#!/bin/bash
# doc-format-guard.sh — schema.json 驱动的 ADD 文档格式守卫
set -euo pipefail

input=$(cat)

# 动态探测 MAGIC_DIR（兼容多 adapter）
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$HOOK_DIR")"
MAGIC_DIR="$(basename "$PARENT_DIR")"

# DEBUG: dump stdin for investigation
mkdir -p "$MAGIC_DIR/debug-dump"
echo "=== $(date) ===" >> "$MAGIC_DIR/debug-dump/stdin.log"
echo "file_path: $(echo "$input" | jq -r '.tool_input.file_path // "EMPTY"')" >> "$MAGIC_DIR/debug-dump/stdin.log"
echo "has_file_content: $(echo "$input" | jq 'has("tool_input") and (.tool_input | has("file_content"))')" >> "$MAGIC_DIR/debug-dump/stdin.log"
echo "has_replacements: $(echo "$input" | jq 'has("tool_input") and (.tool_input | has("replacements"))')" >> "$MAGIC_DIR/debug-dump/stdin.log"
if echo "$input" | jq -e 'has("tool_input") and (.tool_input | has("file_content"))' > /dev/null 2>&1; then
  echo "[file_content[500]]: $(echo "$input" | jq -r '.tool_input.file_content' | head -c 500)" >> "$MAGIC_DIR/debug-dump/stdin.log"
fi
if echo "$input" | jq -e 'has("tool_input") and (.tool_input | has("replacements"))' > /dev/null 2>&1; then
  echo "[replacement_new_text[500]]: $(echo "$input" | jq -r '.tool_input.replacements[0].new_text' | head -c 500)" >> "$MAGIC_DIR/debug-dump/stdin.log"
fi
echo "top_keys: $(echo "$input" | jq -r 'keys | join(", ")')" >> "$MAGIC_DIR/debug-dump/stdin.log"
echo "tool_input_keys: $(echo "$input" | jq -r '.tool_input | keys | join(", ") // "NO_TOOL_INPUT"')" >> "$MAGIC_DIR/debug-dump/stdin.log"
echo "=== DONE ===" >> "$MAGIC_DIR/debug-dump/stdin.log"
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
# L17: 非文件工具事件（空 stdin）→ 不拦截（由 matcher 层过滤）
[ -z "$file_path" ] && exit 0

if ! echo "$file_path" | grep -qE '$MAGIC_DIR/(plans|specs)/'; then
  exit 0
fi

CONTENT=$(echo "$input" | jq -r '
  if .tool_input.file_content then .tool_input.file_content
  elif .tool_input.content then .tool_input.content
  elif .tool_input.replacements then .tool_input.replacements[0].new_text
  else "" end')
# L24: PostToolUse 不可阻断（仅反馈），PreToolUse exit 2 + ask 可拦截
# L24: 文件在 .qoder/(plans|specs)/ 下但 Write 工具未传 content → 无法校验，阻断
if [ -z "$CONTENT" ]; then
  echo "⛔ 拒绝：Write 工具未传 file_content，无法校验手写文档格式" >&2
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Write 工具未传 file_content，无法校验手写文档。请用 SearchReplace 改写已有文件，或用 Write 工具重试。"}}'
  exit 2
fi

PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
TEMPLATES_DIR="$PROJECT_DIR/$MAGIC_DIR/templates"

# 通过 filename 匹配模板名
TEMPLATE_NAME=""
for tmpl in "$TEMPLATES_DIR"/*.md; do
  base=$(basename "$tmpl")
  if echo "$file_path" | grep -q "$base"; then
    TEMPLATE_NAME="$base"
    break
  fi
done

# 退一步：根据文件内容特征猜测模板类型
if [ -z "$TEMPLATE_NAME" ]; then
  if echo "$CONTENT" | grep -q "## 四、Handoff"; then
    TEMPLATE_NAME="simple-standard-plan-template.md"
  elif echo "$CONTENT" | grep -q "## PLAN 元信息"; then
    TEMPLATE_NAME="standard-plan-template.md"
  elif echo "$CONTENT" | grep -q "## Review 元信息"; then
    if echo "$CONTENT" | grep -q "运行时验证"; then
      TEMPLATE_NAME="review-runtime-template.md"
    elif echo "$CONTENT" | grep -q "跨仓库格式契约"; then
      TEMPLATE_NAME="review-implementation-template.md"
    else
      TEMPLATE_NAME="review-template.md"
    fi
  elif echo "$CONTENT" | grep -q "## Why"; then
    TEMPLATE_NAME="spec-template.md"
  elif echo "$CONTENT" | grep -q "## Preconditions"; then
    TEMPLATE_NAME="tasks-template.md"
  elif echo "$CONTENT" | grep -q "审计链（证据→devlog→checklist）"; then
    TEMPLATE_NAME="checklist-template.md"
  else
    case "$file_path" in
      *handoff*)
        # ★ 按内容特征区分单/多轮 handoff，不依赖文件名
        if echo "$CONTENT" | grep -qF "## 全局元信息"; then
          TEMPLATE_NAME="handoff-multi-round-template.md"
        elif echo "$CONTENT" | grep -qF "## 1. 交接前状态"; then
          TEMPLATE_NAME="handoff-single-round-template.md"
        else
          echo "⛔ handoff 文件内容无法识别模板类型（缺 '## 全局元信息' 或 '## 1. 交接前状态'），拒绝写入" >&2
          echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"handoff 内容不符合 single/multi 模板规范"}}'
          exit 2
        fi
        ;;
      *plan*)            TEMPLATE_NAME="standard-plan-template.md" ;;
      *add-route*heavy*) TEMPLATE_NAME="add-route-template-heavyweight.md" ;;
      *add-route*)       TEMPLATE_NAME="add-route-template.md" ;;
      *tasks*)           TEMPLATE_NAME="tasks-template.md" ;;
      *spec*)            TEMPLATE_NAME="spec-template.md" ;;
      *checklist*)       TEMPLATE_NAME="checklist-template.md" ;;
      *report*runtime*)  TEMPLATE_NAME="runtime-report-template.md" ;;
      *report*)          TEMPLATE_NAME="report-template.md" ;;
      *fix-verif*)       TEMPLATE_NAME="fix-verification-template.md" ;;
      *) 
        # 增量修订识别：包含 ~~删除线~~ / → 新增标记 / [修订日期] 任意一个 → 视为增量更新，放行
        if echo "$CONTENT" | grep -qE '~~.+~~|→|\[[0-9]{4}-[0-9]{2}-[0-9]{2}\s+修订'; then
          echo "[doc-format-guard] 检测到增量修订格式，跳过完整章节校验" >&2
          exit 0
        fi
        echo "⛔ 拒绝：无法识别文档类型 (file_path: $file_path)，缺少模板匹配规则" >&2
        echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"无法识别 ADD 文档类型，请联系管理员更新 doc-format-guard.sh"}}'
        exit 2
        ;;
    esac
  fi
fi

SCHEMA_FILE="$TEMPLATES_DIR/${TEMPLATE_NAME%.md}.schema.json"
# L84: schema 文件不存在 → 无校验规则，阻断（不允许无规则放行）
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "⛔ 阻断：模板 ${TEMPLATE_NAME} 缺少对应的 .schema.json 校验规则" >&2
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"缺少 .schema.json 校验规则文件，禁止无规则放行"}}'
  exit 2
fi

# SearchReplace 只传 patch（replacements[].new_text），不传全文件 → 跳过章节校验
IS_SEARCH_REPLACE=$(echo "$input" | jq -r '.tool_input.replacements | length > 0 // false')

ISSUES=""

# ── 章节校验 ──
# 使用项目目录下的临时文件，避免 /tmp 在沙箱中不可写导致静默跳过
TMPFILE="$PROJECT_DIR/$MAGIC_DIR/.doc-guard-issues.tmp"
: > "$TMPFILE"
trap "rm -f $TMPFILE" EXIT
# SearchReplace 只传 patch → 跳过章节/子章节校验（无法从 patch 推断完整文档结构）
if [ "$IS_SEARCH_REPLACE" != "true" ]; then
  jq -r '.sections[] | select(.required == true) | .heading' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r heading; do
    if ! echo "$CONTENT" | grep -qF "$heading"; then
      echo "  缺章节: $heading"
    fi
  done > "$TMPFILE"

  # 子章节
  jq -r '.sections[].subsections[]?.heading' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r sub; do
    if ! echo "$CONTENT" | grep -qF "$sub"; then
      echo "  缺子章节: $sub"
    fi
  done >> "$TMPFILE"
fi

# ── 占位符校验 ──
jq -r '.placeholders[]?' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r ph; do
  if echo "$CONTENT" | grep -qF "$ph"; then
    echo "  未替换占位符: $ph"
  fi
done >> "$TMPFILE"

# ── 禁止词校验 ──
jq -r '.forbidden_terms[]?' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r term; do
  if echo "$CONTENT" | grep -qw "$term"; then
    echo "  禁止词: $term"
  fi
done >> "$TMPFILE"

ISSUES=$(cat "$TMPFILE" 2>/dev/null)

# ── 阻断或放行 ──
if [ -n "$ISSUES" ]; then
  echo "⛔ $TEMPLATE_NAME 校验不通过:
$ISSUES" >&2
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"文档格式校验不通过，请对照模板修正\"}}"
  exit 2
fi

# ── 自动更新 index.md ──
if echo "$file_path" | grep -q '$MAGIC_DIR/plans/'; then
  if [ -x "$PROJECT_DIR/scripts/gen-plan-index.sh" ]; then
    "$PROJECT_DIR/scripts/gen-plan-index.sh" 2>/dev/null || true
  fi
fi

exit 0
