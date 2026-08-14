#!/bin/bash
# SessionStart — ADD 上下文恢复 + 模板索引注入（Claude Code 适配）
# 治理卡位 #1: ADD状态恢复 + 模板索引注入
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")

# 加载四端通用函数（路径统一后: .claude/hooks/lib/common.sh）
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

# 设置项目目录
export PROJECT_DIR="$PWD"

# ── ① ADD 状态恢复 ──
state=$(detect_active_add 2>/dev/null || true)
if [ -n "$state" ]; then
  IFS='::' read -r plan step rounds handoff add_route <<< "$state"
  cat <<EOF
[ADD SessionStart] 检测到活跃 ADD Plan:
  Plan: ${plan}
  轮次: ${rounds}
  当前 Step: ${step}
  handoff: ${handoff}
  恢复命令: query_audit_logs({ planKeyword: '${plan}' })
EOF
fi

# ── ② 模板索引注入 ──
TPL_SCRIPT="$HOOK_DIR/lib/preload-templates.sh"
if [ -f "$TPL_SCRIPT" ]; then
  bash "$TPL_SCRIPT" --index
fi

# ── ③ §代办刷新：活跃 Plan 时提醒加载 IDE 代办 ──
# session-init Step 2.6 依赖 IDE resume invoke SKILL，本段作为兜底
if [ -n "$state" ]; then
  IFS='::' read -r plan step rounds handoff add_route <<< "$state"
  cat <<EOF
[代办] 检测到活跃 Plan: ${plan}。如有未加载的 IDE 代办清单，请从 tasks.md §IDE JSON 刷新 TodoWrite。
EOF
fi

# ── ④ §HITL 待审批检测 ──
if [ -d "$PLANS_DIR" ]; then
  hitl_count=$(find "$PLANS_DIR" -name "*.hitl.md" -mtime -7 -type f 2>/dev/null | wc -l)
  if [ "$hitl_count" -gt 0 ] 2>/dev/null; then
    echo "[HITL 待审批] 检测到 ${hitl_count} 个待审批 HITL 提案，请检查并处理"
  fi
fi

exit 0
