# add-coder-hook-notify-upgrade-add-route-v1

> **定位**：Plan → ADD Step 执行映射。绑定 Plan: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-plan-v1.md`

---

## Step 0：文档先行

**输入**：Plan（HITL 已确认）✅

**产出**：
- [x] 变更影响范围已分析
- [x] 关键文件已阅读（pre-tool-use.sh, audit.ts, notifications/hook.ts, detect_active_add）
- [x] capabilities-and-debugging.md 已更新 §2.5
- [x] add-route 已生成（本文件）
- [x] 文档合约一致性已确认

---

## Step 1-2：功能分析 + 审计基础设施

本次变更纯 bash（hooks）+ TypeScript（MCP Server），无需扩展审计阶段或新建 logger。Step 1-2 快速确认通过。

---

## Step 3：代码实现（3 轮）

### 轮次 1: core hooks + lib/notify.sh

| Task | 文件 | 操作 | 改动描述 |
|------|------|:---:|------|
| 1.1 | `templates/core/hooks/lib/notify.sh` | 新建 | write_hook_event 函数（6 字段 jsonl + rotate） |
| 1.2 | `templates/core/hooks/pre-tool-use.sh` | 修改 | exit 2 前追加 source + write_hook_event + detect_active_add |
| 1.3 | `templates/core/hooks/doc-format-guard.sh` | 修改 | 同上 |
| 1.4 | core hooks 其余文件 | 修改 | 同上 |

验证: `source lib/notify.sh && write_hook_event` 写 jsonl 成功

### 轮次 2: 5 adapter hooks

| Task | 目录 | 操作 | 文件数 |
|------|------|:---:|:---:|
| 2.1 | `templates/adapters/qoder/hooks/` | 批量追加 | 14 |
| 2.2 | `templates/adapters/claude/hooks/` | 批量追加 | 14 |
| 2.3 | `templates/adapters/vscode/hooks/` | 批量追加 | 11 |
| 2.4 | `templates/adapters/trae/hooks/` | 批量追加 | 14 |
| 2.5 | `templates/adapters/codex/hooks/` | 批量追加 | 14 |

验证: `grep write_hook_event templates/adapters/*/hooks/*.sh` 全部命中

### 轮次 3: MCP 集成 + 治理信号

| Task | 文件 | 操作 | 改动描述 |
|------|------|:---:|------|
| 3.1 | `templates/core/scripts/mcp-server/tools/hook-event-report.ts` | 新建 | get_hook_events 工具（按 planKeyword/hook/时间过滤） |
| 3.2 | `templates/core/scripts/mcp-server/notifications/hook.ts` | 修改 | fs.watch + record_dev_operation + sendLoggingMessage |
| 3.3 | `templates/core/scripts/mcp-server/resources/hook-events-report.ts` | 新建 | add-coder://report/hook-events/{daily,weekly} |
| 3.4 | `templates/core/scripts/mcp-server/notifications/hitl.ts` | 修改 | 阈值告警（no-active-plan ≥10/天） |
| 3.5 | `tests/hook-notify.test.ts` | 新建 | 单元测试 |

验证: tsc + eslint + vitest

---

## Step 4-8：后续步骤

| Step | 内容 | 状态 |
|------|------|:---:|
| 4 | 审计数据验证 | 待执行 |
| 5 | AI 合规检查 | 待执行 |
| 6 | 从审计数据定位问题 | 待执行 |
| 7 | 修复并验证 | 待执行 |
| 8 | 收敛判断 | 待执行 |

---

## ADD-7 审计策略

| 文件 | targetType | action | beforeState | afterState |
|------|-----------|--------|------------|-----------| 
| `lib/notify.sh` | SCRIPT | CREATE | 不存在 | write_hook_event 函数 |
| `pre-tool-use.sh` | SCRIPT | MODIFY | 无 hook 事件写入 | 含 write_hook_event 调用 |
| `notifications/hook.ts` | COMPONENT | MODIFY | setInterval 轮询 | fs.watch 事件驱动 |
| `hook-event-report.ts` | COMPONENT | CREATE | 不存在 | get_hook_events 工具 |
