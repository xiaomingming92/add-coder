// post-tool-use.ts — PostToolUse 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/post-tool-router.ts（PostToolRouter §1 DPS 哨兵 / §2 文档守卫 / §3 Bash 增强）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { jsonGet, readHookInput } from "../governance/common.js"
import { PostToolRouter } from "../governance/post-tool-router.js"

const input = readHookInput()
let toolName = jsonGet(input, "tool_name")
if (toolName === "") {
  // bash 版此处 grep 兜底失败触发 set -e 崩溃（exit 1）——缺陷行为，
  // TS 版修复：无 tool_name 的 PostToolUse 事件静默放行（冒烟契约 ∈ {0,2}）。
  const fallback = input.match(/"tool_name"\s*:\s*"([^"]*)"/)?.[1] ?? ""
  if (fallback === "") {
    process.exit(0)
  }
  toolName = fallback
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

process.exit(new PostToolRouter(PROJECT_DIR, MAGIC_DIR).run(input, toolName))
