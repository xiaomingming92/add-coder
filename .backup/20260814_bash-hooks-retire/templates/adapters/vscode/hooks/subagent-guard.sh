#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 17:05:26
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 17:05:29
 # @FilePath     : /add-coder/templates/adapters/vscode/hooks/subagent-guard.sh
 # @Description  : 
### 
# SubagentStart — 子代理 ADD 上下文注入（VS Code Copilot 适配）
# 治理卡位 #10: ADD上下文注入子agent + 审计初始化
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="$PWD"

# 获取当前 ADD 状态并注入子 agent
if type detect_active_add >/dev/null 2>&1; then
  state=$(detect_active_add 2>/dev/null || true)
  if [ -n "$state" ]; then
    IFS='::' read -r plan step rounds handoff add_route <<< "$state"
    cat <<EOF
[ADD SubagentStart] 子代理上下文注入:
  Plan: ${plan}
  Step: ${step}
  轮次: ${rounds}
  handoff: ${handoff}
  遵循 ADD 规范，完成后请检查 checklist 对应项
EOF
  fi
fi

exit 0
