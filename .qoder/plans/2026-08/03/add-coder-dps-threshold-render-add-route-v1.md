# add-coder-dps-threshold-render-add-route-v1

> **定位**：Plan → ADD Step 执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **绑定**：Plan: `.qoder/plans/2026-08/03/add-coder-dps-threshold-render-plan-v1.md` · Spec: `.qoder/specs/add-coder-dps-threshold-render/spec.md` · Tasks: `.qoder/specs/add-coder-dps-threshold-render/tasks.md` · Handoff: `.qoder/plans/2026-08/03/add-coder-dps-threshold-render-handoff-v1.md`

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + Specs + Handoff 三元组齐全，项目文档反映即将实现的变更。

**输入**：
- 上游 Review（add-coder-dps-threshold-render-review-v1，复审通过）
- Plan v1 修订版（P1/P2 全落定）
- docs/caijuehub.md（受影响文档，Task 2.1 声明式化范围）

**动作**：
1. 确认 Specs 三元组就绪：`spec.md` + `tasks.md` + `checklist.md`（本 add-route 之后补建）
2. 调用 `find_related_docs` 检索受影响的架构/规范/需求文档 → `docs/caijuehub.md`、README.md、GUIDE.md、SKILL/vocabulary/rules 模板
3. 项目文档更新范围：Task 2.1（README/GUIDE/caijuehub.md 声明式）——本轮实施
4. 确认 Handoff 就绪（含 round 边界、ADD-7 策略表、回滚方案）——Step 8 生成
5. **落库同步**：调用 `plan_track({ planName: "add-coder-dps-threshold-render-plan-v1" })`

**产出**：
- [x] Plan 修订版 + Review 复审通过（P1 归零）
- [ ] Specs 三元组路径确认（本 add-route 后补建）
- [ ] 项目文档更新（Task 2.1 实施时）
- [ ] Handoff 就绪（Step 8 生成）
- [ ] PlanRecord 已同步（plan_track 已调用）

---

## Step 1：功能分析与审计打点定义

**目的**：定义本次变更涉及的所有审计打点，扩展 `AgentAuditPhase`。

**输入**：
- Plan §3 Task 列表
- `src/lib/agent-audit-logger.ts` 当前 `AgentAuditPhase` 联合类型

**动作**：
1. 列出本次变更涉及的所有业务环节：renderer 占位符注入、check_dps 描述动态化、模板占位符化、文档声明式、sync 验证
2. 审计打点：本任务为文案/渲染层改动，**无需新增 AgentAuditPhase 字面量**（沿用 TEMPLATE_UPDATED / COMPONENT_UPDATED / DOC_UPDATED，Plan ADD-7 表已列）

**产出**：
- [x] 审计打点清单：沿用 ADD-7 表 8 行（含 2 行豁免），无需新字面量

---

## Step 2：审计基础设施确认

**目的**：确认 `agentAudit()` 通道可用，无需新建 logger 文件。

**输入**：
- `src/lib/agent-audit-logger.ts`

**动作**：
1. 确认 `agentAudit()` 可用（add-coder 自身已接入）
2. 本任务审计记录：record_dev_operation 按 Task 落库（每 Task 完成时记录）

**产出**：
- [x] 审计通道可用（无需新建）
- [ ] 每 Task 完成时 record_dev_operation 落库（实施时执行）

---

## Step 3：业务逻辑实现（本 Plan 核心）

**目的**：按 Plan §3.3 Task 清单实施。

**动作**（Plan Task 映射）：
| ADD 动作 | Plan Task | 内容 |
|---------|-----------|------|
| renderer 扩展 | 1.1 | `src/core/renderer.ts` 支持 `{{dpsPass}}`/`{{dpsWarn}}` 占位符（直读 TOML `[thresholds]`，P1-1） |
| MCP 描述动态化 | 1.2 | `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` description 改 `${CFG.THRESHOLD_PASS}` |
| 模板占位符化 | 1.3 | 28 处（core 14 + adapters 10）"≥ 85" → `{{dpsPass}}` |
| 豁免边界 | 1.5 | gateway.backup ×1、模板内历史 add-route ×2 不改不删，写入本 add-route 边界 |
| 文档声明式 | 2.1 | README 中英 2 + GUIDE 2 + docs/caijuehub.md 1 共 5 处 |
| 分发验证 | 2.2 | pnpm build（如需）+ gen-src-hash + 用户项目 sync --patch |
| 缺陷记录 | 2.4 | plan.ts `.hitl` 过滤缺陷记录边界（独立任务） |

**边界（豁免清单）**：
- `templates/core/scripts/mcp-server/tools/gateway.backup`（历史备份，不改不删）
- `templates/core/plans/2026-07/08/add-coder-npm-package-add-route-v1.md`（历史归档，不改不删）
- `.qoder/plans`、`.qoder/specs` 历史记录（不改）

**Task 依赖声明**：
- Task 1.1: 依赖 无
- Task 1.2: 依赖 无
- Task 1.3: 依赖 Task 1.1（占位符化需 renderer 先支持注入）
- Task 1.4: 依赖 Task 1.3（同步验证需模板已占位符化）
- Task 1.5: 依赖 无
- Task 2.1: 依赖 Task 1.4（文档声明式在模板链路稳定后）
- Task 2.2: 依赖 Task 1.4（分发验证需自身同步通过）
- Task 2.3: 依赖 Task 2.1, Task 2.2（全链归零在文档与分发完成后）
- Task 2.4: 依赖 无

**产出**：
- [ ] renderer 占位符注入（Task 1.1）
- [ ] check_dps description 动态化（Task 1.2）
- [ ] 28 处模板占位符化（Task 1.3）
- [ ] 豁免边界声明（Task 1.5）
- [ ] 文档 5 处声明式（Task 2.1）
- [ ] 分发验证通过（Task 2.2）

---

## Step 3.5：实现审查

**目的**：跑 checklist [T] 项 → 生成 review-implementation。

**动作**：
1. 逐项验证 checklist（编译/渲染/同步）
2. 生成 `.qoder/reviews/add-coder-dps-threshold-render-review-implementation-v1.md`

**产出**：
- [ ] checklist [T]/[E] 项全绿
- [ ] review-implementation 已生成

---

## Step 4：审计验证

**目的**：阶段对称性 + 失败路径 + RAHS 门禁。

**动作**：
1. 阶段对称性检查：Plan Task ↔ add-route ↔ checklist 一一对应
2. 失败路径：`check_failure_path`（占位符残留 / build 缺失 / 分发滞后）
3. RAHS：`check_rahs({ planKeyword: "add-coder-dps-threshold-render" })` ≥ 90

**产出**：
- [ ] 阶段对称性通过
- [ ] 失败路径审计等价
- [ ] RAHS ≥ 90

---

## Step 5：合规检查

**目的**：AI 自动检查 ADD 原则。

**动作**：
1. ADD-7 审计完整性（每文件 record_dev_operation 落库）
2. 唯一真源合规（只改 templates/ 真源，副本经 sync 分发）
3. 边界合规（豁免清单未触碰）

**产出**：
- [ ] ADD-7 审计完整
- [ ] 真源原则合规
- [ ] 边界合规

---

## Step 6：定位问题

**目的**：从审计数据推断根因（如存在失败项）。

**动作**：
1. 查询 `query_audit_logs({ planKeyword: "add-coder-dps-threshold-render" })`
2. 对失败项做根因分析

**产出**：
- [ ] 失败项根因分析（如有）

---

## Step 7：修复验证

**目的**：修复 → 重新验证。

**动作**：按根因修复，重跑对应 Task 验收项。

**产出**：
- [ ] 修复项重新验证通过（如有）

---

## Step 8：收敛判断

**目的**：devlog + handoff + 架构回看。

**动作**：
1. 写 devlog（`record_dev_operation` 全量回查）
2. 生成 handoff：`.qoder/plans/2026-08/03/add-coder-dps-threshold-render-handoff-v1.md`
3. 架构回看：单真源链路闭环（TOML → renderer → 模板 → 副本 → 用户项目）

**产出**：
- [ ] devlog 完整
- [ ] handoff 已生成（兑现 Plan 元信息引用）
- [ ] 架构回看结论：全链单一真源成立

---

## Step 9：Report Closure

**目的**：关闭 gateway 发现。

**动作**：
1. `check_hook_events` 回查拦截记录
2. 无未闭合发现 → 关闭

**产出**：
- [ ] 无未闭合发现
- [ ] Plan 闭环（ROUND_CLOSED）
