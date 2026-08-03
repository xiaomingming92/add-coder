# add-coder-dps-threshold-render — 2 轮原子事务交接手册

> **适用场景**：多轮原子事务变更，每轮独立收敛。
>
> **用途**：每个新对话开始时，把对应 Round 章节粘贴给 LLM。它需要明确自己正在执行哪个原子工程事务、上游事务已经提交了什么、当前事务的文件边界是什么、验证标准是什么、完成后记录哪些 ADD-7 审计。

---

## 全局元信息

- **父 Plan**: [add-coder-dps-threshold-render-plan-v1.md](./add-coder-dps-threshold-render-plan-v1.md)
- **原子事务拓扑**: [add-coder-dps-threshold-render-add-route-v1.md](./add-coder-dps-threshold-render-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 约 66 个独立文件（templates 24 处 + renderer + docs 6 处 + sync 副本）
- **Round 数**: 2 轮局部闭包
- **拆分原则**: 以业务原子闭包为主（轮次 1 = 渲染链路能力，轮次 2 = 文档与分发验证），以对话上下文容量为辅

```text
第1轮 ── 运行时动态化 + 模板占位符化（renderer 注入 + check_dps 动态化 + 24 处模板）
            │
            ▼
第2轮 ── 文档声明式 + 验证闭环（README/GUIDE/caijuehub.md + build/hash/分发验证）
```

---

## 原子事务边界说明

本手册中的"轮"按轮次级闭包划分（ADD 范式 §0.7）：

- **轮次级闭包**：第 1 轮修改的文件（renderer/templates/check_dps）不会被第 2 轮回头修改；第 2 轮只动文档（README/GUIDE/caijuehub.md）与分发产物（dist/hash）。文件边界独立。
- **独立验证**：每轮完成后可通过 `tsc --noEmit` + checklist [T] 项独立验证。

因此：

- 两轮虽然同属"单一真源化"目标，但拆成不同轮——因为第 1 轮是**渲染链路能力**（代码/模板），第 2 轮是**文档与分发验证**（文档/构建），文件集合完全不相交，合并会导致文件归属混乱。
- 第 2 轮不是第 1 轮的补丁，而是第 1 轮收敛后的**验证合流**（build + hash + 用户项目分发实测）；第 1 轮禁止提前实现文档声明式（那是第 2 轮边界）。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明 Round 位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以对应 `.qoder/specs/add-coder-dps-threshold-render/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准，不允许按 handoff 的简写自行简化实现。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## 第 1 轮 运行时动态化 + 模板占位符化

### 你当前的位置

你是第 1 轮。本 Plan 无上游轮次（第 1 轮即渲染链路能力建设）。第 2 轮（文档声明式 + 分发验证）依赖本轮完成。

### 上游已完成

- 无上游轮次。前置条件：Plan（DPS 89 PASS）+ Review（复审通过，P1 归零）+ Specs 三元组 + add-route 均已就位。

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL。

#### 第一步：搜索代码文件的改动记录（查看 beforeState/afterState）

文件改了什么、改前改后的合约差异，都在这些记录的 `beforeState` 和 `afterState` 字段里：

```text
query_audit_logs({ targetId: "templates/core/renderer.ts" })
```
→ 返回 1 条：MODIFY。beforeState `renderer 无阈值占位符`，afterState `{{dpsPass}}/{{dpsWarn}} 占位符注入（直读 TOML thresholds）`。

#### 第二步：搜索文档变更记录（恢复 spec 和契约决策）

```text
query_audit_logs({ keyword: "DOC_UPDATED" })
```
→ 返回本轮 spec 文档更新记录。read `.qoder/specs/add-coder-dps-threshold-render/` 下 spec.md / tasks.md / checklist.md 即可理解设计决策和边界约束。

#### 第三步：按行动词搜索（快速定位特定改动）

```text
query_audit_logs({ keyword: "TEMPLATE_UPDATED" })
```
→ 返回 24 处模板占位符化记录（core 14 + adapters 10）。

```text
query_audit_logs({ keyword: "COMPONENT_UPDATED" })
```
→ 返回 renderer.ts 与 check_dps.ts 的改动记录。

#### 恢复顺序建议

新 AI Session 启动后，按以下顺序恢复上下文最快：

```
1. session-init SKILL（强制前置）
2. query_audit_logs({})                                    → 查看最近所有操作
3. query_audit_logs({ keyword: "add-coder-dps-threshold-render" }) → 看本轮所有记录
4. read ".qoder/specs/add-coder-dps-threshold-render/spec.md"
5. read ".qoder/specs/add-coder-dps-threshold-render/tasks.md"
6. read ".qoder/specs/add-coder-dps-threshold-render/checklist.md"
```

Step 3 搜索 `"add-coder-dps-threshold-render"` 可以一次性拉取全部本轮审计记录，是最快的一键恢复方式。

### 原子事务目标

覆盖父 Plan 的 Task 1.1-1.5。DPS 阈值文案从硬编码 85 改为占位符渲染：renderer 直读 TOML [thresholds] 注入 `{{dpsPass}}/{{dpsWarn}}`，check_dps description 运行时动态化，24 处模板文案占位符化（豁免 3 处）。

### spec 文件

- `.qoder/specs/add-coder-dps-threshold-render/spec.md`
- `.qoder/specs/add-coder-dps-threshold-render/tasks.md`
- `.qoder/specs/add-coder-dps-threshold-render/checklist.md`

### 架构文档

- `docs/` 无架构文档变更（本 Plan 为文案/渲染层，判定逻辑不动）

### 你要改的文件（26 个：0 新建 + 26 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/core/renderer.ts` | 修改 | loadDpsThresholds 直读 TOML + `{{dpsPass}}/{{dpsWarn}}` 占位符注入 |
| `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` | 修改 | description 改 `${CFG.THRESHOLD_PASS}` 模板串 |
| `templates/core/skills/add-paradigm/SKILL.md` 等 14 处 | 修改 | "≥ 85" → "≥ {{dpsPass}}" |
| `templates/adapters/{claude,qoder,vscode,codex,trae}/hooks/lib/*.sh` 10 处 | 修改 | "check_dps ≥ 85" → "check_dps ≥ {{dpsPass}}" |

### 核心设计

```text
dps-scoring-rules.toml [thresholds]（唯一真源 pass=80/warn=65）
  ├─ transcribe → 策略（判定消费，不改）
  └─ renderer 直读 → {{dpsPass}}/{{dpsWarn}} → 模板占位符
TOML 缺失时保留占位符 + 告警（不静默注入 0）
```

### 关键契约细化

- `src/core/renderer.ts` 禁止新增 [display] 段（P1-1：避免判定值/展示值新双真源）。
- `src/caijuehub/transcribe.ts` 禁止改动（已输出 THRESHOLD_PASS，文案层不走转录）。
- `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` 只改 description 行，判定逻辑分支不动。
- `templates/core/plans/2026-07/08/add-coder-npm-package-add-route-v1.md` 与 `templates/core/scripts/mcp-server/tools/gateway.backup` **豁免**（不改不删，历史归档）。

### 高风险误区

- 禁止把 `{{dpsPass}}` 写死成 "80"（占位符由 renderer 注入，模板只保留占位符）。
- 禁止改 transcribe.ts 或新增 [display] 段。
- **禁止提前实现第 2 轮的文档声明式**（README/GUIDE/caijuehub.md 属第 2 轮边界）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODIFY` | COMPONENT | `templates/core/renderer.ts` | 占位符注入 | ✅ cmsdr0xgu000qswwrn9p630pz |
| `MODIFY` | COMPONENT | `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` | description 动态化 | ✅ 同记录 |
| `TEMPLATE_UPDATED` | TEMPLATE | `templates/core/**` 14 处 | 占位符化 | ✅ 同记录 |
| `TEMPLATE_UPDATED` | TEMPLATE | `templates/adapters/*/hooks/lib/*.sh` 10 处 | 占位符化 | ✅ 同记录 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-dps-threshold-render" })
→ 返回本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- 渲染：`pnpm exec tsx -e` 直跑 render → `{{dpsPass}}→80`、`{{dpsWarn}}→65`
- 归零：`grep -rn "≥ 85\|>= 85" templates/` 仅剩豁免 3 处（gateway.backup 1 + 历史 add-route 2）
- 覆盖：`grep -rc "dpsPass" templates/` 覆盖 18 文件 24 处
- 编译：tsc 无新增错误（存量 14 与本次无关）；`pnpm run build` DTS Build success
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

#### 未执行的端到端验证（保留给运行时复测）

- [ ] 用户项目 init 端到端渲染验证（已在第 2 轮通过 weather_proxy sync --patch 完成——见第 2 轮）

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`。参考 audit action：

| 文件 | action |
|------|--------|
| `src/core/renderer.ts` | `MODIFY` |
| `templates/.../check_dps.ts` | `MODIFY` |
| 24 处模板 | `TEMPLATE_UPDATED` |

---

## 第 2 轮 文档声明式 + 验证闭环

### 你当前的位置

你是第 2 轮。上游第 1 轮已完成：renderer 占位符注入 + check_dps 动态化 + 24 处模板占位符化（commit a809dbe）。

### 上游已完成

- `src/core/renderer.ts` 已支持 `{{dpsPass}}/{{dpsWarn}}` 注入（直读 TOML [thresholds]）
- `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` description 已动态化（${CFG.THRESHOLD_PASS}）
- 24 处模板文案已占位符化（豁免 3 处边界已声明）

### 恢复上下文审计查询（新 AI Session 首次启动必读）

#### 第一步：搜索代码文件的改动记录

```text
query_audit_logs({ targetId: "templates/core/renderer.ts" })
```
→ 返回 1 条：MODIFY。beforeState 无阈值占位符，afterState 占位符注入。

#### 第二步：搜索文档变更记录（恢复 spec 和契约决策）

```text
query_audit_logs({ keyword: "DOC_UPDATED" })
```
→ 返回 README/GUIDE/caijuehub.md 的声明式修改记录。

#### 第三步：按行动词搜索

```text
query_audit_logs({ keyword: "add-coder-dps-threshold-render" })
```
→ 返回全部本轮审计记录。

#### 恢复顺序建议

```
1. session-init SKILL（强制前置）
2. query_audit_logs({ keyword: "add-coder-dps-threshold-render" })
3. read ".qoder/specs/add-coder-dps-threshold-render/spec.md"
4. read ".qoder/specs/add-coder-dps-threshold-render/checklist.md"
```

### 原子事务目标

覆盖父 Plan 的 Task 2.1-2.4。README/GUIDE/caijuehub.md 共 6 处声明式引用（去硬编码数字，指向 dps-scoring-rules.toml）；build + gen-src-hash（270 文件）+ 用户项目分发验证（weather_proxy sync --patch）；全链归零验收。

### spec 文件

- `.qoder/specs/add-coder-dps-threshold-render/spec.md`
- `.qoder/specs/add-coder-dps-threshold-render/tasks.md`
- `.qoder/specs/add-coder-dps-threshold-render/checklist.md`

### 架构文档

- `docs/caijuehub.md` — 第三个案例：DPS 评分全参数（声明式化 + 示例修正 warn=70→65）

### 你要改的文件（5 个：0 新建 + 5 修改 + 分发产物）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `README.md` | 修改 | 中英 2 处声明式 |
| `GUIDE.md` | 修改 | 2 处声明式 |
| `docs/caijuehub.md` | 修改 | L103 声明式 + 示例 pass=80/warn=65 |
| `dist/` + `templates/.add-coder-src-hash.json` | 修改 | build 产物 + hash（270 文件） |
| 用户项目（weather_proxy）.qoder/ | 修改 | sync --patch 分发（≥ 80 渲染） |

### 核心设计

```text
README/GUIDE/caijuehub.md: "阈值以 dps-scoring-rules.toml 为准（PASS=80/WARN=65）"
分发链路: pnpm build → gen-src-hash → 用户项目 sync --patch → 副本渲染 ≥ 80
```

### 关键契约细化

- `README.md` 英文版（L449）同步声明式（中英一致）。
- `docs/caijuehub.md` TOML 示例必须与真源一致（pass=80/warn=65）。
- 历史记录（.qoder/plans 2026-07、specs 旧文件）禁止改动。

### 高风险误区

- 禁止把 "当前 PASS=80" 写死成唯一表述（保留"以 dps-scoring-rules.toml 为准"的声明式语义，数字是当前值说明）。
- 禁止在文档中重新引入硬编码阈值作为唯一依据。
- **禁止回头修改第 1 轮文件**（renderer/templates 边界已闭合）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `DOC_UPDATED` | DOC | `README.md` | 声明式 2 处 | ✅ |
| `DOC_UPDATED` | DOC | `GUIDE.md` | 声明式 2 处 | ✅ |
| `DOC_UPDATED` | DOC | `docs/caijuehub.md` | 声明式 + 示例修正 | ✅ |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-dps-threshold-render" })
→ 返回全部本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- 声明式：`grep -n "dps-scoring-rules.toml" README.md GUIDE.md docs/caijuehub.md` 命中 6 处
- 分发：weather_proxy `sync --adapter=qoder --patch` 后副本显示 "DPS ≥ 80 通过"（vocabulary/guardian）
- hash：`gen-src-hash` 输出 270 files
- 全链归零：templates/ 硬编码 ≥ 85 仅剩豁免 3 处；全仓仅剩描述性引用（Plan/Spec 的 beforeState 与替换规则说明）
- checklist.md 全部 27 项 `[x]`（证据 + 审计 ID 真实）

#### 未执行的端到端验证（保留给运行时复测）

- [ ] npm 发布后消费者从 registry 安装的端到端验证（当前为本地链接验证）

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`。参考 audit action：

| 文件 | action |
|------|--------|
| `README.md` | `DOC_UPDATED` |
| `GUIDE.md` | `DOC_UPDATED` |
| `docs/caijuehub.md` | `DOC_UPDATED` |

---

## 收敛判定

- 两轮均已完成独立验证（checklist 27/27 全绿，证据真实）
- 全链单一真源成立：TOML → transcribe（判定）/ renderer（文案）/ 文档声明式（引用）
- 已知边界（独立任务）：plan.ts `.hitl` 过滤缺陷（P2-4）；模板历史产物分发面评估
- **恢复关键词**：`add-coder-dps-threshold-render`（query_audit_logs 一键拉全）
