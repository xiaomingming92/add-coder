// post-tool-failure.ts — PostToolUseFailure 入口（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core PostToolFailureRouter，命名子类 QoderPostToolFailureRouter:
//   ① emit override: stderr 回退建议（qoder bash 原文逐字——
//      「检查是否需要回退到上一 ADD Step 重新执行」；core 是 stdout 固定提示）

import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PostToolFailureRouter } from "../../../core/governance/post-tool-failure-router.js"

class QoderPostToolFailureRouter extends PostToolFailureRouter {
  /** ① tool_name/error 缺失回退 "unknown"（bash jq `// \"unknown\"` 语义） */
  protected override fallbackToolName(): string {
    return "unknown"
  }

  protected override fallbackError(): string {
    return "unknown"
  }

  /** ② qoder 协议: stderr 回退建议（bash 原文逐字） */
  protected override emit(toolName: string, error: string): void {
    process.stderr.write(`[ADD PostToolUseFailure] 工具 ${toolName} 失败: ${error}。检查是否需要回退到上一 ADD Step 重新执行。\n`)
  }
}

// 对齐 bash: MAGIC_DIR 由物理位置推导注入
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred

const input = readHookInput()
process.exit(new QoderPostToolFailureRouter().run(input))
