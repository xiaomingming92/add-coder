#!/bin/bash
# context-inject.sh — 上下文注入模板
# 共享库

# 结构化 SessionStart JSON 注入
build_session_start_json() {
  local plan="$1" step="$2" round="$3" handoff="$4"
  cat <<EOF
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "上次 ADD 流程未完成:\n  Plan: ${plan}\n  轮次: ${round}\n  当前 Step: ${step} (add-route)\n  恢复命令: query_audit_logs({ planKeyword: '${plan}' })\n  handoff: ${handoff}"
  }
}
EOF
}

# Stop 四象限分流 few-shot 上下文
build_stop_context() {
  local quadrant="$1" info="$2"
  case "$quadrant" in
    "no_add_no_dev")
      echo "[ADD Stop] 无活跃 Plan，无代码改动。正常结束。"
      ;;
    "no_add_has_dev")
      cat <<'EOF'
[ADD Stop] ⚠️ 检测到代码修改但无活跃 ADD Plan。

Plan 不是"文档开销"——它是代码治理的基础设斻。跳过 Plan 的后果:
  · 没有 add-route → 每次改动无法追溯到具体 Task
  · 没有 tasks.md → 后续 AI Session 不知道改了哪些文件
  · 没有 handoff → 交接时上下文全丢，只能靠 git log 猜

你必须立即补救，二选一:

方案 A — 补 ADD 流程（招安）:
  Step 0: 读 .qoder/templates/plan-template.md → 生成 Plan → .qoder/plans/{today}/{keyword}-plan-v1.md
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
    "has_add_dev_step02")
      echo "[ADD Stop] ADD Step 0-2: 文档先行/审计准备阶段。无需验收闭环。下一步: 进入 Step 3 代码实现。"
      ;;
    "has_add_dev_step3")
      echo "[ADD Stop] ADD Step 3: 代码实现进行中 (${info})。完成后进入 Step 3.5 实现审查。"
      ;;
    "has_add_dev_unclosed")
      cat <<'EOF'
[ADD Stop] ⚠️ 代码已完成但验收未闭环:
${info}

请依次执行（不要等下次会话）:
  ① Write devlog → handoff 同目录 devlog-{plan}-v{n}.md
     格式: # Devlog: {plan}\n 日期 / Plan / 轮次 / 本轮改了什么 / 验收结果 / 遗留项 / 架构回看
  ② Edit handoff → 更新 §验证标准 全部 [x] + 补充审计 ID
     ★ 同步: checklist 有新 cuid → handoff ADD-7 表必须对应新增行
     ★ Step 0 准入: handoff + add-route + Specs 三元组缺一不可，缺则回退 Step 0.5
  ③ Read docs/ → 回看架构文档确认一致性
  ④ Edit add-route → 勾选对应 Step [x]

以上全部完成后 Agent 才能停止。

下次恢复: 读 handoff → 查同目录 devlog-*.md → query_audit_logs
EOF
      ;;
        "has_add_dev_closed")
      echo "[ADD Stop] ✅ 验收闭环: add-route全部[x], devlog已记录, handoff已更新。验收幂等——重复触发不覆盖已有结论。"
      ;;
  esac
}

# 写操作前置守卫上下文
build_pretool_context() {
  local plan="$1" round="$2"
  cat <<EOF
[ADD PreToolUse] 当前 Plan: ${plan}，轮次: ${round}。
本次写入应属于 ADD Step 3 代码实现阶段。
完成后执行 record_dev_operation 记录审计。
EOF
}
