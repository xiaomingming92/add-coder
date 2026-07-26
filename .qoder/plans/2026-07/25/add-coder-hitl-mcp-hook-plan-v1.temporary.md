# add-coder-hitl-mcp-hook-plan-v1.temporary

> HITL 审议证据链。本文件记录 Plan 的 HITL 审议全过程，保留为历史证据，不删除。
> **实施主体**：add-coder（prisma/skills/rules），weather_proxy 通过 sync 消费。
> **审议结果**：已 tongyi → [正式 Plan](./add-coder-hitl-mcp-hook-plan-v1.md)

## HITL 计划总览

| 维度 | 内容 | 决策 |
|------|------|:---:|
| **背景** | LLM 跳过 HITL temporary.md 直接写正式 Plan/Review。需 MCP + hook 强制拦截。HITL 应为通用人机审核架构（Plan + Review 双场景），支持完整 CRUD + 软删除审计。同时 add.prisma 缺少 Plan/Review 状态表，目前靠正则匹配 markdown checkbox 算进度，需新增 PlanRecord + ReviewRecord + HitlRecord 三表联动 | 了解 |
| **实施主体** | **add-coder**（prisma 模型 + MCP 工具 + SKILL + rules），weather_proxy 为消费者（sync 后使用） | 同意 |
| **数据模型** | add.prisma 新增 3 表。详见下方字段清单 | 同意 |
| **MCP 工具** | 9 工具：HITL×3（`create_hitl({ planName, type })` / `update_hitl({ planName, type, status, reason? })` / `status_hitl({ planName, type })`）+ Plan×3（`plan_track` / `plan_status` / `plan_sync`）+ Review×3（`review_track` / `review_status` / `review_sync`）。type 统一入参区分 PLAN/PLAN_REVIEW。review_status/sync 补齐 ReviewRecord 查询和回写能力 | 同意 |
| **文件命名** | 提案文件按 `hitl-template.md` 生成，`doc-format-guard` + `hitl-template.schema.json` 校验。通过后写 `.hitl-tongyi-{planName}` 标记，驳回写 `.hitl-bohui-{planName}`。不再叫 temporary.md | 同意 |
| **模板 + schema** | 新增 `hitl-template.md` + `hitl-template.schema.json`，doc-format-guard 校验 temporary 文件结构 | 同意 |
| **新增依赖** | 无 | 同意 |
| **预计文件数** | add-coder 约 12 文件（prisma 1 + MCP 3 + hook 1 + SKILL 1 + rules 1 + templates 2 + index 1 + scripts 1 + tests 1） | 同意 |
| **预计轮次** | 3 轮：prisma 模型 → MCP 工具 + hook → SKILL/rules/templates 配套 | 同意 |

## 数据模型字段清单

### HitlRecord

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | @id @default(cuid()) | 主键 |
| planName | String | | Plan 名称，同一 Plan 可有多轮审批记录 |
| round | Int | @default(1) | 审批轮次，驳回后重新 create 时 +1 |
| type | HitlType | @default(PLAN) | PLAN \| PLAN_REVIEW |
| status | HitlStatus | @default(DRAFT) | DRAFT→SUBMITTED→TONGYI\|BOHUI。BOHUI 后不可再变，修正后新建 round+1 记录 |
| proposalPath | String? | | 提案文件路径（原 temporary.md） |
| approvedAt | DateTime? | | tongyi 时间 |
| rejectedAt | DateTime? | | bohui 时间 |
| rejectReason | String? | | 驳回原因 |
| createdBy | String | @default("ai-assistant") | 创建者 |
| createdAt | DateTime | @default(now()) | |
| updatedAt | DateTime | @updatedAt | |

### PlanRecord

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | @id @default(cuid()) | 主键 |
| planName | String | @unique | 关联 HitlRecord |
| planPath | String | | .qoder/plans/.../xxx-plan-v1.md |
| specPath | String? | | .qoder/specs/.../spec.md |
| tasksPath | String? | | .qoder/specs/.../tasks.md |
| checklistPath | String? | | .qoder/specs/.../checklist.md |
| totalTasks | Int | @default(0) | tasks.md 中 Task 总数 |
| doneTasks | Int | @default(0) | tasks.md 中 [x] 勾选数 |
| checklistT | Int | @default(0) | checklist.md [T] 项数 |
| checklistTDone | Int | @default(0) | checklist.md [T] 已通过数 |
| checklistR | Int | @default(0) | checklist.md [R] 项数 |
| planKeyword | String | | DPS 检索关键词 |
| createdAt | DateTime | @default(now()) | |
| updatedAt | DateTime | @updatedAt | |

### ReviewRecord

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | @id @default(cuid()) | 主键 |
| planName | String | @unique | 关联 PlanRecord |
| type | ReviewType | @default(PLAN_REVIEW) | PLAN_REVIEW \| IMPLEMENTATION \| RUNTIME。仅 PLAN_REVIEW 走 HITL |
| reviewPath | String | | .qoder/reviews/...-review*.md |
| p0Count | Int | @default(0) | P0 严重问题数 |
| p1Count | Int | @default(0) | P1 中等问题数 |
| backflowRate | Int | @default(0) | Plan [回流:] 标记命中率 (%) |
| createdAt | DateTime | @default(now()) | |
| updatedAt | DateTime | @updatedAt | |

### 枚举

```prisma
enum HitlType   { PLAN PLAN_REVIEW }
enum HitlStatus { DRAFT SUBMITTED TONGYI BOHUI }
enum ReviewType { PLAN_REVIEW IMPLEMENTATION RUNTIME }
```

## SKILL / Rules 调整清单

| 文件 | 改动 |
|------|------|
| `add-paradigm/SKILL.md` | Plan 流程改为：`create_hitl` → 按 `hitl-template.md` 生成提案文件 → 人工 `tongyi` / `bohui` → 通过后转为正式 Plan。增加 `status_hitl` 前置检查。不再使用 temporary.md 命名 |
| `project_rules.md` | ADD-13 HITL 人机审核：Plan/Review 必须经过 HITL 审批，提案文件按模板生成+ schema 校验，禁止跳过直接写正式文件 |
| `pre-tool-use.sh` | 拦截 `.qoder/plans/` `.qoder/reviews/` 正式文件写入，检查 `.hitl-tongyi-{planName}` 存在才放行 |
| `doc-format-guard.sh` | 新增 `hitl-template.schema.json` 校验提案文件结构 |

## 验证用例：现有 Plan 三表联动演示

以 add-coder 已落地的 `add-coder-agent-memory-plan-v1` 为验证样本，展示三表如何替代当前的正则匹配 + 人肉检查：

```
add-coder-agent-memory-plan-v1（现有文件）
├── .qoder/plans/2026-07/16/add-coder-agent-memory-plan-v1.md  ← Plan 正文
├── .qoder/reviews/add-coder-agent-memory-review-v1.md          ← 引用但不存在！
├── 无 .hitl-tongyi-* 标记（历史 Plan，HITL 上线前已落地）

三表映射：
┌─────────────────────────────────────────────────────────────┐
│ HitlRecord                                                  │
│   planName:     add-coder-agent-memory-plan-v1              │
│   type:         PLAN                                        │
│   status:       TONGYI           ← 历史 Plan 补录为已通过   │
│   proposalPath: null             ← 无 HITL 提案（历史债）   │
│                                                              │
│ PlanRecord                                                  │
│   planName:     add-coder-agent-memory-plan-v1              │
│   planPath:     .qoder/plans/2026-07/16/...-plan-v1.md      │
│   totalTasks:   13               ← plan_track 自动扫描      │
│   doneTasks:    0（未勾选）       ← plan_track 自动计数      │
│   reviewPath:   null             ← review 文件缺失标记      │
│                                                              │
│ ReviewRecord                                                │
│   planName:     add-coder-agent-memory-plan-v1              │
│   type:         PLAN_REVIEW                                 │
│   reviewPath:   null             ← 缺失！plan_track 报警    │
│   p0Count:      0                ← 未评审，无数据            │
│   backflowRate: 0                ← 未评审，无数据            │
└─────────────────────────────────────────────────────────────┘
```

**验证价值**：这一个 Plan 集齐了三种典型场景——

| 场景 | 说明 | plan_track 行为 |
|------|------|:--|
| ✅ 自动追踪 | 13 个 Task 的 done/total 计数 | 解析 tasks.md 的 `[x]` 标记 → 写入 PlanRecord |
| ⚠️ 缺失报警 | Plan 引用 review 文件但不存在 | `reviewPath: null` → plan_status 标记「review 缺失」 |
| 🔙 历史补录 | HITL 上线前的 Plan，无审批记录 | 手动 `create_hitl` + `update_hitl(status=TONGYI)` 补录 |

验收标准：`plan_track` 跑完后三表均有记录，`plan_status` 能区分「正常运行」和「review 缺失」。

## 附：PlanRecord 历史补录策略

HITL 系统上线后，现有 Plan 文件不会自动迁移。`plan_track` 需要支持两种模式：

```
plan_track({ planName })          ← 单 Plan 追踪（日常使用）
plan_track({ scanAll: true })     ← 全量扫描 .qoder/plans/ 补录历史（一次性）
```

扫描逻辑：按 caijuehub 的 magicDir 探测机制，遍历项目所有 IDE 适配器目录（`.qoder/` `.claude/` `.add/` `.vscode/` `.trae/` 等）下的 `plans/` 子目录中所有 `*-plan-v*.md` → 对每个解析 tasks/checklist → PlanRecord upsert；若 Plan 内有 `Review:` 引用但对应 review 文件不存在 → ReviewRecord 标记 `reviewPath: null`。
