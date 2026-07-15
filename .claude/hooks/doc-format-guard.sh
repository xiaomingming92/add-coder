#!/bin/bash
# doc-format-guard.sh — 文档格式守卫（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

# 检查 ADD 文档格式
if echo "$file_path" | grep -qE '\.qoder/(specs|plans|reviews)/.*\.md$'; then
  echo "[ADD DocFormatGuard] 检测到 ADD 文档变更，请确保格式符合模板规范。"
fi
exit 0