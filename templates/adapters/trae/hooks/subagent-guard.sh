#!/bin/bash
# SubagentStart/SubagentStop — 子代理门禁（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
event=$(echo "$input" | jq -r '.hook_event_name // empty')

if [ "$event" = "SubagentStart" ]; then
  echo "[ADD SubagentGuard] 子代理启动，请确认其遵循 ADD 规范。"
fi
exit 0