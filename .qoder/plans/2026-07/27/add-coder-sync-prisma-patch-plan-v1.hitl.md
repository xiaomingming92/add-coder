# add-coder-sync-prisma-patch-plan-v1 — HITL 提案 (round 1)

> 创建: 2026-07-27  |  类型: PLAN  |  状态: DRAFT

## HITL 计划总览

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | 实施主体 | add-coder CLI（src/caijuehub + src/cli），消费项目仅触发 sync | 同意/调整 |
| 2 | 数据模型 | 无新表。sync-rules.toml 新增 [prisma] 段定义 diff 策略 | 同意/调整 |
| 3 | MCP 工具 | 无新工具。复用 caijuehub transcribe → strategy 生成链 | 同意/调整 |
| 4 | 文件命名 | prisma-sync.strategy.ts（与 sync.strategy.ts 同级） | 同意/调整 |
| 5 | 模板 + schema | 无新增模板。prisma 同步走 TOML 规则驱动，不涉及模板 | 同意/调整 |
| 6 | 新增依赖 | 无 | 同意/调整 |
| 7 | 预计文件数 | 5 个（4 修改 + 1 新建 strategy 文件） | 同意/调整 |
| 8 | 预计轮次 | 3 轮（规则 → writer → 验证） | 同意/调整 |

## 审批结论

> **tongyi**：方案通过，进入正式 Plan 执行。
> **bohui**：方案驳回，需修正后重新 create_hitl 发起下一轮。

| 时间 | 决策 | 原因 |
|------|:----:|------|
| | | |

