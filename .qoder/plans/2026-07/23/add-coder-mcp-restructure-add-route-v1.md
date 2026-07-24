# add-coder-mcp-restructure-add-route-v1

> **定位**：Plan → ADD Step 执行映射。重型模式——每步产出检查强制执行"验证并更新项目状态"。
>
> **绑定**：Plan: `.qoder/plans/2026-07/23/add-coder-mcp-restructure-plan-v1.md` · Spec: `.qoder/specs/mcp-restructure/spec.md` · Tasks: `.qoder/specs/mcp-restructure/tasks.md` · Handoff: `.qoder/plans/2026-07/23/add-coder-mcp-restructure-handoff-v1.md`

---

## Step 0：文档先行

**输入**：Plan（已确认 HITL）· README.md（已更新六能力架构）· GUIDE.md/DEVELOPMENT.md（流程已同步）

**动作**：
1. 确认 Specs 三元组就绪（待创建）
2. 调用 `find_related_docs` 检索受影响的架构文档 ✅
3. 项目文档已更新：README.md §MCP 审计工具链 已更新为六能力架构 ✅
4. Handoff 待生成（Step 8）

**产出**：
- [x] Specs 三元组路径：`.qoder/specs/mcp-restructure/`
- [x] 项目文档已更新（README.md 六能力架构）
- [ ] Handoff 就绪（Step 8 生成）

### §0.8 DPS 闸门

调用 `check_dps({ planKeyword: "mcp-restructure" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 85 | 🟢 | 进入 Step 1 |
| 70–84 | 🟡 | 回退补齐 |
| < 70 | 🔴 | 回退细化 Plan |

- [ ] DPS 已通过（≥ 85）

---

## Step 1：功能分析

**变更类型**：纯架构重构（不涉及运行时审计打点）。无需扩展 `AgentAuditPhase`。

**产出**：
- [ ] 本次无需扩展审计阶段（纯结构重构，不涉及业务运行时审计），理由已记录

---

## Step 2：审计基础设施确认

**说明**：本项目使用 `agentAudit()` 用于运行时审计。本次重构是 build tool 层级变更，不涉及运行时审计日志通道变更。

**产出**：
- [ ] `agentAudit()` 通道已确认可用（不受本次变更影响）

---

## Step 3：业务逻辑实现与审计植入

### §3.0 前置守卫

调用 `check_add_route_status({ planKeyword: "mcp-restructure" })`。

- [ ] 前置守卫通过（normal 或 warn）

### Task 映射表

| # | Task | 文件 | 审计植入点 | 新增 | 依赖 | 状态 |
|---|------|------|-----------|------|------|------|
| 1.1 | 抽取共享类型 | `mcp-server/types.ts`（新建） | 无（纯类型定义） | — | 无 | ⬜ |
| 1.2 | 抽取环境模块 | `mcp-server/shared/env.ts`（新建） | 无 | — | 1.1 | ⬜ |
| 1.3 | 抽取 Prisma 模块 | `mcp-server/shared/prisma.ts`（新建） | 无 | — | 1.1 | ⬜ |
| 1.4 | 抽取响应模块 | `mcp-server/shared/response.ts`（新建） | 无 | — | 1.1 | ⬜ |
| 1.5 | 抽取文件模块 | `mcp-server/shared/fs.ts`（新建） | 无 | — | 1.1 | ⬜ |
| 2.1 | 上下文查询组 | `mcp-server/tools/context.ts`（新建） | `record_dev_operation` | — | 1.3,1.4 | ⬜ |
| 2.2 | 审计记录组 | `mcp-server/tools/audit.ts`（新建） | `record_dev_operation` | — | 1.3 | ⬜ |
| 2.3 | 文档检索组 | `mcp-server/tools/docs.ts`（新建） | 无 | — | 1.5 | ⬜ |
| 2.4 | 代码质量组 | `mcp-server/tools/quality.ts`（新建） | 无 | — | 1.5 | ⬜ |
| 2.5 | 门禁守卫组 | `mcp-server/tools/gateway.ts`（新建） | 无 | — | 1.3,1.5 | ⬜ |
| 2.6 | 统一注册表 | `mcp-server/tools/index.ts`（新建） | `record_dev_operation` | — | 2.1-2.5 | ⬜ |
| 3.1 | 重写入口壳 | `mcp-server.ts`（修改） | `record_dev_operation` | — | 2.6 | ⬜ |
| 3.2 | 总入口 | `mcp-server/index.ts`（新建） | `record_dev_operation` | — | 3.1 | ⬜ |
| 4.1 | ADD 状态资源 | `mcp-server/resources/add-state.ts`（新建） | `record_dev_operation` | — | 3.2 | ⬜ |
| 4.2 | 轮次 Task 资源 | `mcp-server/resources/round-task.ts`（新建） | 无 | — | 3.2 | ⬜ |
| 4.3 | 版本资源 | `mcp-server/resources/add-coder-version.ts`（新建） | 无 | — | 3.2 | ⬜ |
| 4.4 | 资源注册 | `mcp-server/resources/index.ts`（新建） | `record_dev_operation` | — | 4.1-4.3 | ⬜ |
| 4.5 | HITL 通知 | `mcp-server/notifications/hitl.ts`（新建） | 无 | — | 3.2 | ⬜ |
| 4.6 | Hook 通知 | `mcp-server/notifications/hook.ts`（新建） | 无 | — | 3.2 | ⬜ |
| 4.7 | 通知注册 | `mcp-server/notifications/index.ts`（新建） | `record_dev_operation` | — | 4.5-4.6 | ⬜ |
| 5.1 | Review 回调 | `mcp-server/sampling/review.ts`（新建） | 无 | — | 3.2 | ⬜ |
| 5.2 | Sampling 注册 | `mcp-server/sampling/index.ts`（新建） | `record_dev_operation` | — | 5.1 | ⬜ |
| 5.3 | 确认/风险 | `mcp-server/elicitation/confirm.ts`（新建） | 无 | — | 3.2 | ⬜ |
| 5.4 | Elicitation 注册 | `mcp-server/elicitation/index.ts`（新建） | `record_dev_operation` | — | 5.3 | ⬜ |
| 6.1 | 任务执行器 | `mcp-server/tasks/runner.ts`（新建） | `record_dev_operation` | — | 3.2 | ⬜ |
| 6.2 | 结果持久化 | `mcp-server/tasks/store.ts`（新建） | `record_dev_operation` | — | 1.3 | ⬜ |
| 6.3 | Tasks 注册 | `mcp-server/tasks/index.ts`（新建） | `record_dev_operation` | — | 6.1-6.2 | ⬜ |

### 依赖拓扑

```
轮次 1: 1.1 → 1.2,1.3,1.4,1.5（并行）
轮次 2: 2.1..2.5（并行） → 2.6
轮次 3: 2.6 → 3.1 → 3.2
轮次 4: 3.2 → 4.1..4.3（并行） → 4.4 ┐
         3.2 → 4.5,4.6（并行） → 4.7 ─┤ 轮次 4 内部串行
轮次 5: 3.2 → 5.1→5.2 ∥ 5.3→5.4（两组并行）
轮次 6: 3.2 → 6.1∥6.2 → 6.3
```

**产出**：
- [ ] 全部 26 个新文件创建 + 1 个修改完成
- [ ] `tsc --noEmit` 通过
- [ ] `record_dev_operation` 覆盖全部文件
- [ ] `check_add_route_completeness` 返回 complete

---

## Step 3.5：实现审查

- [ ] `review-implementation.md` 已生成
- [ ] `review-runtime.md` 已生成

---

## Step 4：审计数据验证

- [ ] `tsc --noEmit` 通过
- [ ] 阶段对称性：N/A（无运行时审计阶段变更）
- [ ] 失败路径审计：N/A

### §4.6 RAHS 闸门

调用 `check_rahs({ planKeyword: "mcp-restructure" })`。

- [ ] RAHS ≥ 90

---

## Step 5：AI 自动合规检查

- [ ] 合规报告已生成

---

## Step 8：收敛判断 + Handoff

- [ ] 收敛条件满足
- [ ] RAHS 最终核定 ≥ 90
- [ ] Handoff 已生成
- [ ] ADD-7 审计记录已落库确认

---

## 附录：文件清单

| 文件 | 操作 | Task | targetType | ADD-7 |
|------|------|------|-----------|-------|
| `templates/core/scripts/mcp-server.ts` | MODIFY | 3.1 | COMPONENT | ⬜ |
| `mcp-server/types.ts` | CREATE | 1.1 | COMPONENT | ⬜ |
| `mcp-server/shared/env.ts` | CREATE | 1.2 | COMPONENT | ⬜ |
| `mcp-server/shared/prisma.ts` | CREATE | 1.3 | COMPONENT | ⬜ |
| `mcp-server/shared/response.ts` | CREATE | 1.4 | COMPONENT | ⬜ |
| `mcp-server/shared/fs.ts` | CREATE | 1.5 | COMPONENT | ⬜ |
| `mcp-server/tools/context.ts` | CREATE | 2.1 | COMPONENT | ⬜ |
| `mcp-server/tools/audit.ts` | CREATE | 2.2 | COMPONENT | ⬜ |
| `mcp-server/tools/docs.ts` | CREATE | 2.3 | COMPONENT | ⬜ |
| `mcp-server/tools/quality.ts` | CREATE | 2.4 | COMPONENT | ⬜ |
| `mcp-server/tools/gateway.ts` | CREATE | 2.5 | COMPONENT | ⬜ |
| `mcp-server/tools/index.ts` | CREATE | 2.6 | COMPONENT | ⬜ |
| `mcp-server/resources/add-state.ts` | CREATE | 4.1 | COMPONENT | ⬜ |
| `mcp-server/resources/round-task.ts` | CREATE | 4.2 | COMPONENT | ⬜ |
| `mcp-server/resources/add-coder-version.ts` | CREATE | 4.3 | COMPONENT | ⬜ |
| `mcp-server/resources/index.ts` | CREATE | 4.4 | COMPONENT | ⬜ |
| `mcp-server/notifications/hitl.ts` | CREATE | 4.5 | COMPONENT | ⬜ |
| `mcp-server/notifications/hook.ts` | CREATE | 4.6 | COMPONENT | ⬜ |
| `mcp-server/notifications/index.ts` | CREATE | 4.7 | COMPONENT | ⬜ |
| `mcp-server/sampling/review.ts` | CREATE | 5.1 | COMPONENT | ⬜ |
| `mcp-server/sampling/index.ts` | CREATE | 5.2 | COMPONENT | ⬜ |
| `mcp-server/elicitation/confirm.ts` | CREATE | 5.3 | COMPONENT | ⬜ |
| `mcp-server/elicitation/index.ts` | CREATE | 5.4 | COMPONENT | ⬜ |
| `mcp-server/tasks/runner.ts` | CREATE | 6.1 | COMPONENT | ⬜ |
| `mcp-server/tasks/store.ts` | CREATE | 6.2 | COMPONENT | ⬜ |
| `mcp-server/tasks/index.ts` | CREATE | 6.3 | COMPONENT | ⬜ |
| `mcp-server/index.ts` | CREATE | 3.2 | COMPONENT | ⬜ |
