#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 17:05:03
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 17:05:06
 # @FilePath     : /add-coder/templates/adapters/vscode/hooks/stop-check.sh
 # @Description  : 
### 
# stop-check.sh — VS Code Copilot Stop：四象限分流 + 验收检查
# 治理卡位 #7: 验收检查 + devlog + 阻断
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="$PWD"

state=$(detect_active_add 2>/dev/null || true)
has_dev=$(has_dev_action 2>/dev/null && echo "true" || echo "false")

# ═══════ Q1: 无 ADD + 无 dev → 正常停 ═══════
if [ -z "$state" ] && [ "$has_dev" != "true" ]; then
  exit 0
fi

# ═══════ Q2: 无 ADD + 有 dev → 严重违规，few-shot 注入 ═══════
if [ -z "$state" ] && [ "$has_dev" = "true" ]; then
  build_stop_context "no_add_has_dev" >&2
  exit $EXIT_BLOCK
fi

IFS='::' read -r plan step rounds handoff add_route <<< "$state"

# ═══════ Q3: 有 ADD + 无 dev → 注入状态 ═══════
if [ "$has_dev" != "true" ]; then
  echo "[ADD Stop] Plan: ${plan}, 轮次: ${rounds}, Step: ${step}"
  echo "本次无代码改动。下次继续时执行 session-init 恢复上下文。"
  exit 0
fi

# ═══════ Q4: 有 ADD + 有 dev → 验收检查 ═══════
issues=$(check_add_completeness "$handoff" "$add_route" 2>/dev/null || true)
if [ -n "$issues" ]; then
  build_stop_context "has_add_dev_unclosed" "$issues" >&2
  exit $EXIT_BLOCK
fi

clear_dev_action 2>/dev/null || true
echo "[ADD Stop] ✅ 验收通过——checklist 全部勾选，devlog 已记录。"
exit 0
