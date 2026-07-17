# {项目名} — {Round 数} 轮原子事务交接手册

> **适用场景**：多轮原子事务变更，每轮独立收敛。如 7 轮管线演进、多 Round架构重构。
>
> **用途**：每个新对话开始时，把对应Round章节粘贴给 LLM。它需要明确自己正在执行哪个原子工程事务、上游事务已经提交了什么、当前事务的文件边界是什么、验证标准是什么、完成后记录哪些 ADD-7 审计。

---

## 全局元信息

- **父 Plan**: [{plan文件名}](./{plan文件名}.md)
- **原子事务拓扑**: [{execution文件名}](./{execution文件名}.md)
- **目标仓库**: `{仓库绝对路径}`
- **总文件数**: 约 {N} 个独立文件
- **Round数**: {N} 轮局部闭包
- **拆分原则**: 以业务原子闭包为主，以对话上下文容量为辅

```text
{拓扑依赖图 — ASCII 图，│ ├ ▼ 表达并行/串行关系，每行只有一个人工可读的Round缩写}

第1轮 ── {Round简短描述}
            │
            ▼
第2轮 ── {Round简短描述}
            │
            ├──────────────┐
            ▼              ▼
第3轮 ── {描述}            第4轮 ── {描述}
            │              │
            └──────┬───────┘
                   ▼
第5轮 ── {描述}
```

---

## 原子事务边界说明

本手册中的"轮"按轮次级闭包划分（ADD 范式 §0.7）：

- **轮次级闭包**：一轮内的文件集合形成独立边界——该轮修改的文件不会被其他轮次回头修改，该轮的验证不依赖"下一轮补齐"。轮次之间是生产者-消费者关系，不是互相修补。
- **独立验证**：每轮完成后可通过 `tsc --noEmit` + `eslint` + checklist [T] 项独立验证。

因此：

- {解释为什么某两轮虽然依赖同一上游但拆成不同轮——因为文件边界独立，互不跨轮修改}
- {解释为什么某两轮虽然有关联但必须拆成不同轮——因为涉及不同的文件集合，合并会导致文件归属混乱}
- 每一轮完成后必须能够独立证明收敛，不能依赖"下一轮再补齐"才能成立。
- {最后一轮}不是前{N-1}轮的补丁，而是前{N-1}轮收敛后的验证合流；前{N-1}轮禁止提前实现 {最后一轮的核心内容}。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明Round位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以对应 `.vscode/specs/{spec-name}/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准，不允许按 handoff 的简写自行简化实现。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## <第N轮> {Round简短描述}

### 你当前的位置

你是第 {N} 轮。上游{第 {X} 轮已完成 {上游能力描述}}，{第 {Y} 轮已完成 {上游能力描述}}。

### 上游已完成

- {上游本轮依赖的能力/文件/状态，不允许靠记忆，必须写清楚}
- {每一项是可验证的具体交付物，如 "Evidence 接口已在 src/types/evidence.ts 中唯一定义"}
- {如果上游有多个Round，逐轮列出可验证交付物}

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL。共 {N} 条审计记录可恢复本轮完整开发上下文。

#### 第一步：搜索代码文件的改动记录（查看 beforeState/afterState）

文件改了什么、改前改后的合约差异，都在这些记录的 `beforeState` 和 `afterState` 字段里：

```text
query_audit_logs({ targetId: "{文件路径1}" })
```
→ 返回 {N} 条：{ACTION_1}。beforeState {描述}，afterState {描述}。

```text
query_audit_logs({ targetId: "{文件路径2}" })
```
→ 返回 {N} 条：{ACTION_2}。beforeState {描述}，afterState {描述}。

#### 第二步：搜索文档变更记录（恢复 spec 和契约决策）

```text
query_audit_logs({ keyword: "DOC_UPDATED" })
```
→ 返回 {N} 条 spec 文档更新：spec.md / tasks.md / checklist.md。read 这些文件即可理解本轮的设计决策和边界约束。

#### 第三步：按行动词搜索（快速定位特定改动）

```text
query_audit_logs({ keyword: "{ACTION_1}" })
```
→ 返回 {N} 条：{文件1} 的 {操作类型} 记录。

```text
query_audit_logs({ keyword: "{ACTION_2}" })
```
→ 返回 {N} 条：{文件2} 的 {操作类型} 记录。

#### 恢复顺序建议

新 AI Session 启动后，按以下顺序恢复上下文最快：

```
1. session-init SKILL（强制前置）
2. query_audit_logs({})                                    → 查看最近所有操作
3. query_audit_logs({ keyword: "{汇总关键词}" })            → 看本轮所有记录（应该返回 {N} 条）
4. read ".vscode/specs/{spec-name}/spec.md"
5. read ".vscode/specs/{spec-name}/tasks.md"
6. read ".vscode/specs/{spec-name}/checklist.md"
```

Step 3 搜索 `"{汇总关键词}"` 可以一次性拉取全部本轮审计记录，是最快的一键恢复方式。

### 原子事务目标

覆盖 `{父 Plan 文件名}` 的 Step {X}。{一句话概括本轮目标}。

### spec 文件

- `.vscode/specs/{spec-name}/spec.md`
- `.vscode/specs/{spec-name}/tasks.md`
- `.vscode/specs/{spec-name}/checklist.md`

### 架构文档

- `docs/{项目名}/knowledge/01-架构/{架构说明书}.md` — {章节号}：{章节标题}
- `docs/{项目名}/knowledge/01-架构/{管线说明书}.md` — {相关章节}

### 你要改的文件（{N} 个：{新建数} 新建 + {修改数} 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `{文件路径1}` | 新建 | {一句话描述} |
| `{文件路径2}` | 修改 | {一句话描述} |

### 核心设计（视Round复杂度可选）

```text
{本轮最关键的架构/设计要点，不超过 10 行}
```

### 关键契约细化（视Round复杂度可选）

- `{文件路径}` {必须遵守的契约约束，如"禁止改 Schema"、"必须浅合并 metadata"}。
- {每条以文件路径开头}

### 高风险误区

- 禁止 {最常见的错误做法1}。
- 禁止 {最常见的错误做法2}。
- **禁止提前实现下一轮 {下一轮的某个核心内容}**。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `{ACTION_1}` | {COMPONENT/API_ROUTE/...} | `{文件路径1}` | {说明} | 待记录 |
| `{ACTION_2}` | {COMPONENT/API_ROUTE/...} | `{文件路径2}` | {说明} | 待记录 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "{汇总关键词}" })
→ 返回全部 {N} 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- {验证项1}：{验证证据（代码行号/终端输出/测试结果）}
- {验证项2}：{验证证据}
- `npx tsc --noEmit` + `eslint` 通过
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

#### 未执行的端到端验证（保留给运行时复测）

- [ ] {端到端验证项1}（原因：{为什么本轮无法执行}）
- [ ] {端到端验证项2}（原因：{为什么本轮无法执行}）

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`。参考 audit action：

| 文件 | action |
|------|--------|
| `{文件路径1}` | `{ACTION_1}` |
| `{文件路径2}` | `{ACTION_2}` |

完成后一键验证：
```text
query_audit_logs({ keyword: "{汇总关键词}" })
→ 确认 {N} 条全部落库
```

---

{追加更多Round小节，每轮遵循上述 13 个标准化子章节}

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列，是每轮原子事务完成的强制性前置条件。

### checklist 证据要求

每轮结束时，`checklist.md` 必须满足以下条件才算收敛：

- [ ] **全部项已勾选**（不得有空勾选、不得有"推测通过"）
- [ ] **每项勾选有可验证证据**：
  - 编译/类型项：附 `npx tsc --noEmit` 输出或错误数
  - 运行项：附终端输出、截图或日志摘要
  - 代码项：附文件路径 + 行号引用
  - 跨轮依赖项：附 `query_audit_logs` 查询结果（如"确认第1轮已完成"）
- [ ] **未执行项诚实保留**：无法在当前Round验证的项（如运行时端到端验收），保留为未勾选 `- [ ]`，并在旁注明"待后续运行时验证"
- [ ] **证据可直接获取**：后续 AI Session 通过 `query_audit_logs` 按 targetId/keyword 可查到 checklist 对应的验证证据

### tasks 证据要求

- [ ] **全部任务已完成**（tasks.md 中全部 `- [x]`）
- [ ] **每个任务有对应的 checklist 项覆盖**（不允许 task 完成但无 checklist 验证记录）
- [ ] **task 完成状态与 ADD-7 审计记录一致**：每完成一个 task 的代码修改，必须有对应的 `record_dev_operation` 记录

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

你在执行 {项目名} 改进的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 {handoff 文件路径} 的 <第N轮> 章节。

## 启动操作（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（含 Step 0 文档先行）
3. 读本轮对应 .vscode/specs/{spec-name}/spec.md（含其中的「文档先行三步闭环」章节，按 spec 的指示更新架构文档）
4. 读本轮对应 .vscode/specs/{spec-name}/tasks.md
5. 读本轮对应 .vscode/specs/{spec-name}/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → **附可验证证据** → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 写入审计后：query_audit_logs 按 action/targetId/keyword 回查确认落库
10. 全部代码完成后：按本轮 handoff 的 ADD-7 恢复关键词逐项回查，确认当前Round可被下一轮恢复
11. 收敛后：回到 add-paradigm SKILL Step 0.6，验收后回看架构文档，标记偏差点，通知开发者决策

## 关键提醒

- 当前执行的是 [第N轮]/{总轮数}
- 当前Round是一个原子工程事务，不允许拆到下一轮补齐
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- 架构文档同步：代码执行前（Step 0）更新架构文档 → 代码执行后（Step 0.6）回看架构文档确认一致性
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
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。
