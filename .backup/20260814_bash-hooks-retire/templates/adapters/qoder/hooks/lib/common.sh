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
# lifecycle 的唯一真相源是 scoped DB。短生命周期 Hook 不常驻 LISTEN；每次触发
# 都通过当前 adapter 生成态的机器桥（plan-status-bridge）调用 shared resolver。
# Handoff/add-route 不再参与 active 裁决，禁止跨 adapter 或文件系统 fallback
# （含 .add 回退与 mtime/勾选数推断）。
#
# magicDir 解析（Review P1 #5）: 入口必须注入自身 magicDir；未注入时从生成态
# 脚本物理位置（<magicDir>/hooks/...）反推；推导失败 → STATUS_UNAVAILABLE，
# 禁止任何 adapter 名称默认值。
#
# Qoder stdout 规范: 本文件内所有 echo 均被调用方命令替换捕获（$(...)，不直接
# 暴露给 IDE）；hook 入口脚本不得将非 JSON 输出到 stdout。
#
# 前置条件: 调用方需设置 PROJECT_DIR 环境变量（项目根目录）
# 返回: "plan_keyword::step_n/total::round_n/total::handoff_path::add_route_path"
#       或 "__STATUS_UNAVAILABLE__::reason::database::none::none"（调用方必须 fail-closed）

query_plan_status() {
  local bridge=""
  if [ -n "${MAGIC_DIR:-}" ]; then
    bridge="${PROJECT_DIR:-$PWD}/${MAGIC_DIR}/scripts/plan-status-bridge.ts"
  elif [ -n "${HOOK_DIR:-}" ]; then
    # 物理位置反推: <magicDir>/hooks/lib/common.sh → <magicDir>
    bridge="${PROJECT_DIR:-$PWD}/$(basename "$(dirname "$(dirname "$HOOK_DIR")")")/scripts/plan-status-bridge.ts"
  else
    echo '{"availability":"STATUS_UNAVAILABLE","source":"database","reason":"magicDir 未注入且无法从物理位置推导"}'
    return 3
  fi
  if [ ! -f "$bridge" ]; then
    echo '{"availability":"STATUS_UNAVAILABLE","source":"database","reason":"plan-status bridge missing"}'
    return 3
  fi
  node --import tsx "$bridge"
}

# 兼容既有 Hook 字段协议：
# "planName::done/total::approvalStatus::none::none"；后两个路径不参与 active 判定。
# DB 不可用/不可判定时返回特殊首字段，调用方必须 fail closed，不能当作“无 Plan”。
detect_active_add() {
  local snapshot="" rc=0
  snapshot="$(query_plan_status 2>/dev/null)" || rc=$?
  if [ "$rc" -ne 0 ]; then
    local reason
    reason=$(printf '%s' "$snapshot" | jq -r '.reason // "database status unavailable"' 2>/dev/null || echo "database status unavailable")
    echo "__STATUS_UNAVAILABLE__::${reason}::database::none::none"
    return 0
  fi
  if ! printf '%s' "$snapshot" | jq -e '.availability == "READY" and .isActive == true' >/dev/null 2>&1; then
    return 1
  fi
  local plan done total approval
  plan=$(printf '%s' "$snapshot" | jq -r '.planName')
  done=$(printf '%s' "$snapshot" | jq -r '.progress.doneTasks // 0')
  total=$(printf '%s' "$snapshot" | jq -r '.progress.totalTasks // 0')
  approval=$(printf '%s' "$snapshot" | jq -r '.approvalStatus // "none"')
  echo "${plan}::${done}/${total}::${approval}::none::none"
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
          生成 add-route → check_dps ≥ {{dpsPass}}
  Step 1: 扩展 AgentAuditPhase（如需要）
  Step 2: 确认 agentAudit() 通道
  Step 3: 将已写代码关联到 tasks.md
  完成后可正常停止。

方案 B — 补不上则回滚:
  如果改动太复杂无法追溯生成 Plan，则:
  ① git diff 确认改动范围
  ② 仅对已确认属于本轮的文件生成反向 apply_patch
  ③ 无法安全确认改动所有权时停止，并请求用户决定

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
