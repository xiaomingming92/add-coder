// notification.ts — Notification Review 提醒（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core NotificationRouter，命名子类 VscodeNotificationRouter:
//   ① 探测循环（.claude/.qoder/.vscode/.add）与 reviews 提醒逻辑 = 基类（bash 原文逐字对齐）
//   ② 兜底 magicDir = ".vscode"（构造参数注入，vscode 协议差异）
// 协议差异仅剩: PROJECT_DIR = $PWD（vscode 无注入链）+ fallbackMagicDir

import { readHookInput } from "../../../core/governance/common.js"
import { NotificationRouter } from "../../../core/governance/notification-router.js"

class VscodeNotificationRouter extends NotificationRouter {
  /** 协议差异封装: fallbackMagicDir = ".vscode"（vscode 端兜底，bash 原文逐字） */
  constructor(projectDir: string) {
    super(projectDir, ".vscode")
  }

  // 当前无 override（探测循环 + 提醒文本与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new VscodeNotificationRouter(PROJECT_DIR).run(input))
