#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 13:35:41
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 13:35:41
 # @FilePath     : /add-coder/templates/adapters/claude/hooks/stop-failure.sh
 # @Description  : 
### 
# stop-failure.sh — Claude Code StopFailure：紧急审计转储
# 治理卡位 #8: 紧急审计转储 + 异常标记
# Claude Code 独有事件
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

echo "[ADD StopFailure] ⚠️ Agent 异常退出 — $(date -Iseconds)" >&2

# 尝试 dump 当前 ADD 状态
if type detect_active_add >/dev/null 2>&1; then
  state=$(detect_active_add 2>/dev/null || true)
  if [ -n "$state" ]; then
    IFS='::' read -r plan step rounds handoff add_route <<< "$state"
    cat >&2 <<EOF
[ADD StopFailure] 异常退出时 ADD 状态:
  Plan: ${plan}
  Step: ${step}
  轮次: ${rounds}
  handoff: ${handoff}
  add-route: ${add_route}
EOF
  fi
fi

# 标记异常终止（供 SessionEnd 兜底识别）
FAILURE_FLAG="/tmp/add_failure_$(echo "${PROJECT_DIR}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")"
touch "$FAILURE_FLAG" 2>/dev/null || true

exit 0
