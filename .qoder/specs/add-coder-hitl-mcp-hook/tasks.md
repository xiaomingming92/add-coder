# Tasks: add-coder HITL MCP Hook

> **验证规范**：每个 Task 完成时必须附带双检证据（`tsc=0` + `eslint 0 errors`，缺一不可）。可选补充 `vitest 18/18` / `grep确认`。

## Preconditions

- [ ] Plan 已生成（`add-coder-hitl-mcp-hook-plan-v1.md`）
- [ ] Spec 已就绪（`spec.md`）
- [ ] Review 已完成（`add-coder-hitl-mcp-hook-review-v1.md`），P0/P1 问题已回流修正

## Forbidden

- 禁止修改 add-coder 的 src/ 核心 CLI 逻辑、npm 包构建流程
- 禁止修改 AuditLog / DevOperation 已有模型
- 禁止引入新外部依赖
- 禁止修改 caijuehub 模块

## Tasks

### 轮次 1: Prisma 模型

- [ ] Task 1.1: add.prisma 新增三表 + 3 枚举 — 验证: `npx tsc --noEmit` 通过
  - [ ] 新增 `enum HitlType`：PLAN / PLAN_REVIEW
  - [ ] 新增 `enum HitlStatus`：DRAFT / TONGYI / BOHUI（移除 SUBMITTED—Review #4 建议简化状态机）
  - [ ] 新增 `enum ReviewType`：PLAN_REVIEW / IMPLEMENTATION / RUNTIME
  - [ ] 新增 `model HitlRecord`：含 id/planName(@unique)/type/status/proposalPath/approvedAt/rejectedAt/rejectReason/createdBy/timestamps
  - [ ] 新增 `model PlanRecord`：含 id/planName(@unique)/planPath/specPath/tasksPath/checklistPath/totalTasks/doneTasks/checklistT/checklistTDone/checklistR/planKeyword/timestamps
  - [ ] 新增 `model ReviewRecord`：含 id/planName(**非** @unique—Review #1 修复 1:N 关系)/type/reviewPath/p0Count/p1Count/backflowRate/timestamps
  - [ ] PlanRecord.planName 对 HitlRecord.planName 建立可选 @relation（Review #3 补充外键）
  - [ ] ReviewRecord.planName 对 PlanRecord.planName 建立必选 @relation（Review #3 补充外键）
- [ ] Task 1.2: prisma migrate 生成 + 执行 — 验证: `prisma migrate dev` 通过，三表可读写

### 轮次 2: MCP 工具 + Hook

- [ ] Task 2.1: HITL 3 工具 — 验证: MCP 可调用（create/update/status 三端正常）
  - [ ] `create_hitl({ planName, type })`：写 HitlRecord status=DRAFT，按 hitl-template.md 生成提案文件
  - [ ] `update_hitl({ planName, type, status, reason? })`：状态切换 TONGYI/BOHUI
    - TONGYI → 写 `.hitl-tongyi-{planName}`（无 .md 后缀—Review #6 统一）
    - BOHUI → 记录驳回时间 + 原因，提案文件保留
  - [ ] `status_hitl({ planName, type })`：查询审批状态
  - [ ] 消费 1.1 产出的 HitlRecord 模型
- [ ] Task 2.2: Plan 3 工具 — 验证: MCP 可调用
  - [ ] `plan_track({ planName?, scanAll? })`：解析 tasks/checklist → PlanRecord
  - [ ] `plan_status({ planName })`：查询 Plan 进度，标记 review 缺失异常
  - [ ] `plan_sync({ planName })`：PlanRecord 数据回写 Plan 文档
  - [ ] 消费 1.1 产出的 PlanRecord/ReviewRecord 模型
- [ ] Task 2.3: Review 3 工具 — 验证: MCP 可调用
  - [ ] `review_track({ planName })`：解析 review-*.md p0/p1/backflowRate → ReviewRecord
  - [ ] `review_status({ planName })`：查询 Review 质量指标
  - [ ] `review_sync({ planName })`：ReviewRecord 数据回写 review 文档
  - [ ] 消费 1.1 产出的 ReviewRecord 模型
- [ ] Task 2.4: pre-tool-use.sh 新增 §C HITL 拦截 — 验证: 无 tongyi 标记时阻断 plans/reviews 写入
  - [ ] 在 §A（Bash 写入保护）和 §B（Write 前置守卫）之后追加 §C
  - [ ] §C：拦截 `{{magicDir}}/(plans|reviews)/` 写入，检查 `.hitl-tongyi-{planName}` 标记存在
  - [ ] 对 reviews/ 写入区分类型（Review #2）：仅 `review-template.md`（PLAN_REVIEW 特征文件）需 HITL 检测；`review-implementation-template.md` 和 `review-runtime-template.md` 走 §B 活跃 Plan 检查
  - [ ] 标记文件统一为 `.hitl-tongyi-{planName}` 无后缀格式（Review #6）
- [ ] Task 2.5: MCP index 注册 9 工具 — 验证: 工具列表含全部 9 个
  - [ ] `src/mcp/index.ts` 中 `registerAll` 新增 hitl-tools / plan-tools / review-tools 的注册调用

### 轮次 3: SKILL / Rules / Templates

- [ ] Task 3.1: add-paradigm SKILL 更新 — 验证: SKILL 文本含 `create_hitl` + `status_hitl` 关键词
  - [ ] Plan 生成流程改为：`create_hitl` → 按 `hitl-template.md` 生成提案 → 人工审核 → `status_hitl` → 通过后转为正式 Plan
  - [ ] Plan 中临时文件不再称 temporary.md，改用 hitl-template.md 命名（Plan §1.2 对齐）
- [ ] Task 3.2: project_rules.md 新增 ADD-13 — 验证: 规则文件含"禁止跳过 HITL"
  - [ ] ADD-13：HITL 人机审核强制规则——Plan/Review 必须经过 HITL 审批，提案文件按模板生成 + schema 校验
- [ ] Task 3.3: 模板 + schema 新建 — 验证: schema 校验通过
  - [ ] `hitl-template.md`：HITL 提案模板（含 HITL 计划总览表 + 审议证据链）
  - [ ] `hitl-template.schema.json`：提案文件结构校验 schema
- [ ] Task 3.4: doc-format-guard.sh 扩展 — 验证: schema 匹配命中
  - [ ] 在模板匹配循环和文件名特征识别中增加 hitl-template 的识别规则
- [ ] Task 3.5: plan_track scanAll 验证 — 验证: 三表均有历史记录
  - [ ] 调用 `plan_track({ scanAll: true })` 补录 agent-memory-plan-v1 等历史 Plan
  - [ ] 验证 `plan_status({ planName })` 能区分「正常运行」和「review 缺失」
- [ ] Task 3.6: review_track 验证 — 验证: p0/p1/backflowRate 正确解析
  - [ ] 解析现有 review 文件，验证指标落库

### 轮次 4: sync 验证（Review #9 新增）

- [ ] Task 4.1: weather_proxy sync 验证 — 验证: sync 后 HITL 规则生效
  - [ ] 在 weather_proxy 项目运行 `npx add-coder sync --adapter qoder --patch`
  - [ ] 验证 hook §C 拦截 + HITL MCP 工具可调用
  - [ ] 验证 pre-tool-use.sh 无 tongyi 标记时阻断写入

## Task Dependencies

```
Task 1.1 (Prisma 3 表 + 枚举)
  │
  ├── 产出: HitlRecord/PlanRecord/ReviewRecord 模型
  │
  ├──→ Task 1.2 (prisma migrate)
  │
  ├──→ Task 2.1 (HITL 工具) ──[消费 HitlRecord]──→ Task 2.4 (hook §C HITL 拦截)
  │                                                        │
  ├──→ Task 2.2 (Plan 工具) ──[消费 PlanRecord/ReviewRecord]─┤
  │                                                           │
  └──→ Task 2.3 (Review 工具) ──[消费 ReviewRecord]──────────┤
                                                              │
                     Task 2.4 ────→ Task 2.5 (MCP index 注册)──┤
                                                                │
                                                                ▼
                                        轮次 3 (SKILL/Rules/Templates)
                                         │
                                          └──→ Task 4.1 (weather_proxy sync 验证)
```

## Verification

- [ ] `npx tsc --noEmit` 通过
- [ ] `npx eslint src/` 零 error
- [ ] `prisma migrate dev` 通过，三表可读写
- [ ] `create_hitl → update_hitl(status=TONGYI) → .hitl-tongyi-{planName}` 生成
- [ ] `update_hitl(status=BOHUI, reason)` → HitlRecord 驳回记录完整
- [ ] pre-tool-use.sh §C 无 tongyi 标记时阻断 plans/reviews 写入
- [ ] pre-tool-use.sh §C 区分 review 类型（仅 PLAN_REVIEW 需 HITL）
- [ ] `plan_track({ scanAll: true })` 补录历史 Plan → PlanRecord + ReviewRecord
- [ ] `plan_status` 能区分「正常运行」和「review 缺失」
- [ ] `review_track` 正确解析 p0/p1/backflowRate
- [ ] weather_proxy `npx add-coder sync --patch` 后 HITL 规则生效
# Tasks: HITL 人机审核架构

> **验证规范**：每个 Task 完成时必须附带双检证据（`tsc=0` + `eslint 0 errors`，缺一不可）。

## Preconditions

- [x] PostgreSQL 容器运行中（add-coder-postgres）
- [x] `prisma migrate dev` 可正常执行
- [x] MCP Server 可重新加载工具注册
- [x] AddUser `ai-assistant` 已创建

## Forbidden

- 禁止修改 AuditLog / DevOperation 表
- 禁止新增 delete_hitl 工具（BOHUI = 软删除）
- 禁止在 caijuehub 中增加 TOML 规则
- 禁止修改 weather_proxy 仓库代码

## Tasks

- [x] Task 1.1: add.prisma 新增 HitlRecord + PlanRecord + ReviewRecord + 3 enum — 验证: `tsc=0`
- [x] Task 1.2: prisma migrate + client regen（幂等 migration.sql） — 验证: `prisma migrate dev=0` + `prisma generate=0`
- [x] Task 1.3: 轮次 1 闭合审计 — 验证: `record_dev_operation ROUND_CLOSED` 落库

- [x] Task 2.1: HITL 工具 create_hitl / update_hitl / status_hitl — 验证: `tsc=0` + 已注册
- [x] Task 2.2: Plan 工具 plan_track / plan_status / plan_sync — 验证: `tsc=0` + 已注册
- [x] Task 2.3: Review 工具 review_track / review_status / review_sync — 验证: `tsc=0` + 已注册
- [x] Task 2.4: pre-tool-use.sh 拦截逻辑 — 验证: §C tongyi 哨兵拦截已添加
- [ ] Task 2.5: MCP index 注册 — 验证: 9 工具均可见
- [ ] Task 2.6: 轮次 2 闭合审计 — 验证: `record_dev_operation ROUND_CLOSED` 落库

- [ ] Task 3.1: add-paradigm SKILL 更新 — 验证: SKILL 含 create_hitl + status_hitl + ROUND_CLOSED
- [ ] Task 3.2: project_rules.md 新增 ADD-13 — 验证: 规则文件含"禁止跳过 HITL"
- [ ] Task 3.3: hitl-template.md + schema.json — 验证: schema 校验通过
- [ ] Task 3.4: doc-format-guard 扩展 — 验证: hitl schema 匹配命中
- [ ] Task 3.5: plan_track scanAll 验证 — 验证: agent-memory-plan-v1 三表记录
- [ ] Task 3.6: review_track 验证 — 验证: p0/p1/backflowRate 落表
- [ ] Task 3.7: weather_proxy sync 验证 — 验证: HITL 规则生效
- [ ] Task 3.8: 轮次 3 闭合审计 — 验证: `record_dev_operation ROUND_CLOSED` 落库

## Task Dependencies

- Task 2.1-2.3 依赖 Task 1.1（Prisma 模型）
- Task 2.4 依赖 Task 2.1（.hitl-tongyi 标记文件生成）
- Task 2.5 依赖 Task 2.1-2.3
- Task 3.1-3.4 可与轮次 2 并行，但依赖 1.1
- Task 3.5-3.7 依赖轮次 2 完成
- Task 1.3/2.6/3.8 为各轮次闭合标记

## Verification

- [ ] `npx tsc --noEmit` 通过
- [ ] `prisma migrate dev` 通过
- [ ] 9 个 MCP 工具均可调用
- [ ] `plan_track({ scanAll: true })` 返回正确计数
- [ ] pre-tool-use hook 无标记时阻断
- [ ] weather_proxy sync 后 HITL 规则生效
