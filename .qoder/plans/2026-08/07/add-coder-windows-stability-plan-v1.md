# add-coder-windows-stability-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。

## PLAN 元信息

- **Plan 名称**: add-coder-windows-stability-plan-v1
- **启动时间**: 2026-08-07T10:30:00+08:00
- **结束时间**: 2026-08-07（用户确认收敛，Plan 关闭）
- **状态**: CLOSED — 3 轮 15 Task 代码实施完成、双闸门通过（DPS 80 / RAHS 88 工具上限）、add-route 31/31；剩余 6 项（[R] Windows 真机运行时验证）已流转至 `.qoder/reviews/add-coder-windows-stability-review-runtime.md`，待部署后验证
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/07/add-coder-windows-stability-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-08/07/add-coder-windows-stability-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-windows-stability-review-v1.md`
  - Issue: https://github.com/xiaomingming92/add-coder/issues/10
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| src/lib/path-normalize.ts | MODULE | MODULE_CREATED | 不存在 | 提供 normalizeRelPath()（反斜杠→POSIX） | 待实施 |
| src/lib/run-command.ts | MODULE | MODULE_CREATED | 不存在 | 跨平台命令封装（.cmd 解析/退出码/stderr/commandExists）[回流: Review 跨端选型] | 待实施 |
| src/cli/commands/sync.ts | COMPONENT | COMPONENT_MODIFIED | hash 仅存差异文件、isUserData 直测原始路径、loadHashFile 不兼容反斜杠 key | hash 存全量基线、比较前先规范化路径、读取时 key normalize | 待实施 |
| src/cli/commands/stack.ts | COMPONENT | COMPONENT_MODIFIED | 筛选匹配 POSIX 分隔符，Windows 空集假成功 | 规范化后匹配 + L168-L171 写后断言 [回流: Review P2 #7] | 待实施 |
| src/caijuehub/strategies/prisma.strategy.ts | COMPONENT | COMPONENT_MODIFIED | npm 子进程调用错误（缺 exec + .cmd 无法 spawn）、L64 fallback 吞错、L176 generate 不查退出码、SQLite 无 output、L41 which | 迁移 runCommand（npm exec）、L64 fallback 显式失败、generate 退出码检查、postInitSetup 统一注入 output、which→commandExists [回流: Review P0 #2 / P1 #3 / P2 #9] | 待实施 |
| src/cli/commands/init.ts | COMPONENT | COMPONENT_MODIFIED | 失败仅打印仍"完成"、L479 peer 安装无退出码 | 失败非零退出码 + 明确"治理模型未就绪"、L479 迁移 runCommand [回流: Review P2 #8] | 待实施 |
| src/cli/commands/status.ts | COMPONENT | COMPONENT_MODIFIED | 缺失仅打印 | 缺失 process.exit(1) | 待实施 |
| templates/core/scripts/mcp-server/shared/run-command.ts | TEMPLATE | TEMPLATE_CREATED | 不存在 | 模板侧跨平台命令封装（用户项目 MCP 用）[回流: Review 跨端选型] | 待实施 |
| templates/core/scripts/mcp-server/tools/gateway/check_spec_sync.ts | TEMPLATE | TEMPLATE_MODIFIED | L78 spawnSync("git") Windows .cmd 失效 | 迁移 runCommand [回流: Review 跨端选型] | 待实施 |
| templates/core/scripts/mcp-server/tools/gateway/check_rahs.ts | TEMPLATE | TEMPLATE_MODIFIED | L54 spawnSync("npx") Windows .cmd 失效 | 迁移 runCommand [回流: Review 跨端选型] | 待实施 |
| templates/core/scripts/mcp-server/resources/add-coder-version.ts | TEMPLATE | TEMPLATE_MODIFIED | L19 spawnSync("npm") Windows .cmd 失效 | 迁移 runCommand [回流: Review 跨端选型] | 待实施 |
| templates/core/scripts/mcp-server/shared/fs.ts | TEMPLATE | TEMPLATE_MODIFIED | L18 spawnSync("bash") Windows 无 bash | 迁移 runCommand（含命令缺失显式报错）[回流: Review 跨端选型] | 待实施 |
| templates/core/scripts/mcp-server/shared/prisma.ts | TEMPLATE | TEMPLATE_MODIFIED | 仅 PG adapter、仅 src/generated 探测 | 补 SQLite adapter + 探测路径含 fallback | 待实施 |
| .github/workflows/test.yml | CI | CI_CREATED | 不存在（现有 preview/publish/release 无 test job） | windows-latest + ubuntu vitest job [回流: Review P1 #5] | 待实施 |
| GUIDE.md | DOC | DOC_MODIFIED | 无 SQLite 支持状态说明 | 补 init 失败语义、SQLite 状态、stack 断言说明 | 待实施 |
| DEVELOPMENT.md | DOC | DOC_MODIFIED | 无跨平台规范引用 | 关联跨平台兼容规范文档 | 待实施 |
| docs/跨平台兼容开发规范.md | DOC | DOC_CREATED | 不存在 | 路径规范化/runCommand 单入口/hash 基线语义约定 | 待实施 |

---

## HITL 计划总览（已通过，round 1 TONGYI 2026-08-07）

| # | 维度 | 最终确认内容 | 决策 |
|---|------|------------|:---:|
| 1 | 影响模块 | cli/commands/init.ts、sync.ts、stack.ts、status.ts、caijuehub/sync-rules.toml（PATCH_GUARD 源头，改后重新 generate）、caijuehub/strategies/prisma.strategy.ts、templates/core/scripts/mcp-server/shared/prisma.ts、新增 src/lib/path-normalize.ts、GUIDE.md、DEVELOPMENT.md | ✅ 同意 |
| 2 | 预估文件数 | 11 个文件：新增 2（src/lib/path-normalize.ts + docs/跨平台兼容开发规范.md）、修改 9（sync.ts、stack.ts、init.ts、status.ts、sync-rules.toml、prisma.strategy.ts、mcp-server/shared/prisma.ts、GUIDE.md、DEVELOPMENT.md） | ✅ 同意 |
| 3 | 架构变更 | 新增 src/lib/path-normalize.ts 统一 POSIX 路径规范化；hash 保存语义改为全量基线；sync.strategy.ts 为生成文件不改，改 sync-rules.toml 源头再 generate | ✅ 同意 |
| 4 | 新增依赖 | 不引入 cross-env：环境变量均通过 spawnSync env 对象传递，天然跨平台；跨平台适配点是路径规范化和子进程命令选择（npm exec/npx、bash 不可依赖） | ✅ 同意 |
| 5 | 风险等级 | 中（涉及 npm 子进程调用与退出码语义，需回归验证 Linux 路径不回归） | ✅ 同意 |
| 6 | 预计轮次 | 3 轮：①路径规范+hash基线 ②Prisma 子进程+退出码 ③SQLite 完整路径+文档联动（GUIDE/DEVELOPMENT/规范文档） | ✅ 同意 |

> **HITL 记录位置**：提案 `.qoder/plans/2026-08/07/add-coder-windows-stability-plan-v1.hitl.md` + HitlRecord `cmsid0i0q0000nllz9e8n12av`（DRAFT→TONGYI）+ 哨兵 `.qoder/hitl/.tongyi-*`（双通道）。[回流: Review P1 #6 实物核验：hitl.md 按 MAGIC_DIR 生成在 .qoder/plans/，非 .add/plans/]
> **Review 回流后文件清单调整**（2026-08-07）：~~11 个~~ → 18 个文件（新增 5：path-normalize、run-command、模板 run-command、规范文档、CI workflow；修改 13；sync-rules.toml 因 normalize 优先方案移出清单）。[回流: Review P0 #1 / 跨端选型]

---

## 一、背景与目标

### 1.1 问题现状

[GitHub issue #10（0.3.19，Windows PowerShell + Codex adapter + SQLite](https://github.com/xiaomingming92/add-coder/issues/10)实测报告 5 个问题 + 1 个补充，经源码逐行验证全部真实存在：

- **P0-1 init 假成功**：npm 场景子进程调用错误（`spawnSync("npm", ["prisma", "init"])`，Windows 下 `status=null`）；`prisma generate` 不检查退出码；失败被 catch 后仅打印，`finalize` 无条件输出"完成"，无非零退出码。
- **P0-2 sync --patch hash 基线丢失**：`saveHashFile(..., new Map([...missingFiles, ...conflictFiles]))` 只保存本轮差异文件，未保留未变化文件 hash → 300 项缩成 1 项 → 下一轮全量误判冲突。
- **P0-3 Windows 保护目录失效**：PATCH_GUARD 正则（`sync-rules.toml` 源头 → `sync.strategy.ts` 生成）仅匹配 POSIX `/`，Windows 反斜杠路径匹配不到，`plans/specs/reviews` 可被覆盖。
- **P1-4 stack set 假成功**：`applyStack()` 用 `relPath.includes("/rules/profiles/")` 匹配，Windows 下 `stackRelated` 为空集 → profile 未写、project_rules.md 未更新，仍打印"✅ 已设置 + hash 已刷新（0 个文件）"。
- **P1-5 SQLite Client 与 MCP 入口不匹配**：fallback schema（`prisma.strategy.ts` 手动创建）无 `output` 字段 → Client 在 `node_modules/@prisma/client`；MCP 模板只探测 `src/generated/<dir>/client.ts` 且仅 PG adapter → SQLite 项目 MCP 必然无法启动。
- **补充-6 status 通过含义过弱**：缺失文件仅打印不 `process.exit(1)`，无法用于 CI 门禁。

### 1.2 目标

1. 修复上述 6 个问题的代码根因（以 issue #10 复现步骤为验收基准）。
2. 建立跨平台路径处理规范，杜绝"POSIX 分隔符假设"再次扩散（本次修复 + 规范文档双保险）。
3. 全部子进程调用迁移至**跨平台 `runCommand` 单入口**（手搓封装，HITL 决策）：正确 npm 语义（`npm exec prisma -- ...`）、Windows `.cmd` 解析、所有关键命令检查退出码（含 status=null）；`init` 失败时非零退出码 + 明确提示"治理模型未就绪"。[回流: Review 跨端选型]
4. `sync --patch` 的 hash 文件始终是**全量基线**（未变文件 hash 保留 + 本轮写入更新）。
5. SQLite 走通"schema → Client 输出 → MCP adapter → db push 验收"完整链路，或明示仅模板模式（选型见 §二）。
6. Linux 行为零回归（tsc + eslint + 现有 tests + 关键命令 dry-run 回归）。

---

## 二、方案选型

### 2.1 候选方案对比

| 决策点 | 方案 A | 方案 B | 结论 |
|--------|--------|--------|------|
| 路径规范化 | 新建 `src/lib/path-normalize.ts` 统一入口 | 各文件内联 `replaceAll("\\","/")` | **A**：单一真源，规范文档可引用；B 会再次散落 |
| PATCH_GUARD 修复 | ~~改 `sync-rules.toml` patterns 为双分隔符正则~~ → **normalize 优先**：sync.ts 调用处先 `normalizeRelPath`，PATCH_GUARD 正则保持匹配 `/` 不动，toml/transcribe 零改动 [回流: Review P0 #1 toml 双重转义缺陷] | 直接手改生成的 `sync.strategy.ts`（被 generate 覆盖，否决） | **A（新）**：Review 转义链推演证实 toml 写 `[\\/]` 经基础字符串解析+字面量透传后实为 `[\/]`，正则仍只匹配 `/` 修复无效；normalize 后路径统一 `/`，原正则天然命中，零转义风险，且文件清单减少 1 |
| hash 保存 | 全量基线 = 旧 hash（未变文件）+ 本轮写入文件 | 增量（现状） | **A**：issue P0-2 直接要求；版本升级/首次 patch 时全量重写 |
| npm 子进程 | `npm exec prisma -- init/db push/generate` | `npx prisma ...` | **A**：issue 建议 + npm 官方语义；pnpm 分支维持 `dlx` 不变 |
| 退出码策略 | 所有 spawnSync 检查 `status !== 0`（含 `null`）→ throw/exit(1)；init 串联 db push+generate 双成功 | 仅检查 db push | **A**：generate 失败 = Client 缺失 = MCP 不可用，必须纳入 |
| SQLite 支持 | ~~fallback schema `output`~~ → **最终生效 schema 统一 patch**：`postInitSetup` 后对 schema.prisma 的 generator 块注入 `output = "../src/generated/prisma"`（init 成功+失败路径全覆盖）[回流: Review P0 #2 SQLite 成功路径未覆盖] + MCP 模板补 `@prisma/adapter-better-sqlite3` + GUIDE 标注 | 仅模板模式：GUIDE 明示需人工配置 | **A**：仅改 fallback L68 只覆盖 prisma init 失败路径；成功路径 schema.prisma 由 Prisma CLI 生成（generator 无 output）→ Client 仍落 node_modules，P1-5 复发 |
| 跨端子进程 | **手搓 `runCommand` 统一封装**（src + 模板双端）：win32 `.cmd` 解析、`status!==0`（含 null）判定、错误带 stderr、commandExists 跨平台探测 | 引入 execa / shelljs 运行时依赖 | **手搓（HITL 决策 2026-08-07）**：需求模式单一（跑命令+查退出码）、参数全部内部构造无注入面；npx 分发保持零运行时依赖；模板层实测 4 处同型故障（git/npx/npm/bash）一并迁移；execa/shelljs 留待 P2 bash 替代时评估 [回流: Review 跨端选型] |
| hash key 兼容 | loadHashFile 读取时对 key normalize（`\\`→`/`），兼容既有 Windows 反斜杠 key；保存时统一 POSIX 格式 | 不兼容 → 已初始化 Windows 项目首次 patch 全量误判冲突 | **A**：issue 报告者建议"比较/白名单/hash 全部统一 POSIX"，读取兼容是平滑迁移前提 |
| cross-env | 不引入 | 引入 | **不引入**：本仓环境变量全部经 spawnSync 的 env 对象参数传递（init.ts L408、prisma.strategy.ts），不依赖 shell 内联语法，cross-env 无用武之地；真正风险点是 bash 脚本依赖（见 §3.1 已知边界） |
| 规范文档 | 新增 `docs/跨平台兼容开发规范.md` + DEVELOPMENT.md 引用 + GUIDE.md 行为说明 | 不建文档 | **A**：issue 3 个 P0/P1 均为同一类根因（分隔符假设），文档化防止复发；与 DEVELOPMENT/GUIDE 联动 |
| 测试 | 新增 vitest 单测（路径规范化、hash 全量基线、runCommand win32 模拟）+ Linux 回归 + **Windows CI job**（windows-latest vitest）[回流: Review P1 #5] | 仅手工验证 | **A**：路径/hash/runCommand 纯函数化后天然跨平台可跑，issue 建议第 5 条（Windows 自动化回归）落地 |

### 2.2 选型理由

- 方案 A 全部基于 issue 报告者的根因分析与修复建议，经代码验证成立；~~PATCH_GUARD 必须改 toml 源头~~ → Review #1 转义链推演后改为 normalize 优先（toml/transcribe 零改动，规避双重转义陷阱）。[回流: Review P0 #1]
- 不引入 cross-env：证据为本仓无 shell 内联 env 语法（package.json scripts / mcp.json env 对象 / spawnSync env 对象 / shell 脚本内赋值四类场景全部不依赖内联语法）；引入反而增加依赖面。
- 跨端子进程采用**手搓 runCommand**（HITL 决策）：npm/npx/git 在 Windows 为 `.cmd`，`spawnSync("npm",...)` 直接 ENOENT（status=null 完整根因）；封装同时解决命令语义（exec）+ 平台解析（.cmd）+ 退出码（含 null）。
- SQLite 走"代码修复为主、文档说明为辅"：~~`output` 字段修复成本一行~~ → 需在 postInitSetup 统一注入最终生效 schema（成功+失败路径），否则成功路径复发；MCP adapter 属模板级增强。[回流: Review P0 #2]

---

## 三、架构设计

### 3.1 数据流转（文件级，标注关键行号与回退路径）

```
                    ┌──────────────────────────────────────────────┐
                    │ sync-rules.toml (patterns 真源, L6, 不改)       │
                    │  PATCH_GUARD: ["[/]plans[/]", ...] 匹配 /      │
                    └──────────────────┬───────────────────────────┘
                                       │ npm run generate（现有机制不动）
                                       ▼
                    ┌──────────────────────────────────────────────┐
                    │ sync.strategy.ts (生成物, 不手改)              │
                    │  PATCH_GUARD: /[/]plans[/]/ 原样保留           │
                    └──────────────────┬───────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ sync.ts          │    │ stack.ts         │    │ init.ts          │
│ L46 isUserData   │    │ L149 筛选匹配    │    │ L385 hash 写入   │
│  先 normalize    │    │  先 normalize    │    │  (已是全量,不动)  │
│ L117 loadHashFile│    │ L168-L171 断言   │    │ L479 peer 安装   │
│  key normalize   │    │                  │    │  → runCommand    │
│ L162 hash 全量   │    │                  │    │ L411/L419 bash   │
│  基线保存        │    │                  │    │  → 失败检测(P2)  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
        │ 统一调用                                  │
        ▼                                           ▼
┌──────────────────┐    ┌─────────────────────────────────────────┐
│ path-normalize   │    │ run-command.ts (src 新增)               │
│ src/lib/          │    │  win32 .cmd 解析 / status!==0 / stderr  │
│ normalizeRelPath()│    │  commandExists(win32: where / POSIX)    │
└──────────────────┘    └──────────────────┬──────────────────────┘
                                            ▼
                        ┌─────────────────────────────────────────┐
                        │ prisma.strategy.ts                      │
                        │ L58-62/L161-164 → runCommand(npm exec)  │
                        │ L64 fallback 吞错 → 显式失败            │
                        │ L165 退出码 null 判定（回归锁定）        │
                        │ L176 generate 退出码检查                │
                        │ postInitSetup 统一注入 generator output│
                        │ L41 which → commandExists               │
                        └──────────────────┬──────────────────────┘
                                           ▼
                        ┌─────────────────────────────────────────┐
                        │ mcp-server/shared/prisma.ts (模板)      │
                        │ 探测候选 + SQLite adapter 分支           │
                        └─────────────────────────────────────────┘

回退链：
- npm exec 不可用（npm <7）→ runCommand 内回退 npx prisma ...（文档化提示）
- win32 .cmd 解析失败（ENOENT）→ runCommand 统一抛"命令不可用"（含命令名+平台），不再静默 status=null
- prisma db push 失败 → 维持现有 rollback（onMigrateFail=rollback），但 init 必须向上抛非零
- SQLite 无 adapter-better-sqlite3 → MCP 启动时明确报错提示安装，不静默降级
- bash 脚本（init.ts L411/L419 db-ensure.sh）→ Windows 无 bash 时失败已纳入 init 失败检测（非零退出码）；跨平台 bash 替代列为 P2 已知边界，见 §3.4
```

### 3.2 组件关系

```
src/lib/path-normalize.ts（新增，纯函数）
  normalizeRelPath(p: string): string   // replaceAll("\\", "/")
  → 被 sync.ts / stack.ts 消费；hash key 与 PATCH_GUARD 匹配全部使用规范化后路径

src/lib/run-command.ts（新增，纯函数封装）[回流: Review 跨端选型]
  runCommand(cmd, args, opts): 返回 status/stdout/stderr  // win32 .cmd、status!==0(含 null)、stderr 带出
  commandExists(cmd): boolean                              // win32: where / POSIX: which
  → src 层唯一子进程入口（init.ts / prisma.strategy.ts 迁移）
  → 模板层复制为 mcp-server/shared/run-command.ts（用户项目侧 4 处迁移）

prisma.strategy.ts（修改）
  runPrismaInit() / injectPrisma()
  → 命令迁移 runCommand：npm 场景 ["exec","prisma","--",...]，pnpm 维持 dlx
  → L64 fallback 吞错改造：失败显式报错（不再静默手动建 schema）
  → L176 generate 退出码检查（失败 → 抛错，init 非零退出）
  → postInitSetup 后统一 patch schema.prisma generator 块注入 output（成功+失败路径）[回流: Review P0 #2]

mcp-server/shared/prisma.ts（模板修改）
  → 候选探测保持 src/generated/<dir>（SQLite 修复后与 output 对齐）
  → DATABASE_URL 以 "file:" 开头 → 加载 @prisma/adapter-better-sqlite3
```

### 3.3 数据模型变更

无（不涉及 Prisma 业务模型、DB 表结构变更）。

### 3.4 已知边界与 P2 项（本轮不修或部分纳入，文档记录）

- `init.ts` L411/L419 `spawnSync("bash", ...)`：Windows 无 bash 时 db-ensure.sh 不可用。本轮只保证"失败被检测"（非零退出码），不做 bash 替代（涉及 db-ensure.sh 重写，超范围）。
- `mcp-server/shared/prisma.ts` 中 PG adapter 加载为 `try/catch` 静默降级：本轮保持，SQLite 分支同策略。
- status 的 adapter/hash/profile 深度检查：issue 建议为"可选增强"，本轮只做"缺失文件非零退出码"，深度检查列入规范文档 as future work。
- `checkPrismaDiff`（sync.ts L166）：**已核验无子进程风险**——diffPrisma 为纯 readFileSync 文件对比（writer.ts L108-112），不列为边界。[回流: Review P2 #10 关闭]
- `which` 探测（prisma.strategy.ts L41、init.ts L149）：Windows 无 which → 本轮由 `runCommand.commandExists`（win32: `where`）替代，纳入轮次 2。[回流: Review P2 #9]
- `finalize` L479 peer 依赖安装：无退出码检查（npm 场景 Windows status=null）→ 本轮迁移 runCommand 并检查退出码，纳入轮次 2。[回流: Review P2 #8]
- 模板加载机制（createRequire → import() 重构）：vitest 环境 18 个 pre-existing 失败根因，运行时（tsx）不受影响；列为 P2 独立课题，登记于 `docs/跨平台兼容开发规范.md` §4.1（含历史决策背景与候选方案）。

### 3.5 Plan→Spec 实施映射

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| 新增路径规范化工具 | Spec §1 normalizeRelPath 纯函数 | `src/lib/path-normalize.ts` | 新增，单函数 + 单测 |
| ~~PATCH_GUARD 双分隔符~~ → normalize 优先 | Spec §2 isUserData 先 normalize | `src/cli/commands/sync.ts` | ~~toml patterns 改 `[\\/]`~~ → L46 用 normalizeRelPath，toml/transcribe 零改动 [回流: Review P0 #1] |
| sync hash 全量基线 | Spec §3 saveHashFile 语义 | `src/cli/commands/sync.ts` | L162 合并旧 hash 未变项 |
| hash key 兼容 | Spec §3 loadHashFile key normalize | `src/cli/commands/sync.ts` | 读取时 `\\`→`/`，兼容旧 Windows hash 文件 |
| stack 筛选规范化 + 断言 | Spec §4 applyStack 改造 | `src/cli/commands/stack.ts` | L149 先 normalize；L168-L171 之间插入写后断言（存在性校验，缺失报错）[回流: Review P2 #7] |
| runCommand 封装（src） | Spec §5 跨平台命令封装 | `src/lib/run-command.ts` | 新增：win32 .cmd / status 判定 / stderr / commandExists [回流: Review 跨端选型] |
| runCommand 封装（模板） | Spec §5 模板侧封装 | `templates/core/scripts/mcp-server/shared/run-command.ts` | 新增：用户项目 MCP 同型封装 [回流: Review 跨端选型] |
| 模板 4 处迁移 | Spec §5 命令迁移 | check_spec_sync / check_rahs / add-coder-version / fs | git/npx/npm/bash 同型修复 [回流: Review 跨端选型] |
| npm exec 子进程调用 | Spec §5 命令构造 | `src/caijuehub/strategies/prisma.strategy.ts` | L58-62/L161-164 迁移 runCommand；L64 fallback 显式失败 [回流: Review P1 #3] |
| 退出码全检查 | Spec §5 status 判定 | `src/caijuehub/strategies/prisma.strategy.ts` | L165 保持（回归锁定）；L176 generate 检查；L41 which→commandExists [回流: Review P2 #9] |
| init 失败传播 | Spec §6 非零退出码 | `src/cli/commands/init.ts` | deployDatabase 抛错→process.exit(1)；L479 peer 安装迁移 runCommand [回流: Review P2 #8] |
| status 非零退出码 | Spec §7 缺失 exit(1) | `src/cli/commands/status.ts` | L34-39 改造 |
| SQLite output 统一注入 | Spec §8 schema 生成 | `src/caijuehub/strategies/prisma.strategy.ts` | ~~L68 增 output~~ → postInitSetup 统一 patch 最终生效 schema（成功+失败路径）[回流: Review P0 #2] |
| SQLite MCP adapter | Spec §9 模板增强 | `templates/core/scripts/mcp-server/shared/prisma.ts` | file: URL → better-sqlite3 |
| Windows CI | Spec §10 CI job | `.github/workflows/test.yml` | windows-latest + ubuntu vitest [回流: Review P1 #5] |
| 文档联动 | Spec §11 三文档 | `GUIDE.md` `DEVELOPMENT.md` `docs/跨平台兼容开发规范.md` | 行为说明 + 规范（含 runCommand 单入口强制）+ 引用 |

---

## 四、实施 Task 概要

> 详细子任务拆解 + 验证证据见 `.qoder/specs/add-coder-windows-stability/tasks.md`（含 Plan→Task 映射表）。

```
轮次 1: 路径规范化 + hash 全量基线（修复 P0-2、P0-3、P1-4）
  ├── Task 1.1: 新增 src/lib/path-normalize.ts + 单测
  ├── Task 1.2: sync.ts isUserData 规范化（normalize 优先，toml/transcribe 零改动）[回流: Review P0 #1]
  ├── Task 1.3: sync.ts hash 全量基线保存 + loadHashFile key normalize 兼容
  └── Task 1.4: stack.ts 筛选规范化 + L168-L171 写后断言 [回流: Review P2 #7]
        │
        ▼
轮次 2: runCommand 封装 + 退出码治理（修复 P0-1、补充-6）[回流: Review 跨端选型 / P1 #3 / P2 #8 #9]
  ├── Task 2.0: 新增 src/lib/run-command.ts（win32 .cmd / status!==0 含 null / stderr / commandExists）+ 单测
  ├── Task 2.1: prisma.strategy.ts 迁移 runCommand（npm exec 语义 + L64 fallback 显式失败 + L176 generate 退出码 + L41 which→commandExists）
  │     │  （产出: 子进程失败可检测 + Client 生成失败可检测）
  │     ▼
  ├── Task 2.2: prisma.strategy.ts postInitSetup 统一注入 generator output（成功+失败路径全覆盖）[回流: Review P0 #2]
  │     │  （产出: SQLite Client 输出到 src/generated/prisma，被轮次3消费）
  │     ▼
  ├── Task 2.3: init.ts 迁移 runCommand（L479 peer 安装退出码）+ 失败传播非零退出码
  ├── Task 2.4: status.ts 缺失 exit(1)
  └── Task 2.5: 模板层 run-command.ts 新增 + 4 处迁移（check_spec_sync/check_rahs/add-coder-version/fs）
        │
        ▼
轮次 3: SQLite 完整路径 + 文档联动 + Windows CI（修复 P1-5）
  ├── Task 3.1: mcp-server/shared/prisma.ts SQLite adapter 分支
  │     │  （消费 2.2 的 output 路径）
  │     ▼
  ├── Task 3.2: GUIDE.md 更新（init 失败语义 / SQLite 状态 / stack 断言）
  ├── Task 3.3: 新增 docs/跨平台兼容开发规范.md（含 runCommand 单入口强制）
  ├── Task 3.4: DEVELOPMENT.md 关联引用 + sync 机制章节更新
  └── Task 3.5: .github/workflows/test.yml（windows-latest + ubuntu vitest）[回流: Review P1 #5]
```

**Task 依赖**：轮次 2 独立于轮次 1；轮次 3 的 Task 3.1 依赖轮次 2 Task 2.2 的 schema output 变更；Task 2.0 是轮次 2 内部前置（2.1-2.5 消费 runCommand）；文档 Task 依赖各自轮次代码完成。

---

## 五、验收标准

- [ ] `npx tsc --noEmit` 通过（add-coder 根目录）
- [ ] ~~`npm run generate` 后 PATCH_GUARD 双分隔符~~ → **normalize 单测**：反斜杠输入 `\plans\specs\...` 经 normalize 后 `isUserData` 命中（toml/transcribe 零改动验证）[回流: Review P0 #1]
- [ ] vitest 新增用例通过：normalizeRelPath 反斜杠→POSIX；hash 全量基线（模拟 300→1→空 场景，验证 issue P0-2 复现步骤不再发生）；loadHashFile 兼容旧反斜杠 key
- [ ] `sync --patch` 无变更时 hash 文件条目数不变（等于既有全量数），`[a]` 跳过不缩水
- [ ] PATCH_GUARD 模拟 Windows 路径 `\plans\specs\...` 时 `isUserData` 命中（单测覆盖反斜杠输入）
- [ ] `stack set machineserver` 后断言：`.add/rules/profiles/machineserver-profile.md` + `<magicDir>/rules/profiles/machineserver-profile.md` 存在、`project_rules.md` 引用行已更新；文件缺失时命令返回非零
- [ ] runCommand 单测：win32 平台模拟（.cmd 解析）、status=null 判失败、stderr 带出、commandExists 双平台分支 [回流: Review 跨端选型]
- [ ] prisma.strategy.ts 命令全部经 runCommand：npm 场景 `npm exec prisma -- ...`；L176 `prisma generate` 失败时 init 返回非零；L64 fallback 不再静默（显式失败信息）[回流: Review P1 #3]
- [ ] init.ts L479 peer 安装经 runCommand 且失败返回非零 [回流: Review P2 #8]
- [ ] 模板 4 处（check_spec_sync/check_rahs/add-coder-version/fs）迁移 runCommand 后 `tsc --noEmit` 通过（模板目录独立编译验证）[回流: Review 跨端选型]
- [ ] SQLite 最终生效 schema（成功+失败路径）generator 块含 `output = "../src/generated/prisma"`；模板 prisma.ts 有 `file:` URL → better-sqlite3 分支 [回流: Review P0 #2]
- [ ] `init`（SQLite dry-run 模拟失败路径）输出"治理模型未就绪"且退出码非零
- [ ] `status` 在缺失文件时 `process.exit(1)`（退出码 1）
- [ ] GUIDE.md / DEVELOPMENT.md / 规范文档三处联动完成（规范含 runCommand 单入口强制）
- [ ] GitHub Actions：`.github/workflows/test.yml` 在 windows-latest + ubuntu 双平台跑通 vitest [回流: Review P1 #5]
- [ ] Linux 回归：现有 tests 全绿；关键命令（init dry-run / sync --patch 无变更 / stack show）行为不回归

---

## 六、关联文档

| 文档 | 路径 | 状态 |
|------|------|:---:|
| ADD Route | `.qoder/plans/2026-08/07/add-coder-windows-stability-add-route-v1.md` | 待创建 [回流: Review P1 #4] |
| Handoff | `.qoder/plans/2026-08/07/add-coder-windows-stability-handoff-v1.md` | 待创建 [回流: Review P1 #4] |
| Review | `.qoder/reviews/add-coder-windows-stability-review-v1.md` | ✅ 已生成（待 HITL 审批 + 回流闭环） |
| Spec | `.qoder/specs/add-coder-windows-stability/spec.md` | 待 Spec 阶段创建 [回流: Review P1 #4] |
| Tasks | `.qoder/specs/add-coder-windows-stability/tasks.md` | 待 Spec 阶段创建 [回流: Review P1 #4] |
| Checklist | `.qoder/specs/add-coder-windows-stability/checklist.md` | 待 Spec 阶段创建 [回流: Review P1 #4] |
| Issue | https://github.com/xiaomingming92/add-coder/issues/10 | — |
