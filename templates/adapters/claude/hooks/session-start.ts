// session-start.ts — SessionStart 入口（Claude 版，Task 3.1 继承体系）
// 继承 core SessionStartGuard；仅 override 协议差异（bash 原文对照）:
//   ① PROJECT_DIR 来源 CLAUDE_PROJECT_DIR（claude-env 注入链）
//   ② 无 ③ 代办段、无 ④ HITL 待审批段（claude bash 版无此两段）

import { SessionStartGuard } from "../../../core/governance/session-start-guard.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()
const PROJECT_DIR = process.env.PROJECT_DIR

class ClaudeSessionStartGuard extends SessionStartGuard {
  /** ② claude 版无代办段 */
  protected override emitTodoReminder(_state: string | null): void {
    // claude 协议: 无代办刷新段
  }

  /** ② claude 版无 HITL 待审批段 */
  protected override emitHitlPending(): void {
    // claude 协议: 无 HITL 检测段
  }
}

process.exit(new ClaudeSessionStartGuard(PROJECT_DIR).run())
