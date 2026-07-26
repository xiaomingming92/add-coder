# add-coder-sync-prisma-patch Spec

## Why
add-coder 的 `npm run sync` 不处理 Prisma schema。新增模型（如 HitlRecord）后消费项目需手工 diff 并补 schema。需要 caijuehub 裁决层驱动的自动 diff + interactive 确认机制。

## What Changes
- `sync-rules.toml` 新增 `[prisma]` 段
- `transcribe.ts` 新增 `genPrismaSyncRules()`
- `caijue.toml` 新增 `sync-prisma-schema` 裁决条目
- 新建 `prisma-sync.strategy.ts`（GENERATED）
- `writer.ts` 新增 `diffPrisma()` + interactive 流程

## Impact
- Affected specs: 无
- Affected code: src/caijuehub/sync-rules.toml, transcribe.ts, caijue.toml, src/cli/writer.ts
- 父 Plan: add-coder-sync-prisma-patch-plan-v1
- 依赖: 无上游

## Boundaries
仅 diff 新增 model/enum/relation，只插不删不改。不覆盖消费项目已有的定制字段。diff 结果 interactive 确认后才应用。

## Requirements

### Requirement: caijuehub 裁决生成
系统 SHALL 从 sync-rules.toml [prisma] 段生成 SYNC_PRISMA_CONFIG 策略常量。
WHEN 执行 `npm run generate`
THEN 产出 `src/caijuehub/strategies/prisma-sync.strategy.ts`

### Requirement: diff 检测
系统 SHALL 对比 add-coder 基准 add.prisma 与消费方 schema.prisma。
WHEN 执行 `sync --patch`
THEN 如有新增 model/enum 输出 diff 并等待用户交互确认

### Requirement: 只插不删
系统 SHALL 只注入消费方缺失的 model/enum。
WHEN 用户确认 diff
THEN schema 新增 model/enum，已有内容不变
