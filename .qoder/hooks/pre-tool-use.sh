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
MAGIC_DIR=".qoder"

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
if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ] || [ "$tool_name" = "SearchReplace" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  [ -z "$file_path" ] && exit 0

  if echo "$file_path" | grep -qE '\.(qoder|claude|add)/(plans|specs|reviews)/'; then
    if type detect_active_add >/dev/null 2>&1; then
      state=$(detect_active_add 2>/dev/null || true)
      if [ -z "$state" ]; then
        echo "[ADD 提示] 正在写入 Plan/Spec/Review 文档但无活跃 ADD Plan——首次创建场景放行，建议先执行 add-paradigm 生成 Plan+add-route" >&2
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"无活跃 ADD Plan 但为 Plan/Spec/Review 写入（首次创建场景），提示而非拦截\"}}"
        write_hook_event "pre-tool-use" "info" "$file_path" "无活跃 ADD Plan 下写入 Plan/Spec/Review（首次创建放行）" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
        exit 0
      fi
    fi
  fi

  if echo "$file_path" | grep -qE '\.env$|\.env\.production$|\.env\.local$|credentials|secrets'; then
    echo "⛔ 敏感文件受保护，禁止写入: $file_path" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"敏感文件受保护\"}}"
    write_hook_event "pre-tool-use" "deny" "$file_path" "敏感文件受保护" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  # §B: 模板类型前置注入 — plans/ 写入前提示应选模板
  if echo "$file_path" | grep -qE '\.(qoder|claude|add|vscode|trae)/(plans)/'; then
    fname=$(basename "$file_path")
    if echo "$fname" | grep -qE 'plan-v[0-9]'; then
      echo "💡 [ADD PreToolUse] 写入 Plan → 模板: standard-plan-template.md（标准）或 simple-plan-template.md（≤3文件）" >&2
    elif echo "$fname" | grep -qE 'add-route'; then
      echo "💡 [ADD PreToolUse] 写入 ADD Route → 模板: add-route-template.md" >&2
    elif echo "$fname" | grep -qE 'handoff'; then
      echo "💡 [ADD PreToolUse] 写入 Handoff → 模板: handoff-single-round-template.md（单轮）或 handoff-multi-round-template.md（多轮）" >&2
    fi
    # Qoder Write 大文件适配 — 已存在大文件建议用 SearchReplace 分块
    if echo "$tool_name" | grep -qE 'Write' && [ -f "$file_path" ]; then
      fsize=$(wc -c < "$file_path" 2>/dev/null || echo "0")
      if [ "$fsize" -gt 2000 ] 2>/dev/null; then
        echo "⚠️ [ADD PreToolUse] 文件已有 ${fsize} 字节，Write 全量覆盖可能触发 Qoder 40500。建议用 SearchReplace 分块追加。" >&2
      fi
    fi
  fi

  # §C: HITL tongyi 检查 — plans/ + PLAN_REVIEW reviews/ 写入前必须有 .hitl-tongyi-{planName} 哨兵
  # implementation/runtime review 不需要 HITL，走 §B 活跃 Plan 检查
  if echo "$file_path" | grep -qE '\.(qoder|claude|add|vscode|trae)/(plans)/'; then
    _do_hitl=true
  elif echo "$file_path" | grep -qE '\.(qoder|claude|add|vscode|trae)/(reviews)/'; then
    if echo "$file_path" | grep -qE '-(implementation|runtime)'; then
      _do_hitl=false  # implementation/runtime review 不被 HITL 拦截
    else
      _do_hitl=true   # PLAN_REVIEW 需要 HITL
    fi
  else
    _do_hitl=false
  fi

  if [ "$_do_hitl" = true ]; then
    _relative=$(echo "$file_path" | sed 's|.*/\.\(qoder\|claude\|add\|vscode\|trae\)/\(plans\|reviews\)/||')
    _planName=$(basename "$_relative" .md | sed 's/\.hitl$//;s/-plan-v[0-9]*$//;s/-add-route-v[0-9]*$//;s/-review-v[0-9]*$//;s/-review-implementation$//;s/-review-runtime$//')
    if [ -n "$_planName" ]; then
      _tongyi_marker="${PROJECT_DIR}/${MAGIC_DIR}/hitl/.tongyi-${_planName}"
      if [ ! -f "$_tongyi_marker" ]; then
        echo "⛔ [ADD PreToolUse §C] HITL 未 tongyi: $file_path" >&2
        echo "   原因: 哨兵文件 $_tongyi_marker 不存在" >&2
        echo "   操作: 请先调用 create_hitl 创建审批，再 update_hitl({ status: \"TONGYI\" })" >&2
        _msg="⛔ HITL 未 tongyi: 哨兵 ${_tongyi_marker} 不存在。请先 create_hitl → 人工 tongyi → update_hitl 后再写入"
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"${_msg}\",\"additionalContext\":\"${_msg}\"}}"
        write_hook_event "pre-tool-use" "ask" "$file_path" "HITL 未 tongyi: $_tongyi_marker" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
        exit 2
      fi
    fi
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
