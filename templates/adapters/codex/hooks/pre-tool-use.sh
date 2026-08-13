#!/bin/bash
# pre-tool-use.sh — Codex PreToolUse：Bash 裸写保护 + apply_patch 文件守卫
set -euo pipefail

input=$(cat)
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=".codex"
export MAGIC_DIR=".codex"
export PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# core notify helper 使用相对 MAGIC_DIR；统一 cwd，避免从 repo 子目录启动时写偏审计文件。
cd "$PROJECT_DIR"

COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"
source "$HOOK_DIR/lib/notify.sh" 2>/dev/null || true

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
tool_command=$(echo "$input" | jq -r '.tool_input.command // empty')
active_plan=$(detect_active_add 2>/dev/null || true)
if [ -n "$active_plan" ]; then
  plan_keyword="${active_plan%%::*}"
  plan_status="active"
else
  plan_keyword="no-active-plan"
  plan_status="none"
fi

_log_block() {
  local rule="$1" detail="$2"
  mkdir -p "$PROJECT_DIR/$MAGIC_DIR/debug-dump" 2>/dev/null || return 0
  printf '=== %s [BLOCKED: %s] ===\n%s\n=== DONE ===\n' \
    "$(date -Iseconds)" "$rule" "${detail:0:500}" \
    >> "$PROJECT_DIR/$MAGIC_DIR/debug-dump/stdin.log" 2>/dev/null || true
}

_deny() {
  local rule="$1" reason="$2" detail="${3:-$tool_name}"
  echo "⛔ [ADD PreToolUse] $reason" >&2
  jq -nc --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  _log_block "$rule" "$detail"
  write_hook_event "pre-tool-use" "deny" "$tool_name" "$reason" "$plan_keyword" "$plan_status" 2>/dev/null || true
  exit "${EXIT_BLOCK:-2}"
}

_require_hitl_for() {
  local file_path="$1" do_hitl=false plan_name marker_base marker_full

  if echo "$file_path" | grep -qE '(^|/)\.codex/plans/'; then
    if ! echo "$file_path" | grep -qE -- '-handoff'; then
      do_hitl=true
    fi
  elif echo "$file_path" | grep -qE '(^|/)\.codex/reviews/'; then
    # Runtime Review 是运行时证据容器；Plan Review 与 Implementation Review 都必须走 create_hitl。
    if ! echo "$file_path" | grep -qE -- '-runtime'; then
      do_hitl=true
    fi
  fi

  [ "$do_hitl" = true ] || return 0

  plan_name=$(basename "$file_path" .md | sed 's/\.hitl$//')
  marker_full="$PROJECT_DIR/$MAGIC_DIR/hitl/.tongyi-${plan_name}"
  marker_base="$PROJECT_DIR/$MAGIC_DIR/hitl/.tongyi-$(echo "$plan_name" | sed 's/-plan-v[0-9]*$//;s/-add-route-v[0-9]*$//;s/-review-v[0-9]*$//;s/-review-implementation[^/]*$//')"
  if [ ! -f "$marker_full" ] && [ ! -f "$marker_base" ]; then
    _deny "hitl" "HITL 未同意: $file_path。请先 create_hitl，再由人工 update_hitl(TONGYI)。" "$file_path"
  fi
}

_guard_file_path() {
  local file_path="$1"
  [ -n "$file_path" ] || return 0

  if echo "$file_path" | grep -qE '(^|/)(\.env|\.env\.production|\.env\.local)$|credentials|secrets'; then
    _deny "sensitive-file" "敏感文件受保护，禁止写入: $file_path" "$file_path"
  fi

  _require_hitl_for "$file_path"

  if echo "$file_path" | grep -qE '(^|/)\.codex/(plans|specs|reviews)/'; then
    if [ -z "$active_plan" ]; then
      echo "[ADD PreToolUse] 正在修改 ADD 文档但未检测到活跃 Plan: $file_path" >&2
    fi
  fi
}

# Codex 对 Bash 与 apply_patch 都把 payload 放在 tool_input.command。
# 只有 canonical Bash 才执行 shell 命令检查，避免把 patch body 误判成 shell。
if [ "$tool_name" = "Bash" ]; then
  if echo "$tool_command" | grep -qE '(^|;|\|\||&&|\|)[[:space:]]*(python3?|node|ruby|perl|php)([[:space:]]|$)'; then
    _deny "script-interpreter" "禁止通过脚本解释器直接修改文件；请使用 apply_patch。" "$tool_command"
  fi
  # `-i` 必须是 sed 命令中的独立 option；不能把 session-init 等后续路径子串当成原地写入。
  if echo "$tool_command" | grep -qE '(^|[;&|][[:space:]]*)sed[[:space:]]+([^;&|]*[[:space:]])?(-[[:alpha:]]*i[^[:space:];&|]*|--in-place(=[^[:space:];&|]*)?)([[:space:];&|]|$)'; then
    _deny "sed-i" "禁止通过 sed -i 直接编辑文件；请使用 apply_patch。" "$tool_command"
  fi
  if echo "$tool_command" | grep -qE '[>]{1,2}[[:space:]]+[^[:space:]]'; then
    _deny "redirect" "禁止通过重定向写入文件；请使用 apply_patch。" "$tool_command"
  fi
  if echo "$tool_command" | grep -qE '\btee\b|\bdd\b.*of='; then
    _deny "tee-dd" "禁止通过 tee/dd 写入文件；请使用 apply_patch。" "$tool_command"
  fi
  if echo "$tool_command" | grep -qE '(^|;|\|\||&&|\|)[[:space:]]*(cp|mv|touch)\b'; then
    _deny "copy-move-touch" "禁止通过 cp/mv/touch 改变文件；请使用 apply_patch。" "$tool_command"
  fi
  exit 0
fi

if [ "$tool_name" = "apply_patch" ]; then
  patch_paths=$(printf '%s\n' "$tool_command" | sed -nE 's/^\*\*\* (Add|Update|Delete) File: (.+)$/\2/p')
  while IFS= read -r file_path; do
    [ -n "$file_path" ] && _guard_file_path "$file_path"
  done <<< "$patch_paths"
  mark_dev_action 2>/dev/null || true
  exit 0
fi

# 兼容尚未 canonicalize 的宿主输入；当前 Codex 正常上报 apply_patch。
if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ] || [ "$tool_name" = "SearchReplace" ]; then
  file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')
  _guard_file_path "$file_path"
  mark_dev_action 2>/dev/null || true
fi

exit 0
