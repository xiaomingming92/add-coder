# add-coder-mcp-restructure-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度。

## PLAN 元信息

- **Plan 名称**: add-coder-mcp-restructure-v1
- **启动时间**: 2026-07-23T12:00:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/23/add-coder-mcp-restructure-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-07/23/add-coder-mcp-restructure-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-mcp-restructure-review-v1.md`

---

## HITL 计划总览（一次性提交人类审核）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | `mcp-server.ts`（3467行→入口壳）、新建 `mcp-server/`（shared + tools + resources + notifications + sampling + elicitation + tasks 共 ~30 文件） | ✅ 同意 |
| 预估文件数 | 修改 1 个 + 新建 ~30 个（四大原语 + 两个横切全覆盖） | ✅ 同意 |
| 架构变更 | 新增 `mcp-server/` 模块目录，MCP 六能力独立子目录，shared 层抽取 | ✅ 同意 |
| 新增依赖 | 无外部依赖 | ✅ 同意 |
| 风险等级 | 🟡中 — `MAGIC_DIR` 传递；入口路径不变；新能力需验证 IDE 兼容性 | ✅ 同意 |
| 预计轮次 | 6 轮：① shared → ② tools → ③ 入口壳 → ④ Resources+Subscribe+Notifications → ⑤ Sampling+Elicitation → ⑥ Tasks | 同意/调整 |

### 文件清单

| # | 文件 | 操作 | 内容 |
|---|------|:---:|------|
| — | `mcp-server.ts` | **修改** | 入口壳（~60 行） |
| | **shared/（5 文件）** | | |
| 1-5 | types / env / prisma / response / fs | 新建 | 基础设施层 |
| | **tools/（6 文件）** | | |
| 6-11 | context / audit / docs / quality / gateway / index | 新建 | 17 工具 |
| | **resources/（4 文件）** | | |
| 12-15 | add-state / round-task / add-coder-version / index | 新建 | ADD 状态订阅 |
| | **notifications/（3 文件）** | | |
| 16-18 | hitl / hook / index | 新建 | 事件推送 |
| | **sampling/（2 文件）** | | |
| 19-20 | review / index | 新建 | AI 回调 |
| | **elicitation/（2 文件）** | | |
| 21-22 | confirm / index | 新建 | 用户信息请求 |
| | **tasks/（3 文件）** | | |
| 23-25 | runner / store / index | 新建 | 持久化后台任务 |
| 26 | `mcp-server/index.ts` | 新建 | 总入口 registerAll |

> **人类确认后**：AI 在下方展开完整 Plan 设计。

---

## 一、背景与目标

### 1.1 问题现状

`mcp-server.ts` 3467 行单文件，仅实现 MCP Tools。MCP 协议六大能力中五项未使用：

1. **HITL 无推送**：HITL 表生成后用户无感知
2. **状态不可订阅**：Plan/Review/Route/轮次/Task 状态变更不推送
3. **AI 不可被服务端触发**：不能主动让 AI 执行 Review 或校验
4. **无用户信息请求**：不能向用户请求额外输入
5. **无持久化任务**：长任务无进度跟踪

### 1.2 目标

```
mcp-server/
├── types.ts
├── shared/                   ← 六能力共同复用
│   ├── env.ts / prisma.ts / response.ts / fs.ts
├── tools/        ← Tools：工具调用（pull，17 工具）
├── resources/    ← Resources：资源订阅（状态 push）
├── notifications/← Notifications：状态变化推送
├── sampling/     ← Sampling：服务端回调 AI
├── elicitation/  ← Elicitation：请求用户信息
├── tasks/        ← Tasks：持久化后台任务
└── index.ts      ← registerAll
```

---

## 二、方案选型

选六能力全覆盖——一次性打地基，shared 层支撑所有能力，后续迭代只加文件不改架构。

---

## 三、架构设计

### 3.1 MCP 四大原语 + 两个横切能力

```
能力              方向             场景映射
──────────────────────────────────────────────────────────
Tools             Client→Server    17 工具（已实现）
Resources+Sub     Client←Server    Plan/Review/Route/Task 状态实时刷新
                                  npm 版本过期通知
Sampling          Server→Client    触发 AI 生成 Review / 校验 checklist
Notifications     Server→Client    HITL 就绪 / Hook 结果推送
── 横切 ──
Elicitation       Server→Client    HITL 确认弹窗、风险提示
Tasks (实验性)    双向             长任务 + 延迟结果 + 状态追踪
```

### 3.2 数据流转

```
IDE Agent ←── stdio ──→ mcp-server 入口壳
                            │
   ┌────┬──────┬──────┬──────┬──────┐
   ▼    ▼      ▼      ▼      ▼      ▼
 tools res  notif  sampling elic  tasks
   │    │      │      │      │      │
   └────┴──────┴──────┴──────┴──────┘
                   │
              shared/ (Prisma / FS / Env)
```

### 3.3 Resources URI 设计

```
add-coder://plan/status    → { active, keyword, step }
add-coder://review/{name}  → { type, hitl_ready, findings }
add-coder://route/{name}   → { complete, steps_done }
add-coder://specs/{name}   → { spec, tasks, checklist }
add-coder://round/{n}/task/{m} → { done, file }
add-coder://version        → { current, latest, outdated }
```

---

## 四、实施 Task + 依赖图

> **轮次设计遵循 ADD 注意力原则**：按语义相关性合并，串行流转，每轮独立可验证。不追求并行——并行 = LLM 注意力碎片化。

```
轮次 1: shared 基础设施（5 文件，独立可复用）✅ 已完成
├── Task 1.1: types.ts（ToolResponse / GuardResult / ToolRegistrar）
├── Task 1.2: shared/env.ts（PROJECT_ROOT / MAGIC_DIR / PROJECT_ID / DATABASE_URL）
├── Task 1.3: shared/prisma.ts（PrismaClient 单例，PG/SQLite 自动适配）
├── Task 1.4: shared/response.ts（textResponse / errorResponse）
└── Task 1.5: shared/fs.ts（readFileSafe / validateDocWithGuard / readdirRecursive）
        │
        ▼
轮次 2: Tools 拆分（6 文件，17 工具逐工具迁移，不修改行为）
├── Task 2.1: context.ts（5 工具：get_project_context / get_db_schema / get_audit_logger_pattern / get_add_template / get_spec_context）
├── Task 2.2: audit.ts（2 工具：record_dev_operation / query_audit_logs）
├── Task 2.3: docs.ts（1 工具：find_related_docs）
├── Task 2.4: quality.ts（4 工具：check_phase_symmetry / check_failure_path / generate_audit_logger / check_add_compliance）
├── Task 2.5: gateway.ts（5 工具：check_add_route_status / check_spec_sync / check_add_route_completeness / check_dps / check_rahs）
└── Task 2.6: tools/index.ts（registerAllTools 聚合 17 工具）
        │
        ▼
轮次 3: 入口壳收敛（2 文件，registerAll 串联六能力）
├── Task 3.1: mcp-server.ts → ~60 行入口壳（McpServer + registerAll + StdioTransport + connect）
└── Task 3.2: mcp-server/index.ts（registerAll 六能力骨架占位，后续轮次逐步填充）
        │
        ▼
轮次 4: Resources + Subscribe + Notifications（7 文件，push 方向合并）
├── Task 4.1: resources/add-state.ts（Plan/Review/Route/Specs 四个 Resource + subscribe）
├── Task 4.2: resources/round-task.ts（轮次/Task 进度 Resource）
├── Task 4.3: resources/add-coder-version.ts（npm 版本订阅，npm view 对比）
├── Task 4.4: resources/index.ts（registerAllResources）
├── Task 4.5: notifications/hitl.ts（HITL 表就绪扫描 + notif push）
├── Task 4.6: notifications/hook.ts（Hook 执行结果监听 + push）
└── Task 4.7: notifications/index.ts（registerAllNotifications，周期性扫描缺省 30s）
        │
        ▼
轮次 5: Sampling + Elicitation（4 文件，Server→Client 请求合并）
├── Task 5.1: sampling/review.ts（server.createMessage() 触发 AI Review）
├── Task 5.2: sampling/index.ts（registerSamplingHandlers）
├── Task 5.3: elicitation/confirm.ts（server.elicit() HITL 确认 / 风险提示弹窗）
└── Task 5.4: elicitation/index.ts（registerElicitationHandlers）
        │
        ▼
轮次 6: Tasks（3 文件，持久化后台任务 + 状态机 + DB 存储）
├── Task 6.1: tasks/runner.ts（队列 + 状态机 pending→running→done/failed + audit-scan / batch-review / npm-check）
├── Task 6.2: tasks/store.ts（TaskResult 表 DB 持久化 + AuditLog 关联）
└── Task 6.3: tasks/index.ts（registerTaskHandlers，启动恢复未完成任务）
```

### 轮次 1: shared 基础设施层

| # | 文件 | 验收 |
|---|------|------|
| 1.1-1.5 | types / shared/env / prisma / response / fs | `tsc --noEmit` |

### 轮次 2: Tools 拆分（6 文件，17 工具按域分组，逐工具迁移）

> 每个 Task 从原 `mcp-server.ts` 精确提取 `server.registerTool(...)` 完整代码块，不修改 name/description/inputSchema/回调逻辑。依赖 shared 层 import。

| # | Task | 目标文件 | 工具名 | 原行号 | 验收 |
|---|------|------|------|------|------|
| | **context.ts（5 工具，上下文与查询）** | | | | |
| 2.1.1 | 迁移 get_project_context | `tools/context.ts` | `get_project_context` | L166-430 | `tsc --noEmit` |
| 2.1.2 | 迁移 get_db_schema | `tools/context.ts` | `get_db_schema` | L433-520 | `tsc --noEmit` |
| 2.1.3 | 迁移 get_audit_logger_pattern | `tools/context.ts` | `get_audit_logger_pattern` | L524-612 | `tsc --noEmit` |
| 2.1.4 | 迁移 get_add_template | `tools/context.ts` | `get_add_template` | L1718-1780 | `tsc --noEmit` |
| 2.1.5 | 迁移 get_spec_context | `tools/context.ts` | `get_spec_context` | L1782-1873 | `tsc --noEmit` |
| | **audit.ts（2 工具，审计记录）** | | | | |
| 2.2.1 | 迁移 record_dev_operation | `tools/audit.ts` | `record_dev_operation` | L1111-1212 | `tsc --noEmit` |
| 2.2.2 | 迁移 query_audit_logs | `tools/audit.ts` | `query_audit_logs` | L992-1109 | `tsc --noEmit` |
| | **docs.ts（1 工具，文档检索）** | | | | |
| 2.3.1 | 迁移 find_related_docs | `tools/docs.ts` | `find_related_docs` | L1214-1446 | `tsc --noEmit` |
| | **quality.ts（4 工具，代码质量）** | | | | |
| 2.4.1 | 迁移 check_phase_symmetry | `tools/quality.ts` | `check_phase_symmetry` | L615-679 | `tsc --noEmit` |
| 2.4.2 | 迁移 check_failure_path | `tools/quality.ts` | `check_failure_path` | L681-757 | `tsc --noEmit` |
| 2.4.3 | 迁移 generate_audit_logger | `tools/quality.ts` | `generate_audit_logger` | L759-990 | `tsc --noEmit` |
| 2.4.4 | 迁移 check_add_compliance | `tools/quality.ts` | `check_add_compliance` | L1875-2101 | `tsc --noEmit` |
| | **gateway.ts（5 工具，门禁与守卫）** | | | | |
| 2.5.1 | 迁移 check_add_route_status | `tools/gateway.ts` | `check_add_route_status` | L1448-1716 | `tsc --noEmit` |
| 2.5.2 | 迁移 check_spec_sync | `tools/gateway.ts` | `check_spec_sync` | L2103-2580 | `tsc --noEmit` |
| 2.5.3 | 迁移 check_add_route_completeness | `tools/gateway.ts` | `check_add_route_completeness` | L2582-2775 | `tsc --noEmit` |
| 2.5.4 | 迁移 check_dps | `tools/gateway.ts` | `check_dps` | L2777-3103 | `tsc --noEmit` |
| 2.5.5 | 迁移 check_rahs | `tools/gateway.ts` | `check_rahs` | L3105-3358 | `tsc --noEmit` |
| | **index.ts（统一注册表）** | | | | |
| 2.6 | 生成注册表 | `tools/index.ts` | 聚合 2.1-2.5 全部 17 工具 | — | `tsc --noEmit` + 人工计数 17 工具无遗漏 |

### 轮次 3: 入口壳收敛（2 文件，串联六能力）

> 入口壳从原 `mcp-server.ts` 的启动逻辑简化而来：仅保留 import + McpServer 创建 + registerAll + StdioServerTransport + connect。六能力骨架先占位（空 import），各能力模块后续轮次逐步填充。

| # | Task | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 3.1 | 重写入口壳 | `templates/core/scripts/mcp-server.ts`（修改） | 删除原 3467 行，替换为 ~60 行：`import { McpServer } from "..."; import { StdioServerTransport } from "..."; import { registerAll } from "./mcp-server/index.js"; const server = new McpServer({ name: "add-dev-tools", version: "1.0.0" }); registerAll(server); const transport = new StdioServerTransport(); await server.connect(transport);` | `tsc --noEmit` + `npx add-coder init --dry-run` 路径无误 |
| 3.2 | 总入口骨架 | `mcp-server/index.ts`（新建） | `export function registerAll(server: McpServer) { registerAllTools(server); /* TODO: registerAllResources(server) 轮次4; registerAllNotifications(server) 轮次4; registerSamplingHandlers(server) 轮次5; registerElicitationHandlers(server) 轮次5; registerTaskHandlers(server) 轮次6; */ }` | `tsc --noEmit` + 六能力占位无遗漏 |

### 轮次 4: Resources + Subscribe + Notifications（7 文件，push 方向合并）

> 依赖轮次 3 的 registerAll 入口。Resources 基于 `server.resource()` + `server.subscribeResource()` 实现。Notifications 基于 `server.notification()` 实现。两者同为 push 方向，共享文件系统扫描逻辑。

| # | Task | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| | **resources/（4 文件，ADD 状态资源）** | | | |
| 4.1 | ADD 状态资源 | `mcp-server/resources/add-state.ts`（新建） | 定义 `add-coder://plan/status`、`review/{name}/status`、`route/{name}/status`、`specs/{name}/status` 四个 Resource。每个 Resource 的 readCallback 从 `.qoder/plans/` `.qoder/reviews/` `.qoder/specs/` 读文件并解析状态。subscribe 回调监听 `notifications/resources/updated` | `tsc --noEmit` + IDE 执行 `resource/list` 可见 4 个 URI |
| 4.2 | 轮次 Task 资源 | `mcp-server/resources/round-task.ts`（新建） | 定义 `add-coder://round/{n}/task/{m}` Resource。从 handoff 文件提取轮次/Task 完成状态。每轮独立 URI，供 IDE 逐轮查看进度 | `tsc --noEmit` |
| 4.3 | 版本资源 | `mcp-server/resources/add-coder-version.ts`（新建） | 定义 `add-coder://version` Resource。readCallback 读 `package.json` version + `npm view add-coder version` 对比。subscribe 推送更新提醒 | `tsc --noEmit` + `npm view add-coder version` 可对比 |
| 4.4 | 资源注册 | `mcp-server/resources/index.ts`（新建） | `export function registerAllResources(server: McpServer)` — 调用 `server.resource(...)` 注册 4.1-4.3 全部 Resource，设置 subscribe 回调 | `tsc --noEmit` |
| | **notifications/（3 文件，事件推送）** | | | |
| 4.5 | HITL 通知 | `mcp-server/notifications/hitl.ts`（新建） | 扫描 `.qoder/plans/` 下 `*-plan-v*.md`，检测 `## HITL 计划总览` 表存在且未确认 → 触发 `notifications/resources/updated`。依赖 `shared/fs.ts` 的 readFileSafe + readdirRecursive | `tsc --noEmit` + 新建含 HITL 表的 plan 文件后 IDE 收到通知 |
| 4.6 | Hook 通知 | `mcp-server/notifications/hook.ts`（新建） | 监听 `.qoder/hooks/` 下 hook 脚本执行结果（由 hook 脚本写入标记文件或通过 spawnSync 捕获 exit code）。成功/失败状态通过 notification 推送 IDE | `tsc --noEmit` |
| 4.7 | 通知注册 | `mcp-server/notifications/index.ts`（新建） | `export function registerAllNotifications(server: McpServer)` — 注册 4.5-4.6 的通知逻辑，周期性扫描（可配置间隔）或缺省 30s | `tsc --noEmit` |

### 轮次 5: Sampling + Elicitation（4 文件，Server→Client 请求模式）

> 依赖轮次 3。Sampling 基于 `server.createMessage()` 实现，Elicitation 基于 `server.elicit()` 实现。两者同为"服务端主动向客户端发请求"模式，合并避免上下文切换。

| # | Task | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| | **sampling/（2 文件，AI 回调）** | | | |
| 5.1 | Review 回调 | `mcp-server/sampling/review.ts`（新建） | 定义 `createReviewSample(prompt)` 函数：构造 `{ role: "user", content: { type: "text", text: prompt } }` 消息，调用 `server.createMessage()`。prompt 模板从 `review-template.md` 读取。场景：Step 0 完成后自动触发方案 Review | `tsc --noEmit` + 单元测试 mock server |
| 5.2 | Sampling 注册 | `mcp-server/sampling/index.ts`（新建） | `export function registerSamplingHandlers(server: McpServer)` — 导出 5.1 的 handler，供外部按需调用（如 Hook 脚本通过 HTTP 回调触发） | `tsc --noEmit` |
| | **elicitation/（2 文件，用户信息请求）** | | | |
| 5.3 | 确认/风险提示 | `mcp-server/elicitation/confirm.ts`（新建） | `export async function elicitConfirm(server, message)` — 调用 `server.elicit()` 弹出确认对话框。场景：HITL 表就绪后弹"请确认 HITL 计划总览"；风险操作前弹"此操作将修改 N 个文件，确认？" | `tsc --noEmit` |
| 5.4 | Elicitation 注册 | `mcp-server/elicitation/index.ts`（新建） | `export function registerElicitationHandlers(server: McpServer)` — 导出 5.3 的 handler | `tsc --noEmit` |

### 轮次 6: Tasks（3 文件，持久化后台任务，实验性）

> 依赖轮次 3。Tasks 是 MCP 最新实验性能力——支持长时间运行的后台任务，返回延迟结果 + 状态追踪。独立业务域，最后执行。

| # | Task | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 6.1 | 任务执行器 | `mcp-server/tasks/runner.ts`（新建） | 任务队列 + 状态机（`pending → running → done/failed`）。支持 `audit-scan`（全量审计检查）、`batch-review`（批量生成 review）、`npm-check`（npm 版本检查）三类任务。每个任务有唯一 taskId、progress 百分比、result 指针 | `tsc --noEmit` + 单元测试状态机 |
| 6.2 | 结果持久化 | `mcp-server/tasks/store.ts`（新建） | `taskResults` 通过 Prisma 写入 `TaskResult` 表（新建 migration：taskId/type/status/progress/result/createdAt）。任务历史可查询，关联 AuditLog | `tsc --noEmit` + DB migration 可执行 |
| 6.3 | Tasks 注册 | `mcp-server/tasks/index.ts`（新建） | `export function registerTaskHandlers(server: McpServer)` — 注册 `audit-scan` `batch-review` `npm-check` 三个 task handler。启动时从 DB 恢复未完成任务 | `tsc --noEmit` + `npx add-coder init --dry-run` 含 migration |

---

## 五、验收标准

- [ ] `tsc --noEmit` 通过（全部 ~27 文件）
- [ ] 17 工具全部注册，行为不变
- [ ] `mcp.json` 入口路径不变，`npx add-coder init --dry-run` 通过
- [ ] Resources: IDE 可 subscribe 状态变更
- [ ] Notifications: HITL/Hook 结果推送 IDE
- [ ] Sampling: 服务端可触发 AI Review
- [ ] Elicitation: 服务端可请求用户确认/输入
- [ ] Tasks: 后台任务可持久化 + 状态追踪
- [ ] `shared/` 层被六能力模块共同复用

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-07/23/add-coder-mcp-restructure-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-07/23/add-coder-mcp-restructure-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-mcp-restructure-review-v1.md` |
| Spec | `.qoder/specs/mcp-restructure/spec.md` |
| Tasks | `.qoder/specs/mcp-restructure/tasks.md` |
| Checklist | `.qoder/specs/mcp-restructure/checklist.md` |

---

## 六点五、项目级配置与 MCP 多实例隔离

> 补充于 2026-07-23：mcp-server 作为独立 MCP 进程，需正确识别当前项目上下文。

### 问题

`mcp-server.ts` 通过 `basename(dirname(__dirname))` 自动检测 MAGIC_DIR。但 MCP 进程部署路径不固定（`.qoder/scripts/`、`.claude/scripts/` 等），且多项目共用同一 IDE 时可能存在多个 MCP 实例指向不同项目。

### 设计

`shared/env.ts` 统一导出项目级配置，覆盖原本分散在各处的 `const`：

```typescript
// shared/env.ts
export const PROJECT_ROOT = resolve(__dirname, "..", "..", "..")  // 从 mcp-server/ 回溯到项目根
export const MAGIC_DIR = basename(dirname(__dirname))              // .qoder / .claude / .vscode / .add
export const PROJECT_ID = basename(PROJECT_ROOT)                   // 项目目录名，如 "add-coder"
export const DATABASE_URL = loadEnv("DATABASE_URL")                // 从 .env 加载
```

**MAGIC_DIR 检测顺序**（兼容多 adapter 部署）：

| 部署位置 | MAGIC_DIR | 说明 |
|---------|-----------|------|
| `.qoder/scripts/mcp-server/` | `.qoder` | Qoder IDE 加载 |
| `.claude/scripts/mcp-server/` | `.claude` | Claude Code 加载 |
| `.vscode/scripts/mcp-server/` | `.vscode` | VS Code 加载 |
| `.add/scripts/mcp-server/` | `.add` | 跨 IDE 共享（回退） |

**PROJECT_ID 用途**：
- 审计日志隔离：不同项目的 DevOperation 记录可独立查询
- Resources URI 前缀：`add-coder://{PROJECT_ID}/plan/status`
- 多项目并行开发时不混淆

### Plan 影响

- 轮次 1.2（shared/env.ts）需导出 PROJECT_ID
- 轮次 4 的 Resources URI 需动态拼接 PROJECT_ID
- 无新增文件，仅增强已有模块
