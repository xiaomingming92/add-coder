// prompt-submit.ts — UserPromptSubmit 入口（Claude 版，Task 3.1 继承体系）
// 继承 core PromptRouter（模板方法固化 L1/L2/L3 分流）；仅 override 协议差异（bash 原文逐字对照）:
//   ① extractPrompt: grep 正则提取（无 jq）
//   ② acceptedText: 验收 4 行（无 ★ 同步检查行）
//   ③ onAccepted: 无 review-checklist 子进程（core 有）
//   ④ onDevKwMatched: stderr "[ADD PromptSubmit] 检测到开发关键词"
//   ⑤ layer2ToStderr: false（Layer2 提示输出 stdout）
//   ⑥ layer3Text: 「[ADD 当前状态]」多行块
//   ⑦ dailyWarnText: 「建议创建 Plan」（无"或检查 hooks 误报"）
//   ⑧ afterLayer3: 模板全文注入（--full --top 5，tpl-injected 去重）
//   ⑨ shouldSkipDaily: MAGIC_DIR 未设置时跳过日报

import { readHookInput } from "../../../core/governance/common.js"
import { PreloadTemplates } from "../../../core/governance/preload-templates.js"
import { PromptRouter } from "../../../core/governance/prompt-router.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()

class ClaudePromptRouter extends PromptRouter {
  /** ① prompt 提取（对齐 bash grep/sed，无 jq） */
  protected override extractPrompt(input: string): string {
    return input.match(/"prompt"\s*:\s*"([^"]*)"/)?.[1] ?? ""
  }

  /** ② 验收幂等文本（claude 4 行，无 ★ 同步检查） */
  protected override acceptedText(): string {
    return `[ADD 验收] ⚠️ 已验收。进入 Review 模式:
  ① 重新检查 checklist [T]/[R] 项
  ② 审查 audit 记录完整性
  ③ 如有差异 → Review 回流至 handoff（增量更新）
  ④ 无差异 → 记录 'Review 已确认，无新发现'
`
  }

  /** ③ 验收后置（claude 无 review-checklist 子进程） */
  protected override onAccepted(_handoff: string, _addRoute: string): void {
    // claude 协议: 无子进程调用
  }

  /** ④ 开发关键词命中提示（stderr） */
  protected override onDevKwMatched(): void {
    process.stderr.write("[ADD PromptSubmit] 检测到开发关键词\n")
  }

  /** ⑤ Layer 2 输出通道（claude: stdout） */
  protected override layer2ToStderr(): boolean {
    return false
  }

  /** ⑥ Layer 3 状态文本（多行块） */
  protected override layer3Text(plan: string, rounds: string, step: string, handoff: string): string {
    return `[ADD 当前状态]
  Plan: ${plan}
  轮次: ${rounds}
  当前 Step: ${step}
  handoff: ${handoff}
`
  }

  /** ⑦ 日报告警文本（无"或检查 hooks 误报"） */
  protected override dailyWarnText(noPlan: number, threshold: number): string {
    return `[Hook ⚠️] 无 Plan 提示已达 ${noPlan} 次（≥${threshold}），建议创建 Plan\n`
  }

  /** ⑧ Layer 3 附加注入: 模板全文（--full --top 5） */
  protected override afterLayer3(): void {
    try {
      process.stdout.write(new PreloadTemplates().full(5))
    } catch {
      /* 模板目录缺失 fail-fast：不阻断 */
    }
  }

  /** ⑨ MAGIC_DIR 未设置时跳过日报（TS 修复: bash 空路径相对检查） */
  protected override shouldSkipDaily(): boolean {
    return !process.env.MAGIC_DIR
  }
}

const input = readHookInput()
process.exit(new ClaudePromptRouter(process.env.MAGIC_DIR || "").run(input))
