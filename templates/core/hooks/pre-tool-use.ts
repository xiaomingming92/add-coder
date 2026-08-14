// pre-tool-use.ts — PreToolUse 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/pre-tool-guard.ts（PreToolUseGuard 服务类，规则消费 hook-guard-rules.toml）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { jsonGet, readHookInput, tryResolveMagicDir } from "../governance/common.js"
import { PreToolUseGuard } from "../governance/pre-tool-guard.js"

const input = readHookInput()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

// 探测 MAGIC_DIR（唯一解析链：注入优先 → 物理位置推导）
let MAGIC_DIR = process.env.MAGIC_DIR
if (!MAGIC_DIR) {
  MAGIC_DIR = tryResolveMagicDir() || ".qoder"
}

const guard = new PreToolUseGuard(PROJECT_DIR, MAGIC_DIR)

const toolName = jsonGet(input, "tool_name")
const command = jsonGet(input, "command")

let exitCode = 0
if (command !== "") {
  exitCode = guard.runSectionA(input)
  if (exitCode !== 0) process.exit(exitCode)
} else {
  exitCode = guard.runSectionB(input, toolName)
  if (exitCode !== 0) process.exit(exitCode)
}
process.exit(0)
