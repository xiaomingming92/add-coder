#!/bin/bash
# pre-compact.sh — PreCompact ADD 状态快照
set -euo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/state-detect.sh"

state=$(detect_active_add 2>/dev/null || true)
[ -z "$state" ] && exit 0

IFS='::' read -r plan step rounds handoff add_route <<< "$state"
echo "[ADD PreCompact] 压缩前状态: Plan=${plan}, 轮次=${rounds}, Step=${step}"
exit 0
