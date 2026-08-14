// stop-check.ts — Stop 入口（Qoder CN 版，Task 4.1 继承体系）
// 继承 core StopRouter（Q0-Q4 模板方法）；仅 override 协议差异（bash 原文逐字对照）:
//   ① stop_hook_active=true → 跳过（Qoder 内部 Stop 触发，入口解析）
//   ② emitQ0/Q3/Q4Pass: stdout 输出 hookSpecificOutput JSON（Qoder stdout 规范）
//   ③ emitQ2/emitQ4Unclosed: stderr 无 \n 后缀（qoder 版差异）
//   ④ ~~unclosedInterpolate: false~~ → 已修复（Task 9.4.1: 回归基类 true 插值语义）

import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { StopRouter } from "../../../core/governance/stop-router.js"
import { buildStopContext } from "./lib/context-inject.js"
import { injectProjectDir } from "./lib/qoder-env.js"

/** JSON 输出助手（Qoder stdout 规范） */
function stopJson(context: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: context } }) + "\n"
}

class QoderStopRouter extends StopRouter {
  /** ② Q0: stderr + stdout JSON + 2 */
  protected override emitQ0(reason: string): number {
    process.stderr.write(`[ADD Stop] ⛔ Plan status 暂不可用（${reason}）。未回退 Handoff/add-route 猜测，请恢复数据库或 MCP resolver 后重试。\n`)
    process.stdout.write(stopJson(`[ADD Stop] Plan status 暂不可用（${reason}），fail-closed 阻断`))
    return 2
  }

  /** ③ Q2: stderr few-shot 无 \n 后缀（qoder 差异） */
  protected override emitQ2(): number {
    process.stderr.write(buildStopContext("no_add_has_dev", ""))
    return 2
  }

  /** ② Q3: stdout JSON + 0 */
  protected override emitQ3(plan: string, rounds: string, step: string): number {
    process.stdout.write(stopJson(`[ADD Stop] Plan: ${plan}, 轮次: ${rounds}, Step: ${step}。本次无代码改动，下次继续时执行 session-init 恢复上下文。`))
    return 0
  }

  /** ③④ Q4 未闭环: stderr 无 \n + 字面量缺陷照搬（不插值） */
  protected override emitQ4Unclosed(info: string): number {
    process.stderr.write(buildStopContext("has_add_dev_unclosed", info))
    return 2
  }

  /** ② Q4 通过: stdout JSON + 0 */
  protected override emitQ4Pass(): number {
    process.stdout.write(stopJson("[ADD Stop] ✅ 验收通过——checklist 全部勾选，devlog 已记录。"))
    return 0
  }
}
// 注: ④ unclosedInterpolate 缺陷照搬（false → {{info}} 传空串不插值）已修复——
// 2026-08-14 Task 9.4.1 删除 override，回归基类 true（插值语义），golden 反写。

// ── 入口 ──
// 对齐 bash: stop_hook_active=true → 跳过（Qoder 内部 Stop 触发）
const input = readHookInput()
let stopActive = "false"
try {
  const parsed = JSON.parse(input) as { stop_hook_active?: unknown }
  stopActive = typeof parsed.stop_hook_active === "string" ? parsed.stop_hook_active : "false"
} catch {
  stopActive = "false"
}
if (stopActive === "true") process.exit(0)

injectProjectDir()
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred

process.exit(new QoderStopRouter().run())
