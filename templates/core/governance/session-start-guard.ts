// lib/session-start-guard.ts — SessionStart 上下文恢复守卫（治理逻辑层，Task 2.1 类化收敛）
// 治理卡位 #1: ADD状态恢复 + 模板索引注入
//
// 设计范式: OOP 守卫类（状态恢复/模板索引/代办/HITL 四职责聚合）。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { detectActiveAdd, tryResolveMagicDir } from "./common.js"
import { PreloadTemplates } from "./preload-templates.js"
import { L1_SNAPSHOT_FILE, L1_SNAPSHOT_TTL_MS, MEMORY_DIR_NAME, memoryMaxTokens, recallMode } from "../scripts/mcp-server/shared/memory/switches.js"
import { estimateTokens } from "../scripts/mcp-server/shared/memory/retrieval/context-builder.js"

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

    // ── ⑤ Memory L1 快照注入（Spec §10；fail-open，读预计算快照，无 DB）──
    this.emitMemoryL1()

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

  /**
   * ⑤ Memory L1 快照注入（ADD_MEMORY_RECALL_MODE 三态）:
   *   off    → 不输出
   *   shadow → 仅提示快照存在（召回可执行并落审计，但不注入上下文）
   *   inject → 读预计算快照注入（新鲜度 ≤7 天，token 预算截断，带来源边界标签）
   * 同步 Hook ≤200ms 约束：只读文件，任何异常 fail-open 静默跳过。
   *
   * [2026-09-21 接线修复] 三态必须**可区分**，且"未接线/已过期"不再静默：
   * 原实现 `if (!existsSync(file)) return` 会让"没跑 job"与"没有已治理记忆"、
   * 以及"档位没开"三种情况在会话里完全无痕，用户与模型都无从判断记忆是否接上。
   */
  protected emitMemoryL1(): void {
    try {
      const mode = recallMode()
      if (mode === "off" || !this.magicDir) return
      const file = join(this.projectDir, this.magicDir, MEMORY_DIR_NAME, L1_SNAPSHOT_FILE)
      // ① 未接线：文件不存在（缺 job 入口 / 首次安装 / 从未刷新）
      if (!existsSync(file)) {
        process.stdout.write(
          `[Memory] ⚠️ L1 快照未接线（${file} 不存在）——当前档位 ${mode}。` +
          `生成快照：执行 \`npx add-coder sync\`、调用 MCP 工具 refresh_memory_snapshots、或运行 ` +
          `\`${this.magicDir}/scripts/memory/memory-jobs.ts refresh-l1\`；` +
          `注入开关：ADD_MEMORY_RECALL_MODE=inject（默认）。详见 ${this.magicDir}/docs/ADD-governance-codex.md\n`,
        )
        return
      }
      if (mode === "shadow") {
        process.stdout.write(
          `[Memory] 当前档位 shadow：召回可执行并落审计，但**不注入**上下文（快照已生成: ${file}）。` +
          `需要注入时去掉 ADD_MEMORY_RECALL_MODE 或设为 inject（默认）；也可直接调用 recall_memory 显式召回。\n`,
        )
        return
      }
      // ② 已接线但过期：inject 下不注入，但必须说明原因与刷新入口
      const ageMs = Date.now() - statSync(file).mtimeMs
      if (ageMs > L1_SNAPSHOT_TTL_MS) {
        const days = Math.floor(ageMs / 86400000)
        process.stdout.write(
          `[Memory] ⚠️ L1 快照已过期（${days} 天 > TTL 7 天，未注入）：${file}` +
          `——刷新：调用 refresh_memory_snapshots 或运行 \`${this.magicDir}/scripts/memory/memory-jobs.ts refresh-l1\`\n`,
        )
        return
      }
      const text = readFileSync(file, "utf-8")
      const budget = memoryMaxTokens()
      if (estimateTokens(text) <= budget) {
        process.stdout.write(text)
        return
      }
      // 超预算：按行截断，不静默吞掉——追加显式截断标记
      const lines = text.split("\n")
      const kept: string[] = []
      let used = 0
      for (const line of lines) {
        const t = estimateTokens(line)
        if (used + t > budget) break
        kept.push(line)
        used += t
      }
      kept.push(`[Memory L1] ⚠️ 超出预算 ${budget} tokens，已截断（完整快照: ${file}）`)
      process.stdout.write(kept.join("\n") + "\n")
    } catch {
      /* fail-open：记忆子系统故障不阻断 session-start（Plan §9.3） */
    }
  }
}
