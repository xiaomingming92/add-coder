# add-coder-collab-contract-plan-v1 — HITL 提案 (round 3)

> 创建: 2026-08-05T11:03:37.020Z  |  类型: PLAN_REVIEW  |  状态: TONGYI

## HITL 计划总览

请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | 契约链路实证 | 契约链路全实证: contract_track v1 创建/v2 增量/status 查询/COLLAB_CONTRACT 审批 TONGYI/plan_status MASTER 展示/提案文件状态回写 | 同意/驳回 |
| 2 | 根环境 | 根环境: schema 同步 + 迁移幂等化(DO块+IF NOT EXISTS,重放验证 exit=0) + generate 含模型 | 同意/驳回 |
| 3 | 文档与模板 | 模板对齐: §7 删除(平台机制不承载) + isolationMode + docs 裁决入口 + Plan 模板 6 处对齐(DPS 84) | 同意/驳回 |
| 4 | 回归验证 | 回归: tsc 0 + eslint 0 + plan_track 35 tasks 无破坏 | 同意/驳回 |
