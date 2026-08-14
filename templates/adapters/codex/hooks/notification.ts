// notification.ts — Notification 入口（Codex 版，Task 7.1 继承体系）
// 继承 core NotificationRouter，命名子类 CodexNotificationRouter:
//   ① resolveMagicDir override: 无探测循环（codex bash 原文硬编码 .codex；
//      TS 用唯一解析链：注入优先 → 物理推导 → .codex 兜底，2026-08-14 轮次 7 治理契约落实）
//   ② 提醒文本 = 基类默认（含 Plan 前缀，与 codex bash 原文一致）
// 协议差异仅剩: PROJECT_DIR = $PWD（codex 小文件无 git toplevel，bash 原文逐字）

import { readHookInput } from "../../../core/governance/common.js"
import { NotificationRouter } from "../../../core/governance/notification-router.js"

class CodexNotificationRouter extends NotificationRouter {
  /** ① codex 无跨端探测循环（bash 原文硬编码 .codex；唯一解析链 + 兜底） */
  protected override resolveMagicDir(): string {
    return process.env.MAGIC_DIR ?? ".codex"
  }

  /** 协议差异封装: fallbackMagicDir = ".codex" */
  constructor(projectDir: string) {
    super(projectDir, ".codex")
  }
}

const input = readHookInput()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new CodexNotificationRouter(PROJECT_DIR).run(input))
