#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-17 13:14:46
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-17 13:21:36
 # @FilePath     : /add-coder/templates/core/hooks/lib/common.sh
 # @Description  : ADD Hook 共享库 — 四端通用函数
### 
# ADD Hook 共享库 — 四端通用函数
# 被 Claude/Qoder/VS Code/Trae adapter 的 hook 脚本 source 引用
# 路径: templates/core/hooks/lib/common.sh

# 退出码常量,目前适配的ide都一样
export EXIT_PASS=0   # 放行
export EXIT_BLOCK=2  # 阻断

# ── 输入解析 ──

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

# ── ADD 活跃 Plan 检测（裁决定逻辑，SKILL §0.7.1） ──
#
# 活跃判定标准：
#   1. magicDir 优先级: 由 Hook 脚本自身的路径推断（.claude/hooks/xxx.sh → .claude）→ .add → stderr 提示全局搜索
#   2. 索引优先: 先读 plans/index.md 匹配 → 无匹配才 glob *-handoff*.md
#   3. 活跃定义: add-route 中存在 [ ] 未勾选项 = 活跃；全部 [x] = 已收敛
#   4. 多 Plan 冲突: 取 add-route 最近 mtime
#   5. 无 add-route: Plan 初始态，视为活跃
#
# 前置条件: 调用方需设置 PROJECT_DIR 环境变量（项目根目录）
# 返回: "plan_keyword::step_n/total::round_n/total::handoff_path::add_route_path" 或 ""

detect_active_add() {
  local plans_dir=""

  # 1. magicDir 回退: 当前 IDE（CURRENT_MAGIC）→ 目录检测 → .add → 提示全局搜索
  local magic_dirs=()
  if [ -n "${CURRENT_MAGIC:-}" ]; then
    magic_dirs+=("$CURRENT_MAGIC")
  else
    # 兜底: 检测 PROJECT_DIR 下哪个 magicDir 存在
    for m in ".claude" ".qoder" ".vscode" ".trae"; do
      [ -d "${PROJECT_DIR:-$PWD}/$m" ] && { magic_dirs+=("$m"); break; }
    done
  fi
  magic_dirs+=(".add")

  for magic in "${magic_dirs[@]}"; do
    if [ -d "${PROJECT_DIR:-$PWD}/$magic/plans" ]; then
      plans_dir="${PROJECT_DIR:-$PWD}/$magic/plans"
      break
    fi
  done

  if [ -z "$plans_dir" ]; then
    echo "[ADD detect] 未在当前 IDE magicDir 和 .add 中找到 plans 目录。是否需要全局搜索所有 magicDir？" >&2
    return 1
  fi

  local handoff=""
  local add_route=""

  # 2. 索引优先: 先读 index.md
  if [ -f "$plans_dir/index.md" ]; then
    # 从 index.md 表格提取最近一个 handoff 相对路径
    # 表格格式: | YYYY-MM/DD/path-to-handoff.md | ...
    handoff=$(grep -oE '[0-9]{4}-[0-9]{2}/[0-9]{2}/[^|]*handoff[^|]*\.md' "$plans_dir/index.md" 2>/dev/null | head -1 | xargs)
    if [ -n "$handoff" ] && [ -f "$plans_dir/$handoff" ]; then
      handoff="$plans_dir/$handoff"
    else
      handoff=""
    fi
  fi

  # 3. 退路: glob handoff 文件（mtime 7 天内）
  if [ -z "$handoff" ]; then
    local today_dir="$plans_dir/$(date +%Y-%m)"
    [ -d "$today_dir" ] && handoff=$(find "$today_dir" -name "*handoff*.md" -mtime -7 -type f 2>/dev/null | head -1)
    [ -z "$handoff" ] && handoff=$(find "$plans_dir" -name "*handoff*.md" -mtime -7 -type f 2>/dev/null | head -1)
  fi
  [ -z "$handoff" ] && return 1

  # 提取 plan keyword
  local plan_kw=$(basename "$handoff" | sed 's/-handoff.*//')

  # 查找 add-route
  local handoff_dir=$(dirname "$handoff")
  add_route=$(find "$handoff_dir" -name "*add-route*.md" -type f 2>/dev/null | head -1)
  [ -z "$add_route" ] && add_route=$(find "$plans_dir" -name "*add-route*.md" -type f 2>/dev/null | head -1)

  # 4. 活跃判定: 读 add-route，存在 [ ] 未勾选项 = 活跃
  local step_info="?"
  if [ -f "$add_route" ]; then
    local ck=$(grep -c '\[x\]' "$add_route" 2>/dev/null || true)
    local uc=$(grep -c '\[ \]' "$add_route" 2>/dev/null || true)
    ck=${ck:-0}; uc=${uc:-0}
    local total=$((ck + uc))
    [ "$total" -gt 0 ] && step_info="${ck}/${total}"
    # 全部 [x] → 已收敛（但 handoff 还存在 → 可能是遗留，仍返回但标记）
  else
    # 无 add-route → Plan 初始态，视为活跃
    step_info="init"
  fi

  # 5. 轮次统计（从 handoff）
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

# ── Dev Action 追踪 ──

# dev action 标记文件（项目级，PreToolUse 写入，Stop 读取）
DEV_FLAG="/tmp/add_dev_$(echo "${PROJECT_DIR:-$PWD}" | md5sum 2>/dev/null | cut -c1-8 || echo "default")"

mark_dev_action() {
  touch "$DEV_FLAG" 2>/dev/null || true
}

has_dev_action() {
  [ -f "$DEV_FLAG" ]
}

clear_dev_action() {
  rm -f "$DEV_FLAG" 2>/dev/null || true
}

# ── 验收完整度检查 ──

# 检查 handoff + add-route 的验收完整度
# 用法: check_add_completeness "$handoff_path" "$add_route_path"
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

# ── 验收幂等保护 ──

# 检查是否已验收（幂等保护）
# 用法: is_already_accepted "$add_route_path" "$handoff_path"
# 返回 0 = 已验收，1 = 未验收
is_already_accepted() {
  local add_route="$1" handoff="$2"
  # add-route Step 8 是否已 [x]
  if [ -f "$add_route" ]; then
    if grep -A 10 'Step 8' "$add_route" 2>/dev/null | grep -q '\[x\].*验证并更新项目状态'; then
      # handoff 是否有验收记录
      if [ -f "$handoff" ] && grep -qE '✅.*验收|收敛|全部闭环|全部.*完成' "$handoff" 2>/dev/null; then
        return 0
      fi
    fi
  fi
  return 1
}

# ── Stop 四象限分流 few-shot 上下文（卡位 #7） ──
# 用法: build_stop_context "$quadrant" "$info"
build_stop_context() {
  local quadrant="$1" info="$2"
  case "$quadrant" in
    "no_add_no_dev")
      echo "[ADD Stop] 无活跃 Plan，无代码改动。正常结束。"
      ;;
    "no_add_has_dev")
      cat <<'EOF'
[ADD Stop] ⚠️ 检测到代码修改但无活跃 ADD Plan。

Plan 不是"文档开销"——它是代码治理的基础设施。跳过 Plan 的后果:
  · 没有 add-route → 每次改动无法追溯到具体 Task
  · 没有 tasks.md → 后续 AI Session 不知道改了哪些文件
  · 没有 handoff → 交接时上下文全丢，只能靠 git log 猜

你必须立即补救，二选一:

方案 A — 补 ADD 流程（招安）:
  Step 0: 读 .qoder/templates/plan-template.md → 生成 Plan
          生成 add-route → check_dps ≥ 85
  Step 1: 扩展 AgentAuditPhase（如需要）
  Step 2: 确认 agentAudit() 通道
  Step 3: 将已写代码关联到 tasks.md
  完成后可正常停止。

方案 B — 补不上则回滚:
  如果改动太复杂无法追溯生成 Plan，则:
  ① git diff 确认改动范围
  ② git checkout -- <改动的文件> 撤回
  ③ 告知用户 "以下改动已回滚，请先走 ADD 流程再重新实施: <文件列表>"

无论选 A 还是 B，完成后告诉用户下次执行 session-init 恢复上下文。
EOF
      ;;
    "has_add_no_dev")
      echo "[ADD Stop] ADD 流程进行中 (${info})，本次无代码改动。下次继续时执行 session-init 恢复上下文。"
      ;;
    "has_add_dev_unclosed")
      cat <<EOF
[ADD Stop] ⚠️ 代码已完成但验收未闭环:
${info}

请依次执行（不要等下次会话）:
  ① Write devlog → handoff 同目录 devlog-{plan}-v{n}.md
     格式: # Devlog: {plan}\n 日期 / Plan / 轮次 / 本轮改了什么 / 验收结果 / 遗留项 / 架构回看
  ② Edit handoff → 更新 §验证标准 全部 [x] + 补充审计 ID
  ③ Read docs/ → 回看架构文档确认一致性
  ④ Edit add-route → 勾选对应 Step [x]

以上全部完成后 Agent 才能停止。
EOF
      ;;
  esac
}

# ── PreToolUse 写入前置守卫上下文（卡位 #4） ──
build_pretool_context() {
  local plan="$1" round="$2"
  cat <<EOF
[ADD PreToolUse] 当前 Plan: ${plan}，轮次: ${round}。
本次写入应属于 ADD Step 3 代码实现阶段。
完成后执行 record_dev_operation 记录审计。
EOF
}
