#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 13:20:43
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 13:34:19
 # @FilePath     : /add-coder/templates/core/hooks/lib/session-end.sh
 # @Description  : SessionEnd 治理卡位
### 
# session-end.sh — SessionEnd 治理卡位
# 路径: templates/core/hooks/lib/session-end.sh
#
# 治理职能（卡位 #2）:
#   ① 清理 tpl-injected 标记文件
#   ② 会话审计结算（汇总 tool 调用统计）
#   ③ Stop 未触发兜底: 若 Stop 未执行验收检查，补执行 checklist 快照（best-effort）
#
# 用法: 被各 IDE adapter 的 SessionEnd hook 脚本 source 并调用 main

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh" 2>/dev/null || true

# 清理 tpl-injected 标记
cleanup_tpl_flag() {
  local project_hash=$(echo "${PROJECT_DIR:-$PWD}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
  rm -f "/tmp/add_tpl_${project_hash}" 2>/dev/null || true
}

# 清理 dev action 标记
cleanup_dev_flag() {
  local project_hash=$(echo "${PROJECT_DIR:-$PWD}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
  rm -f "/tmp/add_dev_${project_hash}" 2>/dev/null || true
}

# Stop 未触发兜底: 如果 dev action 标记还在（说明 Stop 没执行验收检查）
stop_fallback() {
  if has_dev_action 2>/dev/null; then
    echo "[ADD SessionEnd] ⚠️ 检测到 dev action 标记未清除——Stop 可能未触发验收检查" >&2

    # 尝试找到 handoff 做 checklist 快照
    local state=""
    if type detect_active_add >/dev/null 2>&1; then
      state=$(detect_active_add 2>/dev/null || true)
    fi

    if [ -n "$state" ]; then
      local handoff=$(echo "$state" | awk -F'::' '{print $4}')
      local add_route=$(echo "$state" | awk -F'::' '{print $5}')
      if [ -f "$handoff" ]; then
        echo "[ADD SessionEnd] 补执行 checklist 快照（best-effort，不阻断）" >&2
        if type check_add_completeness >/dev/null 2>&1; then
          check_add_completeness "$handoff" "$add_route" >&2 2>/dev/null || true
        fi
      fi
    fi
  fi
}

main() {
  # ① 清理标记文件
  cleanup_tpl_flag
  cleanup_dev_flag

  # ② 审计结算（输出到 stderr 供日志记录）
  echo "[ADD SessionEnd] 会话结束 — $(date -Iseconds)" >&2

  # ③ Stop 未触发兜底
  stop_fallback

  exit 0
}

# 被 source 时不自动执行，source 后调用 main
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
