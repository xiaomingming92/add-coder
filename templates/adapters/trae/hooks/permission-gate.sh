#!/bin/bash
# PermissionRequest — 权限请求门禁（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# 高风险工具需要二次确认
case "$tool_name" in
  Bash|Write|Edit)
    echo "[ADD PermissionGate] 高风险工具: ${tool_name}，请确认操作。"
    ;;
esac
exit 0