#!/bin/bash
# post-tool-use.sh — Claude Code PostToolUse 审计提醒
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

if ! echo "$file_path" | grep -qE 'src/agents/|src/lib/agent-audit-logger\.ts|src/types/|prisma/schema\.prisma'; then
  exit 0
fi

echo "[ADD PostToolUse] 文件已写入: ${file_path}。如果尚未记录，请执行 record_dev_operation 落库审计。"
exit 0