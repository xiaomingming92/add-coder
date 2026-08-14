#!/bin/bash
# Notification — Review 提醒 + Token 预警（Claude Code 适配）
# 治理卡位 #12: 开发提醒/Token 预警
set -euo pipefail

input=$(cat)
ntype=$(echo "$input" | jq -r '.notification_type // ""' 2>/dev/null || echo "")

if [ "$ntype" != "result" ]; then
  exit 0
fi

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="$PWD"

state=$(detect_active_add 2>/dev/null || true)
[ -z "$state" ] && exit 0

IFS='::' read -r plan _ _ _ _ <<< "$state"

# 当前 magicDir 解析（入口注入优先；未注入时物理位置反推）
if [ -z "${MAGIC_DIR:-}" ]; then
  HOOK_DIR_ABS="$(cd "$(dirname "$0")" && pwd)"
  MAGIC_DIR="$(basename "$(dirname "$HOOK_DIR_ABS")")"
fi
reviews_dir="${PROJECT_DIR}/$MAGIC_DIR/reviews"
if ls "$reviews_dir"/*.md >/dev/null 2>&1; then
  echo "[ADD Notification] Plan: ${plan} — 请检查 Review 文档: ${reviews_dir}"
fi
exit 0
#!/bin/bash
# Notification — 通知事件处理（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

exit 0