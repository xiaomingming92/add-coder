#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-08-19 10:12:28
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-08-19 10:12:29
 # @FilePath     : /farm-agent/home/xmm/ai/add-coder/tests/stop-prompt-limit-isolation.sh
 # @Description  : 
### 
# 临时验证脚本：隔离 / 窗口重置 / 损坏降级
cd /home/xmm/ai/farm-agent || exit 1
SENTINEL=$(ls /tmp/add_stop_*.json 2>/dev/null | head -1)
if [ -z "$SENTINEL" ]; then SENTINEL="/tmp/add_stop_478ae3bd.json"; fi
NOW=$(date +%s%3N)
OLD=$((NOW - 31*60*1000))

# 4.2 隔离：哨兵仅含无关 plan（count 3），当前 plan 首次触发应弹框 exit 2
printf '{"planA-fake":{"count":3,"lastPromptAt":%s}}' "$NOW" > "$SENTINEL"
echo '{}' | node .qoder/hooks/stop-check.mjs > /dev/null 2>/tmp/iso_err.txt
echo "4.2 隔离验证 exit=$?（期望 2）"
grep -c "任务进度" /tmp/iso_err.txt

# 4.3 窗口重置：当前 plan count 3 但 lastPromptAt 超 31 分钟 → 重置为 1 并弹框 exit 2
printf '{"farm-agent-文档管线对齐-plan-v1":{"count":3,"lastPromptAt":1787103695717}}' > "$SENTINEL"
echo '{}' | node .qoder/hooks/stop-check.mjs > /dev/null 2>/tmp/win_err.txt
echo "4.3 窗口重置 exit=$?（期望 2）"
echo "哨兵 after: $(cat "$SENTINEL")"

# 4.4 损坏降级：非法 JSON → fail-open 放行 exit 0
printf '{{{bad json' > "$SENTINEL"
echo '{}' | node .qoder/hooks/stop-check.mjs > /dev/null 2>/tmp/bad_err.txt
echo "4.4 损坏降级 exit=$?（期望 0）"
