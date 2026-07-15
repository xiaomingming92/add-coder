#!/bin/bash
# notification.sh — Notification Review 提醒
set -euo pipefail
input=$(cat)
ntype=$(echo "$input" | jq -r '.notification_type // ""')

if [ "$ntype" != "result" ]; then
  exit 0
fi

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/state-detect.sh"

state=$(detect_active_add 2>/dev/null || true)
[ -z "$state" ] && exit 0

# 检查是否有未读 Review
reviews_dir="${QODER_DIR:-.qoder}/reviews"
if ls "$reviews_dir"/*.md >/dev/null 2>&1; then
  echo "[ADD Notification] 请检查 Review 文档: ${reviews_dir}"
fi
exit 0
