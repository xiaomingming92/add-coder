# {需求域名}-{核心内容}-add-route-v{版本号}

> **定位**：Plan → ADD Step执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**：重型（Heavyweight）——每一步产出检查强制执行"验证并更新项目状态"，包含 `check_spec_sync` 文档-代码交叉校验。适用于后端系统、多层管线、审计合规场景。
>
> **绑定**：Plan: `{plan-path}` · Spec: `{spec-path}` · Tasks: `{tasks-path}` · Handoff: `{handoff-path}`

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + Specs + Handoff 三元组齐全，项目文档反映即将实现的变更。

**输入**：
- 上游 Review（触发来源）
- Plan 文档
- 规划说明书、架构文档等项目知识库

**动作**：
1. 确认 Specs 三元组就绪：`spec.md` + `tasks.md` + `checklist.md`
2. 调用 `find_related_docs` 检索受影响的架构/规范/需求文档
3. 按检索结果更新项目文档（`docs/*/knowledge/`），或声明"本次变更无需更新项目文档"并说明理由
4. 确认 Handoff 就绪（含 round 边界、ADD-7 策略表、回滚方案）

**产出**：
- [ ] 验证并更新项目状态：Specs 三元组路径确认
- [ ] 验证并更新项目状态：项目文档已更新（或无需更新声明已记录）
- [ ] 验证并更新项目状态：Handoff 就绪

### §0.8 DPS 闸门（上游文档质量校验）

> **重型强制**：Step 0 完成后、进入 Step 1 前，调用 `check_dps` 验证上游文档质量。Plan 概括度 → Review 注意力稀释 → Specs 遗漏 → 实现偏差，这是首要根因。

调用 `check_dps({ planKeyword: "{planKeyword}" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 85 | 🟢 | 进入 Step 1 |
| 70–84 | 🟡 | 回退补齐短板（补 Review 缺失维度 / Specs 缺失 Requirement） |
| < 70 | 🔴 | 回退细化 Plan 本身（粒度不足是下游漂移的根因） |

- [ ] DPS 已通过（≥ 85），可进入 Step 1

---

## Step 1：功能分析与审计打点定义

**目的**：定义本次变更涉及的所有审计打点，扩展 `AgentAuditPhase`。

**输入**：
- Plan §3 的 Task 列表
- `src/lib/agent-audit-logger.ts` 当前 `AgentAuditPhase` 联合类型

**动作**：
1. 列出本次变更涉及的所有业务环节
2. 在 `AgentAuditPhase` 联合类型中新增需要的字面量

**产出**：
- [ ] 验证并更新项目状态：本次审计打点清单已同步到 tasks.md Step 1 区域

| 字面量 | 使用场景 | Task |
|-------|---------|------|
| `NEW_PHASE` | 描述 | Task N |

---

## Step 2：审计基础设施确认

**目的**：确认 `agentAudit()` 通道可用，无需新建 logger 文件。

**输入**：
- `src/lib/agent-audit-logger.ts`
- Step 1 的 AgentAuditPhase 扩展

**动作**：
1. 确认 `agentAudit(phase, detail, extra?)` 接受 Step 1 新增的字面量
2. 确认三通道输出正常（console + file + AuditLog 表）
3. 确认辅助函数可用（`agentAuditNodeStart/End/Error`、`agentAuditRetrieval` 等）

**产出**：
- [ ] 验证并更新项目状态：`agentAudit()` 通道确认可用，状态已同步到 checklist.md ADD 规则合规项

---

## Step 3：业务逻辑实现与审计植入

**目的**：按 Plan 的 Task 依赖拓扑，逐 Task 实施代码 + 嵌入审计点。

**输入**：
- Plan §3 修复方案（每个 Task 的改动文件、操作、代码模板）
- Plan §4 依赖与约束
- `tasks.md` 的 Task 清单
- Handoff 的 ADD-7 审计策略表

**动作**：

### §3.0 前置守卫（重型强制）

调用 `check_add_route_status` 确认 add-route 文件有效存在，不通过则禁止进入代码实现。

### Task 映射表

| # | Task | 文件 | 审计植入点 | 新增字面量 | 依赖 | 状态 |
|---|------|------|-----------|-----------|------|------|
| 1 | {Task名} | `file.ts` | `agentAudit("PHASE", ...)` | `PHASE_NAME` | 无 | ⬜ |
| 2 | {Task名} | `file.ts` | 无（结构变更） | — | Task 1 | ⬜ |

### 依赖拓扑

```
Task N ──→ Task M（说明依赖原因）
```

### 每个 Task 完成后（重型强制执行）

1. 验证该 Task 的 checklist `[T]` 项
2. 调用 `record_dev_operation` 记录 ADD-7 审计
3. **验证并更新项目状态**：将该 Task 在 `tasks.md` 中逐子项勾选为 `[x]`

**产出**：
- [ ] 验证并更新项目状态：全部 Task 的 `[T]` 项通过，`tasks.md` 已完成项已逐项勾选
- [ ] 验证并更新项目状态：每个文件有 `record_dev_operation` 记录，`checklist.md` ADD-7 审计项已确认
- [ ] 验证并更新项目状态：调用 `check_spec_sync` 确认 spec 文档勾选状态与实际代码一致

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
5. **重型强制**：调用 `check_spec_sync` 确认 `tasks.md` / `checklist.md` 全部已完成项的勾选状态正确，不一致项立即同步更新

**产出**：
- [ ] 验证并更新项目状态：`checklist.md` 全部 `[T]` 项已通过并勾选
- [ ] 验证并更新项目状态：`review-implementation.md` 已生成
- [ ] 验证并更新项目状态：`review-runtime.md` 已生成（含 `[R]` 待验证清单）
- [ ] 验证并更新项目状态：`check_spec_sync` 通过——spec 文档勾选状态与代码一致

---

## Step 4：审计数据验证

**目的**：编译 + 审计完整性检查。

**输入**：
- 全部修改文件
- MCP 工具：`check_phase_symmetry`、`check_failure_path`、`check_spec_sync`

**动作**：
1. `npx tsc --noEmit` —— 零类型错误
2. `npm run lint` —— 无新增 lint 问题
3. 调用 `check_phase_symmetry` 验证打点标记完整性
4. 调用 `check_failure_path` 验证失败路径审计等价（ADD-6）
5. **重型强制**：调用 `check_spec_sync` 确认 spec 文档与实际代码一致

**产出**：
- [ ] `tsc --noEmit` 通过
- [ ] `npm run lint` 通过
- [ ] 对称性验证通过
- [ ] 失败路径审计等价验证通过
- [ ] 验证并更新项目状态：`check_spec_sync` 通过，checklist.md 编译检查项已同步勾选

### §4.6 RAHS 闸门（下游执行健康度校验）

> **重型强制**：Step 4 各项检查完成后，调用 `check_rahs` 量化本轮注意力漂移程度。范围扩散 + 审计漏记 + 类型错误是最常见的漂移信号。

调用 `check_rahs({ planKeyword: "{planKeyword}" })`。

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入 Step 5 |
| 70–89 | 🟡 | 自检：范围扩散？审计漏记？类型错误？ |
| < 70 | 🔴 | 注意力漂移严重，返工回退 Step 3 |

- [ ] RAHS 已通过（≥ 90），可进入 Step 5

---

## Step 5：AI 自动合规检查

**目的**：扫描全部修改文件的 ADD-1~ADD-7 合规性。

**输入**：
- 全部修改文件的代码
- MCP 工具：`check_add_compliance`

**动作**：
1. 对每个修改文件调用 `check_add_compliance(code, projectPattern="event-based")`
2. 汇总合规报告，标注违规项和风险等级

**产出**：
- [ ] 验证并更新项目状态：合规报告已生成，违规项处理决策已记录
- [ ] 验证并更新项目状态：`checklist.md` ADD 规则合规检查项已同步勾选

---

## Step 6：从审计数据定位问题

> **仅当 Step 4/5 发现异常时进入。**

**目的**：根据审计日志定位问题根因。

**动作**：
1. 查询审计日志（`query_audit_logs` 或直接 grep）
2. 对照 Plan 验收到位情况

**产出**：
- [ ] 验证并更新项目状态：问题清单已记录（含文件路径和根因分析），已同步到 `tasks.md` 对应 Task 的异常标记

---

## Step 7：修复并验证

> **仅当 Step 6 发现问题时进入。**

**动作**：
1. 按问题优先级逐个修复
2. 修复后回到 Step 4 重新验证

**产出**：
- [ ] 验证并更新项目状态：所有问题已修复，`checklist.md` 回归验证项已重新勾选
- [ ] 验证并更新项目状态：Step 4/5 复验通过

---

## Step 8：收敛判断 + Handoff 更新 + Step 0 第二部分

**目的**：功能收敛判定，更新 Handoff，回到架构文档做最终校准。

**输入**：
- Handoff 文档
- 架构文档（`docs/*/knowledge/01-架构/`）
- `checklist.md` 最终状态

**动作**：
1. **收敛判断**：全部 `[T]` 项通过 + `[R]` 清单已生成 + RAHS ≥ 90 → 功能收敛
2. **RAHS 最终核定**：调用 `check_rahs({ planKeyword: "{planKeyword}" })`，RAHS ≥ 90 方可收敛，< 90 回退修复
3. **验证并更新项目状态**：`tasks.md` 全部 Task 已完成 + 全部子项已勾选，`checklist.md` 全部可验证项已勾选
4. **验证并更新项目状态**：调用 `check_spec_sync` 做最终交叉校验——Plan 预期、spec 勾选状态、git diff 实际变更、ADD-7 审计记录四者一致
5. **Handoff 更新**：更新 Handoff 的 §7（实际产出与偏离）、§8（验证结果）、§9（后置确认）
6. **Step 0 第二部分**：回架构文档做最终校准——验证 `{{docsDir}}/knowledge/01-架构/` 下相关文档已反映变更
7. **ADD-7 回查**：`query_audit_logs` 确认全部 `record_dev_operation` 记录已落库，按 action/targetId 交叉验证

**产出**：
- [ ] 验证并更新项目状态：收敛判定结果
- [ ] 验证并更新项目状态：`tasks.md` + `checklist.md` 全部完成项已勾选
- [ ] 验证并更新项目状态：`check_spec_sync` 四者一致确认
- [ ] 验证并更新项目状态：Handoff 已更新
- [ ] 验证并更新项目状态：架构文档已校准
- [ ] 验证并更新项目状态：ADD-7 审计记录已落库确认

---

## Step 9：Report Closure（运行时发现关闭 — 条件性操作）

**目的**：仅 runtime-fix plan 执行。关闭 gateway.md 运行时发现。

**输入**：
- `report-handoff-template.md`
- `gateway.md`

**动作**：
1. 按 `report-handoff-template.md` 在 handoff 中追加 Report Closure 章节
2. 在 gateway.md 中为被修复的发现追加 `- [x]` 标记
3. 运行 `npx tsx scripts/check-boundary-report.ts` 验证关闭

**产出**：
- [ ] 验证并更新项目状态：handoff 已追加 Report Closure 章节
- [ ] 验证并更新项目状态：gateway.md 发现已追加 `- [x]` 标记
- [ ] 验证并更新项目状态：`check-boundary-report.ts` 已关闭类型无残留

---

## 附录：文件清单

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| `path/to/file.ts` | MODIFY | Task N | TYPE | ⬜ |
