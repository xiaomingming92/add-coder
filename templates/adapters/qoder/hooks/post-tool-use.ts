// post-tool-use.ts — PostToolUse 入口（Qoder CN 版，Task 4.1 能力演进）
// 继承 core PostToolRouter；协议能力实证（2026-08-14 Qoder 官方文档）:
//   Qoder PostToolUse 事件支持 stdout JSON，专属字段 hookSpecificOutput.feedback
//   （「反馈信息，会展示给用户」）——qoder 输出通道用 feedback JSON（能力演进，
//   非收敛降级）；段落能力（§1 DPS + §2a-e + §3）对齐 core 全段（此前 qoder §1
//   缺分支为 bash 时代漂移，已补齐）。
// 协议差异: 输出通道 collectJson=true（feedback JSON）+ PROJECT_DIR 注入链

import { jsonGet, readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PostToolRouter } from "../../../core/governance/post-tool-router.js"
import { injectProjectDir } from "./lib/qoder-env.js"

injectProjectDir()
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

class QoderPostToolRouter extends PostToolRouter {
  /** 输出通道: feedback JSON（Qoder 文档实证 PostToolUse 专属字段） */
  protected override collectJson(): boolean {
    return true
  }
}

const input = readHookInput()
let toolName = jsonGet(input, "tool_name")
if (toolName === "") {
  toolName = input.match(/"tool_name"\s*:\s*"([^"]*)"/)?.[1] ?? ""
}

process.exit(new QoderPostToolRouter(PROJECT_DIR, MAGIC_DIR).run(input, toolName))
