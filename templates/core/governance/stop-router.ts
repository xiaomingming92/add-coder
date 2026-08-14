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
   *   维度 1（前置）: DB 任务进度（step = done/total，数值且 done<total → 未完成阻断提示）
   *   维度 2: checklist 质量（checkAddCompleteness 未闭环 → 阻断）
   *   互补非替代——codex 原 DB 进度分流语义上提 core，core checklist 质量语义保留。
   */
  protected q4Check(plan: string, rounds: string, step: string, handoff: string, addRoute: string): number {
    void plan
    void rounds
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
