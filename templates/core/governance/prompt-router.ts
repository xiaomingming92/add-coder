// prompt-router.ts — UserPromptSubmit 触发词路由基类（治理逻辑层，Task 3.1 继承体系）
// 治理卡位 #3: Layer 1 精准触发 → Layer 2 阻断 → Layer 3 状态注入
// 规则真源: hook-event-rules.toml（[event.daily.warn_threshold] 日报阈值）
//
// 设计范式: 模板方法基类——L1/L2/L3 分流流程固化，
//   协议差异（提取方式/文本形态/输出通道/附加注入）由 adapter 子类 override。

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import {
  detectActiveAdd,
  isAlreadyAccepted,
  jsonGet,
  localIsoSeconds,
} from "./common.js"
import { loadDevKeywords, matchTrigger } from "./vocabulary.js"
import { writeHookEvent } from "./notify.js"
import { event } from "./rules.js"

/**
 * UserPromptSubmit 触发词路由基类（模板方法）:
 *   流程固化（不可 override）: run()
 *   扩展点（protected，adapter 子类 override 协议差异）:
 *     - extractPrompt(): prompt 提取（core: jsonGet；claude: grep 正则）
 *     - acceptedText(): 验收幂等文本（core: 6 行含 ★；claude: 4 行）
 *     - onAccepted(): 验收后置（core: spawn review-checklist；claude: 无）
 *     - onDevKwMatched(): 开发关键词命中提示（claude: stderr；core: 无）
 *     - layer2Channel: Layer2 输出通道（core: stderr；claude: stdout）
 *     - layer3Text(): Layer3 状态文本（core: 单行；claude: 多行块）
 *     - dailyWarnText(): 日报告警文本（core: 含"或检查 hooks 误报"；claude: 无）
 *     - afterLayer3(): Layer3 附加注入（claude: 模板全文 full(5)；core: 无）
 */
export class PromptRouter {
  protected readonly magicDir: string

  constructor(magicDir: string) {
    this.magicDir = magicDir
  }

  // ─────────────────────────── 扩展点 ───────────────────────────

  /** prompt 提取（core: jsonGet） */
  protected extractPrompt(input: string): string {
    return jsonGet(input, "prompt")
  }

  /** 验收幂等文本（core 协议: 6 行含 ★ 同步检查） */
  protected acceptedText(): string {
    return `[ADD 验收] ⚠️ 已验收。进入 Review 模式:
  ① 重新检查 checklist [T]/[R] 项
  ② 审查 audit 记录完整性
  ③ 如有差异 → Review 回流至 handoff（增量更新，不覆盖已有结论）
  ④ 无差异 → 记录 'Review 已确认，无新发现'
  ★ 同步检查: 如 checklist 有新 cuid 但 handoff 审计表缺失 → 更新 handoff ADD-7 表 + query_audit_logs 命令
`
  }

  /** 验收后置处理（core: spawn review-checklist 子进程，输出丢弃） */
  protected onAccepted(handoff: string, addRoute: string): void {
    const reviewScript = join(this.magicDir, "hooks", "review-checklist.mjs")
    if (existsSync(reviewScript)) {
      spawnSync(process.execPath, [reviewScript, handoff, addRoute], { stdio: "ignore" })
    }
  }

  /** 开发关键词命中提示（core: 无） */
  protected onDevKwMatched(): void {
    // core 协议: 无额外输出
  }

  /** 开发关键词匹配（core: join("|") 单正则；qoder: 逐个正则 some） */
  protected devKwMatched(prompt: string, devKw: string[]): boolean {
    try {
      return new RegExp(devKw.join("|"), "i").test(prompt)
    } catch {
      return false
    }
  }

  /** Layer 2 输出通道（core: stderr） */
  protected layer2ToStderr(): boolean {
    return true
  }

  /** Layer 3 状态文本（core: 单行） */
  protected layer3Text(plan: string, rounds: string, step: string, handoff: string): string {
    return `[ADD 状态] Plan: ${plan}, 轮次: ${rounds}, Step: ${step}, handoff: ${handoff}\n`
  }

  /** 日报告警文本（core: 含"或检查 hooks 误报"） */
  protected dailyWarnText(noPlan: number, threshold: number): string {
    return `[Hook ⚠️] 无 Plan 提示已达 ${noPlan} 次（≥${threshold}），建议创建 Plan 或检查 hooks 误报\n`
  }

  /** Layer 3 附加注入（core: 无） */
  protected afterLayer3(): void {
    // core 协议: 无附加注入
  }

  /** 日报跳过条件（core: 不跳过；claude: MAGIC_DIR 未设置时跳过） */
  protected shouldSkipDaily(): boolean {
    return false
  }

  /** 前置注入（core: 无；qoder: 无条件 "ADD workflow active" JSON） */
  protected preamble(_input: string): void {
    // core 协议: 无前置注入
  }

  /** Layer 3 输出形态（core: 纯文本逐行；qoder: hookSpecificOutput JSON 包） */
  protected layer3Json(): boolean {
    return false
  }

  /** 日报并入 Layer3 上下文（core: 独立行输出；qoder: 并入 additionalContext） */
  protected dailyInContext(): boolean {
    return false
  }

  // ─────────────────────────── 流程固化 ───────────────────────────

  /** 主路由（模板方法）：返回 exit code（0 放行） */
  run(input: string): number {
    const prompt = this.extractPrompt(input)
    if (prompt === "") return 0

    // 前置注入（qoder: 无条件 JSON——bash 原文位于空 prompt 检查之后）
    this.preamble(input)

    // ─── Layer 1: 精准 P0 触发词 ───
    const matched = matchTrigger(prompt)
    if (matched.length > 0) {
      // 验收幂等保护: 如果已验收，提示不重复
      if (/验收|收敛/i.test(prompt)) {
        const addState = detectActiveAdd()
        if (addState !== null) {
          const handoff = addState.split("::")[3] ?? ""
          const addRoute = addState.split("::")[4] ?? ""
          if (isAlreadyAccepted(addRoute, handoff)) {
            process.stdout.write(this.acceptedText())
            this.onAccepted(handoff, addRoute)
            return 0
          }
        }
      }
      for (const m of matched) process.stdout.write(m + "\n")
      return 0
    }

    // ─── 开发关键词检测（动态加载） ───
    const devKw = loadDevKeywords()
    if (devKw.length === 0) return 0

    if (!this.devKwMatched(prompt, devKw)) return 0

    this.onDevKwMatched()

    // ─── Layer 2/3: 按活跃 ADD 分流 ───
    const state = detectActiveAdd()
    if (state === null) {
      // Layer 2: 无活跃 ADD → 提示启动（不阻断）
      const text = `[ADD 提示] 检测到开发任务，但无活跃 ADD Plan。建议先执行 add-paradigm SKILL:
  Step 0: 文档先行 (Plan → Review → Specs)
  Step 3: 代码实现 + 审计植入
  Step 8: 收敛判断
`
      if (this.layer2ToStderr()) {
        process.stderr.write(text)
      } else {
        process.stdout.write(text)
      }
      writeHookEvent("prompt-submit", "info", prompt, "无活跃 ADD Plan 下检测到开发任务", "no-active-plan", "none")
      return 0
    }

    // Layer 3: 有活跃 ADD → 注入状态
    const plan = state.split("::")[0] ?? ""
    const step = state.split("::")[1] ?? ""
    const rounds = state.split("::")[2] ?? ""
    const handoff = state.split("::")[3] ?? ""
    let block = this.layer3Text(plan, rounds, step, handoff)

    // ─── Hook 治理日报（阈值真源: hook-event-rules.toml [event.daily.warn_threshold]）───
    if (!this.shouldSkipDaily()) {
      const HOOK_JSONL = join(this.magicDir, "reports", "hook-events.jsonl")
      if (existsSync(HOOK_JSONL)) {
        const today = localIsoSeconds().slice(0, 10) // 对齐 bash date +%Y-%m-%d（本地日期）
        const content = readFileSync(HOOK_JSONL, "utf-8")
        const todayLines = content.split("\n").filter((l) => l.includes(`"ts":"${today}`))
        const total = todayLines.length
        const noPlan = todayLines.filter((l) => l.includes('"planKeyword":"no-active-plan"')).length
        if (total > 0) {
          const dailyLine = `[Hook 治理] 今日提示: ${total} 次 | 无 Plan 提示: ${noPlan} 次`
          const warnThreshold = (event.daily as { warn_threshold: number }).warn_threshold
          const warnLine = noPlan >= warnThreshold ? this.dailyWarnText(noPlan, warnThreshold) : ""
          if (this.dailyInContext()) {
            // qoder 协议: 日报并入 additionalContext（\n 前缀 + 警告尾行）
            block += `\n${dailyLine}`
            if (warnLine) block += `\n${warnLine.trimEnd()}`
          } else {
            // core/claude 协议: 日报独立 stdout 行（警告随层3文本后输出）
            process.stdout.write(dailyLine + "\n")
            if (warnLine) process.stdout.write(warnLine)
          }
        }
      }
    }

    if (this.layer3Json()) {
      // qoder 协议: hookSpecificOutput JSON 包
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: block.trimEnd() } }) + "\n"
      )
    } else {
      process.stdout.write(block)
    }

    this.afterLayer3()
    return 0
  }
}
