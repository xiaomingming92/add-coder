# add-coder-init-database-setup-plan-v1

> add-coder init 流程增加数据库引擎与容器运行时选择交互，自动生成 compose 和 SQLite 导出脚本。

**创建时间**: 2026-07-14T09:30:00+08:00
**主导 AI**: Qoder

---

## 一、Plan 概述

- **现状**: `add-coder init` 固定使用 PostgreSQL，`npx prisma init --datasource-provider postgresql` 硬编码。用户无选择权，且没有 compose 自动生成的便利。
- **目标**: init 增加三步交互选择——数据库引擎 → 容器运行时 → 自动生成 compose 或 SQLite 导出脚本。自行管理时有明确的 DATABASE_URL 格式提示。
- **核心原则**: 
  - PostgreSQL 自动起容器（podman 优先），SQLite 零依赖但提供数据导出
  - 自行管理模式不生成额外文件，但提示文案完整
  - 不改动 Prisma schema 结构（User 模型、add.prisma 通用）

---

## 二、变更范围

### 2.1 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/cli/commands/init.ts` | 修改 | 新增 DB 引擎选择、容器运行时选择、compose 生成、SQLite 导出脚本生成、自行管理提示 |
| `src/cli/prisma-injector.ts` | 修改 | PrismaInjectOptions 增加 `datasource` 参数 |
| `src/caijuehub/strategies/prisma.strategy.ts` | 修改 | `prisma init --datasource-provider` 使用传入值替代硬编码 `postgresql` |
| `src/cli/commands/init.ts` | 新增逻辑 | `composeFile()` 函数（支持 podman/docker 两种容器运行时），SQLite `scripts/export-db.ts` 内容生成，`package.json` 注入 `db:export` 脚本 |
| `templates/core/scripts/db-ensure.sh` | 新建 | 容器启动 + pg_isready 轮询 + Prisma migrate 三合一 |
| `templates/core/scripts/mcp-server.ts` | 修改 | Prisma 7 兼容：移除 `Prisma` namespace |
| `src/lib/utils.ts` | 修改 | 新增 `detectPm()` 工具函数 |
| `.gitignore` | 修改 | 加 `*.tgz` + `test-output/` |

### 2.2 关键设计决策

```text
┌──────────────┐
│ add-coder init│
└──────┬───────┘
       │
       ▼
  ┌─────────────┐
  │  IDE 检测    │  env 变量 → 目录检测 → ask
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────────────────┐
  │  数据库引擎:                                  │
  │  [1] PostgreSQL (推荐) — 生产级，自动起容器     │
  │  [2] SQLite — 零依赖，数据存文件，可导出        │
  │  [3] 自行管理 — Prisma 支持的 datasource 都行  │
  └──────┬──────────────────────────────────────┘
         │
    ┌────┼────┬──────────────┐
    ▼    ▼    ▼              ▼
  [1]  [2]  [3]  PostgreSQL│SQLite│自行管理
    │    │    │
    │    │    └──→ 提示 Prisma datasource 列表
    │    │
    │    └──→ writeSqliteExportScript() + injectDbExportScript()
    │              │
    │              ▼
    │         db-ensure.sh sqlite --migrate
    │
    ▼
  ┌──────────────────────┐
  │ 容器运行时:            │
  │ [1] podman (推荐)     │
  │ [2] docker            │
  │ [3] 自行管理          │
  └──────┬───────────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
  [1]  [2]  [3]
 podman│docker│自行管理
    │    │    │
    ├────┤    │
    │    │    └──→ 提示 DATABASE_URL 格式
    ▼    ▼
  ┌──────────────────────────────────────┐
  │ 数据库凭据询问                          │
  │ DATABASE_USER / DATABASE_PASSWORD     │
  └──────┬───────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────┐
  │ compose.yml + .env + DATABASE_URL     │
  │ patchDatabaseUrl()                    │
  └──────┬───────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────┐
  │ db-ensure.sh postgresql {podman|docker} --migrate │
  │  → compose up -d                     │
  │  → pg_isready 轮询 (max 30s)         │
  │  → prisma migrate dev                │
  │  → prisma generate                   │
  └──────────────────────────────────────┘
```

1. **数据库引擎**：PostgreSQL（推荐）、SQLite、自行管理三种。MySQL 不加——Prisma 可自行配置但不属于 init 交互推荐范围。自行管理时提示所有 Prisma 支持的 datasource。
2. **容器运行时**：仅选 PostgreSQL 时询问。podman（推荐默认）、docker、自行管理三种。选自行管理时不生成 compose，提示 URL 格式。
3. **数据库凭据询问**：选 podman/docker 后，询问 DATABASE_USER 和 DATABASE_PASSWORD，回车用预设值（admin / change-me-in-production）。之后可在项目根目录 `.env` 中修改。
4. **compose 文件**：凭据不写死在 yaml 中，通过 `env_file: - .env` 从同名 `.env` 文件读取。compose 内用 `${DATABASE_USER:-admin}` 做容器环境变量映射。端口固定 5433，含 network bridge。
5. **DATABASE_URL 生成**：`patchDatabaseUrl()` 直接使用用户输入的凭据拼写 URL，写入 `.env.development`。不通过正则回读 `.env` 文件——凭据从交互获取，单向写，避免循环依赖。
6. **prisma init fallback**：失败时 placeholder URL `postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public`，不猜测任何用户名/密码/端口。
7. **SQLite 导出脚本**：用 Prisma 读取 AuditLog/DevOperation 导出 JSON，放在 `data/exports/`。含时间戳文件名防覆盖。同时在 `package.json` 注入 `db:export` 脚本。
8. **自行管理模式（两级）**：init 不停止，模板全部写入。顶层自行管理提示 Prisma datasource 列表；PG 层自行管理提示 DATABASE_URL 格式 + 重新 init 迁移。
9. **自行管理模式 — adapter 手动配置**：Prisma 7 要求 `new PrismaClient()` 传入 adapter。模板已内置 PG（`@prisma/adapter-pg`）和 SQLite（`@prisma/adapter-libsql`）的自动检测。选 MySQL/MSSQL/CockroachDB 等时，DATABASE_URL 前缀不匹配任何一种，adapter 为空。用户需自行在 `.qoder/scripts/mcp-server.ts` 中按需 import 对应的 adapter 并传入构造函数。
10. **`--force` 模式**：跳过所有交互，默认 PostgreSQL + podman + admin/change-me-in-production，直接写入不询问。

---

## 三、Tasks

- [x] Task 1: prisma-injector + strategy 支持 datasource 参数
  - [x] `PrismaInjectOptions` 加 `datasource?: string`
  - [x] `prisma.strategy.ts` 第 37 行 `--datasource-provider` 改用 `options.datasource || "postgresql"`
- [x] Task 2: init.ts 增加数据库引擎选择
  - [x] 步骤 ③：询问 `[1] PostgreSQL (推荐) [2] SQLite [3] 自行管理`
  - [x] 每项带说明：[1] 生产级，自动起容器 / [2] 零依赖，数据存文件，可导出 / [3] 你提供连接信息，支持 Prisma 的 datasource 都行
  - [x] 选 3 时跳过容器询问，提示 Prisma 支持的 datasource：postgresql / mysql / sqlite / sqlserver / cockroachdb，用户自行改 .env.development
  - [x] 选 2 时跳过容器询问，直接 `datasource = "sqlite"`
- [x] Task 3: init.ts 增加容器运行时选择（仅选 PostgreSQL 时）
  - [x] 询问 `[1] podman (推荐) [2] docker [3] 自行管理`
  - [x] 每项带说明：[1] 无 daemon，rootless / [2] 已有 docker 环境 / [3] 不生成 compose，手动配 DATABASE_URL
  - [x] podman/docker 时生成 compose 文件 + `.env` 凭据文件 + 改写 DATABASE_URL
  - [x] compose 文件放在项目根目录，不放在 `.add/` 或 IDE 目录下
- [x] Task 3.5: 数据库凭据询问（实施中新增）
  - [x] 选 podman/docker 后询问 DATABASE_USER / DATABASE_PASSWORD
  - [x] 回车使用预设值，输入用输入值
  - [x] 凭据写入 `.env` 和 DATABASE_URL，不猜测，不硬编码
- [x] Task 4: 自行管理模式的提示文案
  - [x] 模板渲染完成后输出 DATABASE_URL 格式说明 + 重新 init 完成迁移的提示
  - [x] 提示包含 URL 格式示例：`postgresql://USER:PASS@HOST:5432/DB?schema=public`
- [x] Task 5: SQLite 导出脚本生成
  - [x] 生成 `scripts/export-db.ts`：Prisma 读取 AuditLog + DevOperation，导出 JSON 到 `data/exports/`
  - [x] 在 `package.json` 中注入 `"db:export": "npx tsx scripts/export-db.ts"`
  - [x] 最终提示中显示 `npm run db:export → data/exports/audit-logs.json`
- [x] Task 6: db-ensure.sh 脚本化 — 容器管理逻辑从 init.ts 抽取
  - [x] 创建 `templates/core/scripts/db-ensure.sh`：容器启动 + pg_isready 轮询 + Prisma migrate
  - [x] init.ts 改为 `spawnSync("bash", [dbScript, ...])` 调用，去 inline shell
  - [x] 支持三种引擎：SQLite 直接 migrate / 自行管理 prompt / 容器模式 compose up + migrate
- [x] Task 7: try/catch 加固 + 兜底值清零
  - [x] `patchDatabaseUrl` 参数签名 `string | undefined`，开头判空 return，调用处加 try/catch
  - [x] `db-ensure.sh` bash 调用外层加 try/catch，防进程 spawn 异常
  - [x] env 传参 `|| ""` / `|| "admin"` 全部移除
- [x] Task 8: peerDeps 自动安装
  - [x] init.ts 不再手工维护依赖列表，改为读 `package.json` 的 `peerDependencies`
  - [x] install 全部 peerDeps，后续加减依赖零改动
- [x] Task 9: mcp-server.ts 模板 Prisma 7 兼容
  - [x] `import { PrismaClient, Prisma }` → `import { PrismaClient }`
  - [x] `Prisma.InputJsonValue` → `any`，`Prisma.JsonNull` → `null`
- [x] Task 10: detectPm + gitignore
  - [x] `detectPm()` 提取到 `lib/utils.ts`，prisma.strategy.ts 和 init.ts 共用
  - [x] 根 `.gitignore` 加 `*.tgz` + `test-output/`

## 四、Handoff

### 4.1 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `src/cli/prisma-injector.ts` | 修改 | PrismaInjectOptions 加 datasource 字段 |
| 2 | `src/caijuehub/strategies/prisma.strategy.ts` | 修改 | --datasource-provider 参数化 |
| 3 | `src/cli/commands/init.ts` | 重写 | 三步交互 + compose 生成 + SQLite 导出脚本 + 提示文案，去 injectPrisma |
| 4 | `templates/core/scripts/db-ensure.sh` | 新建 | 容器管理 + Prisma migrate 脚本 |
| 5 | `templates/core/scripts/mcp-server.ts` | 修改 | Prisma 7 兼容 |
| 6 | `src/lib/utils.ts` | 修改 | 新增 detectPm() |

### 4.2 执行 Task 摘要

```text
Task 1 ── prisma-injector + strategy 参数化
            │
            ▼
Task 2 ── DB 引擎选择交互
            │
            ├── [1] PostgreSQL ──→ Task 3 容器选择
            │                          ├── [1] podman → Task 3.5 凭据询问 → compose + .env + URL 改写
            │                          ├── [2] docker → Task 3.5 凭据询问 → compose + .env + URL 改写
            │                          └── [3] 自行管理 → Task 4 提示文案
            │
            ├── [2] SQLite ──→ Task 5 导出脚本生成
            │
            └── [3] 自行管理 ──→ 提示 Prisma datasource 列表，用户自行配置

Task 6 ── db-ensure.sh 脚本化 ──→ 容器管理 + Prisma migrate 三合一
Task 7 ── try/catch 加固 + 兜底清零 ──→ patchDatabaseUrl 签名 + spawnSync 防护
Task 8 ── peerDeps 自动装
Task 9 ── mcp-server.ts Prisma 7 兼容
Task 10 ── detectPm + gitignore
```

### 4.3 验收标准

- [x] `add-coder init` 在空项目中依次询问 IDE → DB 引擎 → 容器运行时
- [x] 选 podman 后项目根目录生成 `podman-compose.yml`，DATABASE_URL 自动匹配
- [x] 选 docker 后生成 `docker-compose.yml`，其余同上
- [x] 选自行管理后不生成 compose，提示包含 DATABASE_URL 格式和下一步操作
- [x] 选 SQLite 后生成 `scripts/export-db.ts` 和 `package.json` 中的 `db:export` 脚本
- [x] `--force` 模式下跳过交互，使用默认值（PostgreSQL + podman）
- [x] PostgreSQL 和 SQLite 两种 datasource 的 Prisma init 均正常执行
- [x] compose 文件含 network bridge 预设，支持多容器互联

### 4.4 实施偏离与补充

- **Task 3.5 凭据询问**：原 plan 未设计，实施中发现 compose 凭据不宜硬编码。新增 `resolveDbCredentials()`，选 podman/docker 后询问 DATABASE_USER / DATABASE_PASSWORD，回车用预设值。
- **compose 凭据外部化**：yaml 不再内联 `POSTGRES_USER: admin`，改为 `env_file: - .env` + `${DATABASE_USER:-admin}` 映射。同时生成 `.env` 文件供 compose 读取。
- **prisma init fallback URL**：原硬编码 `admin:${POSTGRES_PASSWORD}@localhost:5433`，改为 placeholder `USER:PASSWORD@HOST:PORT/DB`，不猜测。
- **`patchDatabaseUrl` 参数化**：不再从 `.env` 文件回读凭据（避免循环依赖），改为直接接收 `resolveDbCredentials()` 产出的 user/password。
- **prisma.strategy.ts 重构**：拆为 `runPrismaInit` / `postInitSetup` / `injectPrisma` 三函数，增强可读性。
- **`--yes` 移除**：交互逻辑收窄，`--force` 覆盖所有非交互场景。
- **db-ensure.sh 脚本化**：init.ts 中内联的容器启动 + `pg_isready` 轮询 + Prisma migrate 逻辑抽取为 `templates/core/scripts/db-ensure.sh`。init.ts 改为 `spawnSync("bash", [dbScript, ...])` 调用，缩减 ~30 行内联 shell 逻辑。
- **init.ts 去 injectPrisma**：原来 init.ts 直接 import 和调用 `injectPrisma()`，现统一路由到 `db-ensure.sh`，init.ts 不再直接操作 Prisma。
- **patchDatabaseUrl 加固**：参数签名改为 `string | undefined`，函数开头统一判空 return；调用处加 try/catch 防文件 IO 异常。
- **spawnSync 加 try/catch**：`db-ensure.sh` 的 bash 调用外层加 try/catch，防进程 spawn 异常导致 init 中断。
- **兜底值清零**：env 传参 `|| ""` / `|| "admin"` 全部移除，依赖交互层已保证值存在，拼写异常由 try/catch 兜。
- **mcp-server.ts 模板 Prisma 7 兼容**：`import { PrismaClient, Prisma }` → `import { PrismaClient }`，`Prisma.InputJsonValue` → `any`，`Prisma.JsonNull` → `null`。
- **init.ts peerDeps 自动装**：不再手工维护安装列表，改为读 `package.json` 的 `peerDependencies`，install 全部。
- **detectPm 工具函数**：`existsSync(pnpm-lock.yaml)` 判断提取到 `lib/utils.ts`，prisma.strategy.ts 和 init.ts 两处引用合并。
- **gitignore 补充**：根 `.gitignore` 加 `*.tgz` + `test-output/`。

> **继任 Plan**：Prisma 7 适配 + 裁决层接入 + AddUser 模型重构 → [add-coder-init-prisma7-refactor-plan-v2.md](./add-coder-init-prisma7-refactor-plan-v2.md)
