# add-coder-hitl-mcp-hook-add-route-v1

> **定位**：Plan → ADD Step执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **绑定**：Plan: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-plan-v1.md` · Spec: `.qoder/specs/add-coder-hitl-mcp-hook/spec.md` · Tasks: `.qoder/specs/add-coder-hitl-mcp-hook/tasks.md` · Handoff: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-handoff-v1.md` · Checklist: `.qoder/specs/add-coder-hitl-mcp-hook/checklist.md`

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + Specs + Handoff 三元组齐全，项目文档反映即将实现的变更。

**输入**：
- Plan: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-plan-v1.md`
- Review: `.qoder/reviews/add-coder-hitl-mcp-hook-review-v1.md`
- SKILL: `.qoder/skills/add-paradigm/SKILL.md`
- Rules: `.qoder/rules/project_rules.md`

**动作**：
1. DPS ≥ 85 已通过（103 🟢）
2. Specs 三元组已就绪：`spec.md` + `tasks.md` + `checklist.md`
3. Plan → Review → Specs → Handoff 文档链路完整
4. 本次为新增模块，无需更新项目级 `docs/` 知识库文档（ADD-13 HITL 规则将在 rules 中体现）

**产出**：
- [ ] Specs 三元组路径确认
- [ ] 项目文档更新（本次无需更新——新增模块，不修改已有架构/规范文档）
- [ ] Handoff 就绪（保留占位，Step 8 收敛后填充）

---

## Step 1：功能分析与审计打点定义

**目的**：定义本次变更涉及的所有审计阶段和 ADD-7 打点策略。

**输入**：
- Plan §3 Task 列表
- `record_dev_operation` 现有调用模式

**动作**：
1. 本次为 add-coder 治理层新增模块，审计打点通过 `record_dev_operation` 实现（目标表：AuditLog）
2. HitlRecord / PlanRecord / ReviewRecord 本身即审计数据（ADD-5：审计数据即业务数据）
3. Prisma enum 定义即审计阶段字面量（DRAFT/SUBMITTED/TONGYI/BOHUI = HITL 生命周期阶段）

**产出**：
- [ ] 本次审计打点清单

| 字面量 | 使用场景 | Task |
|-------|---------|------|
| MODEL_CREATED | HitlRecord/PlanRecord/ReviewRecord 表创建 | 1.1 |
| COMPONENT_CREATED | hitl-tools.ts / plan-tools.ts / review-tools.ts 新建 | 2.1-2.3 |
| CONFIG_MODIFIED | pre-tool-use.sh / doc-format-guard.sh 修改 | 2.4, 3.4 |
| DOC_UPDATED | SKILL.md / project_rules.md 更新 | 3.1-3.2 |
| TEMPLATE_CREATED | hitl-template.md + schema.json 新建 | 3.3 |
| TEST_CREATED | hitl.test.ts 新建 | 3.5 |

---

## Step 2：审计基础设施确认

**目的**：确认 `record_dev_operation` 可正常使用。

**输入**：
- MCP 工具：`record_dev_operation`

**动作**：
1. 确认 PostgreSQL 容器运行中（podman-compose up -d）
2. 确认 `record_dev_operation` MCP 工具可调用
3. 确认 AuditLog 表存在且可写入

**产出**：
- [ ] `record_dev_operation` 通道确认可用

---

## Step 3：业务逻辑实现与审计植入

**目的**：按 Plan 的 Task 依赖拓扑，逐 Task 实施代码 + 嵌入审计点。

**输入**：
- Plan §4 Task 依赖图
- `tasks.md` 的 Task 清单
- Plan ADD-7 审计策略表

**动作**：

### Task 映射表

| # | Task | 文件 | 审计植入点 | 新增字面量 | 依赖 | 状态 |
|---|------|------|-----------|-----------|------|------|
| 1.1 | 新增三表+枚举 | `prisma/add.prisma` | `record_dev_operation({targetType:"MODEL",action:"MODEL_CREATED"})` | HitlType/HitlStatus/ReviewType | 无 | ⬜ |
| 1.2 | migrate+regen | migration | `record_dev_operation({targetType:"MODEL",action:"MODEL_CREATED"})` | — | 1.1 | ⬜ |
| 1.3 | ROUND_CLOSED | — | `record_dev_operation({targetType:"PLAN",action:"ROUND_CLOSED"})` | — | 1.2 | ⬜ |
| 2.1 | 3 HITL 工具 | `src/mcp/hitl-tools.ts` | `record_dev_operation({targetType:"COMPONENT",action:"COMPONENT_CREATED"})` | — | 1.1 | ⬜ |
| 2.2 | 3 Plan 工具 | `src/mcp/plan-tools.ts` | `record_dev_operation({targetType:"COMPONENT",action:"COMPONENT_CREATED"})` | — | 1.1 | ⬜ |
| 2.3 | 3 Review 工具 | `src/mcp/review-tools.ts` | `record_dev_operation({targetType:"COMPONENT",action:"COMPONENT_CREATED"})` | — | 1.1 | ⬜ |
| 2.4 | hook 拦截 | `templates/core/hooks/pre-tool-use.sh` | `record_dev_operation({targetType:"CONFIG",action:"CONFIG_MODIFIED"})` | — | 2.1 | ⬜ |
| 2.5 | index 注册 | MCP tools/index | `record_dev_operation({targetType:"CONFIG",action:"CONFIG_MODIFIED"})` | — | 2.1-2.3 | ⬜ |
| 2.6 | ROUND_CLOSED | — | `record_dev_operation({targetType:"PLAN",action:"ROUND_CLOSED"})` | — | 2.5 | ⬜ |
| 3.1 | SKILL 更新 | `templates/core/skills/add-paradigm/SKILL.md` | `record_dev_operation({targetType:"DOC",action:"DOC_UPDATED"})` | — | 1.1 | ⬜ |
| 3.2 | ADD-13 规则 | `templates/core/rules/project_rules.md` | `record_dev_operation({targetType:"DOC",action:"DOC_UPDATED"})` | — | 1.1 | ⬜ |
| 3.3 | 模板+schema | `templates/core/templates/hitl-template.md` + `.schema.json` | `record_dev_operation({targetType:"TEMPLATE",action:"TEMPLATE_CREATED"})` | — | 1.1 | ⬜ |
| 3.4 | guard 扩展 | `templates/core/hooks/doc-format-guard.sh` | `record_dev_operation({targetType:"CONFIG",action:"CONFIG_MODIFIED"})` | — | 3.3 | ⬜ |
| 3.5 | 验证扫描 | plan_track scanAll | `record_dev_operation({targetType:"TEST",action:"TEST_CREATED"})` | — | 2.2 | ⬜ |
| 3.6 | review 验证 | review_track | `record_dev_operation({targetType:"TEST",action:"TEST_CREATED"})` | — | 2.3 | ⬜ |
| 3.7 | sync 验证 | weather_proxy sync | `record_dev_operation({targetType:"TEST",action:"TEST_CREATED"})` | — | 3.1-3.4 | ⬜ |
| 3.8 | ROUND_CLOSED | — | `record_dev_operation({targetType:"PLAN",action:"ROUND_CLOSED"})` | — | 3.7 | ⬜ |

### 依赖拓扑

```
1.1 模型定义 ──→ 1.2 migration
1.1 ──→ 2.1/2.2/2.3（MCP 工具消费 Prisma model）
2.1 ──→ 2.4（hook 消费 .hitl-tongyi 标记文件生成逻辑）
2.1/2.2/2.3 ──→ 2.5（index 注册）
1.1 ──→ 3.1/3.2/3.3（模板/规则文件路径已知，可与轮次 2 并行）
3.3 ──→ 3.4（guard 依赖 schema 文件）
2.2/2.3 ──→ 3.5/3.6（验证依赖工具就绪）
3.1-3.4 ──→ 3.7（sync 验证依赖模板/规则/skill 已更新）
```

### 每个 Task 完成后

1. 验证该 Task 的 checklist `[T]` 项
2. 调用 `record_dev_operation` 记录 ADD-7 审计

**产出**：
- [ ] 全部 Task 的 `[T]` 项通过
- [ ] 每个文件有 `record_dev_operation` 记录

---

## Step 3.5：实现审查

**目的**：代码完成后，验证意图与实现无语义鸿沟（ADD-10）。

**输入**：
- `checklist.md`
- `review-implementation-template.md`

**动作**：
1. 逐项执行 `checklist.md` 中所有 `[T]` 编译期检查项
2. 按 `checklist-template.md` 执行跨项目联调检查
3. 读取 `review-implementation-template.md`，生成 `review-implementation.md`
4. 所有 `[T]` 项通过后，生成 `review-runtime.md`（含 `[R]` 待验证清单）

**产出**：
- [ ] `checklist.md` 全部 `[T]` 项已通过
- [ ] `review-implementation.md` 已生成
- [ ] `review-runtime.md` 已生成

---

## Step 4：审计数据验证

**目的**：编译 + 审计完整性检查。

**动作**：
1. `npx tsc --noEmit` —— 零类型错误
2. `npx eslint` —— 无新增 lint 问题
3. 验证 9 个 MCP 工具均可调用
4. 验证 HITL 全生命周期：create → SUBMITTED → TONGYI → .hitl-tongyi 标记
5. 验证 BOHUI + round+1 多轮审批流转

**产出**：
- [ ] `tsc --noEmit` 通过
- [ ] `eslint` 通过
- [ ] 9 MCP 工具可调用
- [ ] HITL 全生命周期验证通过

---

## Step 5：AI 自动合规检查

**目的**：扫描全部修改文件的 ADD-1~ADD-7 合规性。

**动作**：
1. 验证 ADD-2：create_hitl/update_hitl 成对调用（阶段标记对称）
2. 验证 ADD-3：每个工具调用独立 record_dev_operation（最小可观测单元）
3. 验证 ADD-4：console + file + DB 三通道输出
4. 验证 ADD-5：HitlRecord/PlanRecord/ReviewRecord 即审计数据
5. 验证 ADD-6：BOHUI 驳回路径审计信息密度 ≥ TONGYI 路径

**产出**：
- [ ] 合规报告已生成
- [ ] 所有违规项有处理决策

---

## Step 6：从审计数据定位问题

> **仅当 Step 4/5 发现异常时进入。**

**动作**：
1. `query_audit_logs` 查询 HITL 相关审计记录
2. `plan_status` 检查 Plan 进度异常

---

## Step 7：修复并验证

> **仅当 Step 6 发现问题时进入。**

---

## Step 8：收敛判断 + Handoff 更新

**目的**：功能收敛判定，更新 Handoff，回到架构文档做最终校准。

**动作**：
1. **收敛判断**：全部 `[T]` 项通过 + `[R]` 清单已生成 → 功能收敛
2. **Handoff 更新**：按 `handoff-template.md` 生成完整 handoff
3. **ADD-7 回查**：`query_audit_logs` 确认全部 `record_dev_operation` 记录已落库
4. weather_proxy sync 验证：`npx add-coder sync --adapter qoder --patch` → HITL 规则生效

**产出**：
- [ ] 收敛判定结果
- [ ] Handoff 已更新
- [ ] ADD-7 审计记录落库确认
- [ ] weather_proxy sync 验证通过

---

## 附录：文件清单

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| `prisma/add.prisma` | MODIFY | 1.1 | MODEL | ⬜ |
| `src/mcp/hitl-tools.ts` | CREATE | 2.1 | COMPONENT | ⬜ |
| `src/mcp/plan-tools.ts` | CREATE | 2.2 | COMPONENT | ⬜ |
| `src/mcp/review-tools.ts` | CREATE | 2.3 | COMPONENT | ⬜ |
| `templates/core/hooks/pre-tool-use.sh` | MODIFY | 2.4 | CONFIG | ⬜ |
| `templates/core/skills/add-paradigm/SKILL.md` | MODIFY | 3.1 | DOC | ⬜ |
| `templates/core/rules/project_rules.md` | MODIFY | 3.2 | DOC | ⬜ |
| `templates/core/templates/hitl-template.md` | CREATE | 3.3 | TEMPLATE | ⬜ |
| `templates/core/templates/hitl-template.schema.json` | CREATE | 3.3 | CONFIG | ⬜ |
| `templates/core/hooks/doc-format-guard.sh` | MODIFY | 3.4 | CONFIG | ⬜ |
| `tests/hitl.test.ts` | CREATE | 3.5 | TEST | ⬜ |
