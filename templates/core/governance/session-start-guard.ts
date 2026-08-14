// lib/session-start-guard.ts — SessionStart 上下文恢复守卫（治理逻辑层，Task 2.1 类化收敛）
// 治理卡位 #1: ADD状态恢复 + 模板索引注入
//
// 设计范式: OOP 守卫类（状态恢复/模板索引/代办/HITL 四职责聚合）。

import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { detectActiveAdd, tryResolveMagicDir } from "./common.js"
import { PreloadTemplates } from "./preload-templates.js"

/**
 * SessionStart 守卫（① 状态恢复 → ② 模板索引 → ③ 代办 → ④ HITL 待审批检测）:
 *   缺陷修复（Plan §3.2）: PLANS_DIR 由 magicDir 推导（bash 版未绑定崩溃已修）
 */
export class SessionStartGuard {
  protected readonly projectDir: string
  protected readonly magicDir: string

  constructor(projectDir: string) {
    this.projectDir = projectDir
    // MAGIC_DIR 解析（唯一链：注入优先 → 物理推导）
    const inferred = tryResolveMagicDir()
    if (inferred && !process.env.MAGIC_DIR) {
      process.env.MAGIC_DIR = inferred
    }
    this.magicDir = process.env.MAGIC_DIR ?? ""
  }

  /** 主入口：返回 exit code（0） */
  run(): number {
    // ── ① ADD 状态恢复（扩展点: core 纯文本 / qoder JSON）──
    const state = detectActiveAdd()
    this.emitState(state)

    // ── ② 模板索引注入（扩展点: core 纯文本 / qoder JSON lines 计数）──
    this.emitIndex()

    // ── ③ §代办刷新（扩展点: adapter 可 override 关闭）──
    this.emitTodoReminder(state)

    // ── ④ §HITL 待审批检测（扩展点: adapter 可 override 关闭）──
    this.emitHitlPending()

    return 0
  }

  // ─────────────────────────── 扩展点 ───────────────────────────

  /** ① ADD 状态恢复输出（core: 纯文本块） */
  protected emitState(state: string | null): void {
    if (state === null) return
    const [plan, step, rounds, handoff] = state.split("::")
    process.stdout.write(`[ADD SessionStart] 检测到活跃 ADD Plan:
  Plan: ${plan}
  轮次: ${rounds}
  当前 Step: ${step}
  handoff: ${handoff}
  恢复命令: query_audit_logs({ planKeyword: '${plan}' })
`)
  }

  /** ② 模板索引输出（core: 纯文本 index） */
  protected emitIndex(): void {
    try {
      process.stdout.write(new PreloadTemplates().index())
    } catch {
      /* 模板目录缺失等 fail-fast 场景：stderr 已在 validate 抛出，入口不阻断 */
    }
  }

  /** ③ 代办刷新（core: 活跃 Plan 时输出提醒；claude: 无此段） */
  protected emitTodoReminder(state: string | null): void {
    if (state !== null) {
      const plan = state.split("::")[0] ?? ""
      process.stdout.write(`[代办] 检测到活跃 Plan: ${plan}。如有未加载的 IDE 代办清单，请从 tasks.md §IDE JSON 刷新 TodoWrite。
`)
    }
  }

  /** ④ HITL 待审批检测（core: 7 天内 .hitl.md 计数提示；claude: 无此段） */
  protected emitHitlPending(): void {
    const PLANS_DIR = this.magicDir ? join(this.projectDir, this.magicDir, "plans") : ""
    if (PLANS_DIR && existsSync(PLANS_DIR)) {
      const weekAgo = Date.now() - 7 * 86400000
      const hitlCount = readdirSync(PLANS_DIR)
        .filter((f) => f.endsWith(".hitl.md"))
        .filter((f) => {
          try {
            return statSync(join(PLANS_DIR, f)).mtimeMs >= weekAgo
          } catch {
            return false
          }
        }).length
      if (hitlCount > 0) {
        process.stdout.write(`[HITL 待审批] 检测到 ${hitlCount} 个待审批 HITL 提案，请检查并处理\n`)
      }
    }
  }
}
