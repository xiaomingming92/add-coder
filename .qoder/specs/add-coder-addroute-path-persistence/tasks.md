# Tasks: add-coder-addroute-path-persistence

## 轮次 1: 补齐 addRoutePath 落库

### Plan→Task 映射

| Plan 决策 | Task | 文件 |
|-----------|------|------|
| addRoutePath 字段 | Task 1.1 Schema 变更 | `prisma/add.prisma` |
| plan_track 扫描 | Task 1.2 扫描逻辑 | `templates/.../plan.ts` |
| plan_status 返回 | Task 1.3 查询返回 | `templates/.../plan.ts` |
| sync 验证 | Task 1.4 同步 | - |

---

- [x] Task 1.1: `prisma/add.prisma` 加 `addRoutePath String?`
  - [x] 在 PlanRecord 模型中 `checklistPath String?` 后追加 `addRoutePath String?`
  - [x] 验证：`npx prisma validate`

- [x] Task 1.2: plan_track 加 add-route 扫描
  - [x] 在 plan_track 循环内，对每个 plan 按前缀匹配 `*add-route*.md`
  - [x] upsert data 中加入 `addRoutePath`
  - [x] 匹配失败时跳过（不阻断 plan 落库）
  - [x] 验证：`plan_track({ planName: "add-coder-addroute-path-persistence-plan-v1" })` 返回含 addRoutePath

- [x] Task 1.3: plan_status 返回 addRoutePath
  - [x] 在 plan_status 输出中追加 addRoutePath 行
  - [x] 验证：`plan_status({ planName: "add-coder-addroute-path-persistence-plan-v1" })` 返回 addRoutePath

- [x] Task 1.4: 同步 + 验证
  - [x] `npm run sync` 同步模板到 farm-agent
  - [x] farm-agent 端 `npx prisma generate` + `db push`
  - [x] farm-agent 端调用 plan_track + plan_status 验证通过
