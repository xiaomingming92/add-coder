import type { McpServer } from "@modelcontextprotocol/server"
import { registerContextTools } from "./context.js"
import { registerAuditTools } from "./audit.js"
import { registerContractTools } from "./contract.js"
import { registerDocsTools } from "./docs.js"
import { registerQualityTools } from "./quality.js"
import { registerGatewayTools } from "./gateway/index.js"
import { registerHookEventTools } from "./hook-event-report.js"
import { registerHitlTools } from "./hitl.js"
import { registerPlanTools } from "./plan.js"
import { registerReviewTools } from "./review.js"
import { PROJECT_ID } from "../shared/env.js"
import type { ToolRegistrar } from "./registrar.js"

// ── 读写分级信号量节流（进程层并发契约 v2 §7：Codex Parallel MCP 真并行兑底） ──
// 读工具共享 8 并发；写工具共享 4 并发；超限请求排队（MCP 协议允许延迟响应，排队即天然反压）
const READ_MAX = 8
const WRITE_MAX = 4

const READ_TOOLS = new Set([
  "get_project_context", "find_related_docs", "get_db_schema", "query_audit_logs",
  "plan_status", "review_status", "status_hitl", "contract_status",
  "check_dps", "check_rahs", "check_add_route_status", "check_spec_sync",
  "check_add_route_completeness", "check_phase_symmetry", "check_failure_path",
  "check_add_compliance", "get_hook_events",
])

function createSemaphore(limit: number) {
  let active = 0
  const queue: (() => void)[] = []
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < limit) {
        active++
        resolve()
      } else {
        queue.push(resolve)
      }
    })
  const release = () => {
    active--
    const next = queue.shift()
    if (next) {
      active++
      next()
    }
  }
  return { acquire, release }
}

// 429 指数退避重试（3 次，250ms 起步，倍率 2x）：上游限流不直接透传
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (!/429|rate.?limit|限流/i.test(msg)) throw e
      await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)))
    }
  }
  throw lastErr
}

const readSem = createSemaphore(READ_MAX)
const writeSem = createSemaphore(WRITE_MAX)

export function registerAllTools(server: McpServer) {
  // D9 多 MCP 路由安全：派生装饰版 registrar，为所有工具 description 注入项目身份前缀
  const origRegister = server.registerTool.bind(server)
  type RegisterTool = ToolRegistrar["registerTool"]
  type ToolConfig = Parameters<RegisterTool>[1]
  type ToolCb = Parameters<RegisterTool>[2]
  const registerTool = ((name: string, config: ToolConfig, cb: ToolCb) => {
    const c = config as { description?: string }
    // 读写分级节流 + 429 退避（进程层契约 v2：Codex 并行调用兜底）
    const sem = READ_TOOLS.has(name) ? readSem : writeSem
    const throttledCb = (async (...args: unknown[]) => {
      await sem.acquire()
      try {
        return await withRetry(async () => cb(...(args as Parameters<ToolCb>)))
      } finally {
        sem.release()
      }
    }) as ToolCb
    return origRegister(
      name,
      { ...config, description: `[项目: ${PROJECT_ID}] ${c.description ?? ""}` },
      throttledCb,
    )
  }) as RegisterTool
  const registrar: ToolRegistrar = { registerTool }

  registerContextTools(registrar)    // 5 tools
  registerAuditTools(registrar)      // 2 tools
  registerContractTools(registrar)   // 2 tools: contract_track / contract_status
  registerDocsTools(registrar)       // 1 tool
  registerQualityTools(registrar)    // 4 tools
  registerGatewayTools(registrar)    // 5 tools
  registerHookEventTools(registrar)  // 1 tool: get_hook_events
  registerHitlTools(registrar)       // 3 tools: create_hitl / update_hitl / status_hitl
  registerPlanTools(registrar)       // 3 tools: plan_track / plan_status / plan_sync
  registerReviewTools(registrar)     // 3 tools: review_track / review_status / review_sync
  // Total: 29 tools
}
