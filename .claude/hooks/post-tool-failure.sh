#!/bin/bash
# PostToolUseFailure — 工具失败后处理（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

echo "[ADD PostToolFailure] 工具调用失败，请检查错误信息并修复。"
exit 0