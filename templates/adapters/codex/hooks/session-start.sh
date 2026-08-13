#!/bin/bash
# SessionStart — ADD 上下文恢复 + 模板索引注入（Codex 适配）
# 治理卡位 #1: ADD状态恢复 + 模板索引注入
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=".codex"
export MAGIC_DIR=".codex"
export PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# 加载四端通用函数（路径统一后: .claude/hooks/lib/common.sh）
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

# Codex 可能从 repo 子目录启动；状态仍只读取 Codex 自己的 `.codex`。
export PLANS_DIR="$PROJECT_DIR/$MAGIC_DIR/plans"

# ── ① ADD 状态恢复 ──
state=$(detect_active_add 2>/dev/null || true)
if [ -n "$state" ]; then
  plan=$(echo "$state" | awk -F'::' '{print $1}')
  step=$(echo "$state" | awk -F'::' '{print $2}')
  rounds=$(echo "$state" | awk -F'::' '{print $3}')
  handoff=$(echo "$state" | awk -F'::' '{print $4}')
  add_route=$(echo "$state" | awk -F'::' '{print $5}')
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
# core lib 的相对路径面向其他 adapter；Codex 直接读取项目 `.codex/templates`。
TEMPLATES_DIR="$PROJECT_DIR/$CURRENT_MAGIC/templates"
if [ -d "$TEMPLATES_DIR" ]; then
  echo "## ADD 可用模板清单"
  for template_path in "$TEMPLATES_DIR"/*.md; do
    [ -f "$template_path" ] || continue
    echo "- $(basename "$template_path")"
  done
fi

# ── ③ §代办刷新：活跃 Plan 时提醒加载 IDE 代办 ──
# session-init Step 2.6 依赖 IDE resume invoke SKILL，本段作为兜底
if [ -n "$state" ]; then
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
