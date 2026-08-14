#!/bin/bash
# SessionEnd — 通用版（核心模板，Trae 等适配器继承）
# 治理卡位 #2: 标记清理 + 会话审计结算 + Stop未触发兜底
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="$PWD"

# ── ① 清理 tpl-injected 标记 ──
project_hash=$(echo "${PROJECT_DIR:-$PWD}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
rm -f "/tmp/add_tpl_${project_hash}" 2>/dev/null || true

# ── ② 清理 dev action 标记 ──
rm -f "/tmp/add_dev_${project_hash}" 2>/dev/null || true

# ── ③ Stop 未触发兜底: 如果 dev action 标记还在，补执行 checklist 快照 ──
if has_dev_action 2>/dev/null; then
  echo "[ADD SessionEnd] ⚠️ 检测到 dev action 标记未清除——Stop 可能未触发验收检查" >&2

  state=$(detect_active_add 2>/dev/null || true)
  if [ -n "$state" ]; then
    handoff=$(echo "$state" | awk -F'::' '{print $4}')
    add_route=$(echo "$state" | awk -F'::' '{print $5}')
    if [ -f "$handoff" ]; then
      echo "[ADD SessionEnd] 补执行 checklist 快照（best-effort，不阻断）" >&2
      if type check_add_completeness >/dev/null 2>&1; then
        check_add_completeness "$handoff" "$add_route" >&2 2>/dev/null || true
      fi
    fi
  fi
fi

# ── ④ 审计结算 ──
echo "[ADD SessionEnd] 会话结束 — $(date -Iseconds)" >&2
exit 0
