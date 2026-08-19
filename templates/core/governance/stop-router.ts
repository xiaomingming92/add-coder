// stop-router.ts — Stop 四象限分流路由基类（治理逻辑层，Task 2.1/4.1 继承体系）
// 治理卡位 #7: 验收检查 + devlog + 阻断
// DB lifecycle 真相源（协议层）：DB 不可用时 fail-closed，禁止回退 Handoff/add-route 猜测
//
// 设计范式: 模板方法基类——Q0-Q4 分流流程固化，输出形态（JSON/纯文本）由 adapter 子类 override。

import {
  EXIT_BLOCK,
  checkAddCompleteness,
  clearDevAction,
  detectActiveAdd,
  hasDevAction,
} from "./common.js"
import { buildStopContext } from "./context-inject.js"
import { protocol } from "./rules.js"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Stop 四象限分流路由（Q0-Q4，与 bash stop-check.sh 同语义）:
 *   Q0: DB 不可用 → fail closed（禁止当"无 Plan"）
 *   Q1: 无 ADD + 无 dev → 正常停
 *   Q2: 无 ADD + 有 dev → 严重违规，few-shot 注入 + 阻断
 *   Q3: 有 ADD + 无 dev → 注入状态
 *   Q4: 有 ADD + 有 dev → 验收检查
 * 扩展点（protected，adapter 子类 override 输出形态）:
 *   - emitQ0 / emitQ2 / emitQ3 / emitQ4Unclosed / emitQ4Pass（core: 纯文本；qoder: stdout JSON）
 *   - unclosedInterpolate(): has_add_dev_unclosed 是否插值（core: true；qoder: false 缺陷照搬）
 */
export class StopRouter {
  /** 主路由：返回 exit code（0 放行 / 2 阻断） */
  run(): number {
    const state = detectActiveAdd()
    const hasDev = hasDevAction()

    // ═══════════ Q0: DB 不可用 → fail closed ═══════════
    if (state !== null && state.startsWith("__STATUS_UNAVAILABLE__")) {
      const reason = state.split("::")[1] ?? ""
      return this.emitQ0(reason)
    }

    // ═══════════ Q1: 无 ADD + 无 dev → 正常停 ═══════════
    if (state === null && !hasDev) {
      return 0
    }

    // ═══════════ Q2: 无 ADD + 有 dev → 严重违规 ═══════════
    if (state === null && hasDev) {
      return this.emitQ2()
    }

    const fields = (state as string).split("::")
    const plan = fields[0] ?? ""
    const step = fields[1] ?? ""
    const rounds = fields[2] ?? ""
    const handoff = fields[3] ?? ""
    const addRoute = fields[4] ?? ""

    // ═══════════ Q3: 有 ADD + 无 dev → 注入状态 ═══════════
    if (!hasDev) {
      return this.emitQ3(plan, rounds, step)
    }

    // ═══════════ Q4: 有 ADD + 有 dev → 验收检查（决策逻辑扩展点: core checklist / codex DB 进度）═══
    return this.q4Check(plan, rounds, step, handoff, addRoute)
  }

  // ─────────────────────────── 扩展点 ───────────────────────────

  /**
 * Q4 验收决策（双维度组合——2026-08-14 Task 9.4.4④ 上提，回流: I2）:
 *   维度 0（新增，临时方案）: 弹框频控——同项目同 Plan 窗口内达上限 → 降级放行
 *   维度 1（前置）: DB 任务进度（step = done/total，数值且 done<total → 未完成阻断提示）
 *   维度 2: checklist 质量（checkAddCompleteness 未闭环 → 阻断）
 *   互补非替代——codex 原 DB 进度分流语义上提 core，core checklist 质量语义保留。
 */
protected q4Check(plan: string, rounds: string, step: string, handoff: string, addRoute: string): number {
    void rounds
    // 维度 0: 弹框频控（达上限 → 放行，防 Stop 阻断刷屏死循环）
    const limited = this.stopPromptLimited(plan)
    if (limited) {
        process.stderr.write(`[ADD Stop] 已达本 Plan 弹框上限(${this.stopPromptMax()})，本次放行。请在后续实施中完成验收闭环（devlog + handoff）后停止。\n`)
        return 0
    }
    // 维度 1: DB 任务进度（step 格式 done/total，如 11/64）
    const [donePart, totalPart] = step.split("/")
    if (
      /^\d+$/.test(donePart) &&
      /^\d+$/.test(totalPart) &&
      Number(donePart) < Number(totalPart)
    ) {
      return this.emitQ4Unclosed(
        `DB Plan 任务进度 ${donePart}/${totalPart}，尚有未完成 Task。请继续执行当前 Plan 的未完成 Task，并为本轮改动补齐 record_dev_operation 审计。`
      )
    }
    // 维度 2: checklist 质量
    const issues = checkAddCompleteness(
      handoff && handoff !== "none" ? handoff : "",
      addRoute && addRoute !== "none" ? addRoute : ""
    )
    if (issues.length > 0) {
      return this.emitQ4Unclosed(issues.join("\n"))
    }

    clearDevAction()
    return this.emitQ4Pass()
  }

  // ── 弹框频控（临时方案，规则真源: hook-protocol-rules.toml [protocol.stop]）──
  // 计数隔离: 文件级 = PROJECT_DIR md5（跨项目不互扰）；key 级 = planName（同项目跨 Plan 不互扰）
  // 故障降级: 哨兵读/写异常 → fail-open 放行（不阻塞主流程）

  /** 哨兵记录：同一项目同一 Plan 的弹框计数 */
  protected stopPromptMax(): number {
    const cfg = protocol.stop as { max_prompt_per_context?: number } | undefined
    return cfg?.max_prompt_per_context ?? 3
  }

  /** 哨兵窗口（毫秒） */
  protected stopPromptWindowMs(): number {
    const cfg = protocol.stop as { window_minutes?: number } | undefined
    return (cfg?.window_minutes ?? 30) * 60_000
  }

  /** 哨兵文件路径（项目隔离：PROJECT_DIR md5） */
  protected stopSentinelPath(): string {
    const projectDir =
      process.env.PROJECT_DIR ||
      process.env.QODER_PROJECT_DIR ||
      process.env.QODERCN_PROJECT_DIR ||
      process.env.CLAUDE_PROJECT_DIR ||
      process.cwd()
    const md5 = createHash("md5").update(projectDir).digest("hex").slice(0, 8)
    return join(tmpdir(), `add_stop_${md5}.json`)
  }

  /** 写哨兵（失败静默，fail-open） */
  protected writeStopPromptSentinel(data: Record<string, { count: number; lastPromptAt: number }>): void {
    try {
      writeFileSync(this.stopSentinelPath(), JSON.stringify(data), "utf-8")
    } catch {
      // 静默：哨兵写失败不影响主流程
    }
  }

  /**
   * 频控判定：返回 true = 已达上限应放行（不弹框）
   * 生成态缺失 protocol.stop（TOML 未同步）→ 跳过频控保持既有行为（生成链幂等校验兜底）
   */
  protected stopPromptLimited(plan: string): boolean {
    try {
      const stopCfg = protocol.stop as
        | { max_prompt_per_context?: number; window_minutes?: number }
        | undefined
      if (!stopCfg) return false // 生成态缺失 → 跳过频控
      const max = this.stopPromptMax()
      const windowMs = this.stopPromptWindowMs()
      const path = this.stopSentinelPath()
      let data: Record<string, { count: number; lastPromptAt: number }> = {}
      if (existsSync(path)) {
        try {
          data = JSON.parse(readFileSync(path, "utf-8")) ?? {}
        } catch {
          return true // 哨兵损坏 → fail-open 放行
        }
      }
      const now = Date.now()
      const entry = data[plan]
      if (!entry) {
        // 首次触发：计数 1，正常弹框
        data[plan] = { count: 1, lastPromptAt: now }
        this.writeStopPromptSentinel(data)
        return false
      }
      if (now - entry.lastPromptAt > windowMs) {
        // 窗口过期：重置计数 1，正常弹框（新窗口）
        data[plan] = { count: 1, lastPromptAt: now }
        this.writeStopPromptSentinel(data)
        return false
      }
      if (entry.count >= max) {
        return true // 窗口内已达上限 → 放行（不写回，保持计数）
      }
      data[plan] = { count: entry.count + 1, lastPromptAt: now }
      this.writeStopPromptSentinel(data)
      return false
    } catch {
      return true // 自身故障 → fail-open 放行
    }
  }

  /** Q0: DB 不可用（core: stderr + 2） */
  protected emitQ0(reason: string): number {
    process.stderr.write(
      `[ADD Stop] ⛔ Plan status 暂不可用（${reason}）。未回退 Handoff/add-route 猜测，请恢复数据库或 MCP resolver 后重试。\n`
    )
    return EXIT_BLOCK
  }

  /** Q2: 无 ADD + 有 dev（core: stderr few-shot + 2） */
  protected emitQ2(): number {
    process.stderr.write(buildStopContext("no_add_has_dev", "") + "\n")
    return EXIT_BLOCK
  }

  /** Q3: 有 ADD + 无 dev（core: 纯文本状态注入 + 0） */
  protected emitQ3(plan: string, rounds: string, step: string): number {
    process.stdout.write(`[ADD Stop] Plan: ${plan}, 轮次: ${rounds}, Step: ${step}\n`)
    process.stdout.write("本次无代码改动。下次继续时执行 session-init 恢复上下文。\n")
    return 0
  }

  /** Q4 验收未闭环（core: stderr + 2；unclosedInterpolate=true 插值） */
  protected emitQ4Unclosed(info: string): number {
    const text = this.unclosedInterpolate()
      ? buildStopContext("has_add_dev_unclosed", info)
      : buildStopContext("has_add_dev_unclosed", "")
    process.stderr.write(text + "\n")
    return EXIT_BLOCK
  }

  /** Q4 验收通过（core: 纯文本 + 0） */
  protected emitQ4Pass(): number {
    process.stdout.write("[ADD Stop] ✅ 验收通过——checklist 全部勾选，devlog 已记录。\n")
    return 0
  }

  /** has_add_dev_unclosed 是否插值（core: true；qoder: false 缺陷照搬） */
  protected unclosedInterpolate(): boolean {
    return true
  }
}
