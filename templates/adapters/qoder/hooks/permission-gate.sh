#!/bin/bash
# permission-gate.sh — PermissionRequest 人工卡位（不干预）
set -euo pipefail
# ADD Review 卡位由 Qoder 本身的权限弹窗处理，此 hook 仅做日志
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // "unknown"')
echo "[ADD PermissionRequest] 工具 ${tool_name} 请求权限。如有 Review 文档待确认，请先检查。" >&2
exit 0
