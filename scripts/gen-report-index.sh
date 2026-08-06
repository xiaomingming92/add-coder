#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-08-06 10:13:48
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-08-06 10:13:48
 # @FilePath     : /farm-agent/home/xmm/ai/add-coder/scripts/gen-report-index.sh
 # @Description  : 
### 
# 生成 .qoder/reports/index.md 总览清单 — 索引全部 Report 文件，每日自动更新
#
# 扫描范围:
#   - .qoder/reports/*.md                    (综合报告 / 修复验证 / 建议)
#   - .qoder/reports/runtime-report/*.md  (运行时报告，按子系统分类)
#
# 注意: .qoder/reviews/ (Plan Review) 不在本索引范围内，Review 归 Plan 管线。
#
# 依赖: 无外部依赖，纯 bash + 标准 UNIX 工具
# 来源: 由 farm-agent/scripts/gen-report-index.sh 适配（runtime-report 目录名）
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORTS_DIR="$ROOT/.qoder/reports"
INDEX="$REPORTS_DIR/index.md"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

# ──── 阶段0: 计数 ────

REPORT_COUNT_TOP=$(find "$REPORTS_DIR" -maxdepth 1 -type f -name '*.md' ! -name 'index.md' ! -name 'REPORT-WORKFLOW.md' ! -name 'boundary-runtime-report.md' 2>/dev/null | wc -l)
REPORT_COUNT_RUNTIME=$(find "$REPORTS_DIR/runtime-report" -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l)
REPORT_COUNT=$((REPORT_COUNT_TOP + REPORT_COUNT_RUNTIME))

# ──── 阶段0b: 统计修复状态 ────

count_fix_status() {
  local file="$1"
  local fixed=$(grep -c '✅ 已修复' "$file" 2>/dev/null || echo 0)
  local partial=$(grep -c '⚠️ 部分修复' "$file" 2>/dev/null || echo 0)
  local unfixed=$(grep -c '❌ 仍存在' "$file" 2>/dev/null || echo 0)
  echo "${fixed}|${partial}|${unfixed}"
}

# ──── 阶段1: 收集数据 ────

TMP="$ROOT/.qoder/.tmp_gen_report_index"
rm -f "$TMP"
trap 'rm -f "$TMP"' EXIT

# 顶层 Report 文件
find "$REPORTS_DIR" -maxdepth 1 -type f -name '*.md' \
  ! -name 'index.md' \
  ! -name 'REPORT-WORKFLOW.md' ! -name 'boundary-runtime-report.md' 2>/dev/null | sort | while IFS= read -r f; do
  fn=$(basename "$f")
  bn="${fn%.md}"
  mtime=$(stat -c '%Y' "$f" 2>/dev/null || echo 0)
  mtime_str=$(date -d "@$mtime" '+%Y-%m-%d' 2>/dev/null || echo "unknown")

  # 分类标签
  case "$fn" in
    runtime-issue-*)          tag="issue-draft" ;;
    *fix-verification*)       tag="fix-verify" ;;
    *combined-report*)        tag="combined-report" ;;
    *suggestions*)            tag="suggestions" ;;
    *)                        tag="report" ;;
  esac

  # 提取标题（第一个 # 行）
  topic=$(head -30 "$f" 2>/dev/null | grep -m1 '^# ' | sed 's/^#\+\s*//' | sed 's/ - .*//' | tr -d '\r')
  if [ -z "$topic" ] || [ "${#topic}" -le 3 ]; then
    topic="$bn"
  fi

  # 提取修复状态（仅对 verification-report）
  if [ "$tag" = "fix-verify" ]; then
    status=$(count_fix_status "$f")
  else
    status="0|0|0"
  fi

  # 提取生成时间
  gen_date=""
  gen_date=$(head -10 "$f" 2>/dev/null | grep -m1 '生成时间\|首次生成\|创建时间' | sed 's/.*：//;s/.*: //' | tr -d '\r' | xargs)
  if [ -z "$gen_date" ]; then
    gen_date="$mtime_str"
  fi

  echo "${mtime_str}|${gen_date}|${tag}|${fn}|${topic}|${status}" >> "$TMP"
done

# 运行时报告子目录文件
RUNTIME_DIR="$REPORTS_DIR/runtime-report"
if [ -d "$RUNTIME_DIR" ]; then
  find "$RUNTIME_DIR" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort | while IFS= read -r f; do
    fn=$(basename "$f")
    bn="${fn%.md}"
    rel="runtime-report/$fn"
    mtime=$(stat -c '%Y' "$f" 2>/dev/null || echo 0)
    mtime_str=$(date -d "@$mtime" '+%Y-%m-%d' 2>/dev/null || echo "unknown")

    tag="runtime-$bn"

    topic=$(head -30 "$f" 2>/dev/null | grep -m1 '^# ' | sed 's/^#\+\s*//' | sed 's/ - .*//' | tr -d '\r')
    if [ -z "$topic" ] || [ "${#topic}" -le 3 ]; then
      topic="$bn"
    fi

    gen_date=""
    gen_date=$(head -10 "$f" 2>/dev/null | grep -m1 '生成时间\|首次生成\|创建时间' | sed 's/.*：//;s/.*: //' | tr -d '\r' | xargs)
    if [ -z "$gen_date" ]; then
      gen_date="$mtime_str"
    fi

    echo "${mtime_str}|${gen_date}|${tag}|${rel}|${topic}|0|0|0" >> "$TMP"
  done
fi

# ──── 阶段2: 写入 index.md ────

cat > "$INDEX" << 'HEADER'
# Reports 总览

> 自动生成: {NOW} | 共 {TOTAL} 份 Report | 下次更新: 每天 2:10 AM
>
> 扫描范围: `.qoder/reports/`（Plan Review 在 `.qoder/reviews/`，由 Plan 管线管理）

---

## 快速导航

| 类型 | 说明 | 入口 |
|------|------|------|
| combined-report | 综合代码审查报告 | [code-review-combined-report.md](./code-review-combined-report.md) |
| fix-verify | 修复验证对照报告 | [code-review-fix-verification-report.md](./code-review-fix-verification-report.md) |
| suggestions | 审查建议（历史） | [code-review-suggestions.md](./code-review-suggestions.md) |
| runtime-report | 运行时报告（按子系统） | [runtime-report/](./runtime-report/) |
| boundary | Runtime Report ↔ 静态 Report 边界 | [boundary-runtime-report.md](./boundary-runtime-report.md) |
| workflow | Report 工作流 | [REPORT-WORKFLOW.md](./REPORT-WORKFLOW.md) |

---

## 修复概览

HEADER

# 替换占位符
sed -i "s/{NOW}/$NOW/g" "$INDEX"
sed -i "s/{TOTAL}/$REPORT_COUNT/g" "$INDEX"

# 汇总修复验证状态
if [ -f "$REPORTS_DIR/code-review-fix-verification-report.md" ]; then
  VF_STATUS=$(count_fix_status "$REPORTS_DIR/code-review-fix-verification-report.md")
  VF_FIXED=$(echo "$VF_STATUS" | cut -d'|' -f1)
  VF_PARTIAL=$(echo "$VF_STATUS" | cut -d'|' -f2)
  VF_UNFIXED=$(echo "$VF_STATUS" | cut -d'|' -f3)
  cat >> "$INDEX" << EOF
| 状态 | 数量 |
|------|:----:|
| ✅ 已修复 | ${VF_FIXED:-0} |
| ⚠️ 部分修复 | ${VF_PARTIAL:-0} |
| ❌ 仍存在 | ${VF_UNFIXED:-0} |

EOF
else
  echo "> 尚无修复验证报告。" >> "$INDEX"
  echo "" >> "$INDEX"
fi

# ──── Report 文件列表（顶层） ────

cat >> "$INDEX" << 'EOF'
---

## Report 文件

| 日期 | 类型 | 文件 | 标题 |
|------|------|------|------|
EOF

while IFS='|' read -r mtime gen_date tag fn topic status; do
  echo "| $gen_date | \`$tag\` | [$fn](./$fn) | $topic |" >> "$INDEX"
done < <(sort -t'|' -k1,1r "$TMP")

# ──── 运行时报告（按子系统分类） ────

cat >> "$INDEX" << 'EOF'

---

## 运行时报告（按子系统分类）

> `runtime-report/{subsystem}.md`，每份报告对应一个子系统。
> 由各子系统自动追加，去重后每条 Finding 对应一条记录。

| 日期 | 子系统 | 文件 | 标题 |
|------|--------|------|------|
EOF

if [ -d "$RUNTIME_DIR" ]; then
  find "$RUNTIME_DIR" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort -r | while IFS= read -r f; do
    fn=$(basename "$f")
    subsystem="${fn%.md}"
    rel="runtime-report/$fn"
    mtime=$(stat -c '%Y' "$f" 2>/dev/null || echo 0)
    mtime_str=$(date -d "@$mtime" '+%Y-%m-%d' 2>/dev/null || echo "unknown")
    topic=$(head -5 "$f" 2>/dev/null | grep -m1 '^# ' | sed 's/^#\+\s*//' | tr -d '\r')
    [ -z "$topic" ] && topic="${fn%.md}"
    echo "| $mtime_str | \`$subsystem\` | [$rel](./$rel) | $topic |" >> "$INDEX"
  done
fi

# ──── 页脚 ────

cat >> "$INDEX" << EOF

---

*索引由 \`scripts/gen-report-index.sh\` 自动生成，勿手动编辑*
*最后更新: $NOW*
EOF

echo "✅ reports/index.md 已更新 (共 ${REPORT_COUNT} 份 Report)"
