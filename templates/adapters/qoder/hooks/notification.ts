// notification.ts — Notification 入口（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core NotificationRouter，命名子类 QoderNotificationRouter:
//   ① 兜底 magicDir = ".qoder"（构造参数注入——替代 bash 硬编码 ${PROJECT_DIR}/.qoder/reviews）
//   ② emitReminder override: 无 Plan 前缀（qoder bash 原文逐字「[ADD Notification] 请检查 Review 文档」，
//     与 core 的 Plan 前缀文本差异保留——非能力漂移，qoder bash 原文如此）
//   ③ 输出通道: stdout（qoder bash 原文 echo 无 >&2 重定向——违反 qoder JSON 规范但缺陷照搬，
//     归 Task 9.4 缺陷修复专项）
// 协议差异仅剩: PROJECT_DIR 注入链（qoder-env）

import { readHookInput } from "../../../core/governance/common.js"
import { NotificationRouter } from "../../../core/governance/notification-router.js"
import { injectProjectDir } from "./lib/qoder-env.js"

class QoderNotificationRouter extends NotificationRouter {
  /** 协议差异封装: fallbackMagicDir = ".qoder"（qoder 端兜底，bash 原文硬编码语义） */
  constructor(projectDir: string) {
    super(projectDir, ".qoder")
  }

  /** ① qoder bash 原文硬编码 ${PROJECT_DIR}/.qoder/reviews——无跨端探测循环（协议差异，不做探测） */
  protected override resolveMagicDir(): string {
    return process.env.MAGIC_DIR ?? ".qoder"
  }

  /** ② qoder 提醒文本: 无 Plan 前缀（bash 原文逐字） */
  protected override emitReminder(_plan: string, reviewsDir: string): void {
    process.stdout.write(`[ADD Notification] 请检查 Review 文档: ${reviewsDir}\n`)
  }
}

const input = readHookInput()
const PROJECT_DIR = injectProjectDir()

process.exit(new QoderNotificationRouter(PROJECT_DIR).run(input))
