#!/bin/bash
# stop-check.sh — Stop 验收闭环检查（四象限 + few-shot）
input=$(cat)
stop_active=$(echo "$input" | jq -r '.stop_hook_active // false')
[ "$stop_active" = "true" ] && exit 0

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/lib/state-detect.sh"
source "$HOOK_DIR/lib/context-inject.sh"

state=$(detect_active_add 2>/dev/null || true)
has_dev=$(has_dev_action 2>/dev/null && echo "true" || echo "false")

# ═══════════════ 四象限分流 ═══════════════

# Q1: 无 ADD + 无 dev → 正常停
if [ -z "$state" ] && [ "$has_dev" != "true" ]; then
  exit 0
fi

# Q2: 无 ADD + 有 dev → 严重违规，强制阻止
if [ -z "$state" ] && [ "$has_dev" = "true" ]; then
  build_stop_context "no_add_has_dev" >&2
  exit 2
fi

# 解析 state
plan=$(echo "$state" | cut -d':' -f1 | sed 's/^:://')
step_info=$(echo "$state" | awk -F'::' '{print $2}')
round_info=$(echo "$state" | awk -F'::' '{print $3}')
handoff=$(echo "$state" | awk -F'::' '{print $4}')
add_route=$(echo "$state" | awk -F'::' '{print $5}')

# Q3: 有 ADD + 无 dev → 注入状态
if [ "$has_dev" != "true" ]; then
  echo "[ADD Stop] Plan: ${plan}, 轮次: ${round_info}, Step: ${step_info}"
  echo "本次无代码改动。下次继续时执行 session-init 恢复上下文。"
  exit 0
fi

# Q4: 有 ADD + 有 dev → Step 定位分流
issues=$(check_add_completeness "$handoff" "$add_route" 2>/dev/null || true)

# 提取 Step 勾选数
ck=$(grep -c '\[x\]' "$add_route" 2>/dev/null || true); ck=${ck:-0}
uc=$(grep -c '\[ \]' "$add_route" 2>/dev/null || true); uc=${uc:-0}

# Step 0-2: 文档/审计阶段（勾选数 < 3 或 Step 0/1/2 任一项 [ ]）
if [ "$ck" -lt 3 ] 2>/dev/null; then
  echo "[ADD Stop] ADD 阶段: 文档先行/审计准备 (add-route ${ck}/${total})."
  echo "无需验收闭环。下一步: 进入 Step 3 代码实现。"
  exit 0
fi

# Step 3 进行中: 有 [ ] Step 但非全部完成
if [ "$uc" -gt 0 ] 2>/dev/null && [ -n "$issues" ]; then
  echo "[ADD Stop] ADD Step 3: 代码实现进行中 (add-route ${ck}/${total})."
  echo "tasks.md 还有 ${uc} 项待完成。"
  exit 0
fi

# Step 3+ 完成 + 未闭环
if [ -n "$issues" ]; then
  build_stop_context "has_add_dev_unclosed" "$issues" >&2
  exit 2
fi

# 全部闭环
clear_dev_action 2>/dev/null || true
echo "[ADD Stop] ✅ 验收闭环: add-route 全部 [x], devlog 已写, handoff 已更新。"
exit 0
