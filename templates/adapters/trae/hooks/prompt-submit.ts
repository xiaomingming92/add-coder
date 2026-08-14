// prompt-submit.ts — UserPromptSubmit 入口（Trae 版，Task 6.1 继承体系）
// 继承 core PromptRouter（L1/L2/L3 模板方法）；仅 override 协议差异（bash 原文逐字对照）:
//   ① extractPrompt = 基类默认（jsonGet 与 bash `jq -r '.prompt // empty'` 同语义）
//   ② acceptedText = 基类默认（trae bash 原文 6 行含 ★ 同步检查，与 core 逐字一致）
//   ③ onAccepted: 输出 review-checklist 占位文本（trae bash 调占位脚本；core 是子进程 stdio ignore）
//   ④ layer2ToStderr: false——Layer2 提示输出 stdout（trae bash heredoc 无重定向）
// 协议差异仅剩: MAGIC_DIR 兜底 = ".trae"（构造参数）

import { readHookInput } from "../../../core/governance/common.js"
import { PromptRouter } from "../../../core/governance/prompt-router.js"

const MAGIC_DIR = process.env.MAGIC_DIR || ".trae"

class TraePromptRouter extends PromptRouter {
  /** ③ 验收后置: 输出 review-checklist 占位文本（trae bash 调占位脚本逐字） */
  protected override onAccepted(_handoff: string, _addRoute: string): void {
    process.stdout.write("[ADD ReviewChecklist] 请在提交前确认 checklist.md 全部项已勾选。\n")
  }

  /** ④ Layer 2 输出通道（trae: stdout——bash heredoc 无重定向） */
  protected override layer2ToStderr(): boolean {
    return false
  }

  // 其余（extractPrompt/acceptedText/layer3Text/dailyWarnText/afterLayer3）与 core 基线一致
}

const input = readHookInput()
process.exit(new TraePromptRouter(MAGIC_DIR).run(input))
