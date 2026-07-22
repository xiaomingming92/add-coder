#!/bin/bash
# 生成 {MAGIC_DIR}/plans/index.md 总览清单 — 按日期分层，每日自动更新
# 自动探测 MAGIC_DIR（.qoder / .claude / .vscode / .trae / .codex / .add）
set -e

# 探测 MAGIC_DIR：在当前目录向上查找包含 plans/ 的隐藏目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT="$SCRIPT_DIR"
MAGIC_DIR=""
while [ "$CURRENT" != "/" ]; do
  for d in "$CURRENT"/.qoder "$CURRENT"/.claude "$CURRENT"/.vscode "$CURRENT"/.trae "$CURRENT"/.codex "$CURRENT"/.add; do
    if [ -d "$d/plans" ]; then
      MAGIC_DIR="$d"
      break 2
    fi
  done
  CURRENT="$(dirname "$CURRENT")"
done

if [ -z "$MAGIC_DIR" ]; then
  echo "❌ 未找到 MAGIC_DIR（.qoder / .claude / .vscode / .trae / .codex / .add 均无 plans/ 子目录）" >&2
  exit 1
fi

PLANS_DIR="$MAGIC_DIR/plans"
INDEX="$PLANS_DIR/index.md"
NOW=$(date '+%Y-%m-%d %H:%M:%S')
TOTAL=$(find "$PLANS_DIR" -mindepth 2 -type f -name '*.md' ! -name 'index.md' | wc -l)

# 阶段1：收集数据到临时文件
TMP=$(mktemp)
find "$PLANS_DIR" -mindepth 2 -type f -name '*.md' ! -name 'index.md' | sort | while IFS= read -r f; do
  rel="${f#$PLANS_DIR/}"
  month="${rel%%/*}"
  rest="${rel#*/}"
  day="${rest%%/*}"
  fn=$(basename "$rel")

  case "$fn" in
    *add-route*) tag="add-route" ;;
    *handoff*)   tag="handoff" ;;
    *execution*) tag="execution" ;;
    *)           tag="plan" ;;
  esac

  topic=$(head -1 "$f" 2>/dev/null | sed 's/^#\+\s*//' | sed 's/ - .*//' | sed 's/  .*//')
  if [ -z "$topic" ] || [ "${#topic}" -le 3 ]; then
    topic=$(echo "$fn" | sed 's/\.md$//;s/-v[0-9]*$//;s/-plan$//;s/-handoff$//;s/-add-route$//;s/-execution$//;s/^farm-agent-//;s/^team-coordinator-//;s/^co-agent-//;s/^agent-//' | tr '-' ' ')
  fi

  echo "${month}|${day}|${tag}|${fn}|${topic}" >> "$TMP"
done

# 阶段2：写入 index.md
cat > "$INDEX" << EOF
# Plans 总览

> 自动生成: $NOW | 文档总数: $TOTAL | 下次更新: 每天 2:00 AM

EOF

prev_month=""
first=true
while IFS='|' read -r month day tag fn topic; do
  if [ "$month" != "$prev_month" ]; then
    prev_month="$month"
    first=true
  fi

  if $first; then
    { echo ""; echo "## $month"; echo ""; echo "| 日 | 类型 | 文档 | 主题 |"; echo "|---|------|------|------|"; } >> "$INDEX"
    first=false
  fi

  echo "| $day | $tag | [$fn]($month/$day/$fn) | $topic |" >> "$INDEX"
done < <(sort -t'|' -k1,1r -k2,2n "$TMP")

rm -f "$TMP"

echo "" >> "$INDEX"
echo "---" >> "$INDEX"
echo "*索引由 \`$(basename "$MAGIC_DIR")/scripts/gen-plan-index.sh\` 自动生成，勿手动编辑*" >> "$INDEX"

echo "✅ index.md 已更新 ($TOTAL 文档)"
