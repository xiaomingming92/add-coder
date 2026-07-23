#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 13:19:01
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 13:21:29
 # @FilePath     : /add-coder/templates/core/hooks/lib/preload-templates.sh
 # @Description  : ADD 模板预读脚本
### 
# preload-templates.sh — ADD 模板预读脚本
# 路径: templates/core/hooks/lib/preload-templates.sh
#
# 用法:
#   preload-templates.sh --index              # 输出模板清单（文件名 + 用途）
#   preload-templates.sh --full               # 输出全部模板全文
#   preload-templates.sh --full --top 5       # 输出前 5 个最常用模板全文
#   preload-templates.sh --full --mark        # 全文输出 + 落 tpl-injected 标记
#
# 被 SessionStart（--index）和 UserPromptSubmit（--full）调用。
# tpl-injected 标记文件用于去重——同会话二次命中时不重复注入。

set -euo pipefail

# 模板目录（相对于本脚本）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/../../../core/templates"

# tpl-injected 标记文件路径（项目级，/tmp 下按项目 hash 区分）
PROJECT_HASH=$(echo "${PROJECT_DIR:-$PWD}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
TPL_FLAG="/tmp/add_tpl_${PROJECT_HASH}"

# 模板清单（文件名:用途描述，按常用度排序）
# 顺序即 --top N 的优先级
declare -A TEMPLATES=(
  ["simple-plan-template.md"]="需求方案（简单版）：六节结构，元信息+背景+方案+架构+实施+验收"
  ["spec-template.md"]="功能规格：Why/What Changes/Impact/WHEN-THEN Requirements"
  ["tasks-template.md"]="任务拆分：Phase→Task→SubTask层级"
  ["checklist-template.md"]="验收清单：[T]编译期+[R]运行时+ADD规则合规"
  ["review-template.md"]="方案审查（ADD-9）：问题复现+方案对比+决策结论+影响评估"
  ["standard-plan-template.md"]="需求方案（标准版）：PLAN元信息+背景+方案+架构+实施Task+验收+关联文档"
  ["add-route-template-heavyweight.md"]="ADD执行路线图（重型）：每Step验证并更新状态+spec_sync交叉校验"
  ["add-route-template.md"]="ADD执行路线图（轻量）：标准Step产出检查"
  ["handoff-single-round-template.md"]="单轮交接：9章节（含恢复上下文审计查询）"
  ["handoff-multi-round-template.md"]="多轮交接：全局拓扑+每轮13子章节+收敛规则+启动模板"
  ["review-implementation-template.md"]="实现审查（ADD-10）：格式契约+框架版本+数据模型+E2E curl"
  ["review-runtime-template.md"]="运行时纠偏（ADD-11）：发现列表+根因分析+流程改进项"
  ["prd-standard-template.md"]="产品需求文档（新建）：背景目标+用户场景+功能需求+验收标准"
  ["prd-incremental-template.md"]="产品需求文档（增量）：变更摘要+diff式记录"
  ["fix-verification-template.md"]="修复验证模板"
  ["report-template.md"]="代码审查报告模板"
  ["runtime-report-template.md"]="运行时报告模板"
  ["TERMINOLOGY.md"]="模板术语速查"
)

# 按优先级排序的模板文件名列表
PRIORITY_ORDER=(
  "simple-plan-template.md"
  "spec-template.md"
  "tasks-template.md"
  "checklist-template.md"
  "review-template.md"
  "standard-plan-template.md"
  "add-route-template-heavyweight.md"
  "add-route-template.md"
  "handoff-single-round-template.md"
  "handoff-multi-round-template.md"
  "review-implementation-template.md"
  "review-runtime-template.md"
  "prd-standard-template.md"
  "prd-incremental-template.md"
  "fix-verification-template.md"
  "report-template.md"
  "runtime-report-template.md"
  "TERMINOLOGY.md"
)

# 读取模板文件内容（strip frontmatter）
read_template_content() {
  local file="$1"
  if [ -f "$file" ]; then
    # 跳过 YAML frontmatter（--- 开头和 --- 结束之间的内容）
    awk '
      BEGIN { in_fm=0; started=0 }
      NR==1 && /^---$/ { in_fm=1; next }
      in_fm && /^---$/ { in_fm=0; next }
      !in_fm { print }
    ' "$file"
  fi
}

# ── --index 模式：输出模板清单 ──

output_index() {
  echo "## ADD 可用模板清单"
  echo ""
  echo "| # | 模板文件 | 用途 |"
  echo "|---|---------|------|"
  local i=1
  for tmpl in "${PRIORITY_ORDER[@]}"; do
    if [ -f "$TEMPLATES_DIR/$tmpl" ]; then
      echo "| $i | $tmpl | ${TEMPLATES[$tmpl]:-模板文件} |"
      ((i++))
    fi
  done
}

# ── --full 模式：输出模板全文 ──

output_full() {
  local top="${1:-0}"  # 0 = 全部

  echo "## ADD 模板全文内容"
  echo ""

  local count=0
  for tmpl in "${PRIORITY_ORDER[@]}"; do
    if [ ! -f "$TEMPLATES_DIR/$tmpl" ]; then
      continue
    fi

    count=$((count + 1))
    if [ "$top" -gt 0 ] && [ "$count" -gt "$top" ]; then
      break
    fi

    echo "---"
    echo "### $tmpl"
    echo ""
    read_template_content "$TEMPLATES_DIR/$tmpl"
    echo ""
  done
}

# ── 标记文件管理 ──

mark_injected() {
  touch "$TPL_FLAG" 2>/dev/null || true
}

is_injected() {
  [ -f "$TPL_FLAG" ]
}

clear_injected() {
  rm -f "$TPL_FLAG" 2>/dev/null || true
}

# ── 主入口 ──

main() {
  local mode="index"
  local top=0
  local do_mark=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --index) mode="index"; shift ;;
      --full)  mode="full"; shift ;;
      --top)
        top="${2:-0}"
        shift 2
        ;;
      --mark) do_mark=true; shift ;;
      *) shift ;;
    esac
  done

  case "$mode" in
    index)
      output_index
      ;;
    full)
      # 去重检查：如果已注入且没有主动要求重新注入，跳过
      if is_injected && ! $do_mark; then
        echo "[ADD preload] 模板已在本会话注入，跳过重复注入（tpl-injected 标记存在）" >&2
        exit 0
      fi

      output_full "$top"

      # 落标记文件
      mark_injected
      ;;
  esac
}

main "$@"
