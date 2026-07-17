#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 13:35:20
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 13:35:21
 # @FilePath     : /add-coder/templates/adapters/claude/hooks/subagent-stop.sh
 # @Description  : 
### 
# SubagentStop — Claude Code 适配（薄包装）
# 治理卡位 #11: 子agent边界校验 + 审计聚合 + 阻断
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

SHARED="$HOOK_DIR/lib/subagent-stop.sh"
if [ -f "$SHARED" ]; then
  source "$SHARED"
fi
