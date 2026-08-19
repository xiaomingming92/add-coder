#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-08-19 10:12:03
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-08-19 10:12:03
 # @FilePath     : /farm-agent/home/xmm/ai/add-coder/tests/stop-prompt-limit-smoke.sh
 # @Description  : 
### 
# 临时验证脚本：Stop 弹框频控冒烟（4 连击）
cd /home/xmm/ai/farm-agent || exit 1
echo '{}' | node .qoder/hooks/stop-check.mjs > /dev/null 2>/tmp/stop_err2.txt
echo "第2次 exit=$?"
echo '{}' | node .qoder/hooks/stop-check.mjs > /dev/null 2>/tmp/stop_err3.txt
echo "第3次 exit=$?"
echo '{}' | node .qoder/hooks/stop-check.mjs > /dev/null 2>/tmp/stop_err4.txt
echo "第4次 exit=$?"
echo "---哨兵内容---"
cat /tmp/add_stop_*.json 2>/dev/null
echo
echo "---第4次 stderr---"
head -2 /tmp/stop_err4.txt
