#!/bin/bash
# pre-tool-use.sh — Qoder CN PreToolUse：四路守卫
# 治理卡位 #4: 危险命令拦截 / 模板路径兜底 / 写入前置守卫 / 敏感文件保护
set -euo pipefail

input=$(cat)
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true
source "$HOOK_DIR/lib/notify.sh" 2>/dev/null || true

# ── Hook 通知: 提前计算 Plan 关联信息 ──
ACTIVE_PLAN=$(detect_active_add 2>/dev/null || true)
if [ -n "$ACTIVE_PLAN" ]; then
  PLAN_KEYWORD="${ACTIVE_PLAN%%::*}"
  PLAN_STATUS="active"
else
  PLAN_KEYWORD="no-active-plan"
  PLAN_STATUS="none"
fi

tool_name=$(json_get "$input" "tool_name")
[ -z "$tool_name" ] && tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")

# ── ① Bash matcher: 危险命令拦截 + 终端写文件拦截 ──
if [ "$tool_name" = "Bash" ]; then
  cmd=$(echo "$input" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  # 危险命令
  if echo "$cmd" | grep -qiE 'rm[[:space:]]+-rf[[:space:]]+/|DROP[[:space:]]+TABLE|git[[:space:]]+push[[:space:]]+--force|mkfs\.|dd[[:space:]]+if='; then
    echo "⛔ 危险命令已被阻止: $cmd" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"危险命令已被阻止\"}}"
    write_hook_event "pre-tool-use" "deny" "$cmd" "危险命令已被阻止" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi
  # 终端写文件拦截（含 > / >> / << heredoc / mv / touch / python -c > file）
  if echo "$cmd" | grep -qE '(cat|echo|tee|sed[[:space:]]+-i|awk|printf|cp|mv|dd|touch)[[:space:]]*.*([>]{1,2}|[|][[:space:]]*tee|<<)'; then
    echo "⛔ 禁止通过终端命令直接写文件: $cmd。请使用 Write/Edit/SearchReplace 工具。" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"禁止通过终端直接写文件，请使用 IDE 工具\"}}"
    write_hook_event "pre-tool-use" "deny" "$cmd" "禁止通过终端直接写文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi
  # cp / mv / touch — 可创建或覆盖文件，无重定向也拦（对齐 core §A 检测5）
  if echo "$cmd" | grep -qE '(^|;|\|\||&&|\|)\s*(cp|mv|touch)\b'; then
    echo "⛔ 禁止通过 cp/mv/touch 操作文件: $cmd。请使用 Write 或 SearchReplace 工具。" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"禁止通过 cp/mv/touch 操作文件，请使用 IDE 工具\"}}"
    write_hook_event "pre-tool-use" "deny" "$cmd" "禁止通过 cp/mv/touch 操作文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi
  # python/node/ruby/perl/php 脚本解释器 — 可写任意文件
  if echo "$cmd" | grep -qE '(^|;|\|\||&&|\|)\s*(python3?|node|ruby|perl|php)(\s|$)'; then
    echo "⛔ 禁止通过脚本解释器直接写文件: $cmd。请使用 Write 或 SearchReplace 工具。" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"禁止通过脚本解释器直接写文件，请使用 IDE 工具\"}}"
    write_hook_event "pre-tool-use" "deny" "$cmd" "禁止通过脚本解释器直接修改文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi
  mark_dev_action 2>/dev/null || true
  exit 0
fi

# ── ② Write/Edit matcher: 文件写入前置守卫 ──
if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  [ -z "$file_path" ] && exit 0

  if echo "$file_path" | grep -qE '\.(qoder|claude|add)/(plans|specs|reviews)/'; then
    if type detect_active_add >/dev/null 2>&1; then
      state=$(detect_active_add 2>/dev/null || true)
      if [ -z "$state" ]; then
        echo "⛔ 正在写入 Plan/Spec/Review 文档但无活跃 ADD Plan——请先执行 add-paradigm" >&2
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Plan/Spec/Review 写入需要活跃 ADD Plan，请先执行 add-paradigm\"}}"
        write_hook_event "pre-tool-use" "deny" "$file_path" "Plan/Spec/Review 写入需活跃 ADD Plan" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
        exit 2
      fi
    fi
  fi

  if echo "$file_path" | grep -qE '\.env$|\.env\.production$|\.env\.local$|credentials|secrets'; then
    echo "⛔ 敏感文件受保护，禁止写入: $file_path" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"敏感文件受保护\"}}"
    write_hook_event "pre-tool-use" "deny" "$file_path" "敏感文件受保护" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  mark_dev_action 2>/dev/null || true
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
