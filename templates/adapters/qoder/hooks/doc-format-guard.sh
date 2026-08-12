#!/bin/bash
# doc-format-guard.sh — schema.json 驱动的 ADD 文档格式守卫
set -euo pipefail

input=$(cat)

# 动态探测 MAGIC_DIR（兼容多 adapter）
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$HOOK_DIR")"
MAGIC_DIR="$(basename "$PARENT_DIR")"
PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"

# ── Hook 通知: 拦截事件写入 jsonl（旁路，失败不阻断 exit 2）──
source "${HOOK_DIR}/lib/notify.sh" 2>/dev/null || true
ACTIVE_PLAN=$(detect_active_add 2>/dev/null || true)
if [ -n "$ACTIVE_PLAN" ]; then
  PLAN_KEYWORD="${ACTIVE_PLAN%%::*}"
  PLAN_STATUS="active"
else
  PLAN_KEYWORD="no-active-plan"
  PLAN_STATUS="none"
fi

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

if ! echo "$file_path" | grep -qE "$MAGIC_DIR/(plans|specs)/"; then
  exit 0
fi

CONTENT=$(echo "$input" | jq -r '
  if .tool_input.file_content then .tool_input.file_content
  elif .tool_input.content then .tool_input.content
  elif .tool_input.new_string then .tool_input.new_string
  elif .tool_input.new_string then .tool_input.new_string
  elif .tool_input.replacements then .tool_input.replacements[0].new_text
  else "" end')
# L24: PostToolUse 不可阻断（仅反馈），PreToolUse exit 2 + ask 可拦截
# L24: 文件在 .qoder/(plans|specs)/ 下但 Write 工具未传 content → 无法校验，阻断
if [ -z "$CONTENT" ]; then
  echo "⛔ 拒绝：Write 工具未传 file_content，无法校验手写文档格式" >&2
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Write 工具未传 file_content，无法校验手写文档。请用 SearchReplace 改写已有文件，或用 Write 工具重试。"}}'
  write_hook_event "doc-format-guard" "deny" "Write" "Write 工具未传 file_content" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
  exit 2
fi

PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
TEMPLATES_DIR="$PROJECT_DIR/$MAGIC_DIR/templates"

# 文件名类型 token 匹配（特异性排序，取代子串 grep；R5/Task 1.4）
# review/handoff 不在此层绑定（需内容特征细分单多轮/运行时），留给下方探测链
TEMPLATE_NAME=""
base=$(basename "$file_path")
base=${base%-v[0-9]*}
case "$base" in
  *add-route*heavy*) TEMPLATE_NAME="add-route-template-heavyweight.md" ;;
  *add-route*)       TEMPLATE_NAME="add-route-template.md" ;;
  *hitl*)            TEMPLATE_NAME="hitl-template.md" ;;
  *handoff*)         : ;;  # R15: 跳过 token 层，交内容探测链；必须在 *report* 前，防含 report 的 handoff 被误吞
  *checklist*)       TEMPLATE_NAME="checklist-template.md" ;;
  *fix-verif*)       TEMPLATE_NAME="fix-verification-template.md" ;;
  *report*runtime*)  TEMPLATE_NAME="runtime-report-template.md" ;;
  *report*)          TEMPLATE_NAME="report-template.md" ;;
  *tasks*)           TEMPLATE_NAME="tasks-template.md" ;;
  *spec*)            TEMPLATE_NAME="spec-template.md" ;;
  *plan*)            TEMPLATE_NAME="standard-plan-template.md" ;;
esac

# 退一步：根据文件内容特征猜测模板类型
if [ -z "$TEMPLATE_NAME" ]; then
  if grep -q "## PLAN 元信息" <<< "$CONTENT"; then
    TEMPLATE_NAME="standard-plan-template.md"
  elif grep -q "## 一、Plan 概述" <<< "$CONTENT"; then
    TEMPLATE_NAME="simple-plan-template.md"
  elif grep -q "## 四、Handoff" <<< "$CONTENT"; then
    TEMPLATE_NAME="simple-plan-template.md"
  elif grep -q "## Review 元信息" <<< "$CONTENT"; then
    if grep -q "运行时验证" <<< "$CONTENT"; then
      TEMPLATE_NAME="review-runtime-template.md"
    elif grep -q "跨仓库格式契约" <<< "$CONTENT"; then
      TEMPLATE_NAME="review-implementation-template.md"
    else
      TEMPLATE_NAME="review-template.md"
    fi
  elif grep -q "## Why" <<< "$CONTENT"; then
    TEMPLATE_NAME="spec-template.md"
  elif grep -q "## Preconditions" <<< "$CONTENT"; then
    TEMPLATE_NAME="tasks-template.md"
  elif grep -q "审计链（证据→devlog→checklist）" <<< "$CONTENT"; then
    TEMPLATE_NAME="checklist-template.md"
  else
    case "$file_path" in
      *handoff*)
        # ★ 按内容特征区分单/多轮 handoff，不依赖文件名
        if grep -qF "## 全局元信息" <<< "$CONTENT"; then
          TEMPLATE_NAME="handoff-multi-round-template.md"
        elif grep -qF "## 1. 交接前状态" <<< "$CONTENT"; then
          TEMPLATE_NAME="handoff-single-round-template.md"
        else
          echo "⛔ handoff 文件内容无法识别模板类型（缺 '## 全局元信息' 或 '## 1. 交接前状态'），拒绝写入" >&2
          echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"handoff 内容不符合 single/multi 模板规范"}}'
          write_hook_event "doc-format-guard" "deny" "$file_path" "handoff 模板类型无法识别" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
          exit 2
        fi
        ;;
      *add-route*heavy*) TEMPLATE_NAME="add-route-template-heavyweight.md" ;;
      *add-route*)       TEMPLATE_NAME="add-route-template.md" ;;
      *plan*)            TEMPLATE_NAME="standard-plan-template.md" ;;
      *tasks*)           TEMPLATE_NAME="tasks-template.md" ;;
      *spec*)            TEMPLATE_NAME="spec-template.md" ;;
      *checklist*)       TEMPLATE_NAME="checklist-template.md" ;;
      *report*runtime*)  TEMPLATE_NAME="runtime-report-template.md" ;;
      *report*)          TEMPLATE_NAME="report-template.md" ;;
      *fix-verif*)       TEMPLATE_NAME="fix-verification-template.md" ;;
      *hitl*)           TEMPLATE_NAME="hitl-template.md" ;;
      *) 
        # 增量修订识别：包含 ~~删除线~~ / → 新增标记 / [修订日期] 任意一个 → 视为增量更新，放行
        if grep -qE '~~.+~~|→|\[[0-9]{4}-[0-9]{2}-[0-9]{2}\s+修订' <<< "$CONTENT"; then
          echo "[doc-format-guard] 检测到增量修订格式，跳过完整章节校验" >&2
          exit 0
        fi
        echo "⛔ 拒绝：无法识别文档类型 (file_path: $file_path)，缺少模板匹配规则" >&2
        echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"无法识别 ADD 文档类型，请联系管理员更新 doc-format-guard.sh"}}'
        write_hook_event "doc-format-guard" "deny" "$file_path" "无法识别文档类型" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
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
  write_hook_event "doc-format-guard" "deny" "$file_path" "缺少 .schema.json 校验规则" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
  exit 2
fi

# SearchReplace 只传 patch（replacements[].new_text），不传全文件 → 跳过章节校验
IS_SEARCH_REPLACE=$(echo "$input" | jq -r '(.tool_input.replacements | length > 0) or (.tool_input.new_string != null) // false')

ISSUES=""

# ── 章节校验 ──
# 使用项目目录下的临时文件，避免 /tmp 在沙箱中不可写导致静默跳过
TMPFILE="$PROJECT_DIR/$MAGIC_DIR/.doc-guard-issues.tmp"
: > "$TMPFILE"
trap "rm -f $TMPFILE" EXIT

# ── 锚定校验（锚定制：schema 声明 anchor，参照内容从模板现场提取；Task 1.2）──
# 锚点不在模板 → 跳过该规则 + stderr 告警（不阻塞写入，冒烟巡检兑底）
# within 前缀匹配；heading 缺失 → 跳过规则 + 告警（不误拦）
if [ "$IS_SEARCH_REPLACE" != "true" ]; then
  jq -r '.sections[] | select(.anchor != null) | .id + "|" + .anchor + "|" + (.within // "")' "$SCHEMA_FILE" 2>/dev/null | while IFS='|' read -r aid anchor within; do
    [ -z "$anchor" ] && continue
    ref_line=$(grep -m1 -F "$anchor" "$TEMPLATES_DIR/$TEMPLATE_NAME" 2>/dev/null || true)
    if [ -z "$ref_line" ]; then
      echo "[doc-format-guard] anchor_miss: schema ${aid} 声明的 anchor '${anchor}' 在 ${TEMPLATE_NAME} 中未定位，跳过该规则（冒烟巡检兑底）" >&2
      continue
    fi
    tokens=$(echo "$ref_line" | tr '#*`|(){' '         ' | tr -s ' ' '\n' | grep -v '^$' | grep -vF '{' | sort -u)
    [ -z "$tokens" ] && continue
    scope="$CONTENT"
    if [ -n "$within" ]; then
      if grep -q "^${within}" <<< "$CONTENT"; then
        scope=$(sed -n "/^${within}/,/^## /p" <<< "$CONTENT")
      else
        echo "[doc-format-guard] within_miss: schema ${aid} 的 within '${within}' 在文档中未定位，跳过该规则" >&2
        continue
      fi
    fi
    # 声明级缺失统计：一个锚点声明的必选 token 有任一缺失即记 1 条规则缺失（struct_score 精确语义）
    miss_tokens=""
    for tok in $tokens; do
      if ! grep -qF "$tok" <<< "$scope"; then
        miss_tokens="${miss_tokens}${tok} "
      fi
    done
    # if 语句（非 && 链）：miss_tokens 为空时返回 0，避免 while 管道退出码非零触发 set -e
    if [ -n "$miss_tokens" ]; then
      echo "  缺锚点(${aid}): ${miss_tokens}"
    fi
  done >> "$TMPFILE"
fi

# SearchReplace 只传 patch → 跳过章节/子章节校验（无法从 patch 推断完整文档结构）
if [ "$IS_SEARCH_REPLACE" != "true" ]; then
  jq -r '.sections[] | select(.required == true) | select(.heading != null) | .heading' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r heading; do
    if ! grep -qF "$heading" <<< "$CONTENT"; then
      echo "  缺章节: $heading"
    fi
  done >> "$TMPFILE"

  # 子章节
  jq -r '.sections[].subsections[]? | select(.heading != null) | .heading' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r sub; do
    if ! grep -qF "$sub" <<< "$CONTENT"; then
      echo "  缺子章节: $sub"
    fi
  done >> "$TMPFILE"
fi

# ── 占位符校验 ──
jq -r '.placeholders[]?' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r ph; do
  if grep -qF "$ph" <<< "$CONTENT"; then
    echo "  未替换占位符: $ph"
  fi
done >> "$TMPFILE"

# ── 结构位禁词校验（仅标题行 + schema 声明的 groupColumn；正文叙述免疫；Task 1.2）──
struct_text=$(grep -E '^#{2,}[[:space:]]' <<< "$CONTENT")
col=$(jq -r '.groupColumn // empty' "$SCHEMA_FILE" 2>/dev/null)
if [ -n "$col" ]; then
  struct_text="${struct_text}
$(awk -F'|' -v c="$col" 'NF>c {gsub(/^[[:space:]]+|[[:space:]]+$/, "", $(c+1)); print $(c+1)}' <<< "$CONTENT")"
fi
jq -r '.forbidden_terms[]?' "$SCHEMA_FILE" 2>/dev/null | while IFS= read -r term; do
  # 结构位（标题行/分组列）是原子单元：定串匹配即可命中；正文不参与（豁免由提取范围保证）
  if grep -qF "$term" <<< "$struct_text"; then
    echo "  结构位禁词: $term"
  fi
done >> "$TMPFILE"

ISSUES=$(cat "$TMPFILE" 2>/dev/null)

# ── 算法化规则校验（ADD 范式约束下沉为代码）──
ALGO_ISSUES=""

# 规则1: 精简版 Plan 反作弊
if echo "$TEMPLATE_NAME" | grep -q 'simple-plan'; then
  # 1a. 文件数 ≤ 3
  file_count=$(grep -cP '^\|\s*`[^`]+`' <<< "$CONTENT" 2>/dev/null || echo "0")
  if [ "$file_count" -gt 3 ] 2>/dev/null; then
    ALGO_ISSUES="${ALGO_ISSUES}  ❌ 精简版反作弊: 涉及 ${file_count} 个文件（超过 3 个限制），应改用 standard-plan-template.md\n"
  fi
  # 1b. HITL 表不能写 "等 N 个文件"
  if grep -qP '等\s*\d*\s*个文件|等\s*若干' <<< "$CONTENT"; then
    ALGO_ISSUES="${ALGO_ISSUES}  ❌ 精简版反作弊: HITL 表文件清单使用模糊描述（'等 N 个文件'），必须列出实际完整路径\n"
  fi
  # 1c. HITL 方案/设计决策不能写 "等若干决策"
  if grep -qP '等\s*若干\s*(决策|方案|设计)' <<< "$CONTENT"; then
    ALGO_ISSUES="${ALGO_ISSUES}  ❌ 精简版反作弊: HITL 表方案/设计决策使用模糊描述（'等若干决策'），必须逐条列出\n"
  fi
  # 1d. 不能包含架构设计章节（精简版无架构设计）
  if grep -q '## 三、架构设计' <<< "$CONTENT"; then
    ALGO_ISSUES="${ALGO_ISSUES}  ❌ 精简版反作弊: 包含 '## 三、架构设计' 章节，精简版不应有架构设计——应改用 standard-plan-template.md\n"
  fi
fi

# 规则2: HITL 表非空校验（所有 Plan + Review 模板）
if echo "$TEMPLATE_NAME" | grep -qE 'plan|review'; then
  if grep -q '## HITL' <<< "$CONTENT"; then
    # HITL 表至少要有 1 行非占位符内容（不包含 { } 占位符）
    hitl_rows=$(sed -n '/## HITL/,/^## /p' <<< "$CONTENT" | grep -cP '^\|\s*[^|{]*\s*\|' 2>/dev/null || echo "0")
    # rows 包含表头行和分隔行，实际数据行 = rows - 2
    hitl_data=$((hitl_rows - 2))
    if [ "$hitl_data" -lt 1 ] 2>/dev/null; then
      ALGO_ISSUES="${ALGO_ISSUES}  ⚠️  HITL 表为空——必须填写至少 1 行实际内容后再提交审核\n"
    fi
  fi
fi

# 规则3: 精简版 Plan 禁止同时存在独立 handoff 文件
if echo "$TEMPLATE_NAME" | grep -q 'simple-plan'; then
  plan_base=$(basename "$file_path" | sed 's/-plan-v.*//')
  plan_dir=$(dirname "$file_path")
  handoff_pattern="${plan_dir}/${plan_base}-handoff"
  if find "$plan_dir" -name "${plan_base}-handoff*.md" 2>/dev/null | grep -q .; then
    ALGO_ISSUES="${ALGO_ISSUES}  ❌ 精简版 Handoff 冲突: 检测到独立 handoff 文件（${plan_base}-handoff*.md）。精简版 Plan 的 Handoff 已融合在 §四，不应生成独立文件。请删除独立 handoff 文件或改用 standard-plan-template.md\n"
  fi
fi

if [ -n "$ALGO_ISSUES" ]; then
  echo "⛔ 算法化规则校验不通过:" >&2
  echo -e "$ALGO_ISSUES" >&2
  # 合并到 ISSUES 中一起阻断
  echo -e "$ALGO_ISSUES" >> "$TMPFILE"
fi

ISSUES=$(cat "$TMPFILE" 2>/dev/null)

# ── 判定回流 extra（Task 1.5 数据契约：anchor_hit/struct_score 精确语义；override 由上层 hook 在人类推翻时追加）──
# struct_score = (适用规则数 - 缺失规则数) / 适用规则数 × 100，适用规则从 schema 实况计数
anchor_total=$(jq -r '[.sections[] | select(.anchor != null)] | length' "$SCHEMA_FILE" 2>/dev/null || echo 0)
heading_total=$(jq -r '[.sections[] | select(.required == true and .heading != null)] | length' "$SCHEMA_FILE" 2>/dev/null || echo 0)
sub_total=$(jq -r '[.sections[].subsections[]? | select(.heading != null)] | length' "$SCHEMA_FILE" 2>/dev/null || echo 0)
term_total=$(jq -r '.forbidden_terms | length' "$SCHEMA_FILE" 2>/dev/null || echo 0)
if [ "$IS_SEARCH_REPLACE" = "true" ]; then
  applied=$term_total  # patch 路径仅禁词规则适用
else
  applied=$(( anchor_total + heading_total + sub_total + term_total ))
fi
missed=$(wc -l < "$TMPFILE" 2>/dev/null | tr -d ' ')
missed=${missed:-0}
anchor_hit=true
grep -q "缺锚点" "$TMPFILE" 2>/dev/null && anchor_hit=false
struct_score=100
if [ "$applied" -gt 0 ] 2>/dev/null && [ "$missed" -gt 0 ] 2>/dev/null; then
  struct_score=$(( (applied - missed) * 100 / applied ))
  [ "$struct_score" -lt 0 ] && struct_score=0
fi
BACKFLOW_EXTRA="\"anchor_hit\":${anchor_hit},\"struct_score\":${struct_score}"

# ── 阻断或放行 ──
if [ -n "$ISSUES" ]; then
  echo "⛔ $TEMPLATE_NAME 校验不通过:
$ISSUES" >&2
  # 明细注入 stdout reason（去引号防 JSON 破坏，截断 180 字），让被拦方第一时间知道改什么
  ISSUES_BRIEF=$(printf '%s' "$ISSUES" | tr '\n' ' ' | tr -d '"' | tr -s ' ' | cut -c1-180)
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"文档格式校验不通过: ${ISSUES_BRIEF}\"}}"
  write_hook_event "doc-format-guard" "deny" "$file_path" "文档格式校验不通过" "$PLAN_KEYWORD" "$PLAN_STATUS" "$BACKFLOW_EXTRA" 2>/dev/null || true
  exit 2
fi

# ── 自动更新 index.md ──
if echo "$file_path" | grep -q "$MAGIC_DIR/plans/"; then
  if [ -x "$PROJECT_DIR/scripts/gen-plan-index.sh" ]; then
    "$PROJECT_DIR/scripts/gen-plan-index.sh" 2>/dev/null || true
  fi
fi

# 放行回流（Task 1.5：anchor_hit/struct_score 正样本底座）
write_hook_event "doc-format-guard" "allow" "$file_path" "校验通过" "$PLAN_KEYWORD" "$PLAN_STATUS" "$BACKFLOW_EXTRA" 2>/dev/null || true

exit 0
