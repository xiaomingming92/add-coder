#!/bin/bash
# notify.sh — Hook 拦截事件写入 jsonl（零外部依赖，bash 原生）
# 用法: source 后在 exit 2 前调用 write_hook_event
#
# 写入格式（7 字段 jsonl）:
#   {"ts":"ISO8601","hook":"...","decision":"deny","cmd":"...","reason":"...","planKeyword":"...","planStatus":"..."}
#
# 磁盘管理:
#   - 单文件 ≤256KB，超限轮转为 .old（覆盖，不累积多份）
#   - 总量 ≤512KB（当前 + 一个 .old）
#   - MCP Server 宕机不丢事件，重启后从文件恢复消费

write_hook_event() {
  local hook="$1" decision="$2" cmd="$3" reason="$4" plan="${5:-unknown}" status="${6:-none}" extra="${7:-}"
  local dir=".codex/reports"
  mkdir -p "$dir" 2>/dev/null || true
  local file="$dir/hook-events.jsonl"

  # 超过 256KB 自动轮转（262144 bytes）
  if [ -f "$file" ]; then
    local sz
    sz=$(stat -c%s "$file" 2>/dev/null || echo 0)
    [ "$sz" -gt 262144 ] && mv "$file" "${file}.old" 2>/dev/null || true
  fi

  # extra 为可选 JSON 片段（Task 1.5 数据契约：anchor_hit/struct_score/override 等），非空时以逗号拼接
  printf '{"ts":"%s","hook":"%s","decision":"%s","cmd":"%s","reason":"%s","planKeyword":"%s","planStatus":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$hook" \
    "$decision" \
    "$cmd" \
    "$reason" \
    "$plan" \
    "$status" \
    "${extra:+,$extra}" >> "$file"
}
