#!/bin/bash
# stop-check.sh — Qoder CN Stop：四象限分流 + 验收检查（保留 few-shot 上下文注入）
# 治理卡位 #7: 验收检查 + devlog + 阻断
# DB lifecycle 真相源（协议层）：DB 不可用时 fail-closed，禁止回退 Handoff/add-route 猜测
# Qoder stdout 规范: stdout 只输出合法 JSON（hookSpecificOutput）；非 JSON 一律走 stderr
set -euo pipefail

input=$(cat)
stop_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
[ "$stop_active" = "true" ] && exit 0

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export MAGIC_DIR=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true
source "$HOOK_DIR/lib/context-inject.sh" 2>/dev/null || true

state=$(detect_active_add 2>/dev/null || true)
has_dev=$(has_dev_action 2>/dev/null && echo "true" || echo "false")

# ═══════ Q0: DB 不可用 → fail closed（禁止当“无 Plan”；stdout 保持 JSON 规范） ═══════
if [ "${state%%::*}" = "__STATUS_UNAVAILABLE__" ]; then
  reason=$(echo "$state" | awk -F'::' '{print $2}')
  echo "[ADD Stop] ⛔ Plan status 暂不可用（${reason}）。未回退 Handoff/add-route 猜测，请恢复数据库或 MCP resolver 后重试。" >&2
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"Stop\",\"additionalContext\":\"[ADD Stop] Plan status 暂不可用（${reason}），fail-closed 阻断\"}}"
  exit "${EXIT_BLOCK:-2}"
fi

# ═══════ Q1: 无 ADD + 无 dev → 正常停 ═══════
if [ -z "$state" ] && [ "$has_dev" != "true" ]; then
  exit 0
fi

# ═══════ Q2: 无 ADD + 有 dev → 严重违规，few-shot 注入 ═══════
if [ -z "$state" ] && [ "$has_dev" = "true" ]; then
  build_stop_context "no_add_has_dev" >&2
  exit $EXIT_BLOCK
fi

# 解析 state
IFS='::' read -r plan step rounds handoff add_route <<< "$state"

# ═══════ Q3: 有 ADD + 无 dev → 注入状态（stdout JSON） ═══════
if [ "$has_dev" != "true" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"Stop\",\"additionalContext\":\"[ADD Stop] Plan: ${plan}, 轮次: ${rounds}, Step: ${step}。本次无代码改动，下次继续时执行 session-init 恢复上下文。\"}}"
  exit 0
fi

# ═══════ Q4: 有 ADD + 有 dev → 验收检查 ═══════
issues=$(check_add_completeness "$handoff" "$add_route" 2>/dev/null || true)
if [ -n "$issues" ]; then
  build_stop_context "has_add_dev_unclosed" "$issues" >&2
  exit $EXIT_BLOCK
fi

clear_dev_action 2>/dev/null || true
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"Stop\",\"additionalContext\":\"[ADD Stop] ✅ 验收通过——checklist 全部勾选，devlog 已记录。\"}}"
exit 0
