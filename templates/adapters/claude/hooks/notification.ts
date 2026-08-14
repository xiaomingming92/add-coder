// notification.ts — Notification 入口（Claude 版，Task 3.1 继承体系）
// 继承 core NotificationRouter，命名子类 ClaudeNotificationRouter:
//   ① 探测循环（.claude/.qoder/.vscode/.add）与 reviews 提醒 = 基类（bash 原文逐字对齐）
//   ② 兜底 magicDir = ".claude"（构造参数注入，claude 协议差异）
//   ③ 提醒文本 = 基类默认（含 Plan 前缀，与 claude bash 原文一致）
// 协议差异仅剩: PROJECT_DIR 来源 CLAUDE_PROJECT_DIR（claude-env 注入链）

import { readHookInput } from "../../../core/governance/common.js"
import { NotificationRouter } from "../../../core/governance/notification-router.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

class ClaudeNotificationRouter extends NotificationRouter {
  /** 协议差异封装: fallbackMagicDir = ".claude"（claude 端兜底，bash 原文逐字） */
  constructor(projectDir: string) {
    super(projectDir, ".claude")
  }

  // 当前无 override（提醒文本与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = resolveClaudeProjectDir()

const input = readHookInput()
process.exit(new ClaudeNotificationRouter(process.env.PROJECT_DIR).run(input))
