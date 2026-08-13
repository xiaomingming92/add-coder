#!/bin/bash
# stop-check.sh — Codex Stop：四象限分流 + 验收检查
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=".codex"
export MAGIC_DIR=".codex"
export PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(cat 2>/dev/null || echo '{}')

# Stop 已经续跑过一次时不再次阻断，避免递归 continuation。
if echo "$input" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
  exit 0
fi

_system_message() {
  local message="$1"
  jq -nc --arg message "$message" '{systemMessage: $message}'
}

state=$(detect_active_add 2>/dev/null || true)
has_dev=$(has_dev_action 2>/dev/null && echo "true" || echo "false")

# DB 是 lifecycle 真相源；不可用时 fail closed，不能谎报“无活跃 Plan”。
if [ "${state%%::*}" = "__STATUS_UNAVAILABLE__" ]; then
  reason=$(echo "$state" | awk -F'::' '{print $2}')
  printf '%s\n' "[ADD Stop] ⛔ Plan status 暂不可用（${reason}）。未回退 Handoff/add-route 猜测，请恢复数据库或 MCP resolver 后重试。" >&2
  exit "${EXIT_BLOCK:-2}"
fi

# Q1: 无 ADD + 无 dev → exit 0 且 stdout 为空。
if [ -z "$state" ] && [ "$has_dev" != "true" ]; then
  exit 0
fi

# Q2: 无 ADD + 有 dev → exit 2，stderr 成为 continuation reason。
if [ -z "$state" ] && [ "$has_dev" = "true" ]; then
  build_stop_context "no_add_has_dev" "" >&2
  exit "${EXIT_BLOCK:-2}"
fi

plan=$(echo "$state" | awk -F'::' '{print $1}')
step=$(echo "$state" | awk -F'::' '{print $2}')
approval=$(echo "$state" | awk -F'::' '{print $3}')

# Q3: 有 ADD + 无 dev → 合法 JSON，不输出纯文本。
if [ "$has_dev" != "true" ]; then
  _system_message "[ADD Stop] Plan: ${plan}；approval: ${approval}；tasks: ${step}。本次无代码改动。"
  exit 0
fi

# Q4: 有 ADD + 有 dev。DB progress 决定本轮是否仍有任务；Handoff 只在
# Step 8 生成，不能参与 active 判定，也不能因缺失而把 ACTIVE Plan 判成无 Plan。
done_tasks=${step%%/*}
total_tasks=${step##*/}
if [[ "$done_tasks" =~ ^[0-9]+$ ]] && [[ "$total_tasks" =~ ^[0-9]+$ ]] && [ "$done_tasks" -lt "$total_tasks" ]; then
  cat >&2 <<EOF
[ADD Stop] ⚠️ 当前 DB Plan 仍为 ACTIVE，任务进度 ${done_tasks}/${total_tasks}：${plan}

请继续执行当前 Plan 的未完成 Task，并为本轮改动补齐 record_dev_operation 审计。
Handoff 只在 Step 8 生成；本提示没有使用 Handoff/add-route 猜测 active 状态。
EOF
  exit "${EXIT_BLOCK:-2}"
fi

clear_dev_action 2>/dev/null || true
_system_message "[ADD Stop] DB Plan ${plan} 的 tasks 已完成（${done_tasks}/${total_tasks}）；可进入 Review/closure。"
exit 0
