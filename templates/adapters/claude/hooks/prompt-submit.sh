#!/bin/bash
# UserPromptSubmit — 用户输入提交前检查（ADD 关键词兜底）
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_LIB="$HOOK_DIR/../../shared/hooks-lib/common.sh"
[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"

input=$(parse_input)
prompt=$(echo "$input" | jq -r '.prompt // empty')

# 检测 ADD 关键词触发
if echo "$prompt" | grep -qiE '开发|改功能|修.?bug|加需求|新增|重构|实施|验收|继续'; then
  echo "[ADD PromptSubmit] 检测到开发关键词，请确认已加载 ADD 工作流上下文。"
fi
exit 0