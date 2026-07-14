# add-coder — init 数据库设置交互 交接手册

## 你当前的位置

你是本 Plan 的唯一轮次。本 Plan 完成了 `add-coder init` 的数据库引擎选择、容器运行时选择、compose 自动生成、SQLite 导出脚本、两层自行管理提示。

## 上游已完成

无上游依赖。本 Plan 是独立变更。

## 你的 spec 文件

不适用（Plan 逻辑清晰，无独立 spec 文件）。

## 你要改的文件

| 文件 | 操作 | 改什么 |
|------|------|------|
| `src/cli/prisma-injector.ts` | 修改 | PrismaInjectOptions 加 `datasource` 字段 |
| `src/caijuehub/strategies/prisma.strategy.ts` | 重写 | datasource 参数化 + prisma init 失败 fallback + force/yes 跳过交互 |
| `src/cli/commands/init.ts` | 重写 | 新增 resolveDbEngine / resolveContainer / composeContent / writeSqliteExportScript / injectDbExportScript / patchDatabaseUrl |

## 核心设计

### 交互流程

```
init
 → resolveAdapter()        IDE 检测 (env→dir→ask)
 → resolveDbEngine()       数据库: [1] PG [2] SQLite [3] 自行管理
    ├─ PG → resolveContainer()  容器: [1] podman [2] docker [3] 自行管理
    │        ├─ podman/docker → resolveDbCredentials() 凭据询问
    │        │                      → composeContent() + composeEnvContent() 生成 .env
    │        │                      → patchDatabaseUrl() 改写 DATABASE_URL
    │        └─ 自行管理 → 提示 DATABASE_URL 格式
    ├─ SQLite → writeSqliteExportScript() + injectDbExportScript()
    └─ 自行管理 → 提示 Prisma datasource 列表
 → injectPrisma({ datasource })   Prisma init + User 模型 + add.prisma
 → renderCore()                   模板渲染
 → writeFiles()                   写入
```

### 关键决策

1. **compose 文件不用模板渲染**：`composeContent()` 是纯函数拼接，因为 compose 内容与 ADD 模板体系无关，且需要动态决定文件名（podman-compose.yml vs docker-compose.yml）。
2. **prisma init 失败有 fallback**：当 `npx prisma init` 因缺少 dotenv 等依赖失败时，手动创建 schema.prisma + .env.development，确保空项目能一次跑通。
3. **`--force` 默认 PostgreSQL + podman**：CI/脚本场景下零交互。
4. **自行管理分两级**：顶层（DB 引擎选 3）提示所有 Prisma datasource；PG 层（容器选 3）提示 DATABASE_URL 格式。

## 关键契约细化

1. `composeContent(projectName, runtime)` — `runtime` 仅影响生成的文件名（`podman-compose.yml` / `docker-compose.yml`），镜像均为 `docker.io/postgres:16-alpine`。
2. `patchDatabaseUrl()` 用正则 `/^DATABASE_URL=.*/m` 替换 `.env.development` 中的 URL，不改动其他行。
3. SQLite 导出脚本 `scripts/export-db.ts` 硬编码表名 `auditLog` / `devOperation`（Prisma 自动转 camelCase），未来加表需手动更新。
4. `package.json` 注入仅当 `db:export` 不存在时追加，不覆盖已有脚本。

## 高风险误区

1. **不要改 compose 的镜像名**：`docker.io/postgres:16-alpine` 是唯一真值，podman 和 docker 都拉同一个镜像。
2. **不要给 `magicDir` 加默认值**：schema 里 `z.string()` 无 `.default()`，init.ts 显式赋值。
3. **`datasource` 参数仅影响 `prisma init --datasource-provider`**：User 模型、add.prisma 与 datasource 无关，通用。

## 恢复上下文审计查询

### 总体一键恢复

```text
query_audit_logs({ keyword: "init-database" })
```

### 逐文件查询

```text
query_audit_logs({ targetId: "src/cli/commands/init.ts" })
→ 预期: 重写 init.ts，新增 DB/容器交互逻辑

query_audit_logs({ targetId: "src/cli/prisma-injector.ts" })
→ 预期: PrismaInjectOptions 加 datasource 参数

query_audit_logs({ targetId: "src/caijuehub/strategies/prisma.strategy.ts" })
→ 预期: 重构 prisma init 逻辑
```

### grep 验证

```bash
grep -n "resolveDbEngine\|resolveContainer\|composeContent\|writeSqliteExport" src/cli/commands/init.ts
grep -n "datasource" src/cli/prisma-injector.ts src/caijuehub/strategies/prisma.strategy.ts
```

## 验证标准

### 已完成验证

- [x] `tsc --noEmit` 零报错
- [x] `--force` 端到端：生成 podman-compose.yml + .env.development + schema.prisma
- [x] compose 文件含 network bridge
- [x] 所有 Plan 验收标准 [x]

### 未执行的端到端验证

- [ ] 交互模式 PG + docker 路径（需手动测试）
- [ ] 交互模式 SQLite 路径（需手动测试）
- [ ] 交互模式两级自行管理提示（需手动测试）
- [ ] `prisma migrate dev` 在真实 PostgreSQL 上执行（需数据库环境）

## 完成后记录 ADD-7 审计

- `src/cli/commands/init.ts` — 新增 resolveDbEngine / resolveContainer / composeContent / writeSqliteExportScript / injectDbExportScript / patchDatabaseUrl
- `src/cli/prisma-injector.ts` — PrismaInjectOptions 加 datasource
- `src/caijuehub/strategies/prisma.strategy.ts` — datasource 参数化 + prisma init fallback
