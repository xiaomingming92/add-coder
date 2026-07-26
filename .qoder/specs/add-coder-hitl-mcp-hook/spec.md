# add-coder HITL MCP Hook Spec

## Why

LLM 经常跳过 HITL 提案直接写正式 Plan/Review 文件，缺少强制拦截机制。当前 Plan 状态靠 grep 正则匹配 markdown checkbox 计算，无结构化数据支持。需要在 add-coder 治理体系中构建通用 HITL 人机审核架构。

## What Changes

| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/add.prisma` | MODIFY | 新增 HitlRecord + PlanRecord + ReviewRecord + 3 enum |
| `src/mcp/hitl-tools.ts` | ★ NEW | 3 HITL 工具：create_hitl / update_hitl / status_hitl |
| `src/mcp/plan-tools.ts` | ★ NEW | 3 Plan 工具：plan_track / plan_status / plan_sync |
| `src/mcp/review-tools.ts` | ★ NEW | 3 Review 工具：review_track / review_status / review_sync |
| `src/mcp/index.ts` | MODIFY | registerAll 注册 9 工具 |
| `templates/core/hooks/pre-tool-use.sh` | MODIFY | 新增 §C HITL 写入拦截 + tongyi 检查 |
| `templates/core/hooks/doc-format-guard.sh` | MODIFY | 新增 hitl-template.schema.json 校验路径 |
| `templates/core/skills/add-paradigm/SKILL.md` | MODIFY | Plan/Review 流程含 create_hitl + status_hitl |
| `templates/core/rules/project_rules.md` | MODIFY | 新增 ADD-13 HITL 人机审核规则 |
| `templates/core/templates/hitl-template.md` | ★ NEW | HITL 提案模板 |
| `templates/core/templates/hitl-template.schema.json` | ★ NEW | 提案文件结构校验 |
| `tests/hitl.test.ts` | ★ NEW | 三表 CRUD + hook 拦截测试 |

## Impact

- Affected specs: 无（本 Spec 为新建）
- Affected code: prisma/add.prisma schema + 3 个 MCP 工具模块 src/mcp/ + templates 体系 6 文件 + test
- 父 Plan: `add-coder-hitl-mcp-hook-plan-v1.md`
- 依赖: MCP Server 框架（已有 registerAll 入口）
- 后续依赖: weather_proxy 通过 `npx add-coder sync --adapter qoder --patch` 消费

## Boundaries

本次只允许实现：Prisma 三表 + MCP 9 工具 + Hook 拦截 + SKILL/Rules/Templates 配套。

本次禁止实现：
- 修改 add-coder 核心 CLI 逻辑、npm 包构建流程
- 修改 AuditLog / DevOperation 已有模型（纯增量）
- 引入新外部依赖

## Requirements

### Requirement: 三表数据模型

#### Scenario: HitlRecord 审批状态机

- **WHEN** 调用 `create_hitl({ planName, type })`
- **THEN** HitlRecord 新增 DRAFT 记录，按 hitl-template.md 生成提案文件
- **WHEN** 调用 `update_hitl({ planName, type, status: TONGYI })`
- **THEN** HitlRecord.status → TONGYI，approvedAt → now()，写 `.hitl-tongyi-{planName}` 标记
- **WHEN** 调用 `update_hitl({ planName, type, status: BOHUI, reason })`
- **THEN** HitlRecord.status → BOHUI，rejectedAt → now()，rejectReason → reason，提案文件保留

#### Scenario: PlanRecord 计划追踪

- **WHEN** 调用 `plan_track({ planName })`
- **THEN** 解析 tasks.md [x] 计数 → PlanRecord.totalTasks/doneTasks；解析 checklist.md [T]/[R] 计数 → PlanRecord.checklistT/checklistTDone/checklistR
- **WHEN** 调用 `plan_track({ scanAll: true })`
- **THEN** 遍历所有 magicDir 的 plans/ 目录中 `*-plan-v*.md`，对每个执行解析

#### Scenario: ReviewRecord 评审记录

- **WHEN** 调用 `review_track({ planName })`
- **THEN** 解析 review-*.md 的 P0/P1 计数 + `[回流:]` 标记统计 → ReviewRecord.p0Count/p1Count/backflowRate

### Requirement: Hook 写入拦截

#### Scenario: pre-tool-use.sh 新增 §C HITL

- **WHEN** Write/Edit 工具写入 `{{magicDir}}/plans/` 或 `{{magicDir}}/reviews/` 路径
- **THEN** 新增 §C 段检查 `.hitl-tongyi-{planName}` 标记文件存在才放行；仅 `review-template.md`（方案审查）需要 HITL 检测，`review-implementation-template.md` 和 `review-runtime-template.md` 走现有 §B 活跃 Plan 检查

### Requirement: SKILL/Rules/Templates 配套

#### Scenario: add-paradigm SKILL 更新

- **WHEN** Plan 生成流程中
- **THEN** 改为：`create_hitl` → 按 `hitl-template.md` 生成提案文件 → 人工审核 → `status_hitl` 前置检查 → 通过后转为正式 Plan
# HITL 人机审核架构 Spec

## Why

LLM 经常跳过 HITL 提案直接写正式 Plan/Review，无强制拦截。add.prisma 缺少 Plan/Review 状态表，进度靠正则匹配 markdown checkbox。需构建通用 HITL 架构：DB 状态机 + MCP 工具 + hook 拦截 + SKILL/rules 配套。

## What Changes

### 数据模型
- 新增 `prisma/add.prisma`：HitlRecord（@@unique([planName, round])） + PlanRecord（@relation 到 HitlRecord） + ReviewRecord（1:N, @relation 到 PlanRecord） + 3 enum

### MCP 工具
- 新增 `src/mcp/hitl-tools.ts`：create_hitl / update_hitl / status_hitl（type 入参区分 PLAN/PLAN_REVIEW）
- 新增 `src/mcp/plan-tools.ts`：plan_track / plan_status / plan_sync
- 新增 `src/mcp/review-tools.ts`：review_track / review_status / review_sync

### Hook
- 修改 `templates/core/hooks/pre-tool-use.sh`：拦截 plans/ 全部 + reviews/ 中 PLAN_REVIEW 类型写入，stat() 检查 `.hitl-tongyi-{planName}` 哨兵文件
- 修改 `templates/core/hooks/doc-format-guard.sh`：新增 hitl-template.schema.json 校验路径

### SKILL
- 修改 `templates/core/skills/add-paradigm/SKILL.md`：Plan 生成流程改为 `create_hitl` → 人工 tongyi/bohui → `status_hitl` 确认 → 写正式 Plan；Review（仅 PLAN_REVIEW 类型）生成同样走 `create_hitl` → 人工 tongyi/bohui → `status_hitl` 确认 → 写正式 Review 的 HITL 流程

### Rules
- 修改 `templates/core/rules/project_rules.md`：新增 ADD-13 HITL 人机审核强制规则——Plan/Review 必须经过 HITL 审批，提案文件按模板生成 + schema 校验，禁止跳过直接写正式文件

### 模板
- 新增 `templates/core/templates/hitl-template.md`：HITL 提案模板，结构如下：
  ```markdown
  # {planName}.hitl

  > HITL 提案文件。人工 tongyi 后转为正式 Plan/Review。

  ## HITL 计划总览

  | 维度 | 内容 | 人类决策 |
  |------|------|:---:|
  | 实施主体 | {谁负责，谁消费} | 同意/调整 |
  | 数据模型 | {新增/修改哪些表} | 同意/调整 |
  | MCP 工具 | {新增/修改哪些工具，入参} | 同意/调整 |
  | 文件命名 | {标记文件、提案文件命名规则} | 同意/调整 |
  | 模板 + schema | {是否需要新模板} | 同意/调整 |
  | 新增依赖 | {无 / 依赖名} | 同意/调整 |
  | 预计文件数 | {N} 个文件 | 同意/调整 |
  | 预计轮次 | {N} 轮 | 同意/调整 |
  ```
- 新增 `templates/core/templates/hitl-template.schema.json`：提案文件结构校验 schema，强制要求 HITL 决策表含 8 个维度列 + 人类决策列

### 测试
- 新增 `tests/hitl.test.ts`：三表 CRUD + hook 拦截 + BOHUI round+1 多轮审批

### 运行时标记
- `.hitl-tongyi-{planName}` / `.hitl-bohui-{planName}`（无 .md 后缀，stat() O(1) 哨兵文件）

## Impact

- Affected specs: 无（新模块）
- Affected code: `prisma/add.prisma`, `src/mcp/*.ts`, `templates/core/**`
- 父 Plan: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-plan-v1.md`
- 依赖: Prisma PostgreSQL 已就绪
- 后续依赖: weather_proxy `npx add-coder sync --patch` 消费

## Boundaries

本次允许:
- 新增三表 + enum + 9 MCP 工具 + hook 拦截 + SKILL/rules/templates 更新
- BOHUI 驳回后新建 round+1 HitlRecord（Event Sourcing 不可变）
- plan_track scanAll 全量补录历史 Plan
- `.hitl-tongyi-{planName}` 哨兵文件（无 .md 后缀，stat() O(1) 检查）

本次禁止:
- 删除任何已有 Prisma model
- 修改 AuditLog / DevOperation 表结构
- 在 caijuehub 中增加 TOML 规则（不涉及配置驱动）

## Requirements

### Requirement: HITL 审批生命周期

系统 SHALL 支持 Plan/PlanReview 的完整审批生命周期。

- Scenario: 创建审批提案 — WHEN 调用 `create_hitl({ planName, type })` THEN HitlRecord 写入 status=DRAFT，提案文件按 hitl-template.md 生成
- Scenario: 通过审批 — WHEN 调用 `update_hitl({ planName, type, status: TONGYI })` THEN status→TONGYI，approvedAt→now()，生成 `.hitl-tongyi-{planName}`
- Scenario: 驳回审批 — WHEN 调用 `update_hitl({ planName, type, status: BOHUI, reason })` THEN status→BOHUI，rejectedAt→now()，提案文件保留不删
- Scenario: 驳回后重启 — WHEN BOHUI 后修正完成 THEN 调用 `create_hitl({ planName, type })` → 新记录 round+1（不修改旧记录）

### Requirement: Hook 拦截正式文件写入

系统 SHALL 在 pre-tool-use hook 中拦截 plans/reviews 目录写入。

- Scenario: 有 tongyi 标记 — WHEN `.hitl-tongyi-{planName}` 存在 THEN 放行写入
- Scenario: 无 tongyi 标记 — WHEN 标记文件不存在 THEN 阻断并提示"请先通过 HITL 审批"
- Scenario: implementation/runtime review — WHEN review 类型非 PLAN_REVIEW THEN 走现有活跃 Plan 检查逻辑，不检查 tongyi

### Requirement: Plan 状态自动追踪

系统 SHALL 通过 plan_track 自动解析 Plan 文件进度。

- Scenario: 单 Plan 追踪 — WHEN `plan_track({ planName })` THEN 解析 tasks.md [x] 计数 + checklist.md [T]/[R] 计数 → PlanRecord
- Scenario: 全量补录 — WHEN `plan_track({ scanAll: true })` THEN 遍历 plans/ 所有 `*-plan-v*.md` → PlanRecord upsert
- Scenario: review 缺失检测 — WHEN plan_track 发现 review 文件不存在 THEN ReviewRecord.reviewPath=null

### Requirement: Review 质量指标采集

系统 SHALL 通过 review_track 解析 review 文件提取质量指标。

- Scenario: 解析 review — WHEN `review_track({ planName })` THEN 解析 review-*.md → p0Count/p1Count/backflowRate → ReviewRecord

### Requirement: 轮次闭合审计

系统 SHALL 在每轮所有 Task 完成后追加一条 ROUND_CLOSED 记录作为轮次边界标记。注意：ROUND_CLOSED 不替代逐 Task 的 `record_dev_operation`（后者在 ADD-7 策略表中逐文件定义），而是在所有 Task devlog 已落库后追加一条 `action=ROUND_CLOSED` 的汇总标记，便于 `query_audit_logs` 按轮次边界快速定位。

- Scenario: 轮次完成 — WHEN 该轮所有 Task 验收通过且各自 devlog 已落库 THEN 调用 `record_dev_operation({ targetType: "PLAN", action: "ROUND_CLOSED", targetId: "{planName}::round{N}" })` 追加一条闭合标记
- Scenario: 轮次未完 — WHEN 存在未通过的 Task THEN 禁止追加 ROUND_CLOSED，继续执行剩余 Task
