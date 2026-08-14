#!/bin/bash
# Notification — Review 提醒 + Token 预警（Codex 适配）
# 治理卡位 #12: 开发提醒/Token 预警
set -euo pipefail

input=$(cat)
ntype=$(echo "$input" | jq -r '.notification_type // ""' 2>/dev/null || echo "")

if [ "$ntype" != "result" ]; then
  exit 0
fi

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=".codex"
export MAGIC_DIR=".codex"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="$PWD"

state=$(detect_active_add 2>/dev/null || true)
[ -z "$state" ] && exit 0

IFS='::' read -r plan _ _ _ _ <<< "$state"

reviews_dir="${PROJECT_DIR}/$MAGIC_DIR/reviews"
if ls "$reviews_dir"/*.md >/dev/null 2>&1; then
  echo "[ADD Notification] Plan: ${plan} — 请检查 Review 文档: ${reviews_dir}"
fi
exit 0
