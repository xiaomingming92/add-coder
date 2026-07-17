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
export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

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

exit 0
