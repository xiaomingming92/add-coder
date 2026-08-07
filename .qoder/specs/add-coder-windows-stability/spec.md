# add-coder-windows-stability Spec

> 对应 Plan: `.qoder/plans/2026-08/07/add-coder-windows-stability-plan-v1.md`

---

## Plan→Spec 映射

> 与 Plan §3.5 表格一一对应。DPS 检测此表判断映射覆盖度。

| # | Plan 决策 | 文件 | 关键变更 |
|---|------|------|------|
| 1 | 新增路径规范化工具 | `src/lib/path-normalize.ts` | 新增 normalizeRelPath 纯函数 + 单测 |
| 2 | ~~PATCH_GUARD 双分隔符~~ → normalize 优先 | `src/cli/commands/sync.ts` | isUserData 先 normalize，toml/transcribe 零改动 |
| 3 | sync hash 全量基线 | `src/cli/commands/sync.ts` | saveHashFile 合并旧 hash 未变项 |
| 4 | hash key 兼容 | `src/cli/commands/sync.ts` | loadHashFile 读取时 key normalize |
| 5 | stack 筛选规范化 + 断言 | `src/cli/commands/stack.ts` | L149 normalize + L168-L171 写后断言 |
| 6 | runCommand 封装（src） | `src/lib/run-command.ts` | 新增：win32 .cmd / status 判定 / stderr / commandExists |
| 7 | runCommand 封装（模板） | `templates/.../shared/run-command.ts` | 新增：用户项目 MCP 同型封装 |
| 8 | 模板 4 处迁移 | check_spec_sync / check_rahs / add-coder-version / fs | git/npx/npm/bash 同型修复 |
| 9 | npm exec 子进程调用 | `src/caijuehub/strategies/prisma.strategy.ts` | L58-62/L161-164 迁移 runCommand；L64 fallback 显式失败 |
| 10 | 退出码全检查 | `src/caijuehub/strategies/prisma.strategy.ts` | L165 保持（回归锁定）；L176 generate 检查；L41 which→commandExists |
| 11 | init 失败传播 | `src/cli/commands/init.ts` | deployDatabase 抛错→exit(1)；L479 peer 迁移 runCommand |
| 12 | status 非零退出码 | `src/cli/commands/status.ts` | 缺失文件 process.exit(1) |
| 13 | SQLite output 统一注入 | `src/caijuehub/strategies/prisma.strategy.ts` | postInitSetup 统一 patch generator output（成功+失败路径） |
| 14 | SQLite MCP adapter | `templates/core/scripts/mcp-server/shared/prisma.ts` | file: URL → better-sqlite3 |
| 15 | Windows CI | `.github/workflows/test.yml` | windows-latest + ubuntu vitest |
| 16 | 文档联动 | GUIDE.md / DEVELOPMENT.md / docs/跨平台兼容开发规范.md | 行为说明 + 规范 + 引用 |

---

## 1. normalizeRelPath 路径规范化

> **Plan 决策**: 新增路径规范化工具
> **文件**: `src/lib/path-normalize.ts`

### 类型/接口定义

```typescript
/** 相对路径统一为 POSIX 格式（反斜杠→正斜杠），供比较/白名单/hash key 使用 */
export function normalizeRelPath(p: string): string;
```

### WHEN-THEN

- WHEN 输入 `\plans\specs\spec.md`（Windows 渲染路径）→ THEN 返回 `plans/specs/spec.md`
- WHEN 输入 `plans/specs/spec.md`（POSIX）→ THEN 原样返回（幂等）
- WHEN 输入空串 → THEN 返回空串（不抛错）

---

## 2. sync isUserData 规范化（PATCH_GUARD normalize 优先）

> **Plan 决策**: normalize 优先修复 PATCH_GUARD（toml/transcribe 零改动）
> **文件**: `src/cli/commands/sync.ts`

### 类型/接口定义

```typescript
// isUserData(p) 内部：先 normalizeRelPath(p) 再 test PATCH_GUARD 正则
function isUserData(p: string): boolean;
```

### WHEN-THEN

- WHEN 输入 `\plans\a.md`（Windows）→ THEN normalize 后命中 `/plans/` 正则 → 返回 true（不再覆盖）
- WHEN 输入 `\specs\a.md` / `\reviews\a.md` / `\rules\profiles\a.md` → THEN 全部返回 true
- WHEN 输入 `\.qoder\scripts\mcp-server\a.ts`（普通模板）→ THEN 返回 false（正常参与 patch）

---

## 3. sync hash 全量基线保存

> **Plan 决策**: sync hash 全量基线
> **文件**: `src/cli/commands/sync.ts`

### 类型/接口定义

```typescript
// saveHashFile 调用处：new Map([...outHash 未变项(排除本轮写入), ...missingFiles, ...conflictFiles])
// 即：最终 hash = 旧全量基线中未参与本轮写写的文件 + 本轮写入文件
function saveHashFile(root: string, magic: string, files: Map<string, string>): void;
```

### WHEN-THEN

- WHEN 首次 patch（300 文件全写入）→ THEN hash 文件 300 项
- WHEN 二跑 patch 无变更 `[a]` 全跳过 → THEN hash 文件仍 300 项（不缩水）
- WHEN 三跑 patch 全部文件 hash 匹配 → THEN 无冲突，hash 保持全量（issue P0-2 复现链 300→1→空 不再发生）
- WHEN 版本升级（isUpgrade）→ THEN 全量重写为新基线（现有逻辑保持）

---

## 4. loadHashFile key normalize 兼容

> **Plan 决策**: hash key 兼容旧 Windows 反斜杠 key
> **文件**: `src/cli/commands/sync.ts`

### 类型/接口定义

```typescript
// loadHashFile 解析 JSON 后：Object.entries 逐 key normalizeRelPath
function loadHashFile(root: string, magic: string): Record<string, string>;
```

### WHEN-THEN

- WHEN 既有 hash 文件含 `\plans\a.md`（旧 Windows 生成）→ THEN 读取后 key 变为 `plans/a.md`，与渲染路径匹配
- WHEN 既有 hash 文件含 POSIX key → THEN 不变
- WHEN 文件损坏/缺失 → THEN 返回空对象（现有 catch 保持）

---

## 5. stack applyStack 规范化 + 写后断言

> **Plan 决策**: stack 筛选规范化 + 断言
> **文件**: `src/cli/commands/stack.ts`

### 类型/接口定义

```typescript
// applyStack 内：
// 1) 筛选：normalizeRelPath(relPath).includes("/rules/profiles/") || normalizeRelPath(relPath).endsWith("/rules/project_rules.md")
// 2) 断言（写文件循环后、成功打印前）：
//    assert(existsSync(.add/rules/profiles/{name}-profile.md) || 自定义)
//    assert(existsSync({magicDir}/rules/profiles/{name}-profile.md))
//    assert(project_rules.md 含 stack 引用行)
//    任一失败 → console.error + process.exit(1)
```

### WHEN-THEN

- WHEN Windows 路径 `\rules\profiles\...` → THEN normalize 后命中筛选，profile 文件写入
- WHEN 写入后 profile 文件不存在（异常）→ THEN 命令返回非零并输出缺失路径
- WHEN 写入成功 → THEN 输出"✅ 技术栈已设置为 {name} + profile 已就位"（原成功路径保持）

---

## 6. runCommand 跨平台命令封装

> **Plan 决策**: 手搓 runCommand 统一封装（src + 模板双端）
> **文件**: `src/lib/run-command.ts` + `templates/core/scripts/mcp-server/shared/run-command.ts`

### 类型/接口定义

```typescript
export interface RunResult { status: number | null; stdout: string; stderr: string; }
export function runCommand(cmd: string, args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string; timeout?: number; shell?: boolean }): RunResult;
export function commandExists(cmd: string): boolean;  // win32: where / POSIX: which
// 内部规则：
// - win32 且命令为已知 .cmd 族（npm/npx/pnpm/git）→ 自动追加 .cmd 或 shell:true
// - error（ENOENT 等）→ 抛"命令不可用: {cmd}（平台: {platform}）"
// - 返回值含 status（可能 null，由调用方判定失败）
```

### WHEN-THEN

- WHEN win32 平台执行 `npm exec prisma -- init` → THEN 解析为 npm.cmd 执行成功
- WHEN POSIX 平台执行同命令 → THEN 直接 npm 执行（无 .cmd 逻辑）
- WHEN 命令不存在（ENOENT）→ THEN 抛错"命令不可用: xxx"（不再静默 status=null）
- WHEN status=null（其他原因）→ THEN 返回 status=null，调用方按失败处理
- WHEN stderr 有内容 → THEN 保留在返回值（调用方错误信息带出）
- WHEN 调用 `commandExists("pg_dump")` win32 → THEN 执行 `where pg_dump` 判定

---

## 7. prisma.strategy 命令迁移 + 退出码治理

> **Plan 决策**: npm exec 子进程调用 + 退出码全检查
> **文件**: `src/caijuehub/strategies/prisma.strategy.ts`

### 类型/接口定义

```typescript
// runPrismaInit()：npm 场景 runCommand("npm", ["exec","prisma","--","init","--datasource-provider", provider])；pnpm 维持 ["dlx", ...]
// L64 fallback 改造：init 失败 → console.error 明确信息（不再静默手动建 schema）→ 抛出/返回失败状态
// injectPrisma() db push：runCommand(pm, pm==="pnpm" ? ["dlx","prisma","db","push",schemaArg] : ["exec","prisma","--","db","push",schemaArg])
// L176 generate：runCommand 后 status!==0 → throw new Error("prisma generate 失败")
// L41 which → commandExists("pg_dump")
```

### WHEN-THEN

- WHEN npm 场景执行 prisma init → THEN 实际命令为 `npm exec prisma -- init ...`（issue 建议语义）
- WHEN `prisma generate` 退出码非零 → THEN 抛错，init 最终返回非零 + 提示"治理模型未就绪"
- WHEN prisma init 失败（status!==0 或 schema 未生成）→ THEN 显式失败信息（不再走静默 fallback 假装成功）
- WHEN db push 失败 → THEN 维持 rollback 逻辑（onMigrateFail=rollback）但异常向上传播

---

## 8. SQLite generator output 统一注入

> **Plan 决策**: postInitSetup 统一 patch 最终生效 schema（成功+失败路径）
> **文件**: `src/caijuehub/strategies/prisma.strategy.ts`

### 类型/接口定义

```typescript
// postInitSetup() 内新增：patchGeneratorOutput(schemaPath)
// - schema.prisma 存在 generator client 块 → 在其内注入 output = "../src/generated/prisma"（已存在则跳过）
// - 无 generator 块（异常）→ 追加 generator client { provider = "prisma-client-js", output = "../src/generated/prisma" }
// 同时保留 add.prisma 复制逻辑
```

### WHEN-THEN

- WHEN prisma init 成功（schema 由 CLI 生成）→ THEN generator 块被注入 output，Client 输出 src/generated/prisma
- WHEN prisma init 失败（fallback 手动 schema）→ THEN 同一 postInitSetup 路径注入 output（双路径一致）
- WHEN generator 已有 output → THEN 不重复注入（幂等）

---

## 9. init 失败传播 + peer 安装退出码

> **Plan 决策**: init 失败传播非零退出码
> **文件**: `src/cli/commands/init.ts`

### 类型/接口定义

```typescript
// deployDatabase()：injectPrisma 失败 → 不再 catch 后仅 console.log → 抛错/标记失败
// finalize()：若数据库部署失败 → 输出"治理模型未就绪" + process.exit(1)（不再无条件"完成"）
// L479 peer 安装：runCommand(pm, ...) 后 status!==0 → 输出警告（非致命，但不再静默）
```

### WHEN-THEN

- WHEN SQLite 部署中 prisma db push 失败 → THEN 输出"SQLite 同步失败: ... 治理模型未就绪" + 退出码非零
- WHEN 全链路成功 → THEN 输出"完成: 新建 N ..."（原成功路径保持）
- WHEN peer 依赖安装失败 → THEN 输出警告但不阻断（依赖缺失由后续 MCP 启动报错暴露）

---

## 10. status 缺失非零退出码

> **Plan 决策**: status 缺失 exit(1)
> **文件**: `src/cli/commands/status.ts`

### 类型/接口定义

```typescript
// missing.length > 0 → console.log 缺失列表后 process.exit(1)
```

### WHEN-THEN

- WHEN 模板文件全部就位 → THEN 输出"所有文件完整。"退出码 0
- WHEN 存在缺失文件 → THEN 输出缺失列表 + 退出码 1（CI 门禁可用）

---

## 11. SQLite MCP adapter 分支

> **Plan 决策**: SQLite MCP adapter 模板增强
> **文件**: `templates/core/scripts/mcp-server/shared/prisma.ts`

### 类型/接口定义

```typescript
// DATABASE_URL 以 "file:" 开头 → 尝试加载 @prisma/adapter-better-sqlite3
//   const bsql = require("@prisma/adapter-better-sqlite3")
//   adapter = new bsql.PrismaBetterSQLite3({ url })
// 加载失败（依赖未安装）→ 显式 throw "SQLite 需要安装 @prisma/adapter-better-sqlite3"
// PG 分支保持 try/catch 静默降级（现有行为）
```

### WHEN-THEN

- WHEN DATABASE_URL 为 `file:./data/dev.db` → THEN 加载 better-sqlite3 adapter，PrismaClient 正常构造
- WHEN adapter 依赖缺失 → THEN 明确报错提示安装（不静默降级）
- WHEN DATABASE_URL 为 postgresql:// → THEN 走现有 PG 分支（行为不变）

---

## 12. 模板 4 处命令迁移

> **Plan 决策**: 模板 4 处同型修复
> **文件**: check_spec_sync.ts / check_rahs.ts / add-coder-version.ts / fs.ts

### 类型/接口定义

```typescript
// 各处 import { runCommand } from "../shared/run-command.js"
// - check_spec_sync.ts L78: runCommand("git", ["diff","--name-only"])
// - check_rahs.ts L54: runCommand("npx", ["tsc","--noEmit"])  // runCommand 内 win32 解析 npx.cmd
// - add-coder-version.ts L19: runCommand("npm", ["view","add-coder","version"])
// - fs.ts L18: runCommand("bash", [guardScript], { input: ... })  // 失败时输出"需要 bash/Git Bash"
```

### WHEN-THEN

- WHEN win32 执行 git/npx/npm → THEN .cmd 解析后正常执行
- WHEN win32 无 bash（fs.ts guard）→ THEN 显式错误提示（不再静默 null）

---

## 13. Windows CI job

> **Plan 决策**: Windows CI 自动化回归
> **文件**: `.github/workflows/test.yml`

### 类型/接口定义

```yaml
# jobs.test: strategy.matrix.os = [ubuntu-latest, windows-latest]
# steps: checkout → setup-node(20) → pnpm install → pnpm test（vitest）
# 路径/hash/runCommand 单测纯函数化，双平台可跑
```

### WHEN-THEN

- WHEN PR 提交 → THEN ubuntu + windows 双平台跑 vitest
- WHEN win32 单测失败（.cmd 解析等）→ THEN CI 红（回归保护）

---

## 14. 文档三件套

> **Plan 决策**: 文档联动
> **文件**: GUIDE.md / DEVELOPMENT.md / docs/跨平台兼容开发规范.md

### 内容要求

- GUIDE.md：init 失败语义（"治理模型未就绪"提示）、SQLite 支持状态（完整链路）、stack set 断言说明
- docs/跨平台兼容开发规范.md：路径规范化强制、runCommand 单入口强制、hash 全量基线语义、shell 内联 env 禁止、Windows .cmd 解析规则、P2 项（bash 替代/execa 评估条件）
- DEVELOPMENT.md：关联规范文档 + sync 机制章节更新（hash 全量基线语义）

### WHEN-THEN

- WHEN 用户按 GUIDE 执行 init → THEN 失败时能看到"治理模型未就绪"且命令非零
- WHEN 开发者新增子进程调用 → THEN 规范文档强制走 runCommand 单入口

---

## Boundaries

- 禁止：修改 `sync-rules.toml` / `sync.strategy.ts`（normalize 优先方案，toml/transcribe 零改动）
- 禁止：引入 execa/shelljs/cross-env 等运行时依赖
- 禁止：修改 Prisma 业务模型 / DB 表结构（add.prisma 内容不变）
- 禁止：重写 db-ensure.sh（bash 替代为 P2）
- 允许：仅 src + templates/core 下模板 + 文档 + CI 文件
