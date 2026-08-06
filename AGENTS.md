<!-- BEGIN:add-workflow-entry -->
# ADD 工作流入口

## 空白对话开局

每次新对话开始时，必须先调用 skills: `seesion_init` + mcp tools:`get_project_context({ scope: "add-state" })` 获取 ADD 工作流状态快照，然后根据返回的「待执行 ADD 操作」清单确定下一步。

## 开发执行

所有功能开发、Bug 修复、系统修改必须走 ADD 范式 10 阶段（Step 0-9）。使用 `add-paradigm` SKILL 进入工作流。DO NOT skip sub-steps.

## 关键 MCP 工具

| 工具 | 用途 | 触发时机 |
|------|------|---------|
| `get_project_context({ scope: "add-state" })` | ADD 工作流状态 + 待执行清单 | 空白对话开局 |
| `check_dps` | DPS 门禁（四维各 25%） | Step 0 末尾 |
| `check_add_route_status` | add-route 存在性校验 | Step 3 前 |

## 文档回流

0.6.5 卡位：Plan Review 的 P0/P1 问题必须在进入 Step 1 前回流至 Plan 体。未回流 = Review 白做。
<!-- END:add-workflow-entry -->

<!-- BEGIN:port-alloc -->
# 端口约定（跨项目事实源：`/home/xmm/ai/farm-agent/docs/ports.md`）

| 端口 | 服务 | 归属 | 状态 |
|:---:|------|------|------|
| 5434 | PG 主库（DATABASE_PORT） | add-coder | ✅ 独立实例 `add-coder-postgres`（2026-08-06 从共用分离） |
| 5437 | PG shadow（SHADOW_DB_PORT） | add-coder | ✅ 独立实例 `add-coder-shadow` |
| 5433 / 5435 | farm-agent 主库 / htc-g13-extra-time | 邻居/外部 | 勿占用 |

> 新增端口先查事实源登记表（`/home/xmm/ai/farm-agent/docs/ports.md`）。
<!-- END:port-alloc -->
