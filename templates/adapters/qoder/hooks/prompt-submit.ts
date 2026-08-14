// prompt-submit.ts — UserPromptSubmit 入口（Qoder CN 版，Task 4.1 继承体系）
// 继承 core PromptRouter（L1/L2/L3 模板方法）；仅 override 协议差异（bash 原文逐字对照）:
//   ① preamble: 无条件 "ADD workflow active" JSON 注入（Qoder 主端协议）
//   ② onAccepted: review-checklist 内存调用（checkReviewQuality，非 core 子进程）
//   ③ devKwMatched: 逐个正则 some（core 是 join("|") 单正则）
//   ④ layer3Json: true——Layer3 输出 hookSpecificOutput JSON 包
//   ⑤ dailyInContext: true——日报并入 additionalContext（core 独立行）
//   ⑥ dailyWarnText: 「建议创建 Plan」（无"或检查 hooks 误报"）

import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PromptRouter } from "../../../core/governance/prompt-router.js"
import { checkReviewQuality } from "../../../core/governance/review-checklist-guard.js"
import { injectProjectDir } from "./lib/qoder-env.js"

injectProjectDir()
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred
const MAGIC_DIR = process.env.MAGIC_DIR ?? ".qoder"

class QoderPromptRouter extends PromptRouter {
  /** ① 前置注入: 无条件 JSON（Qoder CN IDE stdout JSON 注入模型上下文） */
  protected override preamble(_input: string): void {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "ADD workflow active. Templates preloaded. Use add-paradigm SKILL.",
        },
      }) + "\n"
    )
  }

  /** ② 验收后置: checklist 质量检查内存调用（bash 外部调用 → TS 内存调用，stdout 直出行为等价） */
  protected override onAccepted(handoff: string, addRoute: string): void {
    process.stdout.write(checkReviewQuality(handoff, addRoute) + "\n")
  }

  /** ③ 开发关键词匹配: 逐个正则 some */
  protected override devKwMatched(prompt: string, devKw: string[]): boolean {
    return devKw.some((kw) => {
      try {
        return new RegExp(kw, "i").test(prompt)
      } catch {
        return false
      }
    })
  }

  /** ④ Layer3 JSON 输出 */
  protected override layer3Json(): boolean {
    return true
  }

  /** ⑤ 日报并入 additionalContext */
  protected override dailyInContext(): boolean {
    return true
  }

  /** ⑥ 日报告警文本（无"或检查 hooks 误报"） */
  protected override dailyWarnText(noPlan: number, threshold: number): string {
    return `[Hook ⚠️] 无 Plan 提示已达 ${noPlan} 次（≥${threshold}），建议创建 Plan`
  }
}

const input = readHookInput()
process.exit(new QoderPromptRouter(MAGIC_DIR).run(input))
