#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-07 17:44:23
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 18:04:31
 # @FilePath     : /add-coder/templates/adapters/qoder/hooks/subagent-guard.sh
 # @Description  : 
### 
# SubagentStart — 子代理 ADD 上下文注入（Qoder CN 适配）
# 治理卡位 #10: ADD上下文注入子agent + 审计初始化
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true

if type detect_active_add >/dev/null 2>&1; then
  state=$(detect_active_add 2>/dev/null || true)
  if [ -n "$state" ]; then
    IFS='::' read -r plan step rounds handoff add_route <<< "$state"
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SubagentStart\",\"additionalContext\":\"[ADD SubagentStart] Plan: ${plan}, Step: ${step}, Round: ${rounds}, handoff: ${handoff}。遵循 ADD 规范，完成后检查 checklist。\"}}"
  fi
fi

exit 0
