#!/bin/bash
# ADD Hook 共享库 — 退出码常量 + stdin JSON 解析
# 被 Claude/Qoder adapter 的 hook 脚本 source 引用

# 退出码常量
export EXIT_PASS=0   # 放行
export EXIT_BLOCK=2  # 阻断

# 从 stdin 解析 JSON 输入（hook 事件通过 stdin 传入 JSON）
parse_input() {
  if [ -t 0 ]; then
    echo "{}"
  else
    cat
  fi
}

# 从 JSON 中提取字段值（简单实现，不依赖 jq）
# 用法: json_get "$json" "field_name"
json_get() {
  echo "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'
}