# Checklist: add-coder-sync-prisma-patch

- [T] [x] sync-rules.toml 含 [prisma] 段，TOML 语法合法
- [T] [x] transcribe.ts genPrismaSyncRules 函数存在且注册
- [T] [x] caijue.toml 含 sync-prisma-schema 裁决条目
- [T] [x] `npm run generate` 产出 prisma-sync.strategy.ts
- [ ] [T] writer.ts diffPrisma() 实现
- [ ] [T] CLI sync 集成 prisma 检查
- [ ] [T] interactive 确认流程
- [ ] [R] weather_proxy 端到端验证
