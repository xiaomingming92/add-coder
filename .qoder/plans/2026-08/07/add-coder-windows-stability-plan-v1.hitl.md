# add-coder-windows-stability-plan-v1 — HITL 提案 (round 1)

> 创建: 2026-08-07T03:02:45.055Z  |  类型: PLAN  |  状态: TONGYI

## HITL 计划总览

请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | 影响模块 | cli/commands/init.ts、sync.ts、stack.ts、status.ts、caijuehub/sync-rules.toml（PATCH_GUARD 源头，改后重新 generate）、caijuehub/strategies/prisma.strategy.ts、templates/core/scripts/mcp-server/shared/prisma.ts、新增 src/lib/path-normalize.ts、GUIDE.md、DEVELOPMENT.md | 同意/驳回 |
| 2 | 预估文件数 | 11 个文件：新增 2（src/lib/path-normalize.ts + docs/跨平台兼容开发规范.md）、修改 9（sync.ts、stack.ts、init.ts、status.ts、sync-rules.toml、prisma.strategy.ts、mcp-server/shared/prisma.ts、GUIDE.md、DEVELOPMENT.md） | 同意/驳回 |
| 3 | 架构变更 | 新增 src/lib/path-normalize.ts 统一 POSIX 路径规范化；hash 保存语义改为全量基线；sync.strategy.ts 为生成文件不改，改 sync-rules.toml 源头再 generate | 同意/驳回 |
| 4 | 新增依赖 | 不引入 cross-env：环境变量均通过 spawnSync env 对象传递，天然跨平台；跨平台适配点是路径规范化和子进程命令选择（npm exec/npx、bash 不可依赖） | 同意/驳回 |
| 5 | 风险等级 | 中（涉及 npm 子进程调用与退出码语义，需回归验证 Linux 路径不回归） | 同意/驳回 |
| 6 | 预计轮次 | 3 轮：①路径规范+hash基线 ②Prisma 子进程+退出码 ③SQLite 完整路径+文档联动（GUIDE/DEVELOPMENT/规范文档） | 同意/驳回 |
