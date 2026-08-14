#!/bin/bash
# post-tool-use.sh — Codex PostToolUse：ADD 文档提示与开发操作审计提醒
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=".codex"
export MAGIC_DIR=".codex"
export PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

_report_file() {
  local file_path="$1"
  [ -n "$file_path" ] || return 0
  if echo "$file_path" | grep -qE '(^|/)\.codex/(plans|specs|reviews)/'; then
    echo "[ADD PostToolUse] ADD 文档已写入: $file_path；请检查双向链接与 Plan/Spec 状态。" >&2
  fi
  echo "[ADD PostToolUse] 文件已写入: $file_path；请执行 record_dev_operation 落库审计。" >&2
}

if [ "$tool_name" = "apply_patch" ]; then
  patch_command=$(echo "$input" | jq -r '.tool_input.command // empty')
  patch_paths=$(printf '%s\n' "$patch_command" | sed -nE 's/^\*\*\* (Add|Update|Delete) File: (.+)$/\2/p')
  while IFS= read -r file_path; do
    _report_file "$file_path"
  done <<< "$patch_paths"
  exit 0
fi

if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ] || [ "$tool_name" = "SearchReplace" ]; then
  file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')
  _report_file "$file_path"
  exit 0
fi

if [ "$tool_name" = "Bash" ]; then
  echo "[ADD PostToolUse] Bash 命令完成；若产生 lint/typecheck/test 错误，请在本轮闭环。" >&2
fi

exit 0
