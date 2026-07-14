#!/bin/bash
# pre-tool-use.sh — PreToolUse §B：源码 Plan 关联检查（阻断模式 v3）
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

if ! echo "$file_path" | grep -qE '(src/|/src/).*\.(ts|tsx)$'; then
  exit 0
fi

PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
MOD=$(basename "$file_path" | sed 's/\.[jt]sx\?$//')

MATCHES=$(grep -rl "$MOD" "$PROJECT_DIR/.qoder/plans" "$PROJECT_DIR/.qoder/specs" "$PROJECT_DIR/.qoder/reports" 2>/dev/null | wc -l)

if [ "$MATCHES" -gt 0 ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"相关 ADD Plan 已存在"}}'
  exit 0
fi

echo "⛔ 阻断: ${file_path} 无相关 ADD Plan。请先创建 Plan（plan-template / simple-plan-template）。" >&2
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"无相关 ADD Plan。请用 AskUserQuestion 询问用户选择 plan-template 或 simple-plan-template 创建 Plan。"}}'
exit 2
#!/bin/bash
# pre-tool-use.sh — PreToolUse §B：源码 Plan 关联检查（阻断模式）
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

# 只处理 src/**/*.ts / src/**/*.tsx
if ! echo "$file_path" | grep -qE '^src/.*\.(ts|tsx)$' && ! echo "$file_path" | grep -qE '^/home/.*/src/.*\.(ts|tsx)$'; then
  exit 0
fi

PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
PLANS_DIR="$PROJECT_DIR/.qoder/plans"
SPECS_DIR="$PROJECT_DIR/.qoder/specs"
REPORTS_DIR="$PROJECT_DIR/.qoder/reports"

MOD=$(basename "$file_path" | sed 's/\.[jt]sx\?$//')

MATCHES=$(grep -rl "$MOD" "$PLANS_DIR" "$SPECS_DIR" "$REPORTS_DIR" 2>/dev/null \
  | sed "s|$PROJECT_DIR/||" \
  | grep -oE '[^/]*-(plan|handoff|review|report)-v[0-9]+' \
  | sed 's/\(plan\|handoff\|review\|report\)-v[0-9]\+\.md//' \
  | sort -u | head -10 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  cat >&2 <<EOF
[ADD PreToolUse] 📋 相关文档:
$(echo "$MATCHES" | sed 's/^/  - /')
允许编辑 $file_path。
EOF
  exit 0
fi

cat >&2 <<EOF
[ADD PreToolUse] ⛔ 阻断：${file_path} 无相关 ADD 文档。

必须先生成 Plan 后才能修改源码。请执行：
  ① 用 AskUserQuestion 询问用户：要创建 Plan 吗？
     A) plan-template     — 复杂改动，含架构设计 + 独立 Spec
     B) simple-plan-template — 单一修复，Tasks 内联于 Plan 体
  ② 按模板创建 Plan → Plan 中引用此文件路径
  ③ 重新执行修改操作

JSON 输出格式（阻断时必须）:
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"无相关 ADD Plan，请先生成 Plan 文档"}}
EOF

# 输出阻断 JSON 到 stdout，Qoder 会读它来展示阻断原因
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"无相关 ADD Plan，请先生成 Plan 文档"}}'
exit 2
