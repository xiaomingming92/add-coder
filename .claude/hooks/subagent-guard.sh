#!/bin/bash
# SubagentStart — 子代理 ADD 上下文注入（Claude Code 适配）
# 治理卡位 #10: ADD上下文注入子agent + 审计初始化
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

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
#!/bin/bash
# SubagentStart/SubagentStop — 子代理门禁（Claude Code 适配）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
event=$(echo "$input" | jq -r '.hook_event_name // empty')

if [ "$event" = "SubagentStart" ]; then
  echo "[ADD SubagentGuard] 子代理启动，请确认其遵循 ADD 规范。"
fi
exit 0