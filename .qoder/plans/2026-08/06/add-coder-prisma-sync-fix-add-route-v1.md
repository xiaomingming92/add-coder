# add-coder-prisma-sync-fix-add-route-v1

> **定位**: Plan → ADD Step 执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**: 轻量（Lightweight）——单轮、3 文件 Bug 修复，无跨模块架构影响。
>
> **绑定**: Plan: `.qoder/plans/2026-08/06/add-coder-prisma-sync-fix-plan-v1.md` · Spec: `.qoder/specs/add-coder-prisma-sync-fix/spec.md` · Tasks: `.qoder/specs/add-coder-prisma-sync-fix/tasks.md` · Checklist: `.qoder/specs/add-coder-prisma-sync-fix/checklist.md` · Handoff: `.qoder/plans/2026-08/06/add-coder-prisma-sync-fix-handoff-v1.md`（待生成）

---

## Step 0：文档先行（Documentation First）

**目的**: 代码动工前，确认 Plan + Specs 就绪，HITL 已 tongyi。

**输入**:
- HITL: TONGYI（2026-08-06，round 1，6 维度）
- Plan: `add-coder-prisma-sync-fix-plan-v1.md`（Review P0-1/P1-2/P1-3 已回流）
- Specs 三元组: `.qoder/specs/add-coder-prisma-sync-fix/`（spec.md + tasks.md + checklist.md）

**动作**:
1. ✅ Specs 三元组就绪
2. ✅ Review 回流完成（0.6.5 闭环）
3. ✅ 缺陷报告登记（prisma-sync-defects-report.md，RPT-20260806-01/02/03）
4. 落库同步：调用 `plan_track({ planName: "add-coder-prisma-sync-fix-plan-v1" })`

**产出**:
- [x] Specs 三元组路径确认
- [x] Review 3 发现已回流（0.6.5 闭环）
- [x] PlanRecord 已同步（plan_track）

### §0.8 DPS 闸门（上游文档质量校验）

调用 `check_dps({ planKeyword: "add-coder-prisma-sync-fix" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 80 | 🟢 | 进入 Step 1 |
| 65–79 | 🟡 | 回退补齐短板 |
| < 65 | 🔴 | 回退细化 Plan |

- [x] DPS 已通过（≥ 80，实际 82），可进入 Step 1

---

## Step 1：功能分析与审计打点定义

**范围**（本 Plan 的审计打点 = ADD-7 策略表 5 项）：

| 打点 | 文件 | action | 触发时机 |
|------|------|--------|---------|
| P1 | `src/cli/writer.ts` | COMPONENT_FIXED | parseSchemaBlocks 重写完成 |
| P2 | `src/cli/commands/sync.ts` | COMPONENT_FIXED | injectFieldLines/getBaseFieldLines 修复完成 |
| P3 | `src/cli/commands/sync.ts` | COMPONENT_FIXED | 导出面变更完成 |
| P4 | `tests/prisma-sync.test.ts` | TEST_CREATED | 测试文件创建 |
| P5 | `dist/` | BUILD_REBUILT | npm run build 完成 |

---

## Step 2：审计基础设施确认

- [x] add-coder-tools MCP 可用（record_dev_operation / query_audit_logs / check_dps / check_rahs）
- [x] DB 连接：add-coder-postgres（5434）healthy

---

## Step 3：业务逻辑实现与审计植入

### Task 映射表

| Task | 文件 | Spec | 依赖 | 审计打点 |
|------|------|------|------|---------|
| 1.1 | `src/cli/writer.ts` | §1 | — | P1 |
| 1.2 | `src/cli/commands/sync.ts` | §2 | 依赖 Task 1.1 | P2 |
| 1.3 | `src/cli/writer.ts` + `src/cli/commands/sync.ts` | §1/§2 | 依赖 Task 1.2 | P3 |
| 1.4 | `tests/prisma-sync.test.ts` | §3 | 依赖 Task 1.3 | P4 |
| 1.5 | `dist/` | §4 | 依赖 Task 1.4 | P5 |
| 1.6 | 现场回归（farm-agent） | §4 | 依赖 Task 1.5 | —（验证性） |

### Task Dependencies

```text
Task 1.1 依赖 无（根任务）
Task 1.2 依赖 Task 1.1（parseSchemaBlocks 重写 → 注入修复）
Task 1.3 依赖 Task 1.2（注入修复 → 导出面）
Task 1.4 依赖 Task 1.3（导出面 → 测试）
Task 1.5 依赖 Task 1.4（测试通过 → dist 重建）
Task 1.6 依赖 Task 1.5（dist 重建 → 现场回归）
```

### 依赖拓扑

```text
1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
（parseSchemaBlocks → 注入修复 → 导出 → 测试 → build → 现场回归）
```

### 每个 Task 完成后

- [ ] `npx tsc --noEmit` 增量通过
- [ ] 调用 `record_dev_operation` 记录（按打点表）

---

## Step 3.5：实现审查

- [ ] Review 发现回归：P0-1 enum 注入非 0 计数 / P1-2 导出可 import / P1-3 文档引用修正
- [ ] 代码风格：与现有 sync.ts/writer.ts 一致（无 any、无未用变量）
- [ ] 测试隔离：vitest 单文件运行，不触发 DATABASE_URL

---

## Step 4：审计数据验证

- [ ] `query_audit_logs({ planKeyword: "add-coder-prisma-sync-fix" })` 返回 ≥5 条记录
- [ ] 审计 action 与 Step 1 打点表一致

---

## Step 5：AI 自动合规检查

- [ ] `check_rahs({ planKeyword: "add-coder-prisma-sync-fix" })` 通过（≥ 80）
- [ ] checklist.md 全量勾选

---

## Step 6：从审计数据定位问题

- [ ] 无未关闭发现；如出现 → 记录 runtime report 并回退修正
