# add-coder-stack-profile-plan-v1 — HITL 提案 (round 3)

> 创建: 2026-08-05T07:48:01.762Z  |  类型: PLAN_REVIEW  |  状态: DRAFT

## HITL 计划总览

请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | 契约与 E2E | ~~ADD 范式验证靠可审计 + 提前规划(WHEN-THEN/check_spec_sync/check_dps/RAHS),不追求测试数量;当前阶段设计/实现质量已通过审计链保证,大显测试尚未到时机~~ → ADD 范式验证以可审计 + 提前规划为主(WHEN-THEN/check_spec_sync/check_dps/RAHS),不追求测试数量;但审计链对质量的保证目前仍是预期、尚未兑现到可免测,故仍需 e2e 冒烟补充验证 [2026-08-05 修订: 开发者指正——若质量已被审计链保证则无需再做 e2e,二者矛盾] | 同意/驳回 |
| 2 | 依赖与版本 | 无新依赖(复用 smol-toml);无框架升级;无 Prisma 变更(Boundaries 声明) | 同意/驳回 |
| 3 | P2 中性引用行 | 中性场景引用行路径拼接占位符文本(profiles/无（add-coder stack set 可启用）)为问题,需修复:引用行改为 {{stackReferenceLine}} 组合占位符按需生成 | 同意/驳回 |
| 4 | 基线技术债 | audit.ts 14 个基线 TS 错误应修复(类型窄化/断言),并入 Task 3.4 范围 | 同意/驳回 |
