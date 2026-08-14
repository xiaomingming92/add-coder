// notification-router.ts — Notification Review 提醒路由（治理逻辑层，Task 3.1 继承体系）
// 治理卡位 #12: 开发提醒/Token 预警
// 行为对齐注: MAGIC_DIR 空时跨端 for 循环探测（.claude/.qoder/.vscode/.add）——
// 兜底值因端而异（core: .add；claude: .claude），构造参数注入。

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { detectActiveAdd, jsonGet } from "./common.js"
import { protocol } from "./rules.js"

/** Notification 路由（探测循环 + reviews 提醒）；adapter 差异 = fallbackMagicDir 构造参数 + emitReminder 文本 */
export class NotificationRouter {
  protected readonly projectDir: string
  protected readonly fallbackMagicDir: string

  constructor(projectDir: string, fallbackMagicDir: string) {
    this.projectDir = projectDir
    this.fallbackMagicDir = fallbackMagicDir
  }

  /** 提醒输出（core 默认: 含 Plan 前缀——bash 原文逐字；qoder 子类 override 无前缀） */
  protected emitReminder(plan: string, reviewsDir: string): void {
    process.stdout.write(`[ADD Notification] Plan: ${plan} — 请检查 Review 文档: ${reviewsDir}\n`)
  }

  /**
   * magicDir 解析（core 默认: env 优先 → 跨端探测循环 → fallback；bash 原文逐字）:
   * 扩展点: qoder 子类 override 为固定值（qoder bash 原文硬编码 ${PROJECT_DIR}/.qoder/reviews，无探测循环）。
   * Task 9.4 中立化: 探测列表从 hook-protocol-rules.toml [protocol.adapter_defaults.probe_magic_dirs] 读取——
   * 原硬编码 [".claude", ".qoder", ".vscode", ".add"] 缺 .trae/.codex（新增端需改代码）；声明化后随端演进。
   */
  protected resolveMagicDir(): string {
    const env = process.env.MAGIC_DIR
    if (env) return env
    const defaults = protocol.adapter_defaults as { probe_magic_dirs?: readonly string[] } | undefined
    const probeList = defaults?.probe_magic_dirs ?? [".claude", ".qoder", ".vscode", ".add"]
    for (const m of probeList) {
      if (existsSync(join(this.projectDir, m))) return m
    }
    return this.fallbackMagicDir
  }

  /** 主路由：返回 exit code（0） */
  run(input: string): number {
    const ntype = jsonGet(input, "notification_type")
    if (ntype !== "result") return 0

    const state = detectActiveAdd()
    if (state === null) return 0

    const plan = state.split("::")[0] ?? ""

    // 动态探测（扩展点: qoder override 固定值）
    const magicDir = this.resolveMagicDir()

    const reviewsDir = join(this.projectDir, magicDir, "reviews")
    if (existsSync(reviewsDir) && readdirSync(reviewsDir).some((f) => f.endsWith(".md"))) {
      this.emitReminder(plan, reviewsDir)
    }
    return 0
  }
}
