# hook-notify-upgrade Spec

> **关联 Plan**: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-plan-v1.md`
> **关联 Route**: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-add-route-v1.md`

## Why

当前 Hook 拦截后仅 `echo >&2` 到 stderr，存在三个缺口：

1. **无结构化记录** — 散落文本，无时间戳/类型/关联 Plan
2. **无跨会话审计** — "哪些 hook 在何时拦截了什么"无法回溯
3. **无治理信号** — 不知道"这几天有多少次无 Plan 的违规"

## What Changes

hook 协议零改动，新增旁路：拦截时写 jsonl → MCP fs.watch 回调解析 → 落库关联 Plan → 通知 + 日报/周报 + 阈值告警。

| 轮次 | 变更概要 | 涉及文件 |
|:--:|------|------|
| 1 | core hooks 改造 + lib/notify.sh 工具函数 | `templates/core/hooks/`（4 文件） |
| 2 | 5 个 adapter hooks 统一替换 | `templates/adapters/{qoder,claude,vscode,trae,codex}/hooks/`（~28 文件） |
| 3 | MCP 集成 + 内存缓冲队列 + 治理信号 + 测试 | `mcp-server/notifications/`（修改 2）、`mcp-server/tools/`（新增 1）、`mcp-server/resources/`（新增 1）、`tests/`（新增 1） |

## Impact

- Affected specs: 无（本 Spec 为全新创建）
- Affected code: `templates/core/hooks/`、`templates/adapters/*/hooks/`、`mcp-server/notifications/`、`mcp-server/tools/`、`mcp-server/resources/`
- 父 Plan: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-plan-v1.md`
- 依赖: hook-lib 已有 `detect_active_add`，无新增外部依赖
- 后续依赖: 无

## Boundaries

- hook 协议零改动：exit 2 + stderr 行为不变，仅新增 jsonl 旁路写入
- bash 写入 jsonl 必须原生实现（`printf` + `>>`），不依赖 jq/curl 等外部工具
- MCP Server 宕机不丢事件：jsonl 文件是持久化的真实数据源，MCP 重启后从文件恢复
- jsonl 磁盘上限：单文件 ≤256KB，轮转仅保留 1 个 `.old`（覆盖而非累积），总量 ≤512KB；`hook-events-overflow.jsonl` 在每次 flush 时消费并清空，不持续增长
- 内存缓冲队列用于解耦 fs.watch 回调与 DB 写入，避免每次回调同步等 DB 导致积压
- 治理信号（日报/周报/阈值告警）从 `DevOperation` 表实时查询聚合，不额外落库
- 用户触达方式使用 MCP 原生能力（sendLoggingMessage + Resource Subscribe），无需插件

---

## Requirements

### Requirement: jsonl 事件写入（bash 原生）

所有 hook 脚本在 exit 2 拦截流程中 SHALL 调用 `write_hook_event` 将事件写入 `{magicDir}/reports/hook-events.jsonl`。

#### Scenario: 正常拦截写入

- **WHEN** pre-tool-use.sh 拦截到违规工具调用（如 `mv /tmp/x`）
- **THEN** `hook-events.jsonl` 追加一行 7 字段 JSON：`ts`、`hook`、`decision`、`cmd`、`reason`、`planKeyword`、`planStatus`

#### Scenario: jsonl 文件自动轮转

- **WHEN** `hook-events.jsonl` 超过 256KB
- **THEN** 自动重命名为 `hook-events.jsonl.old`（覆盖已有 `.old`，不累积多份），新事件写入新的 `hook-events.jsonl`

#### Scenario: MCP 宕机不丢事件

- **WHEN** MCP Server 未运行
- **THEN** hook 脚本仍然成功写入 jsonl（bash 原生，不依赖 MCP），MCP 重启后从文件中恢复消费

#### Scenario: planKeyword 关联

- **WHEN** 存在活跃 Plan（`detect_active_add` 返回非空）
- **THEN** `planKeyword` 字段写入实际 Plan 关键词，`planStatus` 为 `"active"`
- **WHEN** 无活跃 Plan
- **THEN** `planKeyword` 为 `"no-active-plan"`，`planStatus` 为 `"none"`

---

### Requirement: 内存缓冲队列（解决 DB 写入积压）

fs.watch 回调中 SHALL 不直接 `await record_dev_operation`，而是通过内存缓冲队列批量写入 DB。此设计源于 Review P1 #1 反馈：每次回调同步等 DB 会导致事件积压。

```
fs.watch 回调 → 解析 jsonl 行 → push 到内存队列 → 返回（< 1ms）
                                    │
                    队列长度 ≥50 条 → 立即 flush
                    否则调度 setTimeout 2s 后 flush（已有定时则跳过）
                                    │
                    批量 record_dev_operation（createMany）
```

#### Scenario: 阈值触发优先

- **WHEN** 内存队列累积到 50 条事件
- **THEN** SHALL 立即执行 flush，将所有事件批量写入 DevOperation 表（`createMany`），保证高频场景不积压

#### Scenario: 兜底定时刷新

- **WHEN** 新事件入队且当前无 pending 的 flush 定时器
- **THEN** SHALL 调度 `setTimeout` 2s 后执行 flush
- **WHEN** 新事件入队且已有 pending 的 flush 定时器
- **THEN** SHALL 跳过（不重复调度），复用已有定时器

#### Scenario: 队列溢出降级到磁盘

- **WHEN** 内存队列已达 50 条上限且新事件到达
- **THEN** SHALL 降级写入 `reports/hook-events-overflow.jsonl`（二级磁盘缓冲），不丢弃事件

#### Scenario: 溢出文件消费

- **WHEN** flush 执行时
- **THEN** SHALL 先 drain 内存队列中的所有事件 → 再扫描 `hook-events-overflow.jsonl` 逐行消费 → 清空溢出文件
- **AND** 消费逻辑与内存队列一致（批量 `record_dev_operation`）

#### Scenario: 进程退出时清空

- **WHEN** MCP Server 进程收到退出信号（`process.on('exit')` / `SIGTERM`）
- **THEN** SHALL 清空内存队列中剩余事件（同步写入 DB 或降级写入 overflow 文件），保证零丢失

#### Scenario: 事件幂等保护

- **WHEN** 同一条 jsonl 行因 MCP 重启被重复消费
- **THEN** SHALL 通过 `(hook + ts + planKeyword)` 联合去重，避免重复写入 DevOperation 表

---

### Requirement: fs.watch 事件驱动消费

MCP Server SHALL 在启动时建立对 `hook-events.jsonl` 的 `fs.watch`（inotify），回调中解析新增行并推入内存缓冲队列。

#### Scenario: 启动时全量扫描

- **WHEN** MCP Server 启动
- **THEN** SHALL 先全量扫描已有的 `hook-events.jsonl`（及 `.old` 轮转文件），将未消费行推入缓冲队列
- **AND** 通过持久化的消费位点（文件 inode + 已读字节数）跳过已消费内容

#### Scenario: 运行时增量监听

- **WHEN** hook 脚本向 `hook-events.jsonl` 追加新行
- **THEN** fs.watch 回调 SHALL 在 1s 内触发
- **AND** 仅读取新增行（从上次消费位点开始），推入内存缓冲队列

#### Scenario: 文件轮转时无缝切换

- **WHEN** `hook-events.jsonl` 被轮转为 `.old`，新文件创建
- **THEN** SHALL 自动检测并切换到新文件监听，旧文件剩余内容在切换前消费完毕

---

### Requirement: 治理信号（日报 / 周报 / 阈值告警）

系统 SHALL 从 `DevOperation` 表实时查询聚合，提供三种治理信号。

#### Scenario: 日报查询工具

- **WHEN** 调用 MCP Tool `get_hook_events({ since: "24h" })`
- **THEN** SHALL 返回过去 24 小时内的 HOOK_INTERCEPT 事件，按 `planKeyword` 分组聚合
- **AND** 支持按 `hook`、`planKeyword`、时间区间过滤

#### Scenario: 周报 Resource 订阅

- **WHEN** IDE 订阅 `add-coder://report/hook-events/weekly`
- **THEN** SHALL 返回过去 7 天的事件聚合摘要（按日分组的总拦截次数、各 planKeyword 分布）

#### Scenario: 日报 Resource 订阅

- **WHEN** IDE 订阅 `add-coder://report/hook-events/daily`
- **THEN** SHALL 返回过去 24 小时的事件聚合摘要（按小时分组的总拦截次数、各 planKeyword 分布）

#### Scenario: 阈值告警

- **WHEN** 过去 24 小时内 `planKeyword = "no-active-plan"` 的拦截次数 ≥ 10
- **THEN** SHALL 通过 `sendLoggingMessage({ level: "warning" })` 推送告警："今日 N 次无 Plan 违规，建议创建 Plan 或检查 hooks 误报"

#### Scenario: 实时通知

- **WHEN** hook 拦截事件成功落库
- **THEN** SHALL 通过 `sendLoggingMessage({ level: "info" })` 推送实时通知（含 hook 类型、拦截原因、关联 Plan）

---

### Requirement: lib/notify.sh 零依赖可独立 source

`templates/core/hooks/lib/notify.sh` SHALL 零外部依赖，可被任意 hook 脚本独立 `source`。

#### Scenario: 零依赖

- **WHEN** 执行 `grep -E "(jq|curl|wget|perl|python)" templates/core/hooks/lib/notify.sh`
- **THEN** 返回空（0 条匹配）

#### Scenario: 可独立 source

- **WHEN** 在 bash 中执行 `source templates/core/hooks/lib/notify.sh`
- **THEN** `write_hook_event` 函数可用，无报错

#### Scenario: 静默失败不阻断 hook

- **WHEN** `write_hook_event` 执行失败（如磁盘满）
- **THEN** SHALL 不阻断 hook 的主流程（exit 2 仍正常执行），失败静默忽略（`2>/dev/null || true`）
