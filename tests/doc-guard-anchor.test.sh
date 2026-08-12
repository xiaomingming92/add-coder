#!/bin/bash
# doc-guard-anchor.test.sh — 守卫语义锚定冒烟测试（Task 2.1 正式版）
# 覆盖：零误杀 / 三重拦截 / 正文豁免 / anchor 可定位巡检 / R5 绑定回归
set +e
cd /home/xmm/ai/add-coder
GUARD=".qoder/hooks/doc-format-guard.sh"

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS: $1 (exit=$3)"; pass=$((pass+1)); else echo "FAIL: $1 (期望=$2 实际=$3)"; fail=$((fail+1)); fi; }

# ── 用例 1: 合法 spec 写入（锚点 plan_track 命中）→ 放行 ──
echo '{ "tool_name":"Write", "tool_input": { "file_path":"/home/xmm/ai/add-coder/.qoder/specs/guard-semantic-anchor/spec.md", "file_content":"# 测试 Spec\n\n## Plan→Spec 映射\n\n| # | Plan 决策 | 文件 | 关键变更 |\n|---|------|------|------|\n| 1 | x | `a.sh` | y |\n\n## 1. 测试\n\n### WHEN-THEN\n\n- WHEN x → THEN y\n\n> **生成后**：调用 `plan_track({ planName: \"test\" })` 将 Spec 路径同步到 PlanRecord 表。" } }' | bash "$GUARD" >/dev/null 2>&1
check "合法 spec 写入（锚点命中）" 0 $?

# ── 用例 2: spec 缺 plan_track 落库 → 锚点缺失拦截 ──
echo '{ "tool_name":"Write", "tool_input": { "file_path":"/home/xmm/ai/add-coder/.qoder/specs/guard-semantic-anchor/spec.md", "file_content":"# 测试 Spec\n\n## Plan→Spec 映射\n\n| # | Plan 决策 | 文件 | 关键变更 |\n|---|------|------|------|\n| 1 | x | `a.sh` | y |\n\n## 1. 测试\n\n### WHEN-THEN\n\n- WHEN x → THEN y\n" } }' | bash "$GUARD" >/dev/null 2>&1
check "缺 plan_track（锚点缺失拦截）" 2 $?

# ── 用例 3: 标题行禁词 → 结构位拦截（R5 回归：plan 绑定 standard-plan schema）──
echo '{ "tool_name":"Write", "tool_input": { "file_path":"/home/xmm/ai/add-coder/.qoder/plans/2026-08/11/add-coder-test-plan-v1.md", "file_content":"# add-coder-test-plan-v1\n\n## 阶段测试标题\n\n## PLAN 元信息\n\n## HITL 计划总览\n\n## Review 回流记录\n\n## 一、背景与目标\n\n### 3.1 数据流转\n\n### 3.2\n\n### 3.3\n\n## 三、架构设计\n\n## 四、实施 Task 概要\n\n## 五、验收标准\n\n## 六、关联文档\n" } }' | bash "$GUARD" >/dev/null 2>&1
check "标题行禁词（结构位拦截）" 2 $?

# ── 用例 4: 正文提及禁词 → 豁免放行 ──
echo '{ "tool_name":"Write", "tool_input": { "file_path":"/home/xmm/ai/add-coder/.qoder/plans/2026-08/11/add-coder-test-plan-v1.md", "file_content":"# add-coder-test-plan-v1\n\n## PLAN 元信息\n\n## HITL 计划总览\n\n## Review 回流记录\n\n## 一、背景与目标\n\n正文提及阶段一词不影响机器解析。\n\n### 3.1 数据流转\n\n### 3.2\n\n### 3.3\n\n## 三、架构设计\n\n## 四、实施 Task 概要\n\n## 五、验收标准\n\n## 六、关联文档\n" } }' | bash "$GUARD" >/dev/null 2>&1
check "正文提及禁词（豁免）" 0 $?

# ── 用例 5: anchor 可定位巡检（静默弱化兜底，3 schema 的 anchor 均可在模板定位）──
anchor_ok=0
for pair in "add-route-template:plan_track" "spec-template:plan_track" "tasks-template:plan_track"; do
  tmpl="${pair%%:*}"; anc="${pair##*:}"
  grep -m1 -F "$anc" ".qoder/templates/${tmpl}.md" >/dev/null 2>&1 || anchor_ok=1
done
check "anchor 可定位巡检（3 schema）" 0 $anchor_ok

# ── 用例 6: R8 引用仿冒回归（spec 正文引用探测串字面量不被误绑 standard-plan）──
echo '{ "tool_name":"Write", "tool_input": { "file_path":"/home/xmm/ai/add-coder/.qoder/specs/guard-semantic-anchor/spec.md", "file_content":"# 测试 Spec\n\n## Plan→Spec 映射\n\n| # | Plan 决策 | 文件 | 关键变更 |\n|---|------|------|------|\n| 1 | x | `a.sh` | y |\n\n## 1. 测试\n\n正文引用 ## PLAN 元信息 探测串字面量不应导致误绑。\n\n### WHEN-THEN\n\n- WHEN x → THEN y\n\n> **生成后**：调用 `plan_track({ planName: \"test\" })` 将 Spec 路径同步到 PlanRecord 表。" } }' | bash "$GUARD" >/dev/null 2>&1
check "R8 引用仿冒回归（spec 不误绑 plan）" 0 $?

echo "==== 结果: PASS=$pass FAIL=$fail ===="
exit $fail
