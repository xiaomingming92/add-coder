# Spec: PlanRecord addRoutePath 落库

## Plan→Spec 映射

| # | Plan 决策 | Spec 节 | 文件 |
|---|-----------|---------|------|
| 1 | addRoutePath 字段 | Prisma Schema 变更 | `prisma/add.prisma` |
| 2 | plan_track 扫描 add-route | plan_track 加 add-route 扫描 | `templates/.../plan.ts` |
| 3 | plan_status 返回 | plan_status 返回 addRoutePath | `templates/.../plan.ts` |
| 4 | sync 到 farm-agent | 同步验证 | - |

---

## 1. Prisma Schema 变更

**文件**: `prisma/add.prisma`

在 `PlanRecord` 模型中新增字段：

```prisma
model PlanRecord {
  // ... 现有字段 ...
  addRoutePath   String?   // add-route 文件绝对路径，nullable
}
```

- `String?`：精简版 Plan 可不生成 add-route，兼容 nullable
- `prisma generate` 重新生成类型后生效

## 2. plan_track 加 add-route 扫描

**文件**: `templates/core/scripts/mcp-server/tools/plan.ts`

在 `plan_track` 的扫描循环中新增 add-route 匹配逻辑：

1. 已完成 plan 文件扫描后，在同一个 `readdirRecursive` 结果中过滤 `*add-route*.md`
2. 对每个 plan，按文件名前缀匹配对应 add-route（如 `foo-plan-v1` → `foo-add-route-v1`）
3. upsert 时写入 `addRoutePath: existsSync(addRoutePath) ? addRoutePath : undefined`
4. add-route 缺失不阻断 plan 落库（try-catch 包裹）

## 3. plan_status 返回 addRoutePath

**文件**: `templates/core/scripts/mcp-server/tools/plan.ts`

在 `plan_status` 返回内容中追加 `addRoutePath` 字段。

## 4. 同步验证

1. `npm run sync` 将模板变更同步到 farm-agent
2. farm-agent 端执行 `npx prisma generate`
3. farm-agent 端调用 `plan_track({ scanAll: true })` 验证 addRoutePath 写入
4. farm-agent 端调用 `plan_status({ planName: "xxx" })` 验证返回 addRoutePath

## 5. Hook 适配器对齐（追加）

**文件**: `templates/core/hooks/*`、`templates/adapters/{qoder,claude,vscode}/hooks/*`

- post-tool-use.sh（core+Qoder）：DPS 自动哨兵 + plan_track 提醒 + devlog 提醒 + schema regen
- pre-tool-use.sh（core+Qoder+claude+vscode）：模板类型前置注入 + Write 大文件适配（>2000字节警告）
- codex/trae 从 core 同步获得，无需独立维护
