#!/bin/bash
# SessionStart — ADD 上下文恢复（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

# 尝试加载 Qoder 的 state-detect 和 context-inject 库
QODER_LIB="$HOOK_DIR/../../qoder/hooks/lib"
[ -f "$QODER_LIB/state-detect.sh" ] && source "$QODER_LIB/state-detect.sh"
[ -f "$QODER_LIB/context-inject.sh" ] && source "$QODER_LIB/context-inject.sh"

export QODER_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

state=$(detect_active_add 2>/dev/null || true)
if [ -z "$state" ]; then
  exit 0
fi

IFS='::' read -r plan step rounds handoff <<< "$state"
build_session_start_json "$plan" "$step" "$rounds" "$handoff"
exit 0