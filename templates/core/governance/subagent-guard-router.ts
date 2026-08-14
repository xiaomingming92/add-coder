// subagent-guard-router.ts — SubagentStart 上下文注入路由（治理逻辑层，Task 3.1 能力对齐）
// 治理卡位 #10: ADD上下文注入子agent + 审计初始化
//
// 能力对齐（2026-08-14 六端实态核验）:
//   强版（状态注入）: claude/vscode/qoder——detect_active_add → 注入 Plan/Step/轮次/handoff
//   弱版（事件提示）: core/trae/codex——仅"子代理启动请确认遵循 ADD 规范"空话
//   → 本基类统一为状态注入语义（core 对齐强版）；输出形态（JSON/纯文本）为协议差异由子类 override。
//
// 设计范式: 模板方法基类——状态获取流程固化，emit() 输出形态由子类 override。

import { detectActiveAdd } from "./common.js"

/**
 * SubagentStart 上下文注入路由（模板方法）:
 *   流程固化（不可 override）: run() = detectActiveAdd → emit(state)
 *   扩展点（protected）: emit()——core/qoder: hookSpecificOutput JSON；claude/vscode/trae/codex: 纯文本块
 */
export class SubagentGuardRouter {
  /** 主路由：返回 exit code（0） */
  run(): number {
    const state = detectActiveAdd()
    if (state === null) return 0
    this.emit(state)
    return 0
  }

  /** 上下文注入输出（core 协议: hookSpecificOutput JSON，qoder 同构） */
  protected emit(state: string): void {
    const [plan, step, rounds, handoff] = state.split("::")
    const ctx = `[ADD SubagentStart] Plan: ${plan}, Step: ${step}, Round: ${rounds}, handoff: ${handoff}。遵循 ADD 规范，完成后检查 checklist。`
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: ctx } }) + "\n"
    )
  }
}
