#!/bin/bash
# pre-compact.sh — 上下文压缩前 ADD 状态保存（Claude Code 适配）
# 治理卡位 #9: ADD状态保存 + 恢复清单导出 + tpl标记清理
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

# ── ① 获取 ADD 状态并保存到标记文件 ──
if type detect_active_add >/dev/null 2>&1; then
  state=$(detect_active_add 2>/dev/null || true)
  if [ -n "$state" ]; then
    IFS='::' read -r plan step rounds handoff add_route <<< "$state"

    # 写入恢复标记文件（SessionStart 恢复时读取）
    RECOVERY_FILE="/tmp/add_recovery_$(echo "${PROJECT_DIR}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")"
    cat > "$RECOVERY_FILE" <<EOF
plan=${plan}
step=${step}
rounds=${rounds}
handoff=${handoff}
add_route=${add_route}
EOF

    echo "[ADD PreCompact] ADD 状态已保存: Plan=${plan}, Step=${step}" >&2
  fi
fi

# ── ② 清理 tpl-injected 标记（compact 后上下文丢失，下次需重注） ──
TPL_FLAG="/tmp/add_tpl_$(echo "${PROJECT_DIR}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")"
rm -f "$TPL_FLAG" 2>/dev/null || true

exit 0
