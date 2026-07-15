#!/bin/bash
# pre-tool-use.sh — Claude Code PreToolUse：源码 Plan 关联检查
# 与 Qoder 版本共享核心逻辑，差异仅在工具名和环境变量
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

if ! echo "$file_path" | grep -qE '(src/|/src/).*\.(ts|tsx)$'; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
MOD=$(basename "$file_path" | sed 's/\.[jt]sx\?$//')

MATCHES=$(grep -rl "$MOD" "$PROJECT_DIR/.qoder/plans" "$PROJECT_DIR/.qoder/specs" "$PROJECT_DIR/.qoder/reports" 2>/dev/null | wc -l)

if [ "$MATCHES" -gt 0 ]; then
  exit 0
fi

echo "⛔ 阻断: ${file_path} 无相关 ADD Plan。请先创建 Plan。" >&2
exit $EXIT_BLOCK