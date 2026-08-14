// permission-denied.ts — Claude Code PermissionDenied 拒绝记录 + 替代方案（Claude 独有事件）
// 治理卡位 #14: 拒绝原因记录 + 替代方案注入

import { jsonGet, readHookInput } from "../../../core/governance/common.js"

const input = readHookInput()
let toolName = jsonGet(input, "tool_name")
if (toolName === "") {
  toolName = input.match(/"tool_name"\s*:\s*"([^"]*)"/)?.[1] ?? "unknown"
}
let reason = jsonGet(input, "reason")
if (reason === "") {
  reason = input.match(/"reason"\s*:\s*"([^"]*)"/)?.[1] ?? "权限被拒绝"
}

// 记录拒绝
process.stderr.write(`[ADD PermissionDenied] ${toolName} 被拒绝: ${reason}\n`)

// 按工具类型提供替代建议
switch (toolName) {
  case "Bash":
    process.stderr.write("[ADD PermissionDenied] 建议: 使用安全的等价命令，或通过 permission-gate.sh 白名单放行\n")
    break
  case "Write":
  case "Edit":
    process.stderr.write("[ADD PermissionDenied] 建议: 检查目标路径是否在项目范围内，敏感文件（.env等）不可写入\n")
    break
  case "Read":
    process.stderr.write("[ADD PermissionDenied] 建议: 该文件可能受读保护，尝试读取项目公有文件替代\n")
    break
}

process.exit(0)
