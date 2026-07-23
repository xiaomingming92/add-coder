#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 13:36:32
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 13:36:33
 # @FilePath     : /add-coder/templates/adapters/claude/hooks/permission-denied.sh
 # @Description  : 
### 
# permission-denied.sh — Claude Code PermissionDenied：拒绝记录 + 替代方案
# 治理卡位 #14: 拒绝原因记录 + 替代方案注入
# Claude Code 独有事件
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(parse_input)
tool_name=$(json_get "$input" "tool_name")
[ -z "$tool_name" ] && tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "unknown")

reason=$(json_get "$input" "reason")
[ -z "$reason" ] && reason=$(echo "$input" | grep -o '"reason"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "权限被拒绝")

# 记录拒绝
echo "[ADD PermissionDenied] ${tool_name} 被拒绝: ${reason}" >&2

# 按工具类型提供替代建议
case "$tool_name" in
  Bash)
    echo "[ADD PermissionDenied] 建议: 使用安全的等价命令，或通过 permission-gate.sh 白名单放行" >&2
    ;;
  Write|Edit)
    echo "[ADD PermissionDenied] 建议: 检查目标路径是否在项目范围内，敏感文件（.env等）不可写入" >&2
    ;;
  Read)
    echo "[ADD PermissionDenied] 建议: 该文件可能受读保护，尝试读取项目公有文件替代" >&2
    ;;
esac

exit 0
