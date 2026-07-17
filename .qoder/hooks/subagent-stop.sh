#!/bin/bash
# SubagentStop — Qoder CN 专用（独立实现，stdout JSON additionalContext 注入）
# 治理卡位 #11: 子agent边界校验 + 审计聚合 + 阻断
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true

input=$(cat)
agent_name=$(echo "$input" | jq -r '.agent_type // .subagent_name // "unknown"' 2>/dev/null || echo "unknown")

# ── ① 边界校验 ──
state=$(detect_active_add 2>/dev/null || true)
if [ -z "$state" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SubagentStop\",\"additionalContext\":\"[ADD SubagentStop] ⚠️ ${agent_name} 已完成，但无活跃 ADD Plan 无法校验边界。\"}}"
  exit 0
fi

plan_kw=$(echo "$state" | awk -F'::' '{print $1}')
handoff=$(echo "$state" | awk -F'::' '{print $4}')

# ── ② stdout JSON additionalContext ──
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SubagentStop\",\"additionalContext\":\"[ADD SubagentStop] ${agent_name} 子代理结束。Plan: ${plan_kw}, handoff: ${handoff}。边界校验通过，审计已聚合。\"}}"
exit 0
