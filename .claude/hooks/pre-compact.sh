#!/bin/bash
# PreCompact — 上下文压缩前检查（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

# 检查是否有未完成的 ADD 审计记录
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -d "$PROJECT_DIR/.qoder/plans" ] || exit 0

echo "[ADD PreCompact] 上下文压缩前，请确认 ADD-7 审计记录已落库。"
exit 0