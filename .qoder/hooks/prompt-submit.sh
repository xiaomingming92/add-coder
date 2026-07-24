#!/bin/bash
# prompt-submit.sh — UserPromptSubmit 触发词智能路由（★入口）
# 治理卡位 #3: 触发词路由 + 模板全文注入（增量插入，保留 Layer 1/2/3）
input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
export PROJECT_DIR="${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}"
source "$HOOK_DIR/lib/common.sh" 2>/dev/null || true
source "$HOOK_DIR/lib/vocabulary.sh"
source "$HOOK_DIR/lib/state-detect.sh"
source "$HOOK_DIR/lib/notify.sh" 2>/dev/null || true

# ─── additionalContext 注入（Qoder CN IDE 通过 stdout JSON 注入模型上下文）───
echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"ADD workflow active. Templates preloaded. Use add-paradigm SKILL."}}'

# ─── Layer 1: 精准 P0 触发词 ───
matched=$(match_trigger "$prompt")
if [ -n "$matched" ]; then
  # 验收幂等保护: 如果已验收，提示不重复
  if echo "$prompt" | grep -qiE '验收|收敛' 2>/dev/null; then
    add_state=$(detect_active_add 2>/dev/null || true)
    if [ -n "$add_state" ]; then
      _handoff=$(echo "$add_state" | awk -F'::' '{print $4}')
      _add_route=$(echo "$add_state" | awk -F'::' '{print $5}')
      if is_already_accepted "$_add_route" "$_handoff" 2>/dev/null; then
        printf '%s\n' \
          "[ADD 验收] ⚠️ 已验收。进入 Review 模式:" \
          "  ① 重新检查 checklist [T]/[R] 项" \
          "  ② 审查 audit 记录完整性" \
          "  ③ 如有差异 → Review 回流至 handoff（增量更新，不覆盖已有结论）" \
          "  ④ 无差异 → 记录 'Review 已确认，无新发现'" \
          "  ★ 同步检查: 如 checklist 有新 cuid 但 handoff 审计表缺失 → 更新 handoff ADD-7 表 + query_audit_logs 命令"
        # 执行 checklist 质量检查
        HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")
        "$HOOK_DIR/review-checklist.sh" "$_handoff" "$_add_route" 2>/dev/null
        exit 0
      fi
    fi
  fi
  echo "$matched"
  exit 0
fi

# ─── 开发关键词检测 ───
dev_kw=$(load_dev_keywords 2>/dev/null || true)
if [ -z "$dev_kw" ]; then
  exit 0
fi

if ! echo "$prompt" | grep -qiE "$dev_kw"; then
  exit 0
fi

# ─── Layer 2/3: 按活跃 ADD 分流（原 Layer 2/3，不修改） ───
state=$(detect_active_add 2>/dev/null || true)
if [ -z "$state" ]; then
  # Layer 2: 无活跃 ADD → 强制启动
  cat >&2 <<'EOF'
[ADD 强制规则] 检测到开发任务。你必须先执行 add-paradigm SKILL 完成 ADD 工作流:
  Step 0: 文档先行 (Plan → Review → Specs)
  Step 1: 扩展 AgentAuditPhase
  Step 2: 确认 agentAudit() 通道
  Step 3: 代码实现 + 审计植入
  ...
  Step 8: 收敛判断
如果 add-paradigm SKILL 尚未激活，请先调用它。
EOF
  write_hook_event "prompt-submit" "deny" "$prompt" "无活跃 ADD Plan 下检测到开发任务" "no-active-plan" "none" 2>/dev/null || true
  exit 2
fi

# Layer 3: 有活跃 ADD → 注入状态
plan=$(echo "$state" | awk -F'::' '{print $1}')
step=$(echo "$state" | awk -F'::' '{print $2}')
rounds=$(echo "$state" | awk -F'::' '{print $3}')
handoff=$(echo "$state" | awk -F'::' '{print $4}')
add_route=$(echo "$state" | awk -F'::' '{print $5}')
add_ctx="[ADD 状态] Plan: ${plan}, 轮次: ${rounds}, Step: ${step}, handoff: ${handoff}"

# ─── Hook 治理日报 ───
HOOK_JSONL="${MAGIC_DIR:-.qoder}/reports/hook-events.jsonl"
if [ -f "$HOOK_JSONL" ]; then
  TODAY="$(date +%Y-%m-%d)"
  TOTAL=$(grep -c "\"ts\":\"${TODAY}" "$HOOK_JSONL" 2>/dev/null || echo 0)
  NO_PLAN=$(grep "\"ts\":\"${TODAY}" "$HOOK_JSONL" 2>/dev/null | grep -c '"planKeyword":"no-active-plan"' || echo 0)
  if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
    add_ctx="${add_ctx}\n[Hook 治理] 今日拦截: ${TOTAL} 次 | 无 Plan 违规: ${NO_PLAN} 次"
    if [ "$NO_PLAN" -ge 10 ] 2>/dev/null; then
      add_ctx="${add_ctx}\n[Hook ⚠️] 无 Plan 违规已达 ${NO_PLAN} 次（≥10），建议创建 Plan"
    fi
  fi
fi
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"UserPromptSubmit\",\"additionalContext\":\"${add_ctx}\"}}"
exit 0

