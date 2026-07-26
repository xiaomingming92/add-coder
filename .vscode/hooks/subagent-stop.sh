#!/bin/bash
# SubagentStop — VS Code Copilot 适配（薄包装）
# 治理卡位 #11: 子agent边界校验 + 审计聚合 + 阻断
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export PROJECT_DIR="$PWD"

SHARED="$HOOK_DIR/lib/subagent-stop.sh"
if [ -f "$SHARED" ]; then
  source "$SHARED"
fi
