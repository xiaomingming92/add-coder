#!/bin/bash
# post-tool-use.sh — PostToolUse 审计提醒
set -euo pipefail
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

# 只在写入核心文件时提醒
if ! echo "$file_path" | grep -qE 'src/agents/|src/lib/agent-audit-logger\.ts|src/types/|prisma/schema\.prisma'; then
  exit 0
fi

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/state-detect.sh"

state=$(detect_active_add 2>/dev/null || true)
[ -z "$state" ] && exit 0

echo "[ADD PostToolUse] 文件已写入: ${file_path}。如果尚未记录，请执行 record_dev_operation({ targetId: '${file_path}' }) 落库审计。"
exit 0
