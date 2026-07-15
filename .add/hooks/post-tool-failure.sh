#!/bin/bash
# post-tool-failure.sh — PostToolUseFailure 错误定位
set -euo pipefail
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')
error=$(echo "$input" | jq -r '.error // "unknown"')
echo "[ADD PostToolUseFailure] 工具 ${tool_name} 失败: ${error}。检查是否需要回退到上一 ADD Step 重新执行。" >&2
exit 0
