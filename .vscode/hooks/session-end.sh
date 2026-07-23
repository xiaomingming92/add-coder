#!/bin/bash
# SessionEnd — VS Code Copilot 适配（薄包装）
# 治理卡位 #2: 标记清理 + 会话审计结算 + Stop未触发兜底
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export PROJECT_DIR="$PWD"

# source 共享版本并自动执行 main()
SHARED="$HOOK_DIR/lib/session-end.sh"
if [ -f "$SHARED" ]; then
  source "$SHARED"
fi
