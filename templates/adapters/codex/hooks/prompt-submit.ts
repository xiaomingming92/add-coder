// prompt-submit.ts — UserPromptSubmit 入口（Codex 版，Task 7.1 继承体系）
// 继承 core PromptRouter（L1/L2/L3 模板方法）；仅 override 协议差异（bash 原文逐字对照）:
//   ① extractPrompt = 基类默认（jsonGet 与 bash jq 同语义）
//   ② acceptedText = 基类默认（codex bash 原文 6 行含 ★ 同步检查，与 core 逐字一致）
//   ③ onAccepted: 输出 review-checklist 占位文本（codex bash 调占位脚本；core 是子进程 stdio ignore）
//   ④ layer2ToStderr = 基类默认 true（codex bash 原文 Layer2 走 stderr）
//   ⑤ layer3Text/日报 = 基类默认（codex bash 原文与 core 逐字一致）
// 入口差异: PROJECT_DIR=git toplevel + cd 统一 cwd（codex 大文件协议）+ MAGIC_DIR 注入

import { execSync } from "node:child_process"
import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PromptRouter } from "../../../core/governance/prompt-router.js"

class CodexPromptRouter extends PromptRouter {
  /** ③ 验收后置: 输出 review-checklist 占位文本（codex bash 调占位脚本逐字） */
  protected override onAccepted(_handoff: string, _addRoute: string): void {
    process.stdout.write("[ADD ReviewChecklist] 请在提交前确认 checklist.md 全部项已勾选。\n")
  }

  // 其余（extractPrompt/acceptedText/layer2ToStderr/layer3Text/dailyWarnText）与 core 基线一致
}

// 对齐 bash: git rev-parse --show-toplevel || pwd + cd
function resolveProjectDir(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim()
  } catch {
    return process.cwd()
  }
}
const PROJECT_DIR = resolveProjectDir()
process.env.PROJECT_DIR = PROJECT_DIR
// 对齐 bash export MAGIC_DIR=".codex"：唯一解析链（注入优先 → 物理推导），推导失败回退 .codex
process.env.MAGIC_DIR = tryResolveMagicDir() || ".codex"
process.chdir(PROJECT_DIR) // 对齐 bash cd "$PROJECT_DIR"

const input = readHookInput()
process.exit(new CodexPromptRouter(process.env.MAGIC_DIR).run(input))
