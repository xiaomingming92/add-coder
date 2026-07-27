# add-coder-hitl-mcp-hook-review-implementation-v1

## Review 元信息

- **Review 对象**: `add-coder-hitl-mcp-hook-plan-v1.md` 全部轮次 1~4 的代码实现
- **关联方案 review**: `.qoder/reviews/add-coder-hitl-mcp-hook-review-v1.md`
- **Review 时间**: 2026-07-27
- **Review 类型**: 实现 review（ADD-10 意图与实现的语义鸿沟）
- **前置阅读**: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-plan-v1.md`、`.qoder/specs/add-coder-hitl-mcp-hook/spec.md`、`.qoder/specs/add-coder-hitl-mcp-hook/tasks.md`、`.qoder/specs/add-coder-hitl-mcp-hook/checklist.md`

---

## HITL 发现总览（一次性提交人类审核）

> **规则**：AI 必须先在此表中列出 **所有检查维度的发现**，等待人类一次性审核通过后再逐项展开。
> 禁止逐条边查边改——这是批量审批入口。

| # | 严重度 | 检查维度 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🔴 高 | 数据模型 | Migration `202607270147` 中有 `HitlRecord_planName_fkey` 裸 FK，但 Prisma schema 中未声明 @relation。Plan 定义"自然键关联，非 FK"，此 FK 与 Plan 意图矛盾，且 `prisma migrate dev` 必报 drift | 新增 migration 删除此 FK（Plan 语义是自然键关联，DB 层也不需要） | 接受 |
| 2 | 🔴 高 | 契约/语法 | `pre-tool-use.sh` 第 28 行 `_log_block() {hitl` 有注入残留字面量 `hitl`，导致函数定义语法错误，§A 阻断日志会静默失败 | 删除 `hitl` 残留字面量，恢复为 `_log_block() {` | 接受 |
| 3 | 🟡 中 | 兼容性 | `plan_track` 的 ReviewRecord 检测仅依赖 plan_track 内的逻辑（检测 review 文件存在性），但不会自动调用 review_track 填充 p0/p1 字段——ReviewRecord 可能只有路径无指标 | 在 plan_track scanAll 完成后提示用户调用 review_track；或 plan_track 内自动触发 review_track | 接受/拒绝/修改 |
| 4 | 🟢 低 | 环境变量 | MCP 服务端依赖 `DATABASE_URL` 环境变量连接 PostgreSQL，但未在任何配置文件中显式声明此依赖关系 | 在 `.env.development.example` 中补充 `DATABASE_URL` 说明 | 接受 |

> **人类确认后**：AI 在下方逐章节展开详细检查。

---

## 1. 跨仓库格式契约

本实现不涉及跨仓库 API 调用（所有 MCP 工具均在 add-coder 仓库内部运行，通过 Prisma 直连 PostgreSQL）。唯一跨仓库操作为 `weather_proxy` 通过 `npx add-coder sync --adapter qoder --patch` 消费模板——这是 CLI 命令，不涉及 HTTP API 契约。

| 接口 | 调用方 | 被调方 | 格式 | 匹配? |
|------|--------|--------|------|:---:|
| MCP Tool `create_hitl` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/hitl.ts` | Zod v4 schema | ✅ |
| MCP Tool `update_hitl` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/hitl.ts` | Zod v4 schema | ✅ |
| MCP Tool `status_hitl` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/hitl.ts` | Zod v4 schema | ✅ |
| MCP Tool `plan_track` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/plan.ts` | Zod v4 schema | ✅ |
| MCP Tool `plan_status` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/plan.ts` | Zod v4 schema | ✅ |
| MCP Tool `plan_sync` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/plan.ts` | Zod v4 schema | ✅ |
| MCP Tool `review_track` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/review.ts` | Zod v4 schema | ✅ |
| MCP Tool `review_status` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/review.ts` | Zod v4 schema | ✅ |
| MCP Tool `review_sync` | IDE AI 助手 (JSON-RPC) | `templates/core/scripts/mcp-server/tools/review.ts` | Zod v4 schema | ✅ |
| CLI `npx add-coder sync --patch` | weather_proxy shell | add-coder templates/ → weather_proxy | 文件复制 | ✅ |

- [x] 所有 MCP 工具输入参数使用 Zod v4 强类型校验
- [x] 响应格式统一为 `textResponse()` 纯文本，错误走 `errorResponse()`——与现有 MCP 工具保持一致
- [x] 无需跨仓库 HTTP 契约校验

---

## 2. 框架版本兼容性

- [x] MCP 工具使用 `zod/v4`（与现有 tools 保持一致）
- [x] MCP Server 使用 `@modelcontextprotocol/server`，已有 `registerTool` API
- [x] Prisma Client 通过 `npx prisma generate` 重新生成，与 migration 对齐
- [x] TypeScript 编译：新增文件（hitl.ts / plan.ts / review.ts）`tsc --noEmit` 零错误
- [x] 现有文件 `tsc` 错误（audit.ts / gateway.ts）与本次变更无关，属已有技术债
- [x] 编译产物：MCP Server 运行时不依赖编译产物（`tsx` 直接执行 `.ts`），无需检查 mtime

---

## 3. 数据模型约束

### 3.1 Prisma Schema 逐表验证

**HitlRecord**：
- [x] `id` @id @default(cuid())
- [x] `planName` `@@unique([planName, round])` — 支持多轮审批；planName 不唯一，因此不使用 Prisma @relation（Plan 定义"自然键关联，非 FK"）
- [x] `type` HitlType (PLAN / PLAN_REVIEW)
- [x] `status` HitlStatus (DRAFT / SUBMITTED / TONGYI / BOHUI)
- [x] `createdAt` @default(now()) / `updatedAt` @updatedAt
- [x] @@index([planName]) / @@index([status])
- ❌ Migration 中有 `HitlRecord_planName_fkey` 裸 FK → PlanRecord.planName（`ON DELETE RESTRICT`），但 Prisma schema 无 @relation，与 Plan"自然键关联"定义矛盾，`prisma migrate dev` 必报 drift（见 #1）

**PlanRecord**：
- [x] `planName` @unique
- [x] 含 totalTasks / doneTasks / checklistT / checklistTDone / checklistR
- [x] `reviews ReviewRecord[]` — 1:N 关系
- [x] @@index([planKeyword])

**ReviewRecord**：
- [x] `planName` **无** @unique — 支持 1:N（#1 回流修正）
- [x] `plan PlanRecord @relation(fields: [planName], references: [planName], onDelete: Cascade)`
- [x] `type` ReviewType (PLAN_REVIEW / IMPLEMENTATION / RUNTIME)
- [x] @@index([planName]) / @@index([type])

### 3.2 外键记录存在性

- [x] ReviewRecord.planName → PlanRecord.planName FK + Cascade（Prisma @relation）
- [x] plan_track 执行时会先 upsert PlanRecord，再创建 ReviewRecord——保证外键存在
- ❌ HitlRecord.planName 存在裸 FK 未在 Prisma schema 声明 → drift 风险（见 #1）

### 3.3 唯一约束防重复

- [x] HitlRecord.@@unique([planName, round]) — 同 plan 同 round 不会重复插入
- [x] PlanRecord.planName @unique — 防止 plan_track 重复创建
- [x] ReviewRecord 无 @unique 约束 — 通过 findFirst + upsert 模式防重复

---

## 4. 环境变量加载链

MCP Server 通过 `shared/prisma.js` 初始化 Prisma Client，依赖标准 Prisma 环境变量：

| 环境变量 | 用途 | 来源 | 验证 |
|---------|------|------|:---:|
| `DATABASE_URL` | PostgreSQL 连接串 | `.env.development` / `.env.production` | ✅ Prisma 自动加载 |
| `PROJECT_ROOT` | 工作区根目录 | `shared/fs.js` 动态推断 | ✅ 无需显式配置 |
| `MAGIC_DIR` | 魔法目录名 (.qoder/.claude/.add/.vscode) | runtime 探测 | ✅ 兼容多 adapter |

- [x] MCP Server 启动命令 `npx tsx templates/core/scripts/mcp-server/server.ts` 无需额外环境变量
- [x] 三套环境指向各自的 PostgreSQL 实例，通过 `.env.*` 区分
- ⚠️ `.env.development.example` 中未声明 `DATABASE_URL` 用途——见 #5

---

## 5. 多 API 场景匹配

| 工具组 | 场景 | 是否正确选择 | 说明 |
|--------|------|:---:|------|
| `create_hitl` | Plan/Review 审批发起 | ✅ | 类型通过 `type: PLAN / PLAN_REVIEW` 区分 |
| `update_hitl` | 审批通过/驳回 | ✅ | inputRequired 弹框 + _fallback 降级双轨 |
| `status_hitl` | 查询审批状态 | ✅ | 只读，无副作用 |
| `plan_track` | 扫描 plans/ 目录入库 | ✅ | scanAll=true 全量扫描 |
| `plan_status` | 查询单 Plan 进度 | ✅ | 只读 |
| `plan_sync` | 回写 Plan 文档 | ✅ | 使用 indexOf 安全替换，避免跨行正则 |
| `review_track` | 解析 review 文件入库 | ✅ | P0/P1 计数 + 回流率 |
| `review_status` | 查询 Review 质量 | ✅ | 汇总多类型 Review |
| `review_sync` | 回写 Review 文档 | ✅ | 使用 HTML comment REVIEW_META 标记 |

- [x] 9 个工具职责边界清晰：HITL=审批门禁、Plan=进度追踪、Review=质量指标
- [x] 无一工具跨职责：plan_track 不调用 HITL，review_track 不写 PlanRecord
- [x] hook §C HITL 拦截仅针对 plans/ + PLAN_REVIEW reviews/，implementation/runtime review 不受影响

---

## 6. E2E 逐端点验证

MCP 工具通过 JSON-RPC 协议调用，无法直接 curl。验证方式为通过 MCP 客户端调用后检查返回值：

| 工具 | 验证方式 | 结果 |
|------|---------|:---:|
| `create_hitl({ planName: "test", type: "PLAN" })` | MCP 调用 → 检查 HitlRecord 写入 + hitl.md 生成 | 待运行时 |
| `update_hitl({ planName: "test", type: "PLAN", status: "TONGYI" })` | MCP 调用 → 检查 `.tongyi-test` 哨兵生成 | 待运行时 |
| `status_hitl({ planName: "test", type: "PLAN" })` | MCP 调用 → 返回 DRAFT/TONGYI/BOHUI | 待运行时 |
| `plan_track({ scanAll: true })` | MCP 调用 → 检查 PlanRecord UPSERT | 待运行时 |
| `plan_status({ planName: "add-coder-hitl-mcp-hook-plan-v1" })` | MCP 调用 → 返回进度 | 待运行时 |
| `review_track({ planName: "add-coder-hitl-mcp-hook" })` | MCP 调用 → 返回 P0/P1 计数 | 待运行时 |
| `update_hitl({ planName: "test", type: "PLAN", status: "BOHUI", reason: "测试" })` | MCP 调用 → 检查 BOHUI 记录 | 待运行时 |
| hook §C tongyi 哨兵拦截 | 无哨兵时 Write plans/ → 预期 BLOCKED | 待运行时 |
| hook §C implementation review 放行 | Write reviews/*-implementation* → 预期放行 | 待运行时 |

- [x] 工具注册验证通过（`tests/hitl.test.ts` 7/7 passed）
- [x] TypeScript 编译零错（新增文件）
- [ ] 运行时 MCP 调用验证待部署后执行
- [ ] hook §C 拦截行为验证待实际触发

---

## 7. 关联 Checklist

本 review 的检查项与 `.qoder/specs/add-coder-hitl-mcp-hook/checklist.md` 的对应关系：

| Checklist 维度 | 对应章节 | 状态 |
|------|------|:---:|
| 编译与 Lint 门禁（[T] tsc + migrate） | §2 框架版本兼容性 | ✅ 通过 |
| 数据模型验收（三表字段 + FK） | §3 数据模型约束 | ⚠️ 见 #1 |
| MCP 工具验收（9 工具注册） | §5 多 API 场景匹配 | ✅ 通过 |
| Hook 拦截验收（§C 段 + 类型区分 + 后缀） | §1 跨仓库格式契约 + §5 | ⚠️ 见 #2 |
| SKILL/Rules/Templates 验收（关键词 grep） | — | ✅ 通过 |
| sync 验证 | — | 待运行时 |

- [ ] Checklist 全部 [T] 项通过后，流转至运行时验证

---

## 8. 决策结论

| 维度 | 结论 |
|------|------|
| **架构方向** | ✅ 正确——9 个 MCP 工具 + hook §C 拦截 + SKILL/Rules/Templates 配套完整实现 |
| **数据模型** | ⚠️ 需修正——#1 Migration 有裸 FK 未在 Prisma schema 声明，必漂移 |
| **Hook 拦截** | ⚠️ 需修正——#2 pre-tool-use.sh 第 28 行 `hitl` 残留字面量 |
| **契约对齐** | ✅ 正确——MCP 工具与 Spec 的 WHEN-THEN 场景一致 |
| **框架兼容** | ✅ 正确——tsc 零错（新增文件），与现有 MCP 工具同栈 |
| **Review 回流** | ✅ 正确——Plan Review 的 9 个问题均已回流修正 |

**判决策略**：P0 修复（#1 #2）为执行前提——#1 `prisma migrate dev` 漂移阻断后续迁移，#2 §A 阻断日志静默失败。P1 修复（#3）建议在同一提交周期内完成。P2 修复（#4）可在后续迭代中补齐。
