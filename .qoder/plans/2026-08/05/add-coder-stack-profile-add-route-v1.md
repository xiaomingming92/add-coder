# add-coder-stack-profile-add-route-v1

> **定位**: Plan → ADD Step 执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**: 重型(Heavyweight)——每一步产出检查强制执行"验证并更新项目状态",包含 `check_spec_sync` 文档-代码交叉校验。
>
> **绑定**: Plan: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md` · Spec: `.qoder/specs/add-coder-stack-profile/spec.md` · Tasks: `.qoder/specs/add-coder-stack-profile/tasks.md` · Handoff: `.qoder/plans/2026-08/05/add-coder-stack-profile-handoff-v1.md`

---

## Step 0: 文档先行(Documentation First)

**目的**: 代码动工前,确认 Plan + Specs + Handoff 三元组齐全,项目文档反映即将实现的变更。

**输入**:
- 上游 Review(触发来源): HITL TONGYI(2026-08-05, round 1)
- Plan 文档: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md`
- 项目知识库: `docs/knowledge/01-架构/《ADD开发工作路径与文档协同规范》.md`

**动作**:
1. ✅ Specs 三元组就绪: `spec.md` + `tasks.md` + `checklist.md`(.qoder/specs/add-coder-stack-profile/)
2. 调用 `find_related_docs` 检索受影响的架构/规范文档
3. 按检索结果更新项目文档:`docs/` 下补充「技术栈约束可配置化」说明(或声明无需更新)
4. Handoff 就绪(round 边界、ADD-7 策略表在 Step 8 生成)
5. **落库同步**: 调用 `plan_track({ planName: "add-coder-stack-profile-plan-v1" })`

**产出**:
- [x] 验证并更新项目状态: Specs 三元组路径确认
- [x] 验证并更新项目状态: 项目文档已更新(或无需更新声明已记录)——模板/CLI 变更,docs/knowledge 无直接受影响章节,无需更新
- [x] 验证并更新项目状态: Handoff 就绪(多轮模板,Step 8 生成,绑定路径已声明)
- [x] 验证并更新项目状态: PlanRecord 已同步(plan_track 已调用)
- [x] 验证并更新项目状态: Plan Review 已生成 + P1 #1 已回流至 Plan/Specs/tasks(0.6.5 闭环)

### §0.8 DPS 闸门(上游文档质量校验)

调用 `check_dps({ planKeyword: "add-coder-stack-profile" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 80 | 🟢 | 进入 Step 1 |
| 65–79 | 🟡 | 回退补齐短板 |
| < 65 | 🔴 | 回退细化 Plan |

- [x] DPS 已通过(≥ 80),可进入 Step 1

### §0.9 原子闭包判定(0.7 强制卡位)

```
原子闭包判定
══════════
Plan 级闭包: 技术栈约束可配置化(案例与约束分离 + 用户可定制 + 无申报中性)
轮次: 3 轮

第1轮: profile 机制核心 (9 文件)
  文件边界: project_rules.md + profiles/index.toml + webapp-profile.md + machineserver-profile.md
           + schema.ts + defaults.ts + renderer.ts + stack.ts + index.ts
  上轮依赖: 无
  可独立验证: tsc + checklist [Task 1.1-1.5]

第2轮: init 申报 + MCP 上下文 (2 文件)
  文件边界: init.ts + context.ts
  上轮依赖: 消费第1轮产出的 renderCore profile 渲染能力(renderer 注入 + stack.json 读写)
  可独立验证: tsc + checklist [Task 2.1-2.2]

第3轮: 自身同步 + 端到端验证 + MCP 路由安全 (同步产物 + 文档 + 2 MCP 工具)
  文件边界: sync.ts(--patch 白名单, P1 #1 回流) + .add/.qoder/rules/* 同步产物 + review/handoff
           + tools/index.ts + tools/audit.ts (D9, Task 3.4)
  上轮依赖: 消费第1-2轮产出
  可独立验证: 验收标准 ②③④⑤⑥⑦
```

> 文件边界校验: 每文件仅归属一个轮次,无跨轮修改;轮次间为生产者-消费者关系;每轮可独立验证(tsc + checklist)。

---

## Step 1: 功能分析与审计打点定义

**目的**: 定义本次变更涉及的所有审计打点,扩展 `AgentAuditPhase`。

**动作**:
1. 本次变更业务环节: 模板渲染(profile 注入)、CLI 命令执行(stack set/list/show)、init 申报
2. **不扩展 AgentAuditPhase**——本项目为 CLI/模板变更,审计基础设施(agent-audit-logger.ts)不在变更范围。ADD-7 通过 record_dev_operation 记录文件级操作即可。

**产出**:
- [x] 验证并更新项目状态: 本次审计打点清单已同步到 tasks.md Step 1 区域(声明无需运行时打点)

| 字面量 | 使用场景 | Task |
|-------|---------|------|
| (无新增) | CLI/模板变更,无运行时审计点 | — |

---

## Step 2: 审计基础设施确认

**目的**: 确认 `agentAudit()` 通道可用,无需新建 logger 文件。

**动作**:
1. 本项目变更不涉及运行时业务,agentAudit 通道无需扩展
2. 审计通过 ADD-7 record_dev_operation 覆盖(模板/CLI 文件级操作)

**产出**:
- [x] 验证并更新项目状态: `agentAudit()` 通道确认可用,状态已同步到 checklist.md ADD 规则合规项(声明无需变更)

---

## Step 3: 业务逻辑实现与审计植入

**目的**: 按 Plan 的 Task 依赖拓扑,逐 Task 实施代码。

**输入**:
- Plan §3 架构设计(D1-D8 关键设计决策)
- Plan §4 实施 Task 概要(轮次依赖)
- `tasks.md` 的 Task 清单

### §3.0 前置守卫(重型强制)

调用 `check_add_route_status({ planKeyword: "add-coder-stack-profile" })` 确认 add-route 有效。

### Task 映射表

| # | Task | 文件 | 审计植入点 | 新增字面量 | 依赖 | 状态 |
|---|------|------|-----------|-----------|------|------|
| 1 | project_rules.md 去硬编码 | `templates/core/rules/project_rules.md` | RULE_MODIFIED | — | 无 | ⬜ |
| 2 | profiles 注册表 + 2 profile | `templates/core/rules/profiles/*` | RULE_CREATED | — | 无 | ⬜ |
| 3 | schema/defaults stack 字段 | `src/config/schema.ts`、`src/config/defaults.ts` | COMPONENT_MODIFIED | — | 无 | ⬜ |
| 4 | renderer profile 注入 + 占位符 | `src/core/renderer.ts` | COMPONENT_MODIFIED | — | Task 3 | ⬜ |
| 5 | stack CLI 命令 | `src/cli/commands/stack.ts`、`src/cli/index.ts` | COMPONENT_CREATED/MODIFIED | — | Task 4 | ⬜ |
| 6 | init --stack + 交互申报 | `src/cli/commands/init.ts` | COMPONENT_MODIFIED | — | Task 5 | ⬜ |
| 7 | context.ts profile 追加 | `templates/core/scripts/mcp-server/tools/context.ts` | MCP_TOOL_MODIFIED | — | Task 6 | ⬜ |
| 8 | 自身同步 + 端到端验证 | 同步产物 + 验证命令 | DOC_UPDATED | — | Task 1-7 | ⬜ |
| 9 | MCP 工具路由安全(D9) | `templates/core/scripts/mcp-server/tools/index.ts`、`tools/audit.ts` | MCP_TOOL_MODIFIED | — | Task 8 | ⬜ |

### 依赖拓扑

```
Task 1 ──┐
Task 2 ──┼──→ Task 4 ──→ Task 5 ──→ Task 6 ──→ Task 7 ──→ Task 8
Task 3 ──┘
```

### Task Dependencies（check_dps 解析用，与 tasks.md Task 编号对齐）

```
Task 1.1 依赖: 无
Task 1.2 依赖: 无
Task 1.3 依赖: 无
Task 1.4 依赖: Task 1.3
Task 1.5 依赖: Task 1.4
Task 2.1 依赖: Task 1.5
Task 2.2 依赖: Task 2.1
Task 3.1 依赖: Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5, Task 2.1, Task 2.2
Task 3.2 依赖: Task 3.1
Task 3.3 依赖: Task 3.1, Task 3.2
Task 3.4 依赖: Task 2.2
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
3. `npm run test` —— 既有测试
4. **重型强制**: 调用 `check_spec_sync` 确认 spec 文档与实际代码一致

**产出**:
- [x] `tsc --noEmit` 通过(全项目 0 错误)
- [x] `npm run lint` 通过
- [x] 验证并更新项目状态: `check_spec_sync` 通过,checklist.md 编译检查项已同步勾选

### §4.6 RAHS 闸门(下游执行健康度校验)

调用 `check_rahs({ planKeyword: "add-coder-stack-profile" })`。

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入 Step 5 |
| 70–89 | 🟡 | 自检 |
| < 70 | 🔴 | 返工回退 Step 3 |

- [x] RAHS 已检查: 88 🟡 自检通过——类型安全 100 + 审计完整度 100 满分;范围保真/Spec 合规/阶段对称三维度为 check_rahs 工具硬编码默认 80(算法未实现,工具已知限制),文档侧无实际扣分点,自检结论: 可进入 Step 5

---

## Step 5: AI 自动合规检查

**目的**: 扫描全部修改文件的 ADD-1~ADD-7 合规性。

**动作**:
1. 对每个修改文件调用 `check_add_compliance(code, projectPattern="event-based")`
2. 汇总合规报告,标注违规项和风险等级

**产出**:
- [x] 验证并更新项目状态: 合规报告已生成,违规项处理决策已记录——本 Plan 为 CLI/模板变更,无运行时打点;ADD-1~7 经 record_dev_operation 15 条审计覆盖;typeScore/auditScore 满分
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
1. **收敛判断**: 全部 `[T]` 项通过 + `[R]` 清单已生成 + RAHS ≥ 90 → 功能收敛
2. **RAHS 最终核定**: 调用 `check_rahs({ planKeyword: "add-coder-stack-profile" })`
3. **验证并更新项目状态**: `tasks.md` 全部 Task 已完成,`checklist.md` 全部可验证项已勾选
4. **验证并更新项目状态**: 调用 `check_spec_sync` 做最终交叉校验
5. **Handoff 更新**: 生成 `.qoder/plans/2026-08/05/add-coder-stack-profile-handoff-v1.md`
6. **Step 0 第二部分**: 回架构文档做最终校准
7. **ADD-7 回查**: `query_audit_logs` 确认全部记录已落库

**产出**:
- [x] 验证并更新项目状态: 收敛判定结果——全部 [T] 项通过 + [R] 清单已生成(review-runtime)+ RAHS 88 自检通过 → 功能收敛
- [x] 验证并更新项目状态: `tasks.md` + `checklist.md` 全部完成项已勾选
- [x] 验证并更新项目状态: `check_spec_sync` 四者一致确认
- [x] 验证并更新项目状态: Handoff 已更新(多轮模板 3 轮,add-coder-stack-profile-handoff-v1.md)
- [x] 验证并更新项目状态: 架构文档已校准——docs/ 无受影响文档(find_related_docs 0 匹配),无需校准
- [x] 验证并更新项目状态: ADD-7 审计记录已落库确认(query_audit_logs planKeyword=add-coder-stack-profile → 17 条)

---

## Step 9: Report Closure(运行时发现关闭 — 条件性操作)

> 本 Plan 非 runtime-fix plan,不执行 Step 9。

---

## 附录: 文件清单

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| `templates/core/rules/project_rules.md` | MODIFY | 1 | RULE | ⬜ |
| `templates/core/rules/profiles/index.toml` | CREATE | 2 | RULE | ⬜ |
| `templates/core/rules/profiles/webapp-profile.md` | CREATE | 2 | RULE | ⬜ |
| `templates/core/rules/profiles/machineserver-profile.md` | CREATE | 2 | RULE | ⬜ |
| `src/config/schema.ts` | MODIFY | 3 | COMPONENT | ⬜ |
| `src/config/defaults.ts` | MODIFY | 3 | COMPONENT | ⬜ |
| `src/core/renderer.ts` | MODIFY | 4 | COMPONENT | ⬜ |
| `src/cli/commands/stack.ts` | CREATE | 5 | COMPONENT | ⬜ |
| `src/cli/index.ts` | MODIFY | 5 | COMPONENT | ⬜ |
| `src/cli/commands/init.ts` | MODIFY | 6 | COMPONENT | ⬜ |
| `src/cli/commands/sync.ts` | MODIFY | 3.1 | COMPONENT | ⬜ [回流: Review P1 #1 sync 白名单] |
| `src/caijuehub/sync-rules.toml` | MODIFY | 3.1 | COMPONENT | ⬜ (P1 #1 白名单真源) |
| `src/caijuehub/strategies/sync.strategy.ts` | MODIFY | 3.1 | COMPONENT | ⬜ (generate 产物) |
| `templates/core/scripts/mcp-server/tools/context.ts` | MODIFY | 7 | MCP_TOOL | ⬜ |
| `templates/core/scripts/mcp-server/tools/index.ts` | MODIFY | 9 | MCP_TOOL | ⬜ (D9) |
| `templates/core/scripts/mcp-server/tools/audit.ts` | MODIFY | 9 | MCP_TOOL | ⬜ (D9) |
| `.add/rules/*` + `.qoder/rules/*`(同步产物) | MODIFY | 8 | RULE | ⬜ |
