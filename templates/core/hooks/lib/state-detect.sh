#!/bin/bash
# state-detect.sh — ADD 活跃流程检测 + dev action 追踪
# 共享库

PROJECT_DIR="$PWD"

# 动态探测 MAGIC_DIR（兼容多 adapter，source 自 hook 脚本时继承调用者的 HOOK_DIR）
if [ -z "${MAGIC_DIR:-}" ]; then
  if [ -n "${HOOK_DIR:-}" ]; then
    MAGIC_DIR="$(basename "$(dirname "$HOOK_DIR")")"
  else
    for m in ".claude" ".qoder" ".vscode" ".add"; do
      [ -d "$PROJECT_DIR/$m" ] && { MAGIC_DIR="$m"; break; }
    done
    MAGIC_DIR="${MAGIC_DIR:-.add}"
  fi
fi

MAGIC_PATH="$PROJECT_DIR/$MAGIC_DIR"
PLANS_DIR="$MAGIC_PATH/plans"

# dev action 标记文件（项目级，PreToolUse 写入，Stop 读取）
DEV_FLAG="/tmp/add_dev_$(echo "$PROJECT_DIR" | md5sum 2>/dev/null | cut -c1-8 || echo "default")"

# 检测活跃 ADD 流程
# 返回: "plan_keyword::step_x/total::round_n/total_r::handoff_path::add_route_path" 或 ""
detect_active_add() {
  local handoff=""
  local today_dir="$PLANS_DIR/$(date +%Y-%m)"
  [ -d "$today_dir" ] && handoff=$(find "$today_dir" -name "*handoff*.md" -mtime -7 -type f 2>/dev/null | head -1)
  [ -z "$handoff" ] && handoff=$(find "$PLANS_DIR" -name "*handoff*.md" -mtime -7 -type f 2>/dev/null | head -1)
  [ -z "$handoff" ] && return 1

  local plan_kw=$(basename "$handoff" | sed 's/-handoff.*//')

  # add-route
  local add_route=$(find "$PLANS_DIR" -name "*add-route*.md" -type f 2>/dev/null | head -1)

  # Step 统计（从 add-route）
  local step_info="?"
  if [ -f "$add_route" ]; then
    local ck=$(grep -c '\[x\]' "$add_route" 2>/dev/null || true)
    local uc=$(grep -c '\[ \]' "$add_route" 2>/dev/null || true)
    ck=${ck:-0}; uc=${uc:-0}
    local total=$((ck + uc))
    [ "$total" -gt 0 ] && step_info="${ck}/${total}"
  fi

  # 轮次统计（从 handoff）
  local round_info="?"
  if grep -q '<第[0-9]轮>' "$handoff" 2>/dev/null; then
    local ck=$(grep -c '\[x\]' "$handoff" 2>/dev/null || true); ck=${ck:-0}
    local total=$(grep -c '<第[0-9]轮>' "$handoff" 2>/dev/null || true); total=${total:-0}
    [ "$total" -gt 0 ] && round_info="${ck}/${total}"
  else
    round_info="1/1"
  fi

  echo "${plan_kw}::${step_info}::${round_info}::${handoff}::${add_route:-none}"
}

# 标记 dev action
mark_dev_action() {
  touch "$DEV_FLAG" 2>/dev/null || true
}

# 检测 dev action
has_dev_action() {
  [ -f "$DEV_FLAG" ]
}

# 清理 dev action 标记（验收闭环后调用）
clear_dev_action() {
  rm -f "$DEV_FLAG" 2>/dev/null || true
}

# 检查验收完整度，返回 issues 文本
check_add_completeness() {
  local handoff="$1" add_route="$2"
  local issues=""

  # devlog（内容已回流至 handoff，检查 handoff 是否含验收结果）
  if [ -f "$handoff" ] && ! grep -qE '验收|收敛|闭环|本轮改了什么|devlog' "$handoff" 2>/dev/null; then
    issues="${issues}  [ ] devlog 缺失（handoff 无验收记录）\n"
  fi

  # handoff 验证标准
  if [ -f "$handoff" ]; then
    local uc=$(grep -c '\[ \]' "$handoff" 2>/dev/null || echo "0")
    [ "$uc" -gt 0 ] && issues="${issues}  [ ] handoff ${uc} 项未勾选\n"
  fi

  # add-route Step
  if [ -f "$add_route" ]; then
    local uc=$(grep -c '\[ \]' "$add_route" 2>/dev/null || echo "0")
    [ "$uc" -gt 0 ] && issues="${issues}  [ ] add-route ${uc} Step 未闭环\n"
  fi

  echo -e "$issues"
}

# 检查是否已验收（幂等保护）
# 返回 0 = 未验收，1 = 已验收
is_already_accepted() {
  local add_route="$1" handoff="$2"
  # add-route Step 8 是否已 [x]
  if [ -f "$add_route" ]; then
    # 检查 Step 8 产出项是否勾选
    if grep -A 10 'Step 8' "$add_route" 2>/dev/null | grep -q '\[x\].*验证并更新项目状态'; then
      # handoff 是否有验收记录
      if [ -f "$handoff" ] && grep -qE '✅.*验收|收敛|全部闭环|全部.*完成' "$handoff" 2>/dev/null; then
        return 0
      fi
    fi
  fi
  return 1
}
