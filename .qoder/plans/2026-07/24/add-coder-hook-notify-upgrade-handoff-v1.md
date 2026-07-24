# add-coder — 3 轮原子事务交接手册

> **适用场景**：Hook 拦截事件治理体系建设（jsonl 旁路 + fs.watch + 内存缓冲队列 + 治理信号）

---

## 全局元信息

- **父 Plan**: [add-coder-hook-notify-upgrade-plan-v1.md](./add-coder-hook-notify-upgrade-plan-v1.md)
- **原子事务拓扑**: [add-coder-hook-notify-upgrade-add-route-v1.md](./add-coder-hook-notify-upgrade-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 约 26 个独立文件（1 新建 + 25 修改）
- **Round数**: 3 轮局部闭包
- **拆分原则**: 以文件边界独立为主（hooks bash 层 → MCP TypeScript 层）

```text
第1轮 ── Core hooks + lib/notify.sh（4 文件）
            │
            ▼
第2轮 ── 5 adapter hooks 统一注入（15 文件）
            │
            ▼
第3轮 ── MCP 集成 + 治理信号 + 测试（7 文件）
```

---

## 原子事务边界说明

- **轮次 1 vs 轮次 2**：轮次 1 建造 `notify.sh` 工具函数，轮次 2 在 5 个 adapter 中调用它——文件集合完全不同，互不跨轮修改。
- **轮次 2 vs 轮次 3**：轮次 2 是 bash hooks，轮次 3 是 TypeScript MCP Server——不同语言、不同目录，没有文件归属冲突。
- **每轮独立验证**：轮次 1-2 通过 `grep write_hook_event` 验证，轮次 3 通过 `vitest` 验证。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话入口索引。具体实现细节以 `.qoder/specs/hook-notify-upgrade/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准。

---

## 第1轮 Core Hooks + lib/notify.sh

### 你当前的位置

你是第 1 轮。上游无依赖。本轮建造 `notify.sh`（jsonl 写入工具函数），并在 core hooks 的每个 `exit 2` 前注入 `write_hook_event` 调用。

### 上游已完成

无（首轮）。

### 恢复上下文审计查询

```text
query_audit_logs({ keyword: "hook-notify-upgrade" })
→ 返回全部审计记录
query_audit_logs({ targetId: "templates/core/hooks/lib/notify.sh" })
→ notify.sh 新建记录
```

### 原子事务目标

覆盖 Plan §4 轮次 1。新建 `notify.sh` + 改造 3 个 core hook 文件。

### spec 文件

- `.qoder/specs/hook-notify-upgrade/spec.md`
- `.qoder/specs/hook-notify-upgrade/tasks.md`（Task 1.1-1.4）
- `.qoder/specs/hook-notify-upgrade/checklist.md`（§一~§三）

### 你要改的文件（4 个：1 新建 + 3 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/hooks/lib/notify.sh` | 新建 | `write_hook_event()` 函数：7 字段 jsonl + 256KB 轮转 |
| `templates/core/hooks/pre-tool-use.sh` | 修改 | source notify.sh + plan 检测 + 6 处 exit 2 前注入 |
| `templates/core/hooks/doc-format-guard.sh` | 修改 | 同上，5 处 exit 2 前注入 |
| `templates/core/hooks/prompt-submit.sh` | 修改 | 同上，1 处 exit 2 前注入 + 治理摘要注入 |

### 高风险误区

- 禁止在 notify.sh 中使用 jq/curl/wget 等外部依赖（必须 bash 原生）
- `write_hook_event` 失败不能阻断 exit 2（`2>/dev/null || true`）

### ADD-7 审计记录

| action | targetType | targetId | 说明 |
|--------|-----------|----------|------|
| CREATE | SCRIPT | `templates/core/hooks/lib/notify.sh` | 新建 notify.sh |
| MODIFY | SCRIPT | `templates/core/hooks/pre-tool-use.sh` | 6 处注入 |
| MODIFY | SCRIPT | `templates/core/hooks/doc-format-guard.sh` | 5 处注入 |
| MODIFY | SCRIPT | `templates/core/hooks/prompt-submit.sh` | 1 处注入 + 治理摘要 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hook-notify-upgrade" })
→ 返回全部 32 条审计记录（28 文件级 + 4 文档/事件级）

query_audit_logs({ targetId: "templates/core/hooks/lib/notify.sh" })
→ notify.sh 新建记录

query_audit_logs({ targetId: "templates/core/scripts/mcp-server/notifications/hook.ts" })
→ 内存缓冲队列 + fs.watch 实现记录

query_audit_logs({ action: "HOOK_INTERCEPT" })
→ 端到端验证记录（5 条测试事件，含重启恢复测试）
```

### DevLog 摘要（32 条审计）

| 轮次 | 文件数 | 审计记录 | 恢复关键词 |
|:--:|:--:|:--:|------|
| 1 | 4 | 4 CREATE/MODIFY | notify.sh + pre-tool-use + doc-format-guard + prompt-submit |
| 2 | 15 | 15 MODIFY | qoder/claude/vscode/trae/codex 各 3 文件 |
| 3 | 7 | 7 CREATE/MODIFY | hook-event-report, hook.ts, hook-events-report, hitl.ts, review.ts, prisma.ts, test |
| 索引 | 2 | 2 MODIFY | tools/index.ts + resources/index.ts |
| 文档 | 2 | 2 DOC | DOC_UPDATED (Plan) + DOC_CREATED (Handoff) |
| 事件 | — | 2 HOOK_INTERCEPT | 重启恢复测试 2 条 |
| **合计** | **28** | **32** | `query_audit_logs({ planKeyword: "hook-notify-upgrade" })` |

### 验证标准

- `grep write_hook_event templates/core/hooks/pre-tool-use.sh` 命中 6 处
- `grep -E "(jq|curl|wget)" templates/core/hooks/lib/notify.sh` 返回空
- `source templates/core/hooks/lib/notify.sh` 无报错

---

## 第2轮 5 Adapter Hooks 统一注入

### 你当前的位置

你是第 2 轮。上游第 1 轮已完成 `notify.sh` 工具函数和 core hooks 改造。本轮在 qoder/claude/vscode/trae/codex 五个 adapter 的 hooks 中统一注入 `write_hook_event`。

### 上游已完成

- `templates/core/hooks/lib/notify.sh` — write_hook_event 函数（7 字段 jsonl + 256KB 轮转）
- `templates/core/hooks/pre-tool-use.sh` — 6 处 exit 2 已注入

### 恢复上下文审计查询

```text
query_audit_logs({ keyword: "hook-notify-upgrade" })
query_audit_logs({ targetId: "templates/adapters/qoder/hooks/pre-tool-use.sh" })
→ qoder adapter 注入记录
```

### 原子事务目标

覆盖 Plan §4 轮次 2。5 个 adapter × 3 文件（pre-tool-use/doc-format-guard/prompt-submit）

### spec 文件

- `.qoder/specs/hook-notify-upgrade/tasks.md`（Task 2.1-2.5）
- `.qoder/specs/hook-notify-upgrade/checklist.md`（§四）

### 你要改的文件（15 个）

| Adapter | pre-tool-use | doc-format-guard | prompt-submit |
|------|:--:|:--:|:--:|
| qoder | 6 处注入 | 5 处注入 | 1 处注入 |
| claude | 6 处注入 | 5 处注入 | 1 处注入 |
| vscode | 6 处注入 | 5 处注入 | 1 处注入 |
| trae | 6 处注入 | 5 处注入 | 1 处注入 |
| codex | 6 处注入 | 5 处注入 | 1 处注入 |

### 高风险误区

- 禁止修改 hook 协议（exit 2 + stderr 行为不变，仅新增 jsonl 旁路）
- `notify.sh` 必须复制到每个 adapter 的 `lib/` 目录（`npm run sync` 后自动分发）
- trae/doc-format-guard.sh 使用硬编码 `MAGIC_DIR=".trae"`，需额外注入 HOOK_DIR/PROJECT_DIR

### 验证标准

- `grep -l write_hook_event templates/adapters/*/hooks/*.sh | wc -l` ≥ 15
- `npm run sync` 后 `.qoder/hooks/` 下 3 文件共 12 处 write_hook_event

---

## 第3轮 MCP 集成 + 治理信号 + 测试

### 你当前的位置

你是第 3 轮。上游第 1-2 轮已完成全部 hook bash 层改造。本轮实现 MCP Server 端：fs.watch 消费 jsonl → 内存缓冲队列 → Prisma 批量落库 → 治理信号（工具/Resource/告警/对话注入）。

### 上游已完成

- 所有 adapter hooks（.qoder/.claude/.vscode/.add）已含 write_hook_event，hook 拦截后自动写入 jsonl
- `npm run sync` 已完成

### 恢复上下文审计查询

```text
query_audit_logs({ keyword: "hook-notify-upgrade" })
query_audit_logs({ targetId: "templates/core/scripts/mcp-server/notifications/hook.ts" })
→ 内存缓冲队列 + fs.watch 实现
query_audit_logs({ action: "HOOK_INTERCEPT" })
→ 端到端验证记录（5 条测试事件）
```

### 原子事务目标

覆盖 Plan §4 轮次 3。MCP Server 端 5 个子任务。

### spec 文件

- `.qoder/specs/hook-notify-upgrade/spec.md`（Requirements: 内存缓冲队列 + 治理信号）
- `.qoder/specs/hook-notify-upgrade/tasks.md`（Task 3.1-3.5）
- `.qoder/specs/hook-notify-upgrade/checklist.md`（§五~§八）

### 你要改的文件（7 个：5 新增/修改 + 1 测试 + 1 修复）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/scripts/mcp-server/tools/hook-event-report.ts` | 新建 | `get_hook_events` 工具（planKeyword/hook/时间过滤 + 分组聚合） |
| `templates/core/scripts/mcp-server/notifications/hook.ts` | 重写 | 内存缓冲队列（50 阈值/2s 定时）+ fs.watch 目录监听 + 批量 Prisma 落库 + 去重 + 溢出降级 + 退出清空 |
| `templates/core/scripts/mcp-server/resources/hook-events-report.ts` | 新建 | 日报/周报 Resource（按小时/按日分组） |
| `templates/core/scripts/mcp-server/notifications/hitl.ts` | 修改 | 新增 5 分钟周期阈值告警（no-active-plan ≥10 → warning） |
| `templates/core/scripts/mcp-server/sampling/review.ts` | 修改 | HITL 两步法 Review（temporary.md → 人类拍板 → 完整 Review） |
| `templates/core/scripts/mcp-server/shared/prisma.ts` | 修改 | Prisma v7 路径兼容（client.ts + client.js） |
| `tests/hook-notify.test.ts` | 新建 | 6 个单元测试（注册 + 幂等） |

### 核心设计

```
Hook 阻断 → jsonl 写入（bash printf >>）
              │
   MCP fs.watch 目录监听（inotify）
              │
   内存缓冲队列（50 条阈值 / 2s 定时）
              │
   批量 Prisma createMany → DevOperation 表
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
get_hook_events 日报/周报  UserPromptSubmit
（工具查询）  （Resource） （对话注入）
```

### 关键契约

- `fs.watch` 监听目录（`REPORT_DIR`）而非单个文件——文件可能后来才创建
- `notifications/message` 在所有 IDE（Qoder/Claude/VS Code）均不支持弹窗渲染，改为 `UserPromptSubmit` 对话注入
- `prisma generate --schema=prisma/` 需要目录路径（含 `add.prisma` 模型）

### 高风险误区

- 禁止直接 `watch(JSONL_FILE)`——文件不存在时会静默失败
- `sendLoggingMessage` 已弃用但仍是唯一可用 API（`notification()` 未实现）
- Prisma 客户端路径需要同时兼容 `.ts`（v7）和 `.js`（v6）

### 验证标准

#### 已完成验证

- `vitest run` 46/46 全部通过（含 6 个新增 hook-notify 测试）
- `get_hook_events({})` 返回 5 条 HOOK_INTERCEPT 记录
- `get_hook_events({ planKeyword: "hook-notify-upgrade" })` 返回 2 条重启恢复测试记录
- `query_audit_logs({})` 可用
- MCP 重启后从 jsonl 恢复消费验证通过（预写 2 条 → 重启 → 查到 2 条）
- `npm run sync` 后 `.qoder/hooks/` 下 12 处 write_hook_event
- 治理摘要注入：UserPromptSubmit hook 在所有 IDE 下输出 `[Hook 治理] 今日拦截: N 次`
- mv /tmp/ 正则加固：从 `^mv` 改为 `(^|;|\|\||&&|\|)\s*mv\s+/tmp/`
- cp/mv/touch + 脚本解释器正则同样加固

#### 未执行的端到端验证（保留给运行时）

- `sendLoggingMessage` 弹窗通知（因所有 IDE 不支持 MCP notifications/message，改为对话注入替代，已闭环）
- 磁盘满时 write_hook_event 静默失败（需模拟磁盘满场景）
- 256KB jsonl 轮转（需累积 800+ 事件触发）
- no-active-plan ≥10 阈值告警（需累积 10 次无 Plan 违规）

---

## 每轮收敛判定补充规则

### checklist 证据要求

- [x] 全部可验证项已勾选（34/46），12 项边缘场景保留给运行时验证
- [x] 每项勾选有可验证证据（行号引用 / 测试结果 / grep 输出）
- [x] 未执行项诚实保留为 `- [ ]`
- [x] 证据可通过 `query_audit_logs` 按 keyword 可查

### tasks 证据要求

- [x] 全部 14 个 Task 已完成（tasks.md 全部 `- [x]`）
- [x] 每个 Task 有对应 checklist 覆盖
- [x] 审计记录已落库（cmrynglex00032clzns334qjl）

---

## 附录：每轮启动模板

新对话开始时，粘贴对应 Round 章节 + 以下启动操作：

```text
## 上下文

你在执行 add-coder Hook 通知升级的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-handoff-v1.md 的 <第N轮> 章节。

## 启动操作（按顺序）

1. 执行 session-init SKILL
2. 读 .qoder/specs/hook-notify-upgrade/spec.md
3. 读 .qoder/specs/hook-notify-upgrade/tasks.md
4. 读 .qoder/specs/hook-notify-upgrade/checklist.md
5. 按 tasks.md 顺序执行
6. 每完成一个文件：record_dev_operation
7. 完成后：query_audit_logs({ keyword: "hook-notify-upgrade" }) 回查确认
```
