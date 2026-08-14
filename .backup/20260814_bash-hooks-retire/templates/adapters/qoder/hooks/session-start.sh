#!/bin/bash
# SessionStart — ADD 上下文恢复 + 模板索引注入（Qoder CN 适配，stdout additionalContext 注入）
# 治理卡位 #1: ADD状态恢复 + 模板索引注入
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh"
source "$HOOK_DIR/lib/state-detect.sh" 2>/dev/null || true
source "$HOOK_DIR/lib/context-inject.sh" 2>/dev/null || true

# ── ① ADD 状态恢复 ──
state=$(detect_active_add 2>/dev/null || true)
if [ -n "$state" ]; then
  IFS='::' read -r plan step rounds handoff add_route <<< "$state"
  add_ctx="ADD: ${plan} Step${step} Round${rounds}"
  # §代办刷新：提醒加载 IDE 代办清单
  add_ctx="${add_ctx}\n[代办] 如有未加载的 IDE 代办清单，请从 tasks.md §IDE JSON 刷新 TodoWrite"
  cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"${add_ctx}"}}
EOJSON
fi

# ── ② 模板索引注入 ──
TPL_SCRIPT="$HOOK_DIR/lib/preload-templates.sh"
if [ -f "$TPL_SCRIPT" ]; then
  lines=$(bash "$TPL_SCRIPT" --index 2>/dev/null | wc -l)
  cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"${lines} ADD templates available. Use preload-templates.sh --index for list."}}
EOJSON
fi

# ── ③ §HITL 待审批检测 ──
PLANS_DIR="${PROJECT_DIR}/${MAGIC_DIR}/plans"
if [ -d "$PLANS_DIR" ]; then
  hitl_count=$(find "$PLANS_DIR" -name "*.hitl.md" -mtime -7 -type f 2>/dev/null | wc -l)
  if [ "$hitl_count" -gt 0 ] 2>/dev/null; then
    cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"[HITL 待审批] 检测到 ${hitl_count} 个待审批 HITL 提案，请检查并处理"}}
EOJSON
  fi
fi

exit 0
