# add-coder — 技术栈 profile 机制 3 轮原子事务交接手册

> **适用场景**：多轮原子事务变更，每轮独立收敛。
>
> **用途**：每个新对话开始时，把对应Round章节粘贴给 LLM。它需要明确自己正在执行哪个原子工程事务、上游事务已经提交了什么、当前事务的文件边界是什么、验证标准是什么、完成后记录哪些 ADD-7 审计。

---

## 全局元信息

- **父 Plan**: [add-coder-stack-profile-plan-v1.md](./add-coder-stack-profile-plan-v1.md)
- **原子事务拓扑**: [add-coder-stack-profile-add-route-v1.md](./add-coder-stack-profile-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 约 15 个独立源文件 + 同步产物
- **Round数**: 3 轮局部闭包
- **拆分原则**: 以业务原子闭包为主，以对话上下文容量为辅

```text
第1轮 ── profile 机制核心（模板去硬编码 + profiles/ + stack 字段 + renderer + CLI）
            │
            ▼
第2轮 ── init 申报 + MCP 上下文（--stack + stack.json + context.ts 追加 profile）
            │
            ▼
第3轮 ── 自身同步 + 端到端验证 + MCP 路由安全（sync 白名单 + e2e + D9 + 文档闭环）
```

---

## 原子事务边界说明

本手册中的"轮"按轮次级闭包划分（ADD 范式 §0.7）：

- **轮次级闭包**：一轮内的文件集合形成独立边界——该轮修改的文件不会被其他轮次回头修改，该轮的验证不依赖"下一轮补齐"。轮次之间是生产者-消费者关系，不是互相修补。
- **独立验证**：每轮完成后可通过 `tsc --noEmit` + `eslint` + checklist [T] 项独立验证。

因此：

- 第1轮与第2轮拆分：第1轮建立渲染/CLI 能力（renderer/schema/stack 命令），第2轮消费该能力（init 申报调用 renderCore）——文件边界独立（init.ts/context.ts 不跨轮修改）。
- 第3轮为验证合流：sync 白名单（P1 #1 回流）+ 端到端验证 + D9 MCP 路由安全（tools/index.ts/audit.ts/registrar.ts）+ 文档闭环，不回头修改第1-2轮文件。
- 每一轮完成后必须能够独立证明收敛，不能依赖"下一轮再补齐"才能成立。
- 第3轮不是前2轮的补丁，而是前2轮收敛后的验证合流；前2轮禁止提前实现 D9（tools/index.ts 前缀包装）与 sync 白名单。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明Round位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以对应 `.qoder/specs/add-coder-stack-profile/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准，不允许按 handoff 的简写自行简化实现。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## <第1轮> profile 机制核心

### 你当前的位置

你是第 1 轮。无上游（本 Plan 起始轮）。

### 上游已完成

- 无（本轮为起点；Plan/Review/Specs/add-route 文档先行已完成）

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL。共 15 条审计记录可恢复本轮完整开发上下文。

#### 第一步：搜索代码文件的改动记录（查看 beforeState/afterState）

```text
query_audit_logs({ planKeyword: "add-coder-stack-profile" })
```
→ 返回 15 条：RULE/COMPONENT/MCP_TOOL 的 MODIFY/CREATE。beforeState/afterState 记录各文件改前改后差异。

#### 第二步：搜索文档变更记录（恢复 spec 和契约决策）

```text
query_audit_logs({ keyword: "DOC_UPDATED" })
```
→ 返回 spec.md / tasks.md / checklist.md 更新记录（P1 #1 回流、D9 并入轮次 3）。read 这些文件即可理解本轮的设计决策和边界约束。

#### 第三步：按行动词搜索（快速定位特定改动）

```text
query_audit_logs({ keyword: "stack" })
```
→ 返回 15 条中与 stack 机制相关的记录（schema/defaults/renderer/stack.ts/init.ts）。

#### 恢复顺序建议

```
1. session-init SKILL（强制前置）
2. query_audit_logs({})                                    → 查看最近所有操作
3. query_audit_logs({ keyword: "add-coder-stack-profile" }) → 看本 Plan 所有记录（15 条）
4. read ".qoder/specs/add-coder-stack-profile/spec.md"
5. read ".qoder/specs/add-coder-stack-profile/tasks.md"
6. read ".qoder/specs/add-coder-stack-profile/checklist.md"
```

Step 3 搜索 `"add-coder-stack-profile"` 可以一次性拉取全部审计记录，是最快的一键恢复方式。

### 原子事务目标

覆盖父 Plan 的 Step 3 第1轮：`templates/core/rules/project_rules.md` 去硬编码 + profiles/ 注册表（index.toml + webapp/machineserver profile）+ schema/defaults stack 字段 + renderer 占位符/profile 注入 + stack CLI 命令。

### spec 文件

- `.qoder/specs/add-coder-stack-profile/spec.md`
- `.qoder/specs/add-coder-stack-profile/tasks.md`
- `.qoder/specs/add-coder-stack-profile/checklist.md`

### 架构文档

- docs/ 无直接受影响架构文档（find_related_docs 0 匹配，Step 0 已声明无需更新）

### 你要改的文件（9 个：4 新建 + 5 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/rules/project_rules.md` | 修改 | 去技术栈硬编码，改 `{{stackReferenceLine}}` 组合占位符引用行 |
| `templates/core/rules/profiles/index.toml` | 新建 | profile 注册表（webapp/machineserver） |
| `templates/core/rules/profiles/webapp-profile.md` | 新建 | 旧硬编码迁移（Prisma/LangGraph/TS/LangChain 附录） |
| `templates/core/rules/profiles/machineserver-profile.md` | 新建 | 后端服务链路约束（Kestra/HTTP API/事件驱动） |
| `src/config/schema.ts` | 修改 | `stack: z.string().optional()` |
| `src/config/defaults.ts` | 修改 | `stack: ""` |
| `src/core/renderer.ts` | 修改 | 占位符两态生成 + profile 按需注入 + loadStack/saveStack/loadProfileRegistry |
| `src/cli/commands/stack.ts` | 新建 | list/set/show/--clear 命令 |
| `src/cli/index.ts` | 修改 | 注册 stack 命令 |

### 核心设计

```text
renderCore(config) — config.stack 决定:
  ├── 通用: project_rules.md → .add/rules/ + {magicDir}/rules/
  │         {{stackReferenceLine}} 组合占位符(设置/中性两态,不产生路径拼接)
  └── profile: 命中注册表 → profiles/{stack}-profile.md → 两目录(未设置不注入)
stack.json: { "stack": "", "updatedAt": ISO } — loadStack 容错缺失/损坏
```

### 关键契约细化

- `templates/core/rules/project_rules.md` 禁止残留 LangGraph/Prisma/TypeScript 强制句（验收①）。
- `src/core/renderer.ts` 中性渲染禁止把占位符中性文本拼进路径（`{{stackReferenceLine}}` 两态生成，实现审查 P1 决议）。
- `src/cli/commands/stack.ts` 的 magicDir 解析必须经 MAGIC_DIR_MAP 转换（detectIDE 返回 adapter 名无点）。

### 高风险误区

- 禁止用 `as unknown as McpServer` 伪造 server 对象（D9 教训，实现审查 P2 决议——本轮虽未涉及，后续轮次必须用 ToolRegistrar 基类接口）。
- 禁止在 renderer 输出中直接拼接 `{{stackProfile}}` 中性文本到路径。
- **禁止提前实现下一轮 init --stack 申报（init.ts）与 context.ts profile 追加**。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODIFY` | RULE | `templates/core/rules/project_rules.md` | 去硬编码+引用行 | 已记录 |
| `CREATE` | RULE | `templates/core/rules/profiles/` | 注册表+2 profile | 已记录 |
| `MODIFY` | COMPONENT | `src/config/schema.ts` | stack 字段 | 已记录 |
| `MODIFY` | COMPONENT | `src/config/defaults.ts` | stack 默认值 | 已记录 |
| `MODIFY` | COMPONENT | `src/core/renderer.ts` | 占位符+注入+读写 | 已记录 |
| `CREATE` | COMPONENT | `src/cli/commands/stack.ts` | stack 命令 | 已记录 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-stack-profile" })
→ 返回全部 15 条 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- 模板无强制句：`grep -n "LangGraph\|Prisma schema\|TypeScript 编译必须" templates/core/rules/project_rules.md` 仅命中中性引用
- 注册表可解析：smol-toml parse index.toml 输出 webapp/machineserver
- `npx tsc --noEmit` 全项目 0 错误 + `eslint` 0 error
- `node dist/index.js stack list/set/show` 冒烟通过（临时目录 e2e）
- checklist.md / tasks.md 已逐项勾选（依据代码证据）

#### 未执行的端到端验证（保留给运行时复测）

- [ ] 真实用户项目 `add-coder init --stack machineserver` 全流程（原因：需 npm 包发布后验证）

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`（已全部落库）。完成后一键验证：
```text
query_audit_logs({ keyword: "add-coder-stack-profile" })
→ 确认 15 条全部落库
```

---

## <第2轮> init 申报 + MCP 上下文

### 你当前的位置

你是第 2 轮。上游第 1 轮已完成 profile 机制核心（renderer 注入 + stack.json 读写 + stack CLI）。本轮消费 renderCore 能力实现 init --stack 申报与 MCP context 追加。

### 上游已完成

- renderer 已支持 `{{stackReferenceLine}}` 两态生成与 profile 按需注入（src/core/renderer.ts）
- loadStack/saveStack/loadProfileRegistry 已在 renderer.ts 导出
- stack CLI 命令可用（list/set/show/--clear）

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "src/cli/commands/init.ts" })
```
→ 返回 1 条：MODIFY。beforeState 无技术栈申报，afterState --stack 选项 + resolveStack 交互 + saveStack 落盘。

```text
query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/context.ts" })
```
→ 返回 1 条：MCP_TOOL MODIFY。beforeState 只返回 project_rules.md，afterState 读 stack.json 追加 profile 全文。

### 原子事务目标

覆盖父 Plan 的 Step 3 第2轮：init --stack 选项 + 交互申报 + stack.json 写入；context.ts 规则读取时追加当前 profile 内容。

### spec 文件

- `.qoder/specs/add-coder-stack-profile/spec.md`（§5 init 技术栈申报、§6 MCP 上下文兼容）

### 架构文档

- docs/ 无直接受影响架构文档（同第1轮声明）

### 你要改的文件（2 个：0 新建 + 2 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/cli/commands/init.ts` | 修改 | --stack 选项 + resolveStack 交互申报 + saveStack |
| `templates/core/scripts/mcp-server/tools/context.ts` | 修改 | 读 stack.json → 追加 profile 全文；失败路径降级 |

### 关键契约细化

- `src/cli/commands/init.ts` 交互提问默认「不设置」（回车/1 → 中性），force/--stack 不提问。
- `templates/core/scripts/mcp-server/tools/context.ts` stack.json/profile 缺失仅返回 project_rules.md，不报错。

### 高风险误区

- 禁止 init 在 dry-run 模式实际写入 stack.json。
- **禁止提前实现第3轮 sync 白名单与 D9 工具前缀**。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODIFY` | COMPONENT | `src/cli/commands/init.ts` | --stack + 申报 | 已记录 |
| `MODIFY` | MCP_TOOL | `templates/core/scripts/mcp-server/tools/context.ts` | profile 追加 | 已记录 |

**恢复关键词**：`query_audit_logs({ keyword: "add-coder-stack-profile" })` → 15 条全量。

### 验证标准

#### 已完成验证

- `init --dry-run --stack machineserver` 预览含 profiles/machineserver-profile.md + 提示写 stack.json
- 实际 init 产物断言：stack.json → machineserver、profile 单文件注入、引用行正确
- `npx tsc --noEmit` 0 错误

#### 未执行的端到端验证

- [ ] IDE 新会话中 get_project_context 实际返回 profile 全文（原因：需重启 MCP 后人工确认）

### 完成后记录 ADD-7 审计

同第1轮（已落库，回查确认）。

---

## <第3轮> 自身同步 + 端到端验证 + MCP 路由安全

### 你当前的位置

你是第 3 轮。上游第 1-2 轮已完成 profile 机制与 init/context 申报。本轮为验证合流：sync 白名单（P1 #1 回流）+ 自身同步 + 端到端验证 + D9 MCP 工具路由安全 + 文档闭环。

### 上游已完成

- renderCore 注入能力（第1轮）+ init/context 申报（第2轮）
- stack.json 四方一致解析（init/sync/stack set/context.ts）

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "src/caijuehub/sync-rules.toml" })
```
→ 返回 1 条：MODIFY。PATCH_GUARD 增加 `[/]rules[/]profiles[/]`（P1 #1 白名单）。

```text
query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/index.ts" })
```
→ 返回 1 条：MCP_TOOL MODIFY。ToolRegistrar 基类接口派生装饰，29 工具 description 注入 `[项目: add-coder]` 前缀。

### 原子事务目标

覆盖父 Plan 的 Step 3 第3轮：sync --patch 白名单（用户自建自定义 profile 不覆盖不删除）+ npm run sync 自身同步 + 端到端验证（验收②③④⑤⑥⑦）+ D9 MCP 工具路由安全 + review/handoff 文档闭环。

### spec 文件

- `.qoder/specs/add-coder-stack-profile/spec.md`（§7 MCP 工具路由安全）

### 架构文档

- docs/ 无直接受影响架构文档

### 你要改的文件（5 个 + 同步产物）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/caijuehub/sync-rules.toml` | 修改 | PATCH_GUARD 白名单加 rules/profiles |
| `src/caijuehub/strategies/sync.strategy.ts` | 修改 | npm run generate 产物（PATCH_GUARD 同步） |
| `templates/core/scripts/mcp-server/tools/registrar.ts` | 新建 | ToolRegistrar 基类接口 |
| `templates/core/scripts/mcp-server/tools/index.ts` | 修改 | 派生装饰 registrar 注入项目前缀 |
| `templates/core/scripts/mcp-server/tools/audit.ts` | 修改 | 落库项目声明 + 基线 14 个 TS 错误修复 |

### 关键契约细化

- `src/caijuehub/sync-rules.toml` 是 PATCH_GUARD 真源，改后必须 `npm run generate` 重新生成 sync.strategy.ts。
- `tools/registrar.ts` 是唯一注册契约：`ToolRegistrar = Pick<McpServer, "registerTool">`，禁止 as unknown 逃逸。
- `tools/audit.ts` args 必须经 s() 窄化（string | number | undefined）。

### 高风险误区

- 禁止直接改 `sync.strategy.ts` 生成文件（改真源 TOML + generate）。
- 禁止在 tools/index.ts 用 `as unknown as McpServer` 伪造对象（实现审查 P2 决议）。
- 禁止跳过 `npm run sync` 后验证 `.qoder/rules/profiles/` 与无强制句残留。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODIFY` | COMPONENT | `src/caijuehub/sync-rules.toml` | 白名单真源 | 已记录 |
| `MODIFY` | COMPONENT | `src/caijuehub/strategies/sync.strategy.ts` | generate 产物 | 已记录 |
| `MODIFY` | MCP_TOOL | `templates/core/scripts/mcp-server/tools/index.ts` | 前缀注入 | 已记录 |
| `MODIFY` | MCP_TOOL | `templates/core/scripts/mcp-server/tools/audit.ts` | 声明+基线修复 | 已记录 |

**恢复关键词**：`query_audit_logs({ keyword: "add-coder-stack-profile" })` → 15 条全量。

### 验证标准

#### 已完成验证

- sync 白名单：PATCH_GUARD 含 rules/profiles（generate 后 grep 断言）
- 自身同步：npm run sync 成功 + .qoder/rules/profiles/ 存在 + project_rules.md 无强制句
- e2e：init dry-run/实际、stack set webapp 切换、中性场景（验收②③④）
- D9：29 工具 description 带 `[项目: add-coder]` 前缀 + 重复注册抛错语义
- tsc 全项目 0 错误（含 audit.ts 基线修复）+ eslint 0 error
- checklist/tasks 逐项勾选 + review-implementation/runtime/handoff 生成

#### 未执行的端到端验证

- [ ] 双 MCP 工作区（add-coder + htc）实际同时加载时工具列表可区分（原因：需 IDE 重启后人工确认）

### 完成后记录 ADD-7 审计

同第1轮（已落库，回查确认）。

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列，是每轮原子事务完成的强制性前置条件。

### checklist 证据要求

每轮结束时，`checklist.md` 必须满足以下条件才算收敛：

- [x] **全部项已勾选**（[T]/[E] 20 项已勾选；[R] 2 项诚实保留待运行时验证）
- [x] **每项勾选有可验证证据**（tsc=0/eslint=0/e2e 输出/审计 ID）
- [x] **未执行项诚实保留**（[R] 项保留 `- [ ]` 并注明原因）
- [x] **证据可直接获取**（query_audit_logs planKeyword=add-coder-stack-profile 可查 15 条）

### tasks 证据要求

- [x] **全部任务已完成**（tasks.md 47 项全部 `- [x]`）
- [x] **每个任务有对应的 checklist 项覆盖**
- [x] **task 完成状态与 ADD-7 审计记录一致**（15 条 devlog 已落库）

### 收敛声明规则

当前Round AI 不得自行声明"本轮已收敛"并直接进入下一轮。收敛声明只能由以下角色做出：

1. **开发者确认** — 开发者审核 checklist/tasks 证据后宣布收敛
2. **Review AI 确认** — 独立的 review AI Session 通过 `query_audit_logs` 验证后宣布收敛

执行 AI 的职责是完成 checklist/tasks 并附证据，而非自我判定收敛。

---

## 附录：每轮启动模板

新对话开始时，直接把下面内容 + 对应Round章节粘贴给 LLM：

```text
## 上下文

你在执行 add-coder 技术栈 profile 机制改进的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .qoder/plans/2026-08/05/add-coder-stack-profile-handoff-v1.md 的 <第N轮> 章节。

## 启动操作（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（含 Step 0 文档先行）
3. 读本轮对应 .qoder/specs/add-coder-stack-profile/spec.md
4. 读本轮对应 .qoder/specs/add-coder-stack-profile/tasks.md
5. 读本轮对应 .qoder/specs/add-coder-stack-profile/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → **附可验证证据** → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 写入审计后：query_audit_logs 按 action/targetId/keyword 回查确认落库
10. 全部代码完成后：按本轮 handoff 的 ADD-7 恢复关键词逐项回查
11. 收敛后：回到 add-paradigm SKILL Step 0.6，验收后回看架构文档，标记偏差点，通知开发者决策

## 关键提醒

- 当前执行的是 [第N轮]/3
- 当前Round是一个原子工程事务，不允许拆到下一轮补齐
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- checklist 证据要求：每项勾选必须有可验证证据，不得空勾选或"推测通过"。未执行项必须诚实保留为未勾选状态
- tasks 证据要求：全部任务完成后，每个 task 必须有对应的 checklist 验证记录
- 禁止自行声明收敛：收敛声明只能由开发者或 Review AI 做出，执行 AI 不得自我判定"本轮已收敛"
- 禁止简化代码实现
- 禁止跳过 MCP 回查；只写 record_dev_operation 不算审计闭环完成
- 保持与上游文件修改兼容，特别注意 handoff 中标记的历史修改文件
```

---

### 脱敏要求

Handoff 文档中 **禁止出现** 以下类型的硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。
