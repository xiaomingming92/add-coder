# add-coder-init-prisma7-refactor-plan-v2

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"。

## PLAN 元信息

- **Plan 名称**: add-coder-init-prisma7-refactor-v2
- **启动时间**: 2026-07-14T10:00:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - 上游 Plan: `.qoder/plans/2026-07/14/add-coder-init-database-setup-plan-v1.md`（数据库引擎+容器选择）
  - Handoff: `.qoder/plans/2026-07/08/add-coder-npm-package-handoff-v1.md`（增量更新）
  - 父 Plan: `.qoder/plans/2026-07/08/add-coder-npm-package-plan-v1.md`（增量更新）
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| templates/core/prisma/add.prisma | SCHEMA | MODIFIED | User @relation 模型 | AddUser 自包含（id/username/email） | ✅ |
| src/caijuehub/strategies/prisma.strategy.ts | STRATEGY | MODIFIED | migrate dev | db push + backup + PM 检测 | ✅ |
| templates/core/scripts/db-ensure.sh | SCRIPT | REFACTORED | prisma 命令内联 | 容器+env+备份（prisma 移交裁决层） | ✅ |
| src/cli/commands/init.ts | CLI | MODIFIED | db-ensure.sh 直接调 prisma | db-ensure.sh + injectPrisma() | ✅ |
| templates/core/scripts/mcp-server.ts | SCRIPT | MODIFIED | prisma.user | prisma.addUser + override:true | ✅ |
| src/core/renderer.ts | RENDERER | MODIFIED | 无 | SKIP_DIRS=["prisma"] | ✅ |

---

## 一、背景与目标

### 1.1 问题现状

v1 Plan 完成后 `add-coder init` 存在三类架构缺陷：

1. **Prisma 7 不兼容**：`migrate dev` 需要 migration 历史，已有项目会报 drift；`datasource.url` 移到 `prisma.config.ts`；`db push` 无 `--skip-generate`
2. **裁决层闲置**：`prisma.strategy.ts` 已实现 CaijueHub 裁决逻辑，但 `init.ts` 绕过它直接调 `db-ensure.sh` 执行 prisma 命令
3. **User 模型侵入**：old `add.prisma` 依赖项目 `User` 表 → `db push` 会冲突；`mcp-server.ts` 查询 `prisma.user` 与项目 User 耦合

### 1.2 目标

- Prisma 7 全链路适配：`migrate dev` → `db push`，`prisma.config.ts` 自动配置 datasource.url
- 裁决层激活：`injectPrisma()` 接入 `init.ts` Stage C
- `AddUser` 自包含：ADD 三表自治，不碰用户 schema
- 安全升级：`pg_dump` 备份 + `dotenv override:true` 防缓存

---

## 二、方案选型

### 2.1 数据库策略

| 方案 | User 依赖 | db push 安全 | 侵入性 | 结论 |
|------|:--:|:--:|:--:|:--:|
| A: 保持 User @relation（v1） | 强依赖 | 可能冲突 | 高 | ❌ |
| **B: AddUser 自包含** | **零依赖** | **仅管理三表** | **零** | **✅** |

### 2.2 同步策略

| 方案 | migration 历史 | 已有项目 | 结论 |
|------|:--:|:--:|:--:|
| A: migrate dev（v1） | 需要 | drift 报错 | ❌ |
| **B: db push** | **不需要** | **仅新增** | **✅** |

### 2.3 调用链

| 方案 | 裁决层 | 职责分离 | 结论 |
|------|:--:|:--:|:--:|
| A: db-ensure.sh 直接调 prisma（v1） | 闲置 | 混乱 | ❌ |
| **B: init.ts → db-ensure.sh(运维) + injectPrisma(裁决)** | **激活** | **清晰** | **✅** |

---

## 三、架构设计

### 3.1 数据模型

```
add.prisma（自包含）
  ├── AddUser { id, username, email, devOperations[], auditLogs[] }
  ├── DevOperation { ..., user AddUser @relation }
  └── AuditLog { ..., user AddUser @relation }

schema.prisma（不修改）
  ├── generator client
  └── datasource db
```

### 3.2 数据流转

```
init.ts Stage C
  │
  ├── db-ensure.sh（运维层）
  │     ├── .env.development 写入
  │     ├── 容器启动 / 连接验证
  │     └── pg_dump 备份
  │
  └── injectPrisma() → prisma.strategy.ts（裁决层）
        ├── prisma init
        ├── add.prisma 复制（justInited 跳过首次交互）
        ├── ensurePrismaConfig（datasource.url + .env.development 优先级链）
        ├── backupAddTables（pg_dump AddUser/DevOperation/AuditLog）
        ├── prisma db push（仅新增，不删数据）
        └── prisma generate
```

### 3.3 prisma.config.ts 规范（Prisma 7）

```ts
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma",
  datasource: { url: env("DATABASE_URL") },  // Prisma 7: 必须在 config，不在 schema
});
```

> env 加载优先级：`.env.development.local` > `.env.development` > `.env.local` > `.env`

---

## 四、实施 Task + 依赖图

```
Task 1: AddUser 模型 ──┐
Task 2: mcp-server 适配 ─┤ 可并行
                        │
                        ▼
Task 3: prisma.strategy.ts 重写（db push + backup + PM）
                        │
                        ▼
Task 4: db-ensure.sh 瘦身
                        │
                        ▼
Task 5: init.ts 接入 injectPrisma + 时序修复
                        │
                        ▼
Task 6: renderer.ts SKIP_DIRS
                        │
                        ▼
Task 7: 集成验证 + 文档 + devlog
```

### Task 1: AddUser 自包含模型

**范围**：`templates/core/prisma/add.prisma`

- User → AddUser（id/username/email）
- DevOperation/AuditLog @relation 指向 AddUser
- schema.prisma 不修改

### Task 2: mcp-server.ts 适配 AddUser

**范围**：`templates/core/scripts/mcp-server.ts` + 四目录同步

- `prisma.user` → `prisma.addUser`
- `dotenv.config({ override: true })` 防缓存
- 移除 `password` 字段

### Task 3: prisma.strategy.ts 重写

**范围**：`src/caijuehub/strategies/prisma.strategy.ts`

- `migrate dev` → `db push`
- 新增 `backupAddTables()` — pg_dump 三表
- 新增 `ensurePrismaConfig()` — datasource.url + env 优先级链
- `npx` → `detectPm()` 防 devEngines 冲突
- `justInited` 标记跳过首次 init 交互
- `requiresUserModel: false`

### Task 4: db-ensure.sh 瘦身

**范围**：`templates/core/scripts/db-ensure.sh`

- 移除 prisma init/push/generate 命令
- 保留：容器启动 + .env.development + pg_dump 备份
- `--migrate` 标志只触发备份

### Task 5: init.ts 裁决层接入

**范围**：`src/cli/commands/init.ts`

- Stage A: 移除 add.prisma 临时拷贝逻辑（交裁决层）
- Stage C: `db-ensure.sh` + `injectPrisma()` 双调用
- reuse-existing 时 `db-ensure.sh` 用 manual 模式（env+备份）

### Task 6: renderer.ts 排除 prisma/

**范围**：`src/core/renderer.ts`

- `SKIP_DIRS = new Set(["prisma"])` — add.prisma 不进 IDE magic path

### Task 7: 集成验证 + 文档 + devlog

- coder-test 端到端 init 验证
- add-coder MCP devlog 写入验证
- README / GUIDE 更新
- Plan / Handoff 增量回流

---

## 五、验收标准

- [x] `prisma db push --schema=prisma/` 创建 AddUser + DevOperation + AuditLog 三表
- [x] 重复 init 幂等，数据不丢失
- [x] `backupAddTables` pg_dump 生成备份文件
- [x] `mcp-server.ts` 重启后 devlog 写入正常
- [x] `add.prisma` 不进 `.add/` `.qoder/` `.claude/` `.vscode/`
- [x] `prisma.config.ts` datasource.url 读取 `.env.development`
- [x] pnpm 项目 `detectPm` 选 pnpm dlx，不触发 devEngines 冲突
- [x] coder-test 复用已有实例 init 全链通过
- [x] Plan / Handoff 文档增量更新
- [x] README / GUIDE 同步

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| 本 Plan | `.qoder/plans/2026-07/14/add-coder-init-prisma7-refactor-plan-v2.md` |
| 上游 Plan | `.qoder/plans/2026-07/14/add-coder-init-database-setup-plan-v1.md` |
| Handoff（增量更新） | `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-handoff-v1.md` |
| 父 Plan（增量更新） | `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-plan-v1.md` |
