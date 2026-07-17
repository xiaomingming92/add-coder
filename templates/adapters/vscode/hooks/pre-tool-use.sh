#!/bin/bash
# pre-tool-use.sh — VS Code Copilot PreToolUse：四路守卫
# 治理卡位 #4: 危险命令拦截 / 模板路径兜底 / 写入前置守卫 / 敏感文件保护
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(parse_input)
tool_name=$(json_get "$input" "tool_name")
[ -z "$tool_name" ] && tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")

export PROJECT_DIR="$PWD"

# ── ① Bash matcher: 危险命令拦截 + 终端写文件拦截 ──
if [ "$tool_name" = "Bash" ]; then
  cmd=$(echo "$input" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  # 危险命令
  if echo "$cmd" | grep -qiE 'rm[[:space:]]+-rf[[:space:]]+/|DROP[[:space:]]+TABLE|git[[:space:]]+push[[:space:]]+--force|mkfs\.|dd[[:space:]]+if='; then
    echo "⛔ 危险命令已被阻止: $cmd" >&2
    exit $EXIT_BLOCK
  fi
  # 终端写文件拦截（含 > / >> / << heredoc / mv / touch / python -c > file）
  if echo "$cmd" | grep -qE '(cat|echo|tee|sed[[:space:]]+-i|awk|printf|cp|mv|dd|touch)[[:space:]]*.*([>]{1,2}|[|][[:space:]]*tee|<<)'; then
    echo "⛔ 禁止通过终端命令直接写文件: $cmd。请使用 Write/Edit/SearchReplace 工具。" >&2
    exit $EXIT_BLOCK
  fi
  # mv 无重定向但仍操作文件
  if echo "$cmd" | grep -qE '^[[:space:]]*mv[[:space:]]+/tmp/'; then
    echo "⛔ 禁止通过 mv /tmp/ 绕过 IDE 工具: $cmd" >&2
    exit $EXIT_BLOCK
  fi
  # python/node 脚本写文件
  if echo "$cmd" | grep -qE '(python3|python|node)[[:space:]].*[>]{1,2}'; then
    echo "⛔ 禁止通过脚本语言直接写文件: $cmd。请使用 Write/Edit/SearchReplace 工具。" >&2
    exit $EXIT_BLOCK
  fi
  mark_dev_action
  exit 0
fi

# ── ② Write/Edit matcher: 文件写入前置守卫 ──
if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  [ -z "$file_path" ] && exit 0

  # 检查是否写入 plans/specs/reviews 目录但无活跃 ADD Plan
  if echo "$file_path" | grep -qE '\.(qoder|claude|add|vscode)/(plans|specs|reviews)/'; then
    if type detect_active_add >/dev/null 2>&1; then
      state=$(detect_active_add 2>/dev/null || true)
      if [ -z "$state" ]; then
        echo "[ADD PreToolUse] ⚠️ 正在写入 Plan/Spec/Review 文档但无活跃 ADD Plan——请先执行 add-paradigm" >&2
      fi
    fi
  fi

  # 敏感文件保护
  if echo "$file_path" | grep -qE '\.env$|\.env\.production$|\.env\.local$|credentials|secrets'; then
    echo "⛔ 敏感文件受保护，禁止写入: $file_path" >&2
    exit $EXIT_BLOCK
  fi

  mark_dev_action
  exit 0
fi

# ── ③ Read matcher: 模板路径兜底 ──
if [ "$tool_name" = "Read" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  if echo "$file_path" | grep -q 'templates/'; then
    echo "[ADD PreToolUse] 提示: 模板文件已通过 hook 预读到上下文，可跳过重复读取" >&2
  fi
  exit 0
fi

exit 0
