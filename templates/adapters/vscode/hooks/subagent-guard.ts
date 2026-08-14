// subagent-guard.ts — SubagentStart 入口（VS Code Copilot 版，Task 3.1 继承体系）
// 继承 core SubagentGuardRouter（状态注入模板方法——能力对齐）；仅 override 协议差异:
//   ① 输出形态: 纯文本状态块（core/qoder 是 hookSpecificOutput JSON）

import { SubagentGuardRouter } from "../../../core/governance/subagent-guard-router.js"

class VscodeSubagentGuardRouter extends SubagentGuardRouter {
  /** ① 纯文本状态块（vscode 协议，与 claude 同构） */
  protected override emit(state: string): void {
    const [plan, step, rounds, handoff] = state.split("::")
    process.stdout.write(`[ADD SubagentStart] 子代理上下文注入:
  Plan: ${plan}
  Step: ${step}
  轮次: ${rounds}
  handoff: ${handoff}
  遵循 ADD 规范，完成后请检查 checklist 对应项
`)
  }
}

process.exit(new VscodeSubagentGuardRouter().run())
