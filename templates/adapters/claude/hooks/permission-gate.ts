// permission-gate.ts — PermissionRequest 权限请求门禁（Claude 版，与 core 同构）

import { jsonGet, readHookInput } from "../../../core/governance/common.js"

const input = readHookInput()
const toolName = jsonGet(input, "tool_name")

// 高风险工具需要二次确认
if (toolName === "Bash" || toolName === "Write" || toolName === "Edit") {
  process.stdout.write(`[ADD PermissionGate] 高风险工具: ${toolName}，请确认操作。\n`)
}
process.exit(0)
