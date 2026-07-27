#!/bin/bash
# pre-tool-use.sh — PreToolUse §A§B（阻断模式，通用适配版）
# §A: Bash 裸写保护 — 拦截所有绕过 IDE 追踪的文件写操作
# §B: Write/Edit 写入前置守卫 — Plan/Spec/Review 需要活跃 ADD Plan + 敏感文件保护
# 治理卡位 #4: 危险命令拦截 / 模板路径兜底 / 写入前置守卫 / 敏感文件保护
set -euo pipefail

input=$(cat)

# 探测 MAGIC_DIR 和 PROJECT_DIR（兼容多种 adapter）
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(dirname "$HOOK_DIR")"
MAGIC_DIR="$(basename "$PARENT")"
PROJECT_DIR="$PWD"

# ── Hook 通知: 拦截事件写入 jsonl（旁路，失败不阻断 exit 2）──
source "${HOOK_DIR}/lib/notify.sh" 2>/dev/null || true
ACTIVE_PLAN=$(detect_active_add 2>/dev/null || true)
if [ -n "$ACTIVE_PLAN" ]; then
  PLAN_KEYWORD="${ACTIVE_PLAN%%::*}"
  PLAN_STATUS="active"
else
  PLAN_KEYWORD="no-active-plan"
  PLAN_STATUS="none"
fi

# ── §A 辅助函数: 阻断日志 ──
_log_block() {hitl
  local rule="$1" cmd="$2"
  mkdir -p "$PROJECT_DIR/$MAGIC_DIR/debug-dump"
  cat >> "$PROJECT_DIR/$MAGIC_DIR/debug-dump/stdin.log" <<BLOCKLOG
=== $(date) [BLOCKED by §A: ${rule}] ===
command: ${cmd:0:300}
=== DONE ===
BLOCKLOG
}

# ═══════════════ §A: Bash 工具写入保护 ═══════════════
# 任何通过 Bash 修改文件内容的操作都会绕过 IDE 工具层（Write/SearchReplace），
# 导致 Plan 关联检查、doc-format-guard、审计追踪全部失效。
# 因此全局阻断所有可写文件的 Bash 命令，强制走 IDE 工具通道。
command=$(echo "$input" | jq -r '.tool_input.command // empty')
if [ -n "$command" ]; then

  # 检测 1: 脚本解释器 — 可写任意文件，无法解析脚本内容做细粒度拦截
  if echo "$command" | grep -qE '(^|;|\|\||&&|\|)\s*(python3?|node|ruby|perl|php)(\s|$)'; then
    _reason="禁止通过脚本解释器直接修改文件。请使用 Write 或 SearchReplace 工具操作文件。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过脚本解释器直接修改文件。

  python/node/ruby/perl/php 可在脚本中写入任意文件，绕过:
    · Plan 关联检查（哪个文件属于哪个 ADD Plan？）
    · doc-format-guard（章节/占位符/禁止词校验）
    · 审计追踪（agentAudit 无法感知 Bash 内部的文件变更）

  → 请改用 Write 或 SearchReplace 工具操作文件。
  → 如需运行构建/测试脚本，使用 npx/pnpm/npm 命令。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "脚本解释器" "$command"
    write_hook_event "pre-tool-use" "deny" "$command" "禁止通过脚本解释器直接修改文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  # 检测 2: sed -i 原地编辑
  if echo "$command" | grep -qE '\bsed\b.*-i'; then
    _reason="禁止通过 sed -i 直接编辑文件。请使用 SearchReplace 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过 sed -i 原地编辑文件。

  sed -i 直接写入文件，绕过 IDE 工具层的所有校验。
  → 请改用 SearchReplace 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "sed -i" "$command"
    write_hook_event "pre-tool-use" "deny" "$command" "禁止通过 sed -i 原地编辑" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  # 检测 3: 输出重定向 (>/>>) 写入文件
  if echo "$command" | grep -qE '[>]{1,2}\s+\S'; then
    _reason="禁止通过重定向写入文件。请使用 Write 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过重定向(>/>>)写入文件。

  重定向写入绕过 IDE 工具层，变更无法追踪。
  → 请改用 Write 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "重定向" "$command"
    write_hook_event "pre-tool-use" "deny" "$command" "禁止通过重定向写入文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  # 检测 4: tee / dd 写入
  if echo "$command" | grep -qE '\btee\b|\bdd\b.*of='; then
    _reason="禁止通过 tee/dd 写入文件。请使用 Write 或 SearchReplace 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过 tee/dd 写入文件。

  → 请改用 Write 或 SearchReplace 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "tee/dd" "$command"
    write_hook_event "pre-tool-use" "deny" "$command" "禁止通过 tee/dd 写入文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  # 检测 5: cp / mv / touch — 可创建或覆盖文件
  if echo "$command" | grep -qE '(^|;|\|\||&&|\|)\s*(cp|mv|touch)\b'; then
    _reason="禁止通过 cp/mv/touch 操作文件。请使用 Write 或 SearchReplace 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过 cp/mv/touch 操作文件。

  → 请改用 Write 或 SearchReplace 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "cp/mv/touch" "$command"
    write_hook_event "pre-tool-use" "deny" "$command" "禁止通过 cp/mv/touch 操作文件" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
    exit 2
  fi

  # 放行: 构建工具(npx/pnpm/npm/yarn)、版本控制(git)、
  #        只读操作(ls/cat/grep/find/head/tail/wc)、目录操作(mkdir/rmdir) 等
  exit 0
fi

# ═══════════════ §B: Write/Edit 文件写入前置守卫 ═══════════════
# 非 Bash 工具（Write/Edit）的文件写入需要经过:
#   1. Plan/Spec/Review 文档写入 → 需要活跃 ADD Plan
#   2. 敏感文件保护 → 阻断写入
#   3. Dev Action 标记 → 用于 Stop 检查
# 注意: 不再对 src/**/*.ts 做 Plan 白名单放行，避免绕过 skill/rules 规定的 HITL。
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ]; then
  file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
  [ -z "$file_path" ] && exit 0

  if echo "$file_path" | grep -qE '\.(qoder|claude|add)/(plans|specs|reviews)/'; then
    if type detect_active_add >/dev/null 2>&1; then
      state=$(detect_active_add 2>/dev/null || true)
      if [ -z "$state" ]; then
        echo "⛔ 正在写入 Plan/Spec/Review 文档但无活跃 ADD Plan——请先执行 add-paradigm" >&2
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Plan/Spec/Review 写入需要活跃 ADD Plan，请先执行 add-paradigm\"}}"
        write_hook_event "pre-tool-use" "deny" "$tool_name $file_path" "Plan/Spec/Review 写入需活跃 ADD Plan" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
        exit 2
      fi
    fi
  fi

  if echo "$file_path" | grep -qE '\.env$|\.env\.production$|\.env\.local$|credentials|secrets'; then
    echo "⛔ 敏感文件受保护，禁止写入: $file_path" >&2
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"敏感文件受保护\"}}"
    exit 2
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
    _planName=$(basename "$_relative" .md | sed 's/-plan-v[0-9]*$//;s/-review-v[0-9]*$//;s/-review-implementation$//;s/-review-runtime$//')
    if [ -n "$_planName" ]; then
      _tongyi_marker="${PROJECT_DIR}/${MAGIC_DIR}/hitl/.tongyi-${_planName}"
      if [ ! -f "$_tongyi_marker" ]; then
        echo "⛔ [ADD PreToolUse §C] HITL 未 tongyi: $file_path" >&2
        echo "   原因: 哨兵文件 $_tongyi_marker 不存在" >&2
        echo "   操作: 请先调用 create_hitl 创建审批，再 update_hitl({ status: \"TONGYI\" })" >&2
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"HITL 未 tongyi: $_tongyi_marker 不存在\"}}"
        write_hook_event "pre-tool-use" "deny" "$tool_name $file_path" "HITL 未 tongyi: $_tongyi_marker" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
        exit 2
      fi
    fi
  fi

  mark_dev_action 2>/dev/null || true
  exit 0
fi

exit 0
