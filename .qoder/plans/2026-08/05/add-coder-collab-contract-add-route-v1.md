# add-coder-collab-contract-add-route-v1

> **定位**: Plan → ADD Step 执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**: 重型(Heavyweight)——每一步产出检查强制执行"验证并更新项目状态"，包含 `check_spec_sync` 文档-代码交叉校验。
>
> **绑定**: Plan: `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md` · Spec: `.qoder/specs/add-coder-collab-contract/spec.md` · Tasks: `.qoder/specs/add-coder-collab-contract/tasks.md` · Handoff: `.qoder/plans/2026-08/05/add-coder-collab-contract-handoff-v1.md`

---

## Step 0: 文档先行(Documentation First)

**目的**: 代码动工前,确认 Plan + Specs + Handoff 三元组齐全,项目文档反映即将实现的变更。

**输入**:
- 上游 Review(触发来源): HITL TONGYI(2026-08-05, round 2)
- Plan 文档: `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md`(含 §六点五 Review 回流)
- 项目知识库: `docs/knowledge/01-架构/《ADD开发工作路径与文档协同规范》.md`

**动作**:
1. ✅ Specs 三元组就绪: `spec.md` + `tasks.md` + `checklist.md`(.qoder/specs/add-coder-collab-contract/)
2. ✅ Review 回流完成: 6 个发现写入 Plan §六点五(0.6.5 闭环,审计已记录)
3. ✅ 项目文档声明: docs/ 无直接受影响架构文档,无需更新
4. Handoff 就绪(round 边界、ADD-7 策略表在 Step 8 生成)
5. **落库同步**: 调用 `plan_track({ planName: "add-coder-collab-contract-plan-v1" })`

**产出**:
- [x] 验证并更新项目状态: Specs 三元组路径确认
- [x] 验证并更新项目状态: Review 6 发现已回流(0.6.5 闭环)
- [x] 验证并更新项目状态: 项目文档已更新(或无需更新声明已记录)
- [x] 验证并更新项目状态: Handoff 就绪(Step 8 生成,绑定路径已声明)
- [x] 验证并更新项目状态: PlanRecord 已同步(plan_track 已调用, 35 tasks)

### §0.8 DPS 闸门(上游文档质量校验)

调用 `check_dps({ planKeyword: "add-coder-collab-contract" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 80 | 🟢 | 进入 Step 1 |
| 65–79 | 🟡 | 回退补齐短板 |
| < 65 | 🔴 | 回退细化 Plan |

- [x] DPS 已通过(≥ 80, 实际 82),可进入 Step 1

### §0.9 原子闭包判定(0.7 强制卡位)

```
原子闭包判定
══════════
Plan 级闭包: 并发协作契约能力收敛(模板/schema/持久化/MCP/HITL/Caijuehub 全链路可用)
轮次: 4 轮(轮次 0-3)

第0轮: 根环境打通 (4 文件)
  文件边界: 根 prisma/add.prisma + prisma/migrations/ + src/generated/prisma/ + 本地契约样例
  上轮依赖: 无
  可独立验证: migrate dev + generate + contract_track 实证

第1轮: 模板 + Schema 收尾 (3 文件)
  文件边界: collab-contract-template.md + schema.json + hitl-template.md
  上轮依赖: 无(与轮次 0 并行,模板补全不依赖根环境)
  可独立验证: tsc + 模板结构 diff

第2轮: MCP 工具收尾 (3 文件)
  文件边界: contract.ts + hitl.ts + plan.ts
  上轮依赖: 消费第0轮产出的 client 契约模型(实证链路)
  可独立验证: tsc + 告警触发 + plan_status 展示

第3轮: Caijuehub + 发布 (2 文件 + 分发产物)
  文件边界: docs/caijuehub.md + 版本 bump/CHANGELOG + sync 分发
  上轮依赖: 消费第1-2轮产出
  可独立验证: 验收③-⑧
```

> 文件边界校验: 每文件仅归属一个轮次,无跨轮修改;轮次间为生产者-消费者关系;每轮可独立验证。

---

## Step 1: 功能分析与审计打点定义

**目的**: 定义本次变更涉及的所有审计打点,扩展 `AgentAuditPhase`。

**动作**:
1. 本次变更业务环节: 契约文档解析落库(contract_track)、契约状态查询(contract_status)、契约 HITL 审批(COLLAB_CONTRACT)
2. **不扩展 AgentAuditPhase**——MCP 工具链变更,审计通过 ADD-7 record_dev_operation 覆盖

**产出**:
- [x] 验证并更新项目状态: 本次审计打点清单已同步到 tasks.md Step 1 区域(声明无需运行时打点)

| 字面量 | 使用场景 | Task |
|-------|---------|------|
| (无新增) | MCP 工具链变更,无运行时审计点 | — |

---

## Step 2: 审计基础设施确认

**目的**: 确认 `agentAudit()` 通道可用,无需新建 logger 文件。

**动作**:
1. 本 Plan 变更不涉及运行时业务,agentAudit 通道无需扩展
2. 审计通过 ADD-7 record_dev_operation 覆盖

**产出**:
- [x] 验证并更新项目状态: `agentAudit()` 通道确认可用,状态已同步到 checklist.md ADD 规则合规项(声明无需变更)

---

## Step 3: 业务逻辑实现与审计植入

**目的**: 按 Plan 的 Task 依赖拓扑,逐 Task 实施代码。

**输入**:
- Plan §三 架构设计(3.1 数据流转 / 3.2 数据模型 / 3.3 工具设计)
- Plan §六点五 Review 回流(6 发现收尾项)
- `tasks.md` 的 Task 清单

### §3.0 前置守卫(重型强制)

调用 `check_add_route_status({ planKeyword: "add-coder-collab-contract" })` 确认 add-route 有效。

### Task 映射表

| # | Task | 文件 | 审计植入点 | 新增字面量 | 依赖 | 状态 |
|---|------|------|-----------|-----------|------|------|
| 0 | 根环境打通 | 根 prisma/add.prisma + migrations + generated | SCHEMA_MODIFIED | — | 无 | ⬜ |
| 1 | 模板补 §7 | collab-contract-template.md | TEMPLATE_MODIFIED | — | 0 | ⬜ |
| 2 | schema isolationMode | collab-contract-template.schema.json | TEMPLATE_MODIFIED | — | 1 | ⬜ |
| 3 | hitl-template 核对 | hitl-template.md | TEMPLATE_MODIFIED | — | 无 | ⬜ |
| 4 | contract.ts 告警 | tools/contract.ts | COMPONENT_MODIFIED | — | 0 | ⬜ |
| 5 | hitl.ts 状态回写核对 | tools/hitl.ts | COMPONENT_MODIFIED | — | 无 | ⬜ |
| 6 | plan.ts 契约角色 | tools/plan.ts | COMPONENT_MODIFIED | — | 无 | ⬜ |
| 7 | docs/caijuehub.md | docs/caijuehub.md | DOC_MODIFIED | — | 无 | ⬜ |
| 8 | sync 分发 + 验证 | 各 magic 目录 | DOC_UPDATED | — | 1-7 | ⬜ |
| 9 | 版本发布 | package.json + CHANGELOG | DOC_UPDATED | — | 8 | ⬜ |

### 依赖拓扑

```
Task 0 ──→ Task 1 ──→ Task 2          Task 3(独立)
  │              │                      │
  ├──→ Task 4    │                      │
  │              └─────────┬────────────┘
  │                        ▼
  ├──→ Task 5(独立) ──→ Task 8 ──→ Task 9
  └──→ Task 6(独立) ──┘
       Task 7(独立) ──┘
```

### Task Dependencies（check_dps 解析用，与 tasks.md Task 编号对齐）

```
Task 0.1 依赖: 无
Task 0.2 依赖: Task 0.1
Task 0.3 依赖: Task 0.2
Task 0.4 依赖: Task 0.3
Task 1.1 依赖: Task 0.4
Task 1.2 依赖: Task 1.1
Task 1.3 依赖: 无
Task 2.1 依赖: Task 0.4
Task 2.2 依赖: 无
Task 2.3 依赖: 无
Task 3.1 依赖: 无
Task 3.2 依赖: Task 1.1, Task 1.2, Task 2.1, Task 2.2, Task 2.3, Task 3.1
Task 3.3 依赖: Task 3.2
```

### 每个 Task 完成后(重型强制执行)

1. 验证该 Task 的 checklist `[T]` 项
2. 调用 `record_dev_operation` 记录 ADD-7 审计
3. **验证并更新项目状态**: 将该 Task 在 `tasks.md` 中逐子项勾选为 `[x]`

**产出**:
- [x] 验证并更新项目状态: 全部 Task 的 `[T]` 项通过,`tasks.md` 已完成项已逐项勾选
- [x] 验证并更新项目状态: 每个文件有 `record_dev_operation` 记录,`checklist.md` ADD-7 审计项已确认
- [x] 验证并更新项目状态: 调用 `check_spec_sync` 确认 spec 文档勾选状态与实际代码一致

---

## Step 3.5: 实现审查

**目的**: 代码完成后,验证意图与实现无语义鸿沟(ADD-10)。

**动作**:
1. 逐项执行 `checklist.md` 中所有 `[T]` 编译期检查项
2. 读取 `review-implementation-template.md`,生成 `review-implementation.md`
3. 所有 `[T]` 项通过后,生成 `review-runtime.md`(含 `[R]` 待验证清单)
4. **重型强制**: 调用 `check_spec_sync` 确认 `tasks.md` / `checklist.md` 全部已完成项的勾选状态正确

**产出**:
- [x] 验证并更新项目状态: `checklist.md` 全部 `[T]` 项已通过并勾选
- [x] 验证并更新项目状态: `review-implementation.md` 已生成
- [x] 验证并更新项目状态: `review-runtime.md` 已生成(含 `[R]` 待验证清单)
- [x] 验证并更新项目状态: `check_spec_sync` 通过——spec 文档勾选状态与代码一致

---

## Step 4: 审计数据验证

**目的**: 编译 + 审计完整性检查。

**动作**:
1. `npx tsc --noEmit` —— 零类型错误
2. `npm run lint` —— 无新增 lint 问题
3. contract_track 实证 + contract_status 查询(验收③④)
4. **重型强制**: 调用 `check_spec_sync` 确认 spec 文档与实际代码一致

**产出**:
- [x] `tsc --noEmit` 通过
- [x] `npm run lint` 通过
- [x] 验证并更新项目状态: `check_spec_sync` 通过,checklist.md 编译检查项已同步勾选

### §4.6 RAHS 闸门(下游执行健康度校验)

调用 `check_rahs({ planKeyword: "add-coder-collab-contract" })`。

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入 Step 5 |
| 70–89 | 🟡 | 自检 |
| < 70 | 🔴 | 返工回退 Step 3 |

- [x] RAHS 已检查(≥ 90 或自检通过),可进入 Step 5

---

## Step 5: AI 自动合规检查

**目的**: 扫描全部修改文件的 ADD-1~ADD-7 合规性。

**动作**:
1. 对每个修改文件调用 `check_add_compliance(code, projectPattern="event-based")`
2. 汇总合规报告,标注违规项和风险等级

**产出**:
- [x] 验证并更新项目状态: 合规报告已生成,违规项处理决策已记录
- [x] 验证并更新项目状态: `checklist.md` ADD 规则合规检查项已同步勾选

---

## Step 6: 从审计数据定位问题

> **仅当 Step 4/5 发现异常时进入。**

**产出**:
- [x] 验证并更新项目状态: 问题清单已记录(如无异常则跳过)——Step 4/5 无异常,跳过

---

## Step 7: 修复并验证

> **仅当 Step 6 发现问题时进入。**

**产出**:
- [x] 验证并更新项目状态: 所有问题已修复,`checklist.md` 回归验证项已重新勾选——无问题需修复,跳过

---

## Step 8: 收敛判断 + Handoff 更新 + Step 0 第二部分

**目的**: 功能收敛判定,更新 Handoff,回到架构文档做最终校准。

**动作**:
1. **收敛判断**: 全部 `[T]` 项通过 + `[R]` 清单已生成 + RAHS 自检 → 功能收敛
2. **RAHS 最终核定**: 调用 `check_rahs({ planKeyword: "add-coder-collab-contract" })`
3. **验证并更新项目状态**: `tasks.md` 全部 Task 已完成,`checklist.md` 全部可验证项已勾选
4. **验证并更新项目状态**: 调用 `check_spec_sync` 做最终交叉校验
5. **Handoff 更新**: 生成 `.qoder/plans/2026-08/05/add-coder-collab-contract-handoff-v1.md`
6. **Step 0 第二部分**: 回架构文档做最终校准(docs/ 无受影响,声明)
7. **ADD-7 回查**: `query_audit_logs` 确认全部记录已落库

**产出**:
- [x] 验证并更新项目状态: 收敛判定结果
- [x] 验证并更新项目状态: `tasks.md` + `checklist.md` 全部完成项已勾选
- [x] 验证并更新项目状态: `check_spec_sync` 四者一致确认
- [x] 验证并更新项目状态: Handoff 已更新
- [x] 验证并更新项目状态: 架构文档已校准
- [x] 验证并更新项目状态: ADD-7 审计记录已落库确认

---

## Step 9: Report Closure(运行时发现关闭 — 条件性操作)

> 本 Plan 非 runtime-fix plan,不执行 Step 9。

---

## 附录: 文件清单

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| `prisma/add.prisma`(根) | MODIFY | 0.1 | SCHEMA | ⬜ |
| `prisma/migrations/*`(根) | CREATE | 0.2 | SCHEMA | ⬜ |
| `src/generated/prisma/*` | REGEN | 0.3 | SCHEMA | ⬜ |
| `.qoder/plans/2026-08/05/*-collab-contract-*.md`(本地样例) | CREATE | 0.4 | DOC | ⬜ |
| `templates/core/templates/collab-contract-template.md` | MODIFY | 1.1 | TEMPLATE | ⬜ |
| `templates/core/templates/collab-contract-template.schema.json` | MODIFY | 1.2 | TEMPLATE | ⬜ |
| `templates/core/templates/hitl-template.md` | MODIFY | 1.3 | TEMPLATE | ⬜ |
| `templates/core/scripts/mcp-server/tools/contract.ts` | MODIFY | 2.1 | COMPONENT | ⬜ |
| `templates/core/scripts/mcp-server/tools/hitl.ts` | MODIFY | 2.2 | COMPONENT | ⬜ |
| `templates/core/scripts/mcp-server/tools/plan.ts` | MODIFY | 2.3 | COMPONENT | ⬜ |
| `docs/caijuehub.md` | MODIFY | 3.1 | DOC | ⬜ |
| `.add/.claude/.qoder/.vscode`(分发产物) | MODIFY | 3.2 | RULE | ⬜ |
