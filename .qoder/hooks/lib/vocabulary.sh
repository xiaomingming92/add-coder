#!/bin/bash
# vocabulary.sh — 从 vocabulary markdown 表格加载触发词
# 单一数据源: .qoder/vocabulary/add-governance-vocabulary.md §类别 A-F 表格

VOCABULARY_FILE="${PROJECT_DIR:-$PWD}/.qoder/vocabulary/add-governance-vocabulary.md"

# 输出格式: 优先级::触发词正则::响应文本（:: 避免与触发词内的 | 冲突）
load_triggers() {
  [ ! -f "$VOCABULARY_FILE" ] && return 1
  sed -n '/^## 类别 A: 文档类型/,/^## 类别 [G-Z]/p' "$VOCABULARY_FILE" \
    | grep -E '^\| (P0|P1|P2) ' \
    | while IFS='|' read -r _ prio raw_trigger action; do
        prio=$(echo "$prio" | xargs)
        trigger=$(echo "$raw_trigger" | sed 's/`//g;s/ *\/ */|/g;s/^ *//;s/ *$//')
        action=$(echo "$action" | xargs)
        [ -z "$trigger" ] && continue
        echo "${prio}::${trigger}::${action}"
      done || true
}

match_trigger() {
  local prompt="$1"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local prio="${line%%::*}"
    local rest="${line#*::}"
    local regex="${rest%%::*}"
    local action="${rest#*::}"
    # 跳过开发关键词检测行（由 Layer 2/3 分流处理，特征：超长regex含"修bug"）
    if echo "$regex" | grep -qE '修\.\?bug|fix\.\?bug' 2>/dev/null; then
      continue
    fi
    if echo "$prompt" | grep -qiE "$regex" 2>/dev/null; then
      echo "[ADD 触发] ${regex} → ${action}"
    fi
  done < <(load_triggers 2>/dev/null)
}

load_dev_keywords() {
  load_triggers 2>/dev/null | while IFS= read -r line; do
    [ -z "$line" ] && continue
    # 只取包含"开发|改功能"的开发关键词检测行
    if echo "$line" | grep -q '开发|改功能' 2>/dev/null; then
      local rest="${line#*::}"
      local regex="${rest%%::*}"
      echo "$regex"
    fi
  done || true
}
