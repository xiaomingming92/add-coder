# add-coder 能力清单 & 调试指南

> 维护者速查手册 — 模块职责、依赖关系、调试命令、常见问题。

📖 开发架构 → [DEVELOPMENT.md](../DEVELOPMENT.md) | 用户文档 → [README.md](../README.md) | 实践指南 → [GUIDE.md](../GUIDE.md)

---

## 一、能力全景

```
add-coder
├── MCP Server（审计工具链）         ← templates/core/scripts/mcp-server/  29 文件
├── CLI（用户入口）                  ← src/cli/commands/                   init/sync/status
├── Hooks（治理卡位）                ← templates/core/hooks/ + adapters/   17 hooks × 5 IDE + 73 注入点
├── Templates（文档模板）            ← templates/core/templates/           36+ 模板
├── Skills（AI 技能）                ← templates/core/skills/              add-paradigm 等
├── Agents（子代理）                 ← templates/core/agents/              guardian + orchestrator
├── Rules（治理规则）                ← templates/core/rules/               project_rules.md
├── Vocabulary（触发词）             ← templates/core/vocabulary/          add-governance-vocabulary.md
├── Sync（自举同步）                 ← scripts/sync-magic-dirs.sh          源→目标覆盖
├── Caijuehub（裁决引擎）           ← src/caijuehub/                      transcribe + adapters
└── Shared（共享库）                 ← templates/shared/                    hooks-lib/debug-dump/repowiki
```

---

## 二、MCP Server 模块详解

> 位置：`templates/core/scripts/mcp-server/`，29 个 TypeScript 文件。
>
> 启动流程：`mcp-server.ts` → `index.ts(registerAll)` → 串联 tools/resources/notifications 三组注册函数。sampling/elicitation/tasks 不直接注册到 server，而是导出 builder 函数供 tool handler 内部调用。

- [2.1 入口](#21-入口) — 启动 + 总注册
- [2.2 shared/](#22-shared-基础设施5-文件) — 被所有模块引用的公共层
- [2.3 tools/](#23-tools--17-个-mcp-工具6-文件) — 17 个 MCP 工具（核心能力）
- [2.4 resources/](#24-resources--资源订阅3-文件) — 资源订阅（Client←Server push）
- [2.5 notifications/](#25-notifications--事件推送3-文件) — 事件推送（Server→Client）
- [2.6 sampling/](#26-sampling--ai-回调2-文件) — AI 回调（Server→Client 请求 AI 执行 prompt）
- [2.7 elicitation/](#27-elicitation--用户确认2-文件) — 用户确认（Server→Client 弹窗请求用户操作）
- [2.8 tasks/](#28-tasks--后台任务3-文件) — 后台任务队列 + 持久化

### 2.1 入口

只有两个文件，是整个 MCP Server 的起搏器。`mcp-server.ts` 是 IDE 通过 `tsx` 直接启动的目标，创建 McpServer 实例后交给 `index.ts` 串联所有能力模块。对外接口只有 `StdioServerTransport` 一行，所有能力通过 `registerAll()` 内部组装。

| 文件 | 架构角色 | 调试 |
|------|------|------|
| `mcp-server.ts` | stdin/stdout 进程入口 — 创建 McpServer 实例 → `registerAll()` → `StdioServerTransport` → `connect()`，16 行 | `node --import tsx .qoder/scripts/mcp-server.ts` |
| `mcp-server/index.ts` | 能力枢纽 — `registerAll()` 串联 tools + resources + notifications 三组注册函数；sampling/elicitation/tasks 不在此注册，导出 builder 供 handler 调用 | — |

### 2.2 shared/ 基础设施（5 文件）

被 tools/resources/notifications/sampling/elicitation/tasks 六个模块共同依赖的公共层。所有文件通过 `../shared/xxx.js` 相对路径引用，不依赖具体业务逻辑，可独立复用。

| 文件 | 架构角色 | 关键导出 |
|------|------|----------|
| `types.ts` | 全模块共享类型定义，避免循环依赖 | `ToolResponse`, `GuardResult`, `ToolRegistrar` |
| `env.ts` | 项目根路径 + 环境变量统一入口 — 从当前文件反推 4 层到项目根，加载 `.env.development` | `PROJECT_ROOT`, `MAGIC_DIR`(.qoder/.claude/.vscode/.add), `PROJECT_ID`, `DATABASE_URL` |
| `prisma.ts` | 数据库连接单例 — 动态导入 Prisma client，v6/v7 双路径兼容（`client.ts` + `client.js`），自动识别 PG/SQLite 适配器 | `prisma` |
| `response.ts` | 工具响应统一格式 — 所有 17 个 tool handler 通过它返回 `{ content: [...] }` | `textResponse()`, `errorResponse()` |
| `fs.ts` | 文件系统抽象 — 安全读取 + 递归遍历（返回相对路径）+ doc-format-guard 校验 | `readFileSafe()`, `readdirRecursive()`, `validateDocWithGuard()` |

### 2.3 tools/ — 18 个 MCP 工具（7 文件）

MCP 六大能力中唯一"已完成"的能力。18 个工具按业务域拆分为 6 组，各自独立注册，通过 `tools/index.ts` 的 `registerAllTools(server)` 一次性挂载。所有 handler 使用 `zod/v4` raw-shape 定义 inputSchema。

| 文件 | 工具数 | 业务域 | 工具列表 |
|------|:---:|------|------|
| `context.ts` | 5 | 上下文查询 — 为 AI 提供项目结构、DB schema、审计模式、模板、specs 三元组 | `get_project_context`, `get_db_schema`, `get_audit_logger_pattern`, `get_add_template`, `get_spec_context` |
| `audit.ts` | 2 | 审计日志读写 — ADD-7 操作记录 + MCP-5 稀疏推理恢复 | `query_audit_logs`, `record_dev_operation` |
| `docs.ts` | 1 | 文档检索 — ADD-0.1 广义文档先行 | `find_related_docs` |
| `quality.ts` | 4 | 代码质量检查 — ADD-1~6 合规验证 | `check_phase_symmetry`, `check_failure_path`, `generate_audit_logger`, `check_add_compliance` |
| `gateway.ts` | 5 | 流程闸门 — add-route 状态/DPS/RAHS/Spec 同步/闭环检查 | `check_add_route_status`, `check_spec_sync`, `check_add_route_completeness`, `check_dps`, `check_rahs` |
| `hook-event-report.ts` | 1 | Hook 事件查询 — 按 planKeyword/hook/时间区间过滤 + 分组聚合 + 阈值告警 | `get_hook_events` |
| `index.ts` | — | 聚合注册 | `registerAllTools(server)` |

### 2.4 resources/ — 资源订阅（4 文件）

实现 MCP Resources + Subscribe 能力（Client←Server push 方向）。IDE 可订阅 8 个 `add-coder://` 端点，服务端状态变更时主动推送。与 notifications 合在一起覆盖全部 Server→Client 主动通知场景。

| 文件 | 端点 | 架构角色 |
|------|------|------|
| `add-state.ts` | `plan/status` `review/status` `route/status` `specs/status` | ADD 工作流四维状态 — 读取 `.qoder/plans|reviews|specs/` 目录，结构化返回当前活跃的 Plan/Review/Route/Specs 状态 |
| `round-task.ts` | `round/{round}/task/{task}` | 轮次进度 — 从 Handoff 文件解析 checkbox 勾选状态，计算轮次完成率 |
| `add-coder-version.ts` | `version` | 版本监控 — 对比 `package.json` 中当前版本与 npm registry 最新版本，标记是否过期 |
| `hook-events-report.ts` | `hook-events/daily` `hook-events/weekly` | Hook 事件报表 — 从 DevOperation 表实时聚合，按小时/按日分组返回拦截统计 |
| `index.ts` | — | `registerAllResources(server)` |

### 2.5 notifications/ — 事件推送（3 文件）

Server→Client 主动推送。hook.ts 通过 fs.watch 监听 `{magicDir}/reports/` 目录，hook 拦截时写入 JSONL → MCP 回调解析 → 内存缓冲队列（50 条阈值 / 2s 定时）→ 批量 `record_dev_operation` 落库 → `sendLoggingMessage` 推送。hitl.ts 负责阈值告警（5 分钟周期检查，无 Plan 拦截 ≥10 次/天）。

> **注意**：`sendLoggingMessage` 弹窗通知经实测 Qoder/Claude/VS Code 均不支持 MCP notifications/message 渲染，改为 `UserPromptSubmit` hook 对话注入替代。

| 文件 | 触发条件 | 架构角色 |
|------|------|------|
| `hitl.ts` | 双模式：30s 扫描 plans/ + 300s Hook 阈值检查 | Plan 未确认 HITL 表提醒 + Hook 阈值告警（no-active-plan ≥10/天 → warning） |
| `hook.ts` | fs.watch 目录 + 内存缓冲队列 | 事件驱动：fs.watch → 解析 jsonl → 内存队列(50/2s) → 批量 Prisma createMany → sendLoggingMessage；含去重/溢出降级(overflow.jsonl)/退出清空 |
| `index.ts` | — | `registerAllNotifications(server)` |

### 2.6 sampling/ — AI 回调（2 文件）

Server→Client 方向：服务端主动请求客户端 AI 执行 prompt。通过 `inputRequired.createMessage()` 实现，不直接注册到 McpServer，而是导出 builder 函数 `createReviewRequest()`，由 tool handler 在需要时调用并 return。

> **v2 更新**：`createReviewRequest()` 已升级为 HITL 两步法流程（temporary.md → 人类拍板 → 完整 Review），支持 `plan`/`implementation`/`runtime` 三种 Review 类型。

| 文件 | 架构角色 |
|------|------|
| `review.ts` | `createReviewRequest(planKeyword, reviewType)` — 读取对应 Review 模板，引导 HITL 两步法（先写 temporary.md → 人类拍板 → 完整 Review），支持 plan/implementation/runtime 三种类型 |
| `index.ts` | 导出 `createReviewRequest` |

### 2.7 elicitation/ — 用户确认（2 文件）

Server→Client 方向：服务端请求用户在 IDE 中做出选择（accept/reject/modify 或 proceed/abort）。通过 `inputRequired.elicit()` 实现，与 sampling 同理——导出 builder 函数，由 tool handler 调用并 return。

| 文件 | 架构角色 |
|------|------|
| `confirm.ts` | `elicitHitlConfirm(message)` / `elicitRiskPrompt(risk, suggestion)` — 用原始 JSON Schema 定义选项（`zod/v4` 的 `z.object()` 在 beta.5 不兼容 `StandardSchemaWithJSON`），构建 `inputRequired.elicit()` 请求 |
| `index.ts` | 导出两个 builder 函数 |

### 2.8 tasks/ — 后台任务（3 文件）

持久化后台任务系统——内存队列 + 状态机 + DB 持久化。不注册到 McpServer（v2 Tasks 能力仍在实验阶段），导出 `enqueueTask/runTask/getTaskStatus` 供其他模块调用。

| 文件 | 架构角色 |
|------|------|
| `runner.ts` | 任务生命周期 — `enqueueTask()` 入队 → `runTask()` 执行（pending→running→done/failed），内存队列 |
| `store.ts` | 持久化 — 完成任务后写入 AuditLog 表（`TASK_DONE` action），实现跨会话可追溯 |
| `index.ts` | 导出所有任务 API |

---

## 三、调试指南

### 3.1 MCP Server

```bash
# 启动验证（Ctrl+C 退出）
node --import tsx .qoder/scripts/mcp-server.ts

# 发送 JSON-RPC 测试
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  timeout 5 node --import tsx .qoder/scripts/mcp-server.ts 2>/dev/null

# 调用单个工具
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_dps","arguments":{"planKeyword":"mcp-restructure"}}}' | \
  timeout 10 node --import tsx .qoder/scripts/mcp-server.ts 2>/dev/null
```

### 3.2 ESLint & TypeScript

```bash
# ESLint（零 error）
npx eslint templates/core/scripts/mcp-server/ --ext .ts

# TypeScript
npx tsc --noEmit
```

### 3.3 DPS 闸门

```bash
# 通过 MCP 工具（需要 IDE 连接 add-dev-tools）
# check_dps({ planKeyword: "xxx" })
# 或直接 JSON-RPC：
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_dps","arguments":{"planKeyword":"xxx"}}}' | \
  timeout 10 node --import tsx .qoder/scripts/mcp-server.ts 2>/dev/null
```

### 3.4 Sync

```bash
# 修改 templates/ 后同步到所有 magic 目录
npm run sync

# 验证同步
diff templates/core/scripts/mcp-server.ts .qoder/scripts/mcp-server.ts
```

### 3.5 Prisma

```bash
# 重新生成 Prisma client（修改 schema.prisma 后）
npx prisma generate

# 数据库状态
npx prisma db pull --print  # 只读检查
# ⚠️ 禁止 npx prisma db push
```

---

## 四、文件依赖拓扑

```
mcp-server.ts (入口)
  └── mcp-server/index.ts (registerAll)
        ├── tools/index.ts
        │     ├── context.ts ─── shared/{response,fs}
        │     ├── audit.ts ───── shared/{response,prisma}
        │     ├── docs.ts ────── shared/{response,fs}
        │     ├── quality.ts ─── shared/{response}
        │     ├── gateway.ts ─── shared/{response,fs,prisma}
        │     └── hook-event-report.ts ─ shared/{response,prisma}
        ├── resources/index.ts
        │     ├── add-state.ts ───── shared/{fs}
        │     ├── round-task.ts ──── shared/{fs}
        │     ├── add-coder-version.ts ─ shared/{fs}
        │     └── hook-events-report.ts ─ shared/{prisma}
        ├── notifications/index.ts
        │     ├── hitl.ts ─── shared/{fs,prisma}
        │     └── hook.ts ─── shared/{fs,prisma}
        ├── sampling/review.ts ─── shared/{fs} + inputRequired
        ├── elicitation/confirm.ts ─── inputRequired
        └── tasks/ ─── shared/{prisma}
```

---

## 五、常见问题

| 症状 | 原因 | 解决 |
|------|------|------|
| `tools/list` 返回空 | capabilities 未声明 | 入口加 `{ capabilities: { tools: {} } }` |
| `Non-representable type: optional` | `z.object()` 包裹了 `.optional()` | 改用 raw-shape `{ field: z.string().optional() }` |
| `DATABASE_URL 未设置` | `PROJECT_ROOT` 算错 | `env.ts` 中 `PROJECT_ROOT` 需要 4 层 `..` |
| `Cannot find module '.prisma/client/default'` | Prisma client 未生成 | `npx prisma generate` |
| `MAGIC_DIR = mcp-server` | `MAGIC_DIR` 算错 | 需 `resolve(__dirname, "..", "..", "..")` 到 `.qoder` |
| eslint 报告 `no-unsafe-*` | zod/v4 类型断层 | `import * as z from "zod/v4"` + raw-shape（已知 beta 限制） |
| `readdirRecursive` 返回空 | `relative()` 用错 dir | 用 `walk()` 内层函数固定 `baseDir` |
| MCP 工具列表中找不到 | 全局 mcp.json 未注册 | 添加到 `~/.config/Qoder/SharedClientCache/mcp.json` 的 `mcpServers` 内 |
| Hook 事件未落库 | `notify.sh` 未同步到 adapter lib/ 目录 | `npm run sync` 确保 `lib/notify.sh` 分发到所有 magic 目录 |
| fs.watch 不触发 | 文件在 MCP 启动后才创建 | 改为监听 `reports/` 目录（非单个文件），启动时预创建空 jsonl |
| MCP 工具报 `Cannot read 'findMany'` | Prisma client 未含 add.prisma 模型 | `npx prisma generate --schema=prisma/`（目录路径含 `add.prisma`） |

---

## 六、版本依赖约束

| 包 | 版本 | 约束原因 |
|----|------|---------|
| `@modelcontextprotocol/server` | `2.0.0-beta.5` | MCP v2 SDK，六能力 + stdio |
| `zod` | `^4.4.3` | SDK 要求 `>=4.2.0`（`StandardSchemaWithJSON`） |
| `tsx` | `>=4` | MCP Server 运行时 |
| `prisma` / `@prisma/client` | `^7.0.0` | 数据库 ORM |
| `typescript` | `^6.0.3` | 编译 |
| `eslint` | `^9.39.4` | 代码质量 |
