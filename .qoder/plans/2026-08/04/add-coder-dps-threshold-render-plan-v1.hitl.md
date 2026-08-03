# add-coder-dps-threshold-render-plan-v1 — HITL 提案 (round 2)

> 创建: 2026-08-03T21:09:20.232Z  |  类型: PLAN_REVIEW  |  状态: DRAFT

## HITL 计划总览

请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | Review 结论 | 结论：不可接受（需修订后复审）；修订方向：砍 [display] 改 renderer 直读 [thresholds]；按实测 28 处重写 Task 1.5；README/GUIDE 4 处 + docs/caijuehub.md 纳入；修正虚假引用 | 同意/驳回 |
| 2 | 修订范围 | 修订 Plan v1（同文件更新）+ 重新跑 Review；新增 gateway.backup/模板内历史 add-route 处置决策（改/删/豁免） | 同意/驳回 |
| 3 | 架构变更 | 无新模块：renderer 直读 TOML [thresholds]（复用现有机制，比 [display] 更简） | 同意/驳回 |
| 4 | 新增依赖 | 无新增依赖 | 同意/驳回 |
| 5 | 风险等级 | 低：仍只改文案层与渲染注入；处置决策（改/删/豁免）明确后分发面风险可控 | 同意/驳回 |
| 6 | 预计轮次 | 1 轮修订：Plan 修订 + Review 复审（P1 归零后进 Specs） | 同意/驳回 |
