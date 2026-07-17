#!/bin/bash
# SessionEnd — Qoder CN 专用（独立实现，stdout JSON additionalContext 注入）
# 治理卡位 #2: 标记清理 + 会话审计结算 + Stop未触发兜底
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true

# ── ① 清理标记文件 ──
project_hash=$(echo "${PROJECT_DIR:-$PWD}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
rm -f "/tmp/add_tpl_${project_hash}" 2>/dev/null || true
rm -f "/tmp/add_dev_${project_hash}" 2>/dev/null || true

# ── ② Stop 未触发兜底 ──
fallback_msg=""
if has_dev_action 2>/dev/null; then
  fallback_msg="⚠️ 检测到 dev action 标记未清除——Stop 可能未触发验收检查"
fi

# ── ③ stdout JSON additionalContext ──
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionEnd\",\"additionalContext\":\"[ADD SessionEnd] 会话结束 — $(date -Iseconds)。标记已清理。${fallback_msg}\"}}"
exit 0
