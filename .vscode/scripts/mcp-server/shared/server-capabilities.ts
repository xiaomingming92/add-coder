// MCP Server 能力声明与 instructions（Plan add-coder-multi-host-adapter-alignment Task 2.1 / 2.2）
//
// 为什么单独成模块：`mcp-server.ts` 是"进程入口"（import 即启动 main()），
// 能力声明若内联在那里就无法被单测断言（import 会拉起 stdio server）。
// 本模块零副作用，供入口与 `tests/mcp-apps-capability.test.ts` 共用同一份真源。

// MCP Apps 官方扩展标识（extensions/apps；客户端矩阵见 modelcontextprotocol.io/extensions/client-matrix）。
//
// 声明它的收益：宿主（Codex desktop / VS Code Copilot / Cursor 等）可在扩展协商通过后绑定 widget；
// 不声明时只能靠工具侧 legacy 位（`_meta.ui.resourceUri` + `openai/outputTemplate`）兼容旧宿主。
// 两条路径并存——删掉 legacy 位会让老宿主失效，删掉扩展声明则在新宿主收紧协商后全端同时失效。
export const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui"

// instructions 长度上限（字节）：Claude Code 对 server instructions 与工具描述各截断 2KB
export const SERVER_INSTRUCTIONS_MAX_BYTES = 2048

// 前缀自包含口径（字符）：Codex 官方要求 instructions 前 512 字符自包含
export const SERVER_INSTRUCTIONS_PREFIX_CHARS = 512

const INSTRUCTIONS_PART_1 = [
  "add-coder 治理工具（ADD 范式）。三个必做 WHEN：",
  "① 新会话或跨轮恢复 → 先 get_project_context(scope:'add-state')；",
  "② 改完任何文件 → record_dev_operation（ADD-7 审计不可省）；",
  "③ Plan 启动或评审 → create_hitl，由人类 update_hitl 裁决，未 TONGYI 不得进入实现。",
].join("\n")

const INSTRUCTIONS_PART_2 = [
  "工具族分区：",
  "状态与上下文 get_project_context / find_related_docs / get_db_schema；",
  "Plan-Review 生命周期 plan_track / plan_status / plan_sync / plan_update / review_track / review_status / review_sync；",
  "HITL 审批 create_hitl / update_hitl / status_hitl / render_hitl_approval；",
  "审计 query_audit_logs / record_dev_operation；",
  "质量门禁 check_dps / check_rahs / check_add_route_status / check_add_route_completeness / check_add_compliance / check_spec_sync；",
  "记忆 propose_memory / recall_memory / refresh_memory_snapshots / get_memory_health。",
].join("\n")

const INSTRUCTIONS_PART_3 = [
  "面板不可用时：用 render_hitl_approval 返回的 fallback（markdownPath / htmlPath）人工确认后调 update_hitl 落库。",
  "收口前 check_dps 与 check_rahs 均需达标（≥80 / ≥90）再声明收敛。",
].join("\n")

// server instructions 真源（≤ SERVER_INSTRUCTIONS_MAX_BYTES 字节；首段自包含）。
// 约束由 tests/mcp-apps-capability.test.ts 守护：超长即测试失败，禁止静默截断。
export const SERVER_INSTRUCTIONS = [INSTRUCTIONS_PART_1, INSTRUCTIONS_PART_2, INSTRUCTIONS_PART_3].join("\n")

export interface ServerCapabilitiesOptions {
  capabilities: {
    tools: Record<string, never>
    resources: { subscribe: boolean }
    extensions: Record<string, Record<string, never>>
  }
  instructions: string
}

// 入口 `new McpServer(...)` 的第二参数（供入口与用例共用同一真源）
export function buildServerOptions(): ServerCapabilitiesOptions {
  return {
    capabilities: {
      tools: {},
      resources: { subscribe: true },
      extensions: { [MCP_APPS_EXTENSION_ID]: {} },
    },
    instructions: SERVER_INSTRUCTIONS,
  }
}
