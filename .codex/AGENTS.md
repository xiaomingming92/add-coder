<!-- BEGIN:add-workflow-entry -->
# ADD 工作流入口

> 本文件由 add-coder 模板为项目 `add-coder` 渲染生成（真源 `templates/core/AGENTS.md`），占位符按项目的 `.codex` 展开。
> **改动请改真源**，再执行 `npx add-coder sync`；不要只改本文件（下次同步会覆盖）。

## 空白对话开局

每次新对话开始时，必须先调用 skills: `session-init` + mcp tools: `get_project_context({ scope: "add-state" })` 获取 ADD 工作流状态快照，然后根据返回的「待执行 ADD 操作」清单确定下一步。

## 开发执行

所有功能开发、Bug 修复、系统修改必须走 ADD 范式 10 阶段（Step 0-9）。使用 `add-paradigm` SKILL 进入工作流。DO NOT skip sub-steps.

### Step 3 执行风格（`executionMode`）

在 Plan 元信息声明，二选一（缺省 `stepwise`）：

| 取值 | 行为 | HITL 触点 |
|------|------|-----------|
| `stepwise`（默认） | 逐轮逐 Task 单步：每个 Task 完成后停下等人确认 | 每个 Task 后 |
| `delegated`（托管） | 连续实施该轮全部 Task，**不逐步同步进度** | 仅停止条件触发时 |

**托管不降低 ADD 合规度**：每个 Task 的 `record_dev_operation` 落库、`tasks.md` 逐子项勾选、`[T]` 验证、闸门取证、Step 3.5 / Step 0.6.5 / Step 8 一律照做；且**不得自动关闭 Plan**（关闭走 `plan_update` 人类确认）。

**两个停止条件**（可判定，用既有工具取证）：①文档与代码不对齐：`check_spec_sync` 出现未归因漂移，或实现偏离 Plan/Spec 的 WHEN-THEN；②代码基线低于预期：`npx tsc --noEmit` / `pnpm test` / `npx tsx scripts/validate-docs.ts` 任一失败，或 `check_dps < 80` / `check_rahs < 90`。

## 关键 MCP 工具

| 工具 | 用途 | 触发时机 |
|------|------|---------|
| `get_project_context({ scope: "add-state" })` | ADD 工作流状态 + 待执行清单 | 空白对话开局 |
| `check_dps` | DPS 门禁（四维各 25%） | Step 0 末尾 |
| `check_rahs` | RAHS 门禁（收敛前核定） | Step 4.6 / Step 8 |
| `check_add_route_status` | add-route 存在性校验 | Step 3 前 |
| `plan_update` | Plan 生命周期关闭/重开（唯一入口） | 收敛后关闭 / PUL 重开 |
| `refresh_memory_snapshots` | 刷新 L1/L2 记忆快照 | 会话注入缺数据时 |

## 文档回流

Plan Review 的 P0/P1 问题必须在进入 Step 1 前回流至 Plan 体（0.6.5 卡位）。未回流 = Review 白做。

## 端口约定

如本项目与其他项目共享宿主端口，**先查事实源登记表**再占用；项目内端口约定统一记录在 `.codex/rules/` 或项目 `docs/ports.md`，禁止在本文件里维护第二份端口清单。
<!-- END:add-workflow-entry -->
