// post-tool-use.ts — PostToolUse 入口薄壳（Claude 版，Task 4.1 能力对齐）
// 继承 core PostToolRouter 无 override——六端实态核验（2026-08-14）:
//   post-tool-use 六端均为纯文本 stderr（无协议形态差异），此前 claude 的
//   「无 §1 DPS / 无 §2b-d / 增量修订文本」为 bash 时代能力漂移——统一收敛 core 全段。
// 协议差异仅剩: PROJECT_DIR 来源 CLAUDE_PROJECT_DIR（claude-env 注入链）

import { jsonGet, readHookInput } from "../../../core/governance/common.js"
import { PostToolRouter } from "../../../core/governance/post-tool-router.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()

const input = readHookInput()
const toolName = jsonGet(input, "tool_name")
if (toolName === "") process.exit(0)

process.exit(new PostToolRouter(process.env.PROJECT_DIR, process.env.MAGIC_DIR || ".claude").run(input, toolName))
