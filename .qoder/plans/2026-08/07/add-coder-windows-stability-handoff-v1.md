# add-coder — 3 轮原子事务交接手册（windows-stability）

> **适用场景**：多轮原子事务变更，每轮独立收敛。issue #10 Windows 稳定性修复。
>
> **用途**：每个新对话开始时，把对应Round章节粘贴给 LLM。

---

## 全局元信息

- **父 Plan**: [add-coder-windows-stability-plan-v1.md](./add-coder-windows-stability-plan-v1.md)
- **原子事务拓扑**: [add-coder-windows-stability-add-route-v1.md](./add-coder-windows-stability-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 约 18 个独立文件（新增 5 + 修改 13）
- **Round数**: 3 轮局部闭包
- **拆分原则**: 以业务原子闭包为主，以对话上下文容量为辅

```text
第1轮 ── 路径规范化 + hash 全量基线（P0-2/P0-3/P1-4）
            │
            ▼
第2轮 ── runCommand 封装 + 退出码治理（P0-1/补充-6）
            │
            ▼
第3轮 ── SQLite 完整路径 + 文档联动 + Windows CI（P1-5）
```

---

## 原子事务边界说明

本手册中的"轮"按轮次级闭包划分（ADD 范式 §0.7）：

- **轮次级闭包**：一轮内的文件集合形成独立边界——该轮修改的文件不会被其他轮次回头修改，该轮的验证不依赖"下一轮补齐"。
- **独立验证**：每轮完成后可通过 `tsc --noEmit` + `eslint` + checklist [T] 项独立验证。

因此：

- 轮次 1（sync/stack/path-normalize）与轮次 2（run-command/init/status/prisma.strategy）文件边界完全独立，互不跨轮修改——虽然 prisma.strategy.ts 与 sync.ts 同属 CLI 链路，但改动面不重叠。
- 轮次 3 的模板 prisma.ts 依赖轮次 2 的 schema output 注入（postInitSetup），但轮次 3 只改模板文件与文档，不回头改 prisma.strategy.ts。
- 每一轮完成后必须能够独立证明收敛，不能依赖"下一轮再补齐"才能成立。
- 第 3 轮不是前 2 轮的补丁，而是前 2 轮收敛后的验证合流（SQLite adapter 消费 output 路径）；前 2 轮禁止提前实现 SQLite adapter。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明Round位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以对应 `.qoder/specs/add-coder-windows-stability/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## <第1轮> 路径规范化 + hash 全量基线

### 你当前的位置

你是第 1 轮。本 Plan 的首轮，无上游依赖。

### 上游已完成

- 无（首轮起点）

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> 以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，直接复制参数调用即可。共 2 条审计记录可恢复本轮上下文。

#### 第一步：搜索代码文件的改动记录

```text
query_audit_logs({ targetId: "src/lib/path-normalize.ts" })
```
→ 返回 1 条：MODULE_CREATED。beforeState 不存在，afterState normalizeRelPath 单入口。

```text
query_audit_logs({ targetId: "src/cli/commands/stack.ts" })
```
→ 返回 1 条：COMPONENT_MODIFIED。beforeState POSIX 匹配+无断言，afterState normalize 筛选+写后断言。

#### 第二步：搜索文档变更记录

```text
query_audit_logs({ keyword: "DOC_CREATED" })
```

#### 第三步：按行动词搜索

```text
query_audit_logs({ keyword: "windows-stability" })
```
→ 返回全部本轮 + 后续轮审计记录（一键恢复）。

#### 恢复顺序建议

```
1. session-init SKILL（强制前置）
2. query_audit_logs({ keyword: "add-coder-windows-stability" })  → 看全部记录
3. read ".qoder/specs/add-coder-windows-stability/spec.md" §1-§5
4. read ".qoder/specs/add-coder-windows-stability/tasks.md" 轮次 1
5. read ".qoder/specs/add-coder-windows-stability/checklist.md" 轮次 1 区块
```

### 原子事务目标

覆盖父 Plan 的 Step 3 轮次 1。修复 issue #10 P0-2（hash 全量基线）、P0-3（Windows 保护目录）、P1-4（stack 假成功）。

### spec 文件

- `.qoder/specs/add-coder-windows-stability/spec.md`（§1-§5）
- `.qoder/specs/add-coder-windows-stability/tasks.md`（轮次 1）
- `.qoder/specs/add-coder-windows-stability/checklist.md`（轮次 1 区块）

### 架构文档

- `docs/跨平台兼容开发规范.md` — §1 路径规范化强制、§5 hash 全量基线语义（第 3 轮文档，本轮的规范归宿）

### 你要改的文件（4 个：1 新建 + 3 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/lib/path-normalize.ts` | 新建 | normalizeRelPath 纯函数（反斜杠→POSIX） |
| `src/cli/commands/sync.ts` | 修改 | isUserData 先 normalize；mergeFullHash 全量基线；loadHashFile key normalize；saveHashFile 直接写最终 hash（禁二次 hash） |
| `src/cli/commands/stack.ts` | 修改 | 筛选 normalize + 写后断言（双路径 profile + project_rules 引用） |
| `tests/windows-stability.test.ts` | 新建 | normalize/isUserData/mergeFullHash/loadHashFile/往返 单测 |

### 核心设计

```text
normalizeRelPath（单入口）──→ sync.ts isUserData / stack.ts 筛选 / hash key
mergeFullHash：旧 hash 全量保留 + candidates 磁盘当前内容刷新（最终 hash 值语义）
saveHashFile：直接写盘最终 hash——禁止二次 hash（Review-implementation #1 教训）
loadHashFile：读取时 key normalize（兼容旧 Windows 反斜杠 key）
```

### 关键契约细化

- `src/cli/commands/sync.ts` saveHashFile 的 value 必须是**最终 hash 值**（禁止再次 hash8——双重 hash 会导致每轮全量 conflict）
- `src/cli/commands/sync.ts` mergeFullHash 的 readDiskHash 返回 hash8 值
- `src/caijuehub/sync-rules.toml` / `sync.strategy.ts` 禁止修改（normalize 优先方案，toml/transcribe 零改动）

### 高风险误区

- 禁止在 saveHashFile 中对 value 再 hash8（双重 hash bug）。
- 禁止修改 sync-rules.toml / sync.strategy.ts（Review #1 转义链教训，normalize 优先）。
- 禁止把 plans/specs/reviews 等用户数据 hash 条目从 hash 文件中丢弃。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODULE_CREATED` | MODULE | `src/lib/path-normalize.ts` | 路径规范化基础设施 | 已记录 |
| `COMPONENT_MODIFIED` | COMPONENT | `src/cli/commands/stack.ts` | normalize + 断言 | 已记录 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
→ 返回全部审计记录（当前共 10 条）
```

### 验证标准

#### 已完成验证

- normalizeRelPath 单测：反斜杠→POSIX、幂等、空串（vitest 全绿）
- isUserData 反斜杠命中：`.codex\specs\`、`.codex\plans\`、`.codex\reviews\`、`.qoder\rules\profiles\` 全部命中（issue P0-3 复现验证）
- mergeFullHash：300→1→空 复现链不再发生；用户 [a] 跳过记录用户版本；userData 条目保留
- **往返单测**：saveHashFile→loadHashFile 写盘值 == hash8(磁盘内容)（双重 hash 防回归）
- stack set 集成：`stack set machineserver` EXIT=0、4 文件写入、project_rules L852 引用已更新；`--clear` 恢复中性
- `npx tsc --noEmit` + `eslint` 通过

#### 未执行的端到端验证（保留给运行时复测）

- [ ] Windows 真机 `sync --patch` 无变更 hash 条目不缩水（原因：无 Windows 环境）
- [ ] 已初始化 Windows 项目旧反斜杠 key 平滑迁移（原因：无 Windows 环境）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `src/lib/path-normalize.ts` | `MODULE_CREATED` |
| `src/cli/commands/stack.ts` | `COMPONENT_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
```

---

## <第2轮> runCommand 封装 + 退出码治理

### 你当前的位置

你是第 2 轮。上游第 1 轮已完成路径规范化 + hash 全量基线。本轮独立于第 1 轮（无跨轮文件修改），但共享单测文件 `tests/windows-stability.test.ts`（追加用例，不跨轮修改已有用例语义）。

### 上游已完成

- `src/lib/path-normalize.ts`：normalizeRelPath 单入口（第 1 轮交付）
- `src/cli/commands/sync.ts`：isUserData 规范化 + mergeFullHash 全量基线 + loadHashFile key 兼容 + saveHashFile 直接写最终 hash
- `src/cli/commands/stack.ts`：normalize 筛选 + 写后断言
- `tests/windows-stability.test.ts`：14 个首轮用例全绿

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ targetId: "src/lib/run-command.ts" })
```
→ 返回 1 条：MODULE_CREATED。win32 .cmd 解析 / ENOENT 抛错 / stderr / commandExists。

```text
query_audit_logs({ targetId: "src/caijuehub/strategies/prisma.strategy.ts" })
```
→ 返回 1 条：COMPONENT_MODIFIED。npm exec 语义 + fallback 显式失败 + generate 退出码 + postInitSetup output 注入。

```text
query_audit_logs({ targetId: "src/cli/commands/init.ts" })
```
→ 返回 1 条：COMPONENT_MODIFIED。deployDatabase 失败传播 + finalize 非零退出 + peer/bash/which 迁移。

### 原子事务目标

覆盖父 Plan 的 Step 3 轮次 2。修复 issue #10 P0-1（init 假成功）、补充-6（status 退出码），跨端选型落地（手搓 runCommand，HITL 决策）。

### spec 文件

- `.qoder/specs/add-coder-windows-stability/spec.md`（§6-§10、§12）
- `.qoder/specs/add-coder-windows-stability/tasks.md`（轮次 2）
- `.qoder/specs/add-coder-windows-stability/checklist.md`（轮次 2 区块）

### 架构文档

- `docs/跨平台兼容开发规范.md` — §2 runCommand 单入口强制、§3 环境变量、§4 bash 边界

### 你要改的文件（7 个：2 新建 + 5 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/lib/run-command.ts` | 新建 | 跨平台命令封装（win32 .cmd / status 判定 / stderr / commandExists / stdio 透传） |
| `src/caijuehub/strategies/prisma.strategy.ts` | 修改 | runCommand 迁移（npm exec）+ L64 fallback 显式失败 + L176 generate 退出码 + patchGeneratorOutput 统一注入 output + which→commandExists |
| `src/cli/commands/init.ts` | 修改 | deployDatabase 失败传播（string\|null）+ finalize "完成"后移 + peer 安装退出码 + bash stdio 透传 |
| `src/cli/commands/status.ts` | 修改 | 缺失文件 process.exit(1) |
| `templates/core/scripts/mcp-server/shared/run-command.ts` | 新建 | 模板侧同型封装 |
| templates 4 文件 | 修改 | check_spec_sync（git）/ check_rahs（npx）/ add-coder-version（npm）/ fs（bash）迁移 runCommand |
| `tests/windows-stability.test.ts` | 修改 | 追加 runCommand/commandExists/patchGeneratorOutput 单测（13 个） |

### 核心设计

```text
runCommand（单入口）──→ prisma.strategy / init / 模板 4 处
  ├─ win32 .cmd 解析（npm/npx/pnpm/git）
  ├─ ENOENT → 抛"命令不可用"（不再静默 status=null）
  ├─ status!==0（含 null）→ 调用方判失败
  └─ stdio: "inherit" 透传（bash 实时输出）

失败传播链：deployDatabase 收集 fail → finalize 检查 → "✗ 治理模型未就绪" + exit(1)
patchGeneratorOutput：postInitSetup 统一注入（init 成功+失败路径全覆盖，幂等）
```

### 关键契约细化

- `src/lib/run-command.ts` 参数必须为数组且全部内部构造（禁止用户输入进 shell）
- `src/caijuehub/strategies/prisma.strategy.ts` 的 `// >>> USER CODE >>>` 标记必须保留（transcribe 切分依赖）
- npm 场景命令语义：`npm exec prisma -- <cmd>`；pnpm 维持 `dlx`
- `status.ts` 缺失文件 exit(1) 后不得继续打印"所有文件完整"

### 高风险误区

- 禁止把 `// >>> USER CODE >>>` 标记改错（会导致 generate 重新包裹用户代码）。
- 禁止直接用 `spawnSync("npm", ["prisma", ...])`（Windows ENOENT → status=null 静默失败）。
- 禁止对 peer 安装失败用 exit(1)（应为警告，MCP 报错暴露即可）。
- **禁止提前实现第 3 轮 SQLite adapter**（模板 prisma.ts 的 file: 分支属第 3 轮）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODULE_CREATED` | MODULE | `src/lib/run-command.ts` | 跨端封装 | 已记录 |
| `COMPONENT_MODIFIED` | COMPONENT | `src/caijuehub/strategies/prisma.strategy.ts` | 命令迁移 + output 注入 | 已记录 |
| `COMPONENT_MODIFIED` | COMPONENT | `src/cli/commands/init.ts` | 失败传播 + 退出码 | 已记录 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
```

### 验证标准

#### 已完成验证

- runCommand 单测 7 用例（win32 .cmd / POSIX 不追加 / 非 .cmd 族 / ENOENT 抛错 / status=null / stderr / input pipe）
- commandExists 3 用例（where / which / 不存在）
- patchGeneratorOutput 3 用例（注入 / 幂等 / 无块追加）
- 模板 4 处迁移 + 模板独立 tsc 0 error
- 全量 vitest 68 passed（18 pre-existing 失败非本次引入，stash 对照）
- `npx tsc --noEmit` + `eslint` 通过

#### 未执行的端到端验证（保留给运行时复测）

- [ ] Windows 真机 `init + SQLite` 失败路径非零退出码（原因：无 Windows 环境）
- [ ] Windows 真机 npm.cmd 解析实际执行（原因：无 Windows 环境）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `src/lib/run-command.ts` | `MODULE_CREATED` |
| `src/caijuehub/strategies/prisma.strategy.ts` | `COMPONENT_MODIFIED` |
| `src/cli/commands/init.ts` | `COMPONENT_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
```

---

## <第3轮> SQLite 完整路径 + 文档联动 + Windows CI

### 你当前的位置

你是第 3 轮（最后一轮）。上游第 1 轮（路径规范化 + hash 基线）、第 2 轮（runCommand + 退出码治理 + schema output 统一注入）已完成。本轮消费第 2 轮 Task 2.2 的 schema output 路径，补齐 SQLite MCP adapter + 文档三件套 + Windows CI。

### 上游已完成

- `src/caijuehub/strategies/prisma.strategy.ts`：patchGeneratorOutput 已注入（postInitSetup 统一，成功+失败路径）
- `src/lib/run-command.ts` + 模板 `shared/run-command.ts`：跨端封装双端就绪
- `tests/windows-stability.test.ts`：27 个用例全绿

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ targetId: "docs/跨平台兼容开发规范.md" })
```
→ 返回 1 条：DOC_MODIFIED。规范文档（7 章节）。

```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
```
→ 全部审计记录（10 条）。

### 原子事务目标

覆盖父 Plan 的 Step 3 轮次 3。修复 issue #10 P1-5（SQLite Client 与 MCP 入口不匹配）+ Review #5（Windows CI）+ 文档三件套联动。

### spec 文件

- `.qoder/specs/add-coder-windows-stability/spec.md`（§11、§13、§14）
- `.qoder/specs/add-coder-windows-stability/tasks.md`（轮次 3）
- `.qoder/specs/add-coder-windows-stability/checklist.md`（轮次 3 区块）

### 架构文档

- `GUIDE.md` — init 失败语义 / SQLite 支持状态 / stack 断言（本轮交付）
- `DEVELOPMENT.md` — §8.6 hash 全量基线 / §8.7 跨平台约束（本轮交付）
- `docs/跨平台兼容开发规范.md` — 7 章节规范（本轮交付）

### 你要改的文件（5 个：2 新建 + 3 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/scripts/mcp-server/shared/prisma.ts` | 修改 | `file:` URL → `@prisma/adapter-better-sqlite3`（缺失显式报错）；PG 分支保持静默 |
| `GUIDE.md` | 修改 | init 失败语义 + SQLite 支持状态 + stack 写后断言（v0.3.20+ 标注） |
| `docs/跨平台兼容开发规范.md` | 新建 | 路径规范化强制 / runCommand 单入口 / env 对象 / bash 边界 / hash 基线 / 失败语义 / 自检清单 |
| `DEVELOPMENT.md` | 修改 | §8.6 hash 全量基线语义 + §8.7 跨平台约束 |
| `.github/workflows/test.yml` | 新建 | matrix 双平台 vitest + prisma generate（src/generated 未跟踪） |

### 核心设计

```text
SQLite 完整链路：schema output（第2轮注入）→ src/generated/prisma → 模板 prisma.ts file: 分支
  → @prisma/adapter-better-sqlite3（缺失 throw 提示安装，不静默降级）

文档三件套：GUIDE（用户行为）← DEVELOPMENT（机制）← 规范文档（强制约束）
CI：ubuntu + windows-latest 双平台跑 vitest（issue #10 建议第 5 条）
```

### 关键契约细化

- `templates/core/scripts/mcp-server/shared/prisma.ts` PG 分支 try/catch 静默降级保持（SQLite 分支必须显式报错）
- 模板改动后必须 `npm run sync` 同步到 4 个 magic 目录
- GUIDE 版本号标注 `v0.3.20+`（发布时核对实际版本）

### 高风险误区

- 禁止给 SQLite 分支也用 try/catch 静默（依赖缺失必须显式报错）。
- 禁止跳过 `npm run sync`（模板真源改动不同步会导致运行时 MCP 用旧代码）。
- 禁止在 test.yml 中省略 `prisma generate`（src/generated 是 gitignore 生成物，CI 缺文件）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `DOC_MODIFIED` | DOC | `docs/跨平台兼容开发规范.md` | 规范文档 | 已记录 |
| `TEMPLATE_MODIFIED` | TEMPLATE | `templates/core/scripts/mcp-server/shared/prisma.ts` | SQLite adapter | 已记录（并入 prisma.strategy 审计） |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
```

### 验证标准

#### 已完成验证

- 模板 prisma.ts `file:` 分支 grep 命中 + 缺失报错提示
- GUIDE 三处更新 grep 命中；DEVELOPMENT §8.6/§8.7 命中；规范文档 7 章节
- test.yml YAML 校验 OK + matrix 双平台
- 模板 tsc 0 error + `npm run sync` 同步验证
- 全量 vitest 68 passed

#### 未执行的端到端验证（保留给运行时复测）

- [ ] Windows 真机 SQLite MCP 启动 + tools/list（原因：无 Windows 环境）
- [ ] CI PR 触发双平台跑通（原因：未推送 PR）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `templates/core/scripts/mcp-server/shared/prisma.ts` | `TEMPLATE_MODIFIED` |
| `docs/跨平台兼容开发规范.md` | `DOC_CREATED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "add-coder-windows-stability" })
```

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列，是每轮原子事务完成的强制性前置条件。

### checklist 证据要求

- [x] **全部 [T]/[E] 项已勾选**（附 tsc/vitest/grep 证据 + 真实审计 cuid）
- [x] **未执行项诚实保留**：[R] 项（Windows 真机 / CI）保留未勾选并注明"待运行时验证"
- [x] **证据可直接获取**：checklist 每项审计 ID 可经 query_audit_logs 回查

### tasks 证据要求

- [x] **全部任务已完成**（tasks.md 全部 `- [x]`，76 项中 71 项完成，Verification 区 5 项 [R] 保留）
- [x] **每个任务有对应的 checklist 项覆盖**
- [x] **task 完成状态与 ADD-7 审计记录一致**（10 条 record_dev_operation）

### 收敛声明规则

当前Round AI 不得自行声明"本轮已收敛"。收敛声明由开发者确认或 Review AI 确认。

---

## 附录：每轮启动模板

新对话开始时，直接把下面内容 + 对应Round章节粘贴给 LLM：

```text
## 上下文

你在执行 add-coder 改进的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .qoder/plans/2026-08/07/add-coder-windows-stability-handoff-v1.md 的 <第N轮> 章节。

## 启动操作（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（含 Step 0 文档先行）
3. 读本轮对应 .qoder/specs/add-coder-windows-stability/spec.md
4. 读本轮对应 .qoder/specs/add-coder-windows-stability/tasks.md
5. 读本轮对应 .qoder/specs/add-coder-windows-stability/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → 附可验证证据 → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 写入审计后：query_audit_logs 按 action/targetId/keyword 回查确认落库
10. 全部代码完成后：按本轮 handoff 的 ADD-7 恢复关键词逐项回查

## 关键提醒

- 当前执行的是 [第N轮]/3
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- checklist 证据要求：每项勾选必须有可验证证据，不得空勾选
- 禁止自行声明收敛：收敛声明只能由开发者或 Review AI 做出
```

---

### 脱敏要求

Handoff 文档中**禁止出现**数据库密码、Chroma token、JWT 密钥、API Key 等硬编码凭据。本手册无任何凭据引用。
