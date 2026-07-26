#!/bin/bash
# review-checklist.sh — Review 检查清单校验（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

echo "[ADD ReviewChecklist] 请在提交前确认 checklist.md 全部项已勾选。"
exit 0