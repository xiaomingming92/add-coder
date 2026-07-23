#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 17:05:26
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 17:05:28
 # @FilePath     : /add-coder/templates/adapters/vscode/hooks/post-tool-failure.sh
 # @Description  : 
### 
# PostToolUseFailure — 工具失败后处理（VS Code Copilot 适配）
# 治理卡位: 错误分类 + 429降级 + 审计
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(parse_input 2>/dev/null || cat)
error=$(echo "$input" | grep -o '"error"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "未知错误")

# 429 特别处理
if echo "$error" | grep -q '429\|rate.limit\|too many requests'; then
  echo "[ADD PostToolFailure] ⚠️ 检测到 429 限流。建议切换为串行模式，降低并行调用数。" >&2
else
  echo "[ADD PostToolFailure] 工具调用失败: ${error}。请检查并修复。" >&2
fi

exit 0
