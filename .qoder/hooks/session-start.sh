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
  cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ADD: ${plan} Step${step} Round${rounds}"}}
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

exit 0
