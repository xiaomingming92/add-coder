// post-tool-failure.ts — PostToolUseFailure 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core PostToolFailureRouter，命名子类 VscodePostToolFailureRouter:
//   ① error 缺失回退 "未知错误"（bash grep || echo 语义）
//   ② emit override: 429 限流降级（bash 原文逐字——429/rate.limit/too many requests
//      → 串行模式建议；否则通用失败提示）——vscode 特有能力，全 stderr

import { readHookInput } from "../../../core/governance/common.js"
import { PostToolFailureRouter } from "../../../core/governance/post-tool-failure-router.js"

class VscodePostToolFailureRouter extends PostToolFailureRouter {
  /** ① 空输入走 fallback（bash grep || echo 语义：空输入 → "未知错误"） */
  protected override emptyUsesFallback(): boolean {
    return true
  }

  /** ② error 缺失回退 "未知错误"（bash grep || echo 语义） */
  protected override fallbackError(): string {
    return "未知错误"
  }

  /** ② 429 限流降级（bash 原文逐字） */
  protected override emit(_toolName: string, error: string): void {
    if (/429|rate\.limit|too many requests/.test(error)) {
      process.stderr.write("[ADD PostToolFailure] ⚠️ 检测到 429 限流。建议切换为串行模式，降低并行调用数。\n")
    } else {
      process.stderr.write(`[ADD PostToolFailure] 工具调用失败: ${error}。请检查并修复。\n`)
    }
  }
}

const input = readHookInput()
process.exit(new VscodePostToolFailureRouter().run(input))
