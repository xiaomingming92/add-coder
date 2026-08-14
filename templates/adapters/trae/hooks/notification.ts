// notification.ts — Notification 入口（Trae 版，Task 6.1 继承体系）
// 继承 core NotificationRouter，命名子类 TraeNotificationRouter:
//   ① 探测循环（.claude/.qoder/.vscode/.add）+ reviews 提醒 = 基类（bash 原文逐字）
//   ② 兜底 magicDir = ".add"（bash 原文 `${MAGIC_DIR:-.add}` 照搬，构造参数注入）
// 协议差异仅剩: PROJECT_DIR = $PWD（trae 无注入链）+ fallbackMagicDir

import { readHookInput } from "../../../core/governance/common.js"
import { NotificationRouter } from "../../../core/governance/notification-router.js"

class TraeNotificationRouter extends NotificationRouter {
  /** 协议差异封装: fallbackMagicDir = ".add"（trae bash 原文 ${MAGIC_DIR:-.add} 逐字） */
  constructor(projectDir: string) {
    super(projectDir, ".add")
  }

  // 当前无 override（探测循环 + 提醒文本与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new TraeNotificationRouter(PROJECT_DIR).run(input))
