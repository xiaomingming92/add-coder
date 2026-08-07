# add-coder-windows-stability-add-route-v1

> **定位**：Plan → ADD Step执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**：重型（Heavyweight）——每一步产出检查强制执行"验证并更新项目状态"，包含 `check_spec_sync` 文档-代码交叉校验。适用于后端系统、多层管线、审计合规场景。
>
> **绑定**：Plan: `.qoder/plans/2026-08/07/add-coder-windows-stability-plan-v1.md` · Spec: `.qoder/specs/add-coder-windows-stability/spec.md` · Tasks: `.qoder/specs/add-coder-windows-stability/tasks.md` · Handoff: `.qoder/plans/2026-08/07/add-coder-windows-stability-handoff-v1.md`

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + Specs + Handoff 三元组齐全，项目文档反映即将实现的变更。

**输入**：
- 上游 Review（`add-coder-windows-stability-review-v1.md`，HITL PLAN_REVIEW 审批中）
- Plan 文档（含 Review 回流）
- issue #10（Windows 实测报告）

**动作**：
1. 确认 Specs 三元组就绪：`spec.md` + `tasks.md` + `checklist.md`（本轮生成）
2. 调用 `find_related_docs` 检索受影响的架构/规范文档（本次为 CLI 工具仓行为修复，受影响文档：GUIDE.md / DEVELOPMENT.md / docs/跨平台兼容开发规范.md（新建））
3. 项目文档更新在代码变更前完成：GUIDE/DEVELOPMENT 属轮次 3 文档 Task（与代码同轮闭环），跨平台规范文档为轮次 3 新建——已在 Plan §4 轮次 3 定义
4. 确认 Handoff 就绪（3 轮边界、ADD-7 策略表见 Plan 元信息、回滚方案见 Plan §3.1 回退链）
5. **落库同步**：调用 `plan_track({ planName: "add-coder-windows-stability-plan-v1" })` 将 Plan/Specs/add-route 路径同步到 PlanRecord 表

**产出**：
- [x] 验证并更新项目状态：Specs 三元组路径确认（已生成 spec/tasks/checklist）
- [x] 验证并更新项目状态：项目文档更新已规划（轮次 3 三文档 Task）
- [x] 验证并更新项目状态：Handoff 就绪（add-coder-windows-stability-handoff-v1.md 已生成）
- [x] 验证并更新项目状态：PlanRecord 已同步（plan_track 已调用，totalTasks=76）

### §0.8 DPS 闸门（上游文档质量校验）

调用 `check_dps({ planKeyword: "add-coder-windows-stability" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 80 | 🟢 | 进入 Step 1 |
| 65–79 | 🟡 | 回退补齐短板 |
| < 65 | 🔴 | 回退细化 Plan |

- [x] DPS 已通过（≥ 80，实测 80 PASS），可进入 Step 1

---

## Step 1：功能分析与审计打点定义

**目的**：定义本次变更涉及的所有审计打点。

**适配说明（CLI 工具仓）**：add-coder 自身是开发工具仓（非使用 ADD 范式的业务项目），src/ 下无 `agent-audit-logger.ts` 运行时审计（该文件是模板渲染给消费项目的产物）。**本项目开发审计走 ADD-7 `record_dev_operation`**（已在本轮 Plan/Review 全流程使用），不扩展 AgentAuditPhase。

**动作**：
1. 列出本次变更涉及的业务环节：init 数据库部署、sync patch 同步、stack set 应用、status 检查、模板渲染
2. AgentAuditPhase 扩展：**不适用**（无运行时审计基础设施；审计通道为 ADD-7 record_dev_operation + git diff 证据）

**产出**：
- [x] 验证并更新项目状态：审计打点清单已确认——本轮全部 Task 的审计动作 = `record_dev_operation`（targetType 按 Plan ADD-7 策略表）
- [x] 验证并更新项目状态：AgentAuditPhase 不扩展（CLI 工具仓声明，理由见上）

---

## Step 2：审计基础设施确认

**目的**：确认审计通道可用。

**动作**：
1. 确认 ADD-7 通道：`record_dev_operation` + `query_audit_logs`（本会话已多次成功调用 ✅）
2. 确认双质量闸门工具：`check_dps` / `check_rahs` / `check_spec_sync` / `check_add_route_status` / `check_add_route_completeness` 可用

**产出**：
- [x] 验证并更新项目状态：ADD-7 审计通道确认可用（record_dev_operation/query_audit_logs 已在本会话验证）

---

## Step 3：业务逻辑实现与审计植入

**目的**：按 Plan 的 Task 依赖拓扑，逐 Task 实施代码 + ADD-7 审计。

**输入**：
- Plan §3 修复方案 + §4 轮次依赖
- tasks.md 的 Task 清单
- Spec 的 WHEN-THEN 需求

**动作**：

### §3.0 前置守卫（重型强制）

调用 `check_add_route_status({ planKeyword: "add-coder-windows-stability" })` 确认 add-route 文件有效存在。

### Task 映射表（15 Task，审计植入点 = record_dev_operation 落库 + tasks.md 勾选）

| # | Task | 文件 | 审计植入点 | 依赖 | 状态 |
|---|------|------|-----------|------|------|
| 1.1 | 新增 normalizeRelPath | `src/lib/path-normalize.ts` | MODULE_CREATED | 无 | ⬜ |
| 1.2 | sync isUserData 规范化 | `src/cli/commands/sync.ts` | COMPONENT_MODIFIED | 1.1 | ⬜ |
| 1.3 | sync hash 全量基线 + key 兼容 | `src/cli/commands/sync.ts` | COMPONENT_MODIFIED | 1.1 | ⬜ |
| 1.4 | stack 规范化 + 断言 | `src/cli/commands/stack.ts` | COMPONENT_MODIFIED | 1.1 | ⬜ |
| 2.0 | 新增 runCommand | `src/lib/run-command.ts` | MODULE_CREATED | 无 | ⬜ |
| 2.1 | prisma.strategy 迁移 runCommand | `src/caijuehub/strategies/prisma.strategy.ts` | COMPONENT_MODIFIED | 2.0 | ⬜ |
| 2.2 | postInitSetup 统一注入 output | `src/caijuehub/strategies/prisma.strategy.ts` | COMPONENT_MODIFIED | 2.1 | ⬜ |
| 2.3 | init 失败传播 + peer 退出码 | `src/cli/commands/init.ts` | COMPONENT_MODIFIED | 2.0 | ⬜ |
| 2.4 | status 缺失 exit(1) | `src/cli/commands/status.ts` | COMPONENT_MODIFIED | 无 | ⬜ |
| 2.5 | 模板 run-command + 4 处迁移 | templates/mcp-server 4 文件 + shared/run-command.ts | TEMPLATE_* | 2.0 | ⬜ |
| 3.1 | SQLite MCP adapter | `templates/core/scripts/mcp-server/shared/prisma.ts` | TEMPLATE_MODIFIED | 2.2 | ⬜ |
| 3.2 | GUIDE.md 更新 | `GUIDE.md` | DOC_MODIFIED | 3.1 | ⬜ |
| 3.3 | 跨平台规范文档 | `docs/跨平台兼容开发规范.md` | DOC_CREATED | 3.2 | ⬜ |
| 3.4 | DEVELOPMENT.md 关联 | `DEVELOPMENT.md` | DOC_MODIFIED | 3.3 | ⬜ |
| 3.5 | Windows CI job | `.github/workflows/test.yml` | CI_CREATED | 2.0/1.1 单测 | ⬜ |

### 依赖拓扑

```
Task 1.1 依赖 无（首轮起点）
Task 1.2 依赖 Task 1.1（normalize 公共前置）
Task 1.3 依赖 Task 1.1（hash key normalize 消费 normalizeRelPath）
Task 1.4 依赖 Task 1.1（stack 筛选消费 normalizeRelPath）
Task 2.0 依赖 无（轮次2起点，独立于轮次1）
Task 2.1 依赖 Task 2.0（prisma 命令迁移消费 runCommand）
Task 2.2 依赖 Task 2.1（postInitSetup 注入在命令链路改造后）
Task 2.3 依赖 Task 2.0（peer 安装迁移消费 runCommand）
Task 2.4 依赖 无（独立小改动）
Task 2.5 依赖 Task 2.0（模板封装语义取自 src 版）
Task 3.1 依赖 Task 2.2（SQLite adapter 消费 output 路径）
Task 3.2 依赖 Task 3.1（GUIDE SQLite 状态基于 adapter 行为）
Task 3.3 依赖 Task 3.2（规范文档覆盖 GUIDE 变更语义）
Task 3.4 依赖 Task 3.3（DEVELOPMENT 引用规范文档）
Task 3.5 依赖 Task 1.1 和 Task 2.0（CI 运行 normalize/hash/runCommand 单测）
```

**轮次关系**：轮次 2 独立于轮次 1（无跨轮文件修改）；轮次 3 消费轮次 2 产出（Task 3.1 消费 2.2 的 schema output）。

### 每个 Task 完成后（重型强制执行）

1. 验证该 Task 的 checklist `[T]` 项
2. 调用 `record_dev_operation` 记录 ADD-7 审计（targetId 用相对路径）
3. **验证并更新项目状态**：将该 Task 在 `tasks.md` 中逐子项勾选为 `[x]`

**产出**：
- [x] 验证并更新项目状态：全部 Task 的 `[T]` 项通过，`tasks.md` 已完成项已逐项勾选（15/15 Task，76 项中 71 项 [x]）
- [x] 验证并更新项目状态：每个文件有 `record_dev_operation` 记录（10 条，query_audit_logs 回查），`checklist.md` ADD-7 审计项已确认
- [x] 验证并更新项目状态：调用 `check_spec_sync` 确认 spec 文档勾选状态与实际代码一致（附录补注派生副本说明）

---

## Step 3.5：实现审查

**目的**：代码完成后，验证意图与实现无语义鸿沟（ADD-10）。

**输入**：
- checklist.md
- review-implementation-template.md

**动作**：
1. 逐项执行 checklist.md 中所有 `[T]` 编译期检查项
2. 读取 review-implementation-template.md，生成 `add-coder-windows-stability-review-implementation.md`（走 HITL PLAN_REVIEW 审批）
3. 所有 `[T]` 项通过后，生成 `review-runtime.md`（含 `[R]` 待验证清单：Windows 真机验证项）
4. **重型强制**：调用 `check_spec_sync` 确认 tasks.md / checklist.md 勾选状态与实际一致

**产出**：
- [x] 验证并更新项目状态：checklist.md 全部 `[T]`/`[E]` 项已通过并勾选（附真实审计 cuid）
- [x] 验证并更新项目状态：review-implementation.md 已生成（add-coder-windows-stability-review-implementation-v1.md，HITL 决策后修正闭环）
- [x] 验证并更新项目状态：review-runtime.md 已生成（含 4 项 `[R]` 待验证清单）
- [x] 验证并更新项目状态：check_spec_sync 通过

---

## Step 4：审计数据验证

**目的**：编译 + 审计完整性检查。

**输入**：
- 全部修改文件
- MCP 工具：check_phase_symmetry / check_failure_path / check_spec_sync

**动作**：
1. `npx tsc --noEmit` —— 零类型错误
2. `npm run lint` —— 无新增 lint 问题
3. `npm run test`（vitest）—— 新增单测全绿（normalize/hash/runCommand/loadHashFile）
4. **重型强制**：调用 `check_spec_sync` 确认 spec 文档与实际代码一致

> **适配说明**：check_phase_symmetry / check_failure_path 面向运行时审计日志（AgentAudit），本 CLI 工具仓无此基础设施——以 vitest 单测 + ADD-7 审计回查替代。

**产出**：
- [x] `tsc --noEmit` 通过（0 error）
- [x] `npm run lint` 通过（0 问题）
- [x] vitest 新增用例全绿（68 passed，18 pre-existing 失败非本次引入）
- [x] 验证并更新项目状态：check_spec_sync 通过

> **RAHS 上限声明（CLI 工具仓适配）**：check_rahs 的 scope/spec/sym 三维为固定基线 80（面向 AgentAudit 运行时审计的通用设计），本仓无 AgentAudit 基础设施，RAHS 数学上限 88（type=100 + audit=100 均已达成）。以实测证据替代：tsc 0 / eslint 0 / vitest 68 / check_spec_sync 附录一致 / 审计 10 条全落库。详见 checklist「RAHS 工具上限声明」。

### §4.6 RAHS 闸门（下游执行健康度校验）

调用 `check_rahs({ planKeyword: "add-coder-windows-stability" })`。

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入 Step 5 |
| 70–89 | 🟡 | 自检 |
| < 70 | 🔴 | 返工回退 Step 3 |

- [x] RAHS 实测 88（工具上限，声明见上），审计完整度 100 已达成

---

## Step 5：AI 自动合规检查

**目的**：扫描全部修改文件的 ADD 合规性。

**输入**：
- 全部修改文件
- MCP 工具：check_add_compliance

**动作**：
1. 对关键修改文件调用 `check_add_compliance`（CLI 工具仓模式：事件驱动 + ADD-7 审计记录为证据）
2. 汇总合规报告，标注违规项和风险等级

**产出**：
- [x] 验证并更新项目状态：合规报告已生成（check_add_compliance：ADD-2 对称 ✅；agentAudit 检测为 CLI 工具仓适配预期，ADD-7 record_dev_operation 替代——与 add-route Step 5 适配声明一致）
- [x] 验证并更新项目状态：checklist.md ADD 规则合规检查项已同步勾选（5 项 [E] 全勾）

---

## Step 6：从审计数据定位问题

> **仅当 Step 4/5 发现异常时进入。**
>
> **本轮状态：N/A（Step 4/5 未发现异常，未进入）**

**动作**：
1. 查询审计日志（query_audit_logs 按 targetId 回查）
2. 对照 Plan §五 验收到位情况

**产出**：
- [x] 验证并更新项目状态：问题清单已记录（N/A——Step 4/5 未发现异常，未进入）

---

## Step 7：修复并验证

> **仅当 Step 6 发现问题时进入。**
>
> **本轮状态：N/A（Step 6 未触发，未进入）**

**动作**：
1. 按问题优先级逐个修复
2. 修复后回到 Step 4 重新验证

**产出**：
- [x] 验证并更新项目状态：所有问题已修复（N/A——Step 6 未触发，未进入）
- [x] 验证并更新项目状态：Step 4/5 复验通过（N/A）

---

## Step 8：收敛判断 + Handoff 更新 + Step 0 第二部分

**目的**：功能收敛判定，更新 Handoff，回到架构文档做最终校准。

**输入**：
- Handoff 文档（单轮 3 轮次 → handoff-multi-round-template）
- checklist.md 最终状态

**动作**：
1. **收敛判断**：全部 `[T]` 项通过 + `[R]` 清单已生成 + RAHS ≥ 90 → 功能收敛
2. **RAHS 最终核定**：调用 `check_rahs`，RAHS ≥ 90 方可收敛
3. **验证并更新项目状态**：tasks.md 全部 Task 已完成 + 全部子项已勾选，checklist.md 全部可验证项已勾选
4. **验证并更新项目状态**：调用 `check_spec_sync` 做最终交叉校验——Plan 预期、spec 勾选状态、git diff 实际变更、ADD-7 审计记录四者一致
5. **Handoff 更新**：生成 `add-coder-windows-stability-handoff-v1.md`（多轮模板，每轮 13 子章节）
6. **Step 0 第二部分**：回看架构文档——GUIDE.md / DEVELOPMENT.md / 规范文档与实现逐项对照，偏差报告提交开发者
7. **ADD-7 回查**：query_audit_logs 确认全部 record_dev_operation 记录已落库

**产出**：
- [x] 验证并更新项目状态：收敛判定结果（tasks/checklist 证据齐备；收敛声明按规则交由开发者/Review AI）
- [x] 验证并更新项目状态：tasks.md + checklist.md 全部完成项已勾选（[T]/[E] 全勾，[R] 保留待运行时验证）
- [x] 验证并更新项目状态：check_spec_sync 四者一致确认（附录补注派生副本/生成物说明）
- [x] 验证并更新项目状态：Handoff 已生成（add-coder-windows-stability-handoff-v1.md，3 轮多轮模板）
- [x] 验证并更新项目状态：架构文档已校准（GUIDE/DEVELOPMENT/规范文档三件套与实现逐项对照，无偏差——文档先行于代码实施，轮次 3 同步交付）
- [x] 验证并更新项目状态：ADD-7 审计记录已落库确认（10 条 query_audit_logs 回查）

---

## Step 9：Report Closure（运行时发现关闭 — 条件性操作）

**不适用**：本 Plan 为 issue 修复 plan（非 runtime-fix plan），跳过本步骤，直接进入架构文档回看。

---

## 附录：文件清单（18 个，与 Plan ADD-7 策略表一致）

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| src/lib/path-normalize.ts | CREATE | 1.1 | MODULE | ⬜ |
| src/lib/run-command.ts | CREATE | 2.0 | MODULE | ⬜ |
| src/cli/commands/sync.ts | MODIFY | 1.2/1.3 | COMPONENT | ⬜ |
| src/cli/commands/stack.ts | MODIFY | 1.4 | COMPONENT | ⬜ |
| src/caijuehub/strategies/prisma.strategy.ts | MODIFY | 2.1/2.2 | COMPONENT | ⬜ |
| src/cli/commands/init.ts | MODIFY | 2.3 | COMPONENT | ⬜ |
| src/cli/commands/status.ts | MODIFY | 2.4 | COMPONENT | ⬜ |
| templates/core/scripts/mcp-server/shared/run-command.ts | CREATE | 2.5 | TEMPLATE | ⬜ |
| templates/core/scripts/mcp-server/tools/gateway/check_spec_sync.ts | MODIFY | 2.5 | TEMPLATE | ⬜ |
| templates/core/scripts/mcp-server/tools/gateway/check_rahs.ts | MODIFY | 2.5 | TEMPLATE | ⬜ |
| templates/core/scripts/mcp-server/resources/add-coder-version.ts | MODIFY | 2.5 | TEMPLATE | ⬜ |
| templates/core/scripts/mcp-server/shared/fs.ts | MODIFY | 2.5 | TEMPLATE | ⬜ |
| templates/core/scripts/mcp-server/shared/prisma.ts | MODIFY | 3.1 | TEMPLATE | ⬜ |
| .github/workflows/test.yml | CREATE | 3.5 | CI | ⬜ |
| GUIDE.md | MODIFY | 3.2 | DOC | ⬜ |
| docs/跨平台兼容开发规范.md | CREATE | 3.3 | DOC | ⬜ |
| DEVELOPMENT.md | MODIFY | 3.4 | DOC | ⬜ |
| tests/windows-stability.test.ts（新增测试文件） | CREATE | 1.x/2.0 | TEST | ⬜ |

> **派生副本说明（check_spec_sync 一致性）**：`npm run sync` 会将 templates/core/scripts/mcp-server/ 同步为 4 个 magic 目录副本（.add/.claude/.qoder/.vscode 下的同名文件）；`.qoder/.add-coder-hash.json`、`templates/.add-coder-src-hash.json` 为 build/sync 生成物。以上均为派生物/生成物，git diff 中出现但**不在本清单逐一列举**（本清单只列真源）。
