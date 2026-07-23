#!/bin/bash
# post-tool-use.sh — Claude Code PostToolUse：格式化 + 文档守卫 + 审计提醒
# 治理卡位 #5: 格式化 + ADD文档守卫 + 审计落库 + 结果增强
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(parse_input)
tool_name=$(json_get "$input" "tool_name")
[ -z "$tool_name" ] && tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")

# ── Edit/Write matcher: 格式化 + ADD文档守卫 ──
if [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  [ -z "$file_path" ] && exit 0

  # ADD 文档结构守卫：写入 plans/specs/reviews 后提示
  if echo "$file_path" | grep -qE '\.(qoder|claude|add)/(plans|specs|reviews)/'; then
    echo "[ADD PostToolUse] ADD 文档已写入: ${file_path}。请确保章节完整、双向链接齐全、增量修订格式正确。" >&2
  fi

  # 审计提醒（所有文件写入）
  echo "[ADD PostToolUse] 文件已写入: ${file_path}。请执行 record_dev_operation 落库审计（ADD-7）。" >&2
  exit 0
fi

# ── Bash matcher: 结果增强 ──
if [ "$tool_name" = "Bash" ]; then
  echo "[ADD PostToolUse] 命令执行完成。如有 lint/tsc 错误请修复。" >&2
  exit 0
fi

exit 0
