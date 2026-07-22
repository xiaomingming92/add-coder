#!/bin/bash
# pre-tool-use.sh — PreToolUse §A§B（阻断模式，通用适配版）
# §A: Bash 裸写保护 — 拦截所有绕过 IDE 追踪的文件写操作
# §B: 源码 Plan 关联检查 — 无 Plan 的 src/**/*.ts 编辑阻断
# 治理卡位 #4: 危险命令拦截 / 模板路径兜底 / 写入前置守卫 / 敏感文件保护
set -euo pipefail

input=$(cat)

# 探测 MAGIC_DIR 和 PROJECT_DIR（兼容多种 adapter）
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(dirname "$HOOK_DIR")"
MAGIC_DIR="$(basename "$PARENT")"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$(dirname "$PARENT")}}}"

# ── §A 辅助函数: 阻断日志 ──
_log_block() {
  local rule="$1" cmd="$2"
  mkdir -p "$PROJECT_DIR/$MAGIC_DIR/debug-dump"
  cat >> "$PROJECT_DIR/$MAGIC_DIR/debug-dump/stdin.log" <<BLOCKLOG
=== $(date) [BLOCKED by §A: ${rule}] ===
command: ${cmd:0:300}
=== DONE ===
BLOCKLOG
}

# ═══════════════ §A: Bash 工具写入保护 ═══════════════
# 任何通过 Bash 修改文件内容的操作都会绕过 IDE 工具层（Write/SearchReplace），
# 导致 Plan 关联检查、doc-format-guard、审计追踪全部失效。
# 因此全局阻断所有可写文件的 Bash 命令，强制走 IDE 工具通道。
command=$(echo "$input" | jq -r '.tool_input.command // empty')
if [ -n "$command" ]; then

  # 检测 1: 脚本解释器 — 可写任意文件，无法解析脚本内容做细粒度拦截
  if echo "$command" | grep -qE '^\s*(python3?|node|ruby|perl|php)(\s|$)'; then
    _reason="禁止通过脚本解释器直接修改文件。请使用 Write 或 SearchReplace 工具操作文件。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过脚本解释器直接修改文件。

  python/node/ruby/perl/php 可在脚本中写入任意文件，绕过:
    · Plan 关联检查（哪个文件属于哪个 ADD Plan？）
    · doc-format-guard（章节/占位符/禁止词校验）
    · 审计追踪（agentAudit 无法感知 Bash 内部的文件变更）

  → 请改用 Write 或 SearchReplace 工具操作文件。
  → 如需运行构建/测试脚本，使用 npx/pnpm/npm 命令。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "脚本解释器" "$command"
    exit 2
  fi

  # 检测 2: sed -i 原地编辑
  if echo "$command" | grep -qE '\bsed\b.*-i'; then
    _reason="禁止通过 sed -i 直接编辑文件。请使用 SearchReplace 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过 sed -i 原地编辑文件。

  sed -i 直接写入文件，绕过 IDE 工具层的所有校验。
  → 请改用 SearchReplace 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "sed -i" "$command"
    exit 2
  fi

  # 检测 3: 输出重定向 (>/>>) 写入文件
  if echo "$command" | grep -qE '[>]{1,2}\s+\S'; then
    _reason="禁止通过重定向写入文件。请使用 Write 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过重定向(>/>>)写入文件。

  重定向写入绕过 IDE 工具层，变更无法追踪。
  → 请改用 Write 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "重定向" "$command"
    exit 2
  fi

  # 检测 4: tee / dd 写入
  if echo "$command" | grep -qE '\btee\b|\bdd\b.*of='; then
    _reason="禁止通过 tee/dd 写入文件。请使用 Write 或 SearchReplace 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过 tee/dd 写入文件。

  → 请改用 Write 或 SearchReplace 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "tee/dd" "$command"
    exit 2
  fi

  # 检测 5: cp / mv / touch — 可创建或覆盖文件
  if echo "$command" | grep -qE '^\s*(cp|mv|touch)\b'; then
    _reason="禁止通过 cp/mv/touch 操作文件。请使用 Write 或 SearchReplace 工具。"
    cat >&2 <<'EOF'
⛔ [ADD PreToolUse §A] 阻断: 禁止通过 cp/mv/touch 操作文件。

  → 请改用 Write 或 SearchReplace 工具。
EOF
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"${_reason}\"}}"
    _log_block "cp/mv/touch" "$command"
    exit 2
  fi

  # 放行: 构建工具(npx/pnpm/npm/yarn)、版本控制(git)、
  #        只读操作(ls/cat/grep/find/head/tail/wc)、目录操作(mkdir/rmdir) 等
  exit 0
fi

# ═══════════════ §B: 源码 Plan 关联检查 ═══════════════
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

if ! echo "$file_path" | grep -qE '(src/|/src/).*\.(ts|tsx)$'; then
  exit 0
fi

MOD=$(basename "$file_path" | sed 's/\.[jt]sx\?$//')

MATCHES=$(grep -rl "$MOD" "$PROJECT_DIR/$MAGIC_DIR/plans" "$PROJECT_DIR/$MAGIC_DIR/specs" "$PROJECT_DIR/$MAGIC_DIR/reports" 2>/dev/null | wc -l)

if [ "$MATCHES" -gt 0 ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"permissionDecisionReason\":\"相关 ADD Plan 已存在\"}}"
  exit 0
fi

echo "⛔ 阻断: ${file_path} 无相关 ADD Plan。请先创建 Plan（plan-template / simple-plan-template）。" >&2
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"无相关 ADD Plan。请用 AskUserQuestion 询问用户选择 plan-template 或 simple-plan-template 创建 Plan。\"}}"
exit 2
