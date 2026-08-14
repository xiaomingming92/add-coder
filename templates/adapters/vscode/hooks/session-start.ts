// session-start.ts — SessionStart 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core SessionStartGuard，命名子类 VscodeSessionStartGuard:
//   ① emitState（纯文本状态块）+ ② emitIndex（模板索引）= 基类默认（与 vscode bash 原文逐字一致）
//   ③ emitTodoReminder / ④ emitHitlPending = override 为空（vscode bash 原文仅两段，
//   无代办/HITL 段——与 claude 同构差异，2026-08-14 实态核验）
// 协议差异仅剩: PROJECT_DIR = $PWD（vscode 无注入链）

import { SessionStartGuard } from "../../../core/governance/session-start-guard.js"

class VscodeSessionStartGuard extends SessionStartGuard {
  /** ③ vscode 版无代办刷新段 */
  protected override emitTodoReminder(_state: string | null): void {
    // vscode 协议: 无代办刷新段（bash 原文仅两段）
  }

  /** ④ vscode 版无 HITL 待审批段 */
  protected override emitHitlPending(): void {
    // vscode 协议: 无 HITL 检测段（bash 原文仅两段）
  }
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new VscodeSessionStartGuard(process.env.PROJECT_DIR).run())
