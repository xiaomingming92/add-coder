#!/bin/bash
# Stop — 停止前合规检查（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

echo "[ADD Stop] 会话结束前，请确认所有 checklist 项已勾选、ADD-7 审计已落库。"
exit 0