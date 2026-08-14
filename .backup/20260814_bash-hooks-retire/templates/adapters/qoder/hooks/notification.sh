#!/bin/bash
# notification.sh — Qoder CN Notification：Review 提醒
# 治理卡位 #12: 开发提醒/Token 预警
set -euo pipefail

input=$(cat)
ntype=$(echo "$input" | jq -r '.notification_type // ""' 2>/dev/null || echo "")

if [ "$ntype" != "result" ]; then
  exit 0
fi

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true

state=$(detect_active_add 2>/dev/null || true)
[ -z "$state" ] && exit 0

reviews_dir="${PROJECT_DIR}/.qoder/reviews"
if ls "$reviews_dir"/*.md >/dev/null 2>&1; then
  echo "[ADD Notification] 请检查 Review 文档: ${reviews_dir}"
fi
exit 0
