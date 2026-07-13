#!/bin/bash
# SessionStart — ADD 上下文恢复
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/state-detect.sh"
source "$HOOK_DIR/lib/context-inject.sh"

state=$(detect_active_add 2>/dev/null || true)
if [ -z "$state" ]; then
  exit 0
fi

IFS='::' read -r plan step rounds handoff <<< "$state"
build_session_start_json "$plan" "$step" "$rounds" "$handoff"
exit 0
