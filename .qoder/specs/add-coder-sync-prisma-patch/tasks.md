# Tasks: add-coder-sync-prisma-patch

## Preconditions
- [x] Plan HITL tongyi
- [x] caijuehub generate 环境可用

## Forbidden
- 禁止修改消费项目的定制 schema 字段
- 禁止自动应用 diff（必须 interactive 确认）

- [x] Task 1: caijuehub 规则
  - [x] 1.1 sync-rules.toml 新增 [prisma] 段
  - [x] 1.2 transcribe.ts genPrismaSyncRules()
  - [x] 1.3 caijue.toml 注册 + generate 验证

- [ ] Task 2: writer diff
  - [ ] 2.1 writer.ts diffPrisma() 逻辑
  - [ ] 2.2 CLI sync 集成 prisma 检查
  - [ ] 2.3 interactive 确认流程

- [ ] Task 3: 验证 + doc
  - [ ] 3.1 add-coder 自我验证
  - [ ] 3.2 weather_proxy 端到端验证
  - [ ] 3.3 DEVELOPMENT.md 更新

## Task Dependencies
- Task 2 依赖 Task 1（消费 SYNC_PRISMA_CONFIG）
- Task 3 依赖 Task 2

## Verification
- [ ] `npm run generate` 产出 prisma-sync.strategy.ts
- [ ] `tsc --noEmit` 通过
- [ ] weather_proxy sync 检测差异并输出 diff
