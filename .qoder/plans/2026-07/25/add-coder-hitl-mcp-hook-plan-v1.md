# add-coder-hitl-mcp-hook-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。

## PLAN 元信息

- **Plan 名称**: add-coder-hitl-mcp-hook-v1
- **启动时间**: 2026-07-25T16:00:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-hitl-mcp-hook-review-v1.md`
  - Spec: `.qoder/specs/add-coder-hitl-mcp-hook/spec.md`
  - Tasks: `.qoder/specs/add-coder-hitl-mcp-hook/tasks.md`
  - Checklist: `.qoder/specs/add-coder-hitl-mcp-hook/checklist.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| prisma/add.prisma | MODEL | MODEL_CREATED | 无三表 | 新增 HitlRecord + PlanRecord + ReviewRecord + 3 enum | ~~待实施~~ → ✅ 已完成（迁移 202607270147） [2026-07-27 修订: 轮次1完成] |
| ~~src/mcp/hitl-tools.ts~~ → templates/core/scripts/mcp-server/tools/hitl.ts | COMPONENT | COMPONENT_CREATED | 不存在 | 3 个 HITL MCP 工具可调用 | ~~待实施~~ → ✅ 已完成 ~~[2026-07-27 修订: 轮次2完成，路径修正]~~ → ✅ 已完成 [2026-07-27 修订: 轮次2完成，路径修正；新增 inputRequired 交互式确认 + _fallback 降级模式] |
| ~~src/mcp/plan-tools.ts~~ → templates/core/scripts/mcp-server/tools/plan.ts | COMPONENT | COMPONENT_CREATED | 不存在 | 3 个 Plan MCP 工具可调用 | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次2完成，路径修正] |
| ~~src/mcp/review-tools.ts~~ → templates/core/scripts/mcp-server/tools/review.ts | COMPONENT | COMPONENT_CREATED | 不存在 | 3 个 Review MCP 工具可调用 | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次2完成，路径修正] |
| templates/core/hooks/pre-tool-use.sh | CONFIG | CONFIG_MODIFIED | 无 HITL 拦截 | plans/reviews 写入拦截 + tongyi 检查 | 待实施 |
| templates/core/skills/add-paradigm/SKILL.md | DOC | DOC_UPDATED | 无 HITL 流程 | ~~Plan/Review 流程含 create_hitl + status_hitl~~ → §0.0 跨轮上下文 + §A.0 增量修订 + DEVELOPMENT.md 引用 + HITL MCP 工具流 + devlog 操作细则 ~~[2026-07-27 修订: SKILL 三重更新]~~ → + inputRequired 交互/降级双轨文档 [2026-07-27 修订: SKILL 三重更新 + 交互降级文档] | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次3 SKILL部分完成；inputRequired 交互/降级文档] |
| templates/core/rules/project_rules.md | DOC | DOC_UPDATED | 无 devlog 双层记录 | ~~新增 ADD-13 HITL 人机审核规则~~ → ADD-7 新增 devlog 双层记录与轮次闭合子章节 [2026-07-27 修订: 不新建 ADD-13，在 ADD-7 扩展现有规则] | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次3 rules部分完成] |
| templates/core/templates/hitl-template.md | TEMPLATE | TEMPLATE_CREATED | 不存在 | HITL 提案模板可用 | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次3完成] |
| templates/core/templates/hitl-template.schema.json | CONFIG | CONFIG_CREATED | 不存在 → JSON Schema 格式 | doc-format-guard 兼容格式（sections/placeholders/forbidden_terms） | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次3完成，格式修正为 doc-format-guard 兼容] |
| templates/core/hooks/doc-format-guard.sh | CONFIG | CONFIG_MODIFIED | 无 hitl schema | 新增 *hitl* → hitl-template.md 匹配规则 | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次3完成] |
| tests/hitl.test.ts | TEST | TEST_CREATED | 不存在 | HITL 三表 CRUD + hook 拦截测试 | 待实施 |
| PLAN::round1 | PLAN | ROUND_CLOSED | 轮次 1 未开始 | 轮次 1 闭合: Prisma 模型 + migrate + power | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次1闭合] |
| PLAN::round2 | PLAN | ROUND_CLOSED | 轮次 2 未开始 | 轮次 2 闭合: MCP 工具（9个）+ index 注册 + sync | ~~待实施~~ → ✅ 已完成 [2026-07-27 修订: 轮次2闭合] |
| PLAN::round3 | PLAN | ROUND_CLOSED | 轮次 3 未开始 | 轮次 3 闭合: SKILL/Rules（devlog已就位，Templates待完成）+ HITL 工具 inputRequired 交互升级 | → 进行中 [2026-07-27 修订: SKILL+Rules+Tools 已完成，Templates 待 Task 3.3-3.4] |

---

## HITL 计划总览（一次性提交人类审核）

> **审议证据**：~~[add-coder-hitl-mcp-hook-plan-v1.temporary.md](./add-coder-hitl-mcp-hook-plan-v1.temporary.md) — 已 tongyi~~ [2026-07-27 修订: temporary.md 机制已被 create_hitl MCP 工具替代，见 SKILL.md §独立能力：生成 Plan]
>
> **Review 回流**：已按 [review-v1](../reviews/add-coder-hitl-mcp-hook-review-v1.md) 决策修正——#1 ReviewRecord 1:1→1:N，#2 Hook 区分 review 类型，#3 补充 @relation 外键，#4 保留 SUBMITTED，#5 BOHUI=软删除（无需独立 delete_hitl）+ 文件命名从临时 temporary.md 演进为 hitl-template.md 规范生成，#6 标记文件无 .md 后缀，#7 BOHUI 回环，#8 消费标签，#9 sync 验证 Task。[回流: Review P0 #1,#2 P1 #3,#4,#5,#6 P2 #7,#8,#9]

---

## 一、背景与目标

### 1.1 问题现状

**问题 A：HITL 跳过无拦截**。LLM 经常跳过 HITL 提案直接写正式 Plan/Review 文件，没有强制拦截机制。当前只能靠记忆提醒，无法自动化阻断。

**问题 B：Plan 状态不可查询**。add.prisma 缺少 Plan/Review 状态表，目前靠正则匹配 markdown checkbox 算进度（`grep '^\[x\]' tasks.md | wc -l`），`plan_status` 类查询无法实现。

**问题 C：审批标记无标准化**。`.hitl-tongyi-{planName}` / `.hitl-bohui-{planName}` 命名规范已确定但未落地，审批结果无法被 hook 直接读取。

### 1.2 目标

在 add-coder 治理体系中构建通用 HITL 人机审核架构：

1. **Prisma 三表**：HitlRecord（审批状态机）+ PlanRecord（计划追踪，替代正则匹配）+ ReviewRecord（评审记录，覆盖三种 review 类型）
2. **MCP 工具 9 个**：
   - `create_hitl({ planName, type, _fallback? })` — 创建审批提案，`type` 区分 `PLAN` / `PLAN_REVIEW`。~~默认直接创建 DB+文件~~ → 支持 inputRequired 弹框让用户确认，确认后才写入。`_fallback: true` 跳过弹框按原始行为创建 [2026-07-27 修订: 新增 inputRequired 交互确认 + _fallback 降级]
   - `update_hitl({ planName, type, status?, reason?, _fallback? })` — 状态切换。**交互模式弹框三选一**：同意→TONGYI、驳回→BOHUI、取消→无操作。AI 无需传 `status`，弹框结果自动映射。降级模式(`_fallback`)仍需手动传 `status`。~~默认直接写哨兵+更新 DB~~ [2026-07-27 修订: 三按钮弹框，用户直接选同意/驳回/取消]
   - `status_hitl({ planName, type })` — 查询审批状态
   - `plan_track({ planName?, scanAll? })` — 解析 tasks/checklist → PlanRecord + 检测 review 文件 → ReviewRecord 基础记录
   - `plan_status({ planName })` — 查询 Plan 进度，标记 review 缺失等异常
   - `plan_sync({ planName })` — PlanRecord 数据回写 Plan 文档
   - `review_track({ planName })` — 解析 review-*.md → ReviewRecord（p0/p1/backflowRate）
   - `review_status({ planName })` — 查询 Review 质量指标
   - `review_sync({ planName })` — ReviewRecord 数据回写 review 文档
3. **Hook 拦截**：pre-tool-use.sh 拦截 `.qoder`/plans/ 全部写入 + `.qoder`/reviews/ 中匹配 `review-template.md` 特征的文件写入（仅 PLAN_REVIEW 走 HITL，implementation/runtime review 不受影响），无 tongyi 标记 → BLOCKED [回流: Review P0 #2 Hook区分review]
4. **SKILL/Rules 配套**：add-paradigm SKILL 更新 + project_rules ADD-13 + hitl-template.md + schema

weather_proxy 通过 `npx add-coder sync --adapter qoder --patch` 消费。

---

## 二、方案选型

| 方案 | 审计可追溯 | LLM 绕过难度 | 状态迁移可靠 | 结论 |
|------|:--:|:--:|:--:|------|
| A: hook 检查文件标记（无 DB） | ❌ 文件丢失即无记录 | 中（hook 拦截写入） | ❌ 无状态机约束 | 不取 |
| B: 复用 AuditLog（弱类型） | ✅ | 中 | ❌ LLM 常漏填 action/reason | 不取 |
| C: 独立 HitlRecord 表 + hook 拦截 | ✅ 强类型状态机 | 低（hook 检查 DB） | ✅ Prisma enum 约束 | **采用** |

**选型理由**：方案 C 是唯一在 schema 层强制状态机的方案（`HitlStatus { DRAFT SUBMITTED TONGYI BOHUI }` 不可乱填），同时 DB 记录保证了 temporary.md 丢失后状态可恢复。三维度覆盖：**方向验证**（方案 A/B 均被否决，C 通过架构评审）、**语义对齐**（Prisma enum 约束与 hook 逻辑一致）、**兼容性**（不修改 AuditLog/DevOperation，纯增量）。

---

## 三、架构设计

### 3.1 数据流转（文件级）

```
create_hitl({ planName, type, _fallback? })
  │
  ├─ ~~直接写 DB + 文件~~ → inputRequired 弹框：[同意 / 取消] [2026-07-27 修订: 同意/取消二按钮]
  │   ├─ 用户选「同意」→ 写 HitlRecord（status: DRAFT）+ 按 hitl-template.md 生成提案文件
  │   ├─ 用户选「取消」→ 返回取消消息，不写 DB
  │   └─ _fallback: true → 跳过弹框，直接写 DB + 文件
  │
  ▼
人工审核提案文件
  │
  ▼
update_hitl({ planName, type, _fallback? })  ← status 由弹框结果决定 [2026-07-27 修订: status 可选]
  │
  ├─ ~~直接写哨兵+更新 DB~~ → inputRequired 弹框：[同意 / 驳回 / 取消] [2026-07-27 修订: 三按钮弹框]
  │   ├─ 用户选「同意」→ 自动 TONGYI，approvedAt → now() + 写 .hitl-tongyi-{planName} 哨兵
  │   ├─ 用户选「驳回」→ 自动 BOHUI，rejectedAt → now() + 写 .hitl-bohui-{planName} 哨兵
  │   ├─ 用户选「取消」→ 返回取消消息，不操作
  │   └─ _fallback: true → 跳过弹框，需手动传 status，直接写哨兵+更新 DB
  │
  ▼
LLM 写正式 Plan → `.qoder`/plans/ 或 `.qoder`/reviews/
  │
  ├─ pre-tool-use hook 拦截写入
  ├─ 检查 .hitl-tongyi-{planName} 存在？
  │   ├─ 存在 → 放行
  │   └─ 不存在 → ❌ BLOCKED
  │
  │  ※ reviews/ 仅对 PLAN_REVIEW 类型做 tongyi 检测
  │     implementation/runtime review 走现有活跃 Plan 检查逻辑
  │
  ▼
plan_track({ planName })
  │
  ├─ 解析 tasks.md（[x] 计数 → PlanRecord.totalTasks/doneTasks）
  ├─ 解析 checklist.md（[T]/[R] 计数 → PlanRecord.checklistT/checklistR）
  ├─ 检测 review 文件存在性 → ReviewRecord.reviewPath/null
  └─ 更新 PlanRecord + ReviewRecord

review_track({ planName })
  │
  ├─ 解析 review-*.md（P0/P1 计数 + [回流:] 标记统计）
  └─ 更新 ReviewRecord（p0Count/p1Count/backflowRate）

驳回路径（软删除，通过 update_hitl status=BOHUI 实现）: [回流: Review P1 #5 BOHUI=软删除]
update_hitl({ planName, type, status: BOHUI, reason: "..." })  ← 交互模式不传 status，降级模式手动传 [2026-07-27 修订: 交互模式三按钮自动映射状态]
  ├─ 交互弹框选「驳回」（或 _fallback 手动传 status: BOHUI）→ HitlRecord.status → BOHUI，rejectedAt → now()，rejectReason → reason
  ├─ 提案文件保留为证据链（不删除）
  └─ AI 按 reason 修正 Plan → create_hitl({ planName, type }) 新 round 提交

> **驳回后重启**：BOHUI 记录的 status 不可再变（审计不可篡改）。**证据持久化**：驳回记录永久保留，提案文件不删除，全链路可追溯。
> 修正后重新 `create_hitl` 创建**新一条** HitlRecord（同一 planName，round +1）。
> HitlRecord 唯一约束为 `@@unique([planName, round])`，允许多轮审批记录共存。[回流: Review P2 #7 BOHUI回环]
```

### 3.2 系统构图

```mermaid
graph TB
    subgraph 消费者
        LLM[LLM / IDE AI 助手]
        HUMAN[人类审核者]
        INTERACT[ 交互门
inputRequired 弹框确认]
    end

    subgraph MCP工具层
        HITL_TOOLS[HITL×3<br/>create_hitl / update_hitl / status_hitl]
        PLAN_TOOLS[Plan×3<br/>plan_track / plan_status / plan_sync]
        REVIEW_TOOLS[Review×3<br/>review_track / review_status / review_sync]
    end

    subgraph Hook拦截层
        PRE_TOOL[pre-tool-use.sh<br/>写入拦截 + tongyi 检查]
        DOC_GUARD[doc-format-guard.sh<br/>schema 校验]
    end

    subgraph 数据层
        DB[(Prisma/PostgreSQL)]
        HITL_TABLE[HitlRecord]
        PLAN_TABLE[PlanRecord]
        REVIEW_TABLE[ReviewRecord]
        MARKER_FILES[.hitl-tongyi-{planName}<br/>.hitl-bohui-{planName}] [回流: Review P1 #6 无.md后缀]
    end

    subgraph 文件系统
        PLANS_DIR[`.qoder`/plans/]
        REVIEWS_DIR[`.qoder`/reviews/]
        PROPOSAL[提案文件<br/>hitl-template.md 生成]
    end

    LLM -->|"create_hitl({ planName, type, _fallback? })"| HITL_TOOLS
    HITL_TOOLS -->|"inputRequired 确认创建"| INTERACT
    INTERACT -->|"proceed / cancel"| HITL_TOOLS
    HITL_TOOLS -->|"INSERT status=DRAFT"| HITL_TABLE
    HITL_TOOLS -->|"生成"| PROPOSAL

    PROPOSAL -->|"审核"| HUMAN
    HUMAN -->|"拍板"| LLM

    LLM -->|"update_hitl({...status:TONGYI, _fallback?})"| HITL_TOOLS
    HITL_TOOLS -->|"inputRequired 确认通过"| INTERACT
    INTERACT -->|"proceed / cancel"| HITL_TOOLS
    HITL_TOOLS -->|"UPDATE status=TONGYI"| HITL_TABLE
    HITL_TOOLS -->|"写入 .hitl-tongyi-*"| MARKER_FILES

    LLM -->|"写入正式文件"| PRE_TOOL
    PRE_TOOL -->|"检查 tongyi 标记"| MARKER_FILES
    PRE_TOOL -->|"放行"| PLANS_DIR
    PRE_TOOL -->|"放行"| REVIEWS_DIR
    PRE_TOOL -->|"BLOCKED"| LLM

    LLM -->|"plan_track({ planName })"| PLAN_TOOLS
    LLM -->|"review_track({ planName })"| REVIEW_TOOLS
    PLAN_TOOLS -->|"解析 tasks/checklist"| PLANS_DIR
    PLAN_TOOLS -->|"UPSERT"| PLAN_TABLE
    REVIEW_TOOLS -->|"解析 review-*.md"| REVIEWS_DIR
    REVIEW_TOOLS -->|"UPSERT p0/p1/backflow"| REVIEW_TABLE

    DOC_GUARD -->|"校验 schema"| PROPOSAL
    DOC_GUARD -->|"校验"| PLANS_DIR

    DB --> HITL_TABLE
    DB --> PLAN_TABLE
    DB --> REVIEW_TABLE

    HITL_TABLE -->|"~~planName FK~~ → 自然键关联"| PLAN_TABLE [2026-07-27 修订]
    PLAN_TABLE -->|"planName FK"| REVIEW_TABLE
```

### 3.3 文件树

```
add-coder/
├── prisma/
│   └── add.prisma                         ← 新增 HitlRecord + PlanRecord + ReviewRecord + 3 enum
├── ~~src/mcp/~~ → templates/core/scripts/mcp-server/                      ← 修正：MCP 工具真源在 templates，非 src/mcp [2026-07-27 修订: 路径对齐 SSOT]
│   ├── ~~hitl-tools.ts~~ → tools/hitl.ts                    ← 新建：create_hitl / update_hitl / status_hitl
│   ├── ~~plan-tools.ts~~ → tools/plan.ts                    ← 新建：plan_track / plan_status / plan_sync
│   └── ~~review-tools.ts~~ → tools/review.ts                ← 新建：review_track / review_status / review_sync
├── templates/core/
│   ├── hooks/
│   │   ├── pre-tool-use.sh                ← 修改：新增 plans/reviews 写入拦截 + tongyi 检查
│   │   └── doc-format-guard.sh            ← 修改：新增 hitl-template.schema.json 校验路径
│   ├── skills/add-paradigm/SKILL.md       ← 修改：~~Plan/Review 流程含 create_hitl + status_hitl~~ → §0.0 跨轮上下文 + §A.0 增量修订 + DEVELOPMENT.md 引用 + HITL 工具流 + devlog Step 8 [2026-07-27 修订: SKILL 三重更新]
│   ├── rules/project_rules.md             ← 修改：~~新增 ADD-13 HITL 人机审核规则~~ → ADD-7 新增 devlog 双层记录与轮次闭合 [2026-07-27 修订: 扩展现有规则非新建]
│   └── templates/
│       ├── hitl-template.md               ← 新建：HITL 提案模板
│       └── hitl-template.schema.json      ← 新建：提案文件结构校验
├── tests/
│   └── hitl.test.ts                       ← 新建：三表 CRUD + hook 拦截测试
└── 
    └── .hitl-tongyi-{planName}            ← 运行时生成：审批通过标记
    └── .hitl-bohui-{planName}             ← 运行时生成：驳回标记
```

### 3.4 三表关系

```
HitlRecord.planName ──(自然键关联，非 FK)── PlanRecord.planName ──(1:N，FK)── ReviewRecord.planName [2026-07-27 修订: HitlRecord.planName 不唯一（@@unique([planName, round])），无法建 FK]

HitlRecord      PlanRecord         ReviewRecord
审批状态机      计划追踪            评审记录
DRAFT           planPath            reviewPath
→ SUBMITTED     totalTasks/doneTasks  p0Count/p1Count
→ TONGYI        checklistT/R       backflowRate
→ BOHUI         planKeyword        type: PLAN_REVIEW|IMPLEMENTATION|RUNTIME [回流: Review P0 #1 1:1→1:N]
```

> **#4 决策**：保留 SUBMITTED 状态——当前数据流使用 DRAFT → TONGYI/BOHUI 直接跳转，SUBMITTED 为后续扩展流程预留（如提交后等待多人审批、跨系统通知等）。[回流: Review P1 #4 保留SUBMITTED]

### 3.5 数据模型变更

`prisma/add.prisma` 新增 3 个 model + 3 个 enum：

```prisma
enum HitlType   { PLAN PLAN_REVIEW }
enum HitlStatus { DRAFT SUBMITTED TONGYI BOHUI }
enum ReviewType { PLAN_REVIEW IMPLEMENTATION RUNTIME }

model HitlRecord  { id String @id; planName String; round Int @default(1); type HitlType; status HitlStatus; ...
  @@unique([planName, round]) } [回流: Review P1 #3 外键+round]
model PlanRecord  { id String @id; planName String @unique; totalTasks Int; doneTasks Int; ... }
model ReviewRecord { id String @id; planName String; plan PlanRecord @relation(fields: [planName], references: [planName]); type ReviewType; reviewPath String; ... }
```

完整字段清单见 [temporary.md 证据链](./add-coder-hitl-mcp-hook-plan-v1.temporary.md#数据模型字段清单)。

Migration 后需执行 `npx prisma generate` 重新生成 Prisma Client。

---

## 四、实施 Task + 依赖图

```
轮次 1: Prisma 模型
  ├── Task 1.1: add.prisma 新增三表 + 枚举
  ├── Task 1.2: prisma migrate + client regen（幂等）
  └── Task 1.3: ROUND_CLOSED（record_dev_operation）
        │
        ▼（产出: model/type 定义，轮次 2 消费）
轮次 2: MCP 工具 + Hook
  ├── Task 2.1: create_hitl / update_hitl / status_hitl
  │     │  [消费 HitlRecord] [回流: Review P2 #8 消费标签]
  │     ▼
  ├── Task 2.2: plan_track / plan_status / plan_sync
  │     │  [消费 PlanRecord + ReviewRecord]
  │     ▼
  ├── Task 2.3: review_track / review_status / review_sync
  │     │  [消费 ReviewRecord]
  │     ▼
  ├── Task 2.4: pre-tool-use.sh 拦截逻辑
  │     │  [消费 .hitl-tongyi 标记文件]
  │     ▼
  ├── Task 2.5: MCP index 注册 9 工具
  ├── Task 2.6: ROUND_CLOSED
        │
        ▼（产出: MCP 工具可调用，hook 生效，轮次 3 消费）
轮次 3: SKILL / Rules / Templates
  ├── Task 3.1: add-paradigm SKILL 更新
  ├── Task 3.2: project_rules.md 新增 ADD-13
  ├── Task 3.3: hitl-template.md + schema.json
  ├── Task 3.4: doc-format-guard 扩展
  ├── Task 3.5: plan_track({ scanAll: true }) 验证补录
  ├── Task 3.6: review_track 验证（解析 agent-memory 的 review 文件）
  ├── Task 3.7: weather_proxy sync 验证 [回流: Review P2 #9 sync验证Task]
  └── Task 3.8: ROUND_CLOSED
```

### 轮次 1: Prisma 模型

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 1.1 | 新增 HitlRecord + PlanRecord + ReviewRecord + 3 enum | `prisma/add.prisma` | 在现有 AuditLog/DevOperation 同级新增三表 | `tsc --noEmit` |
| 1.2 | prisma migrate + client regen | migration + `npx prisma generate` | 生成幂等迁移文件并执行，重新生成 Prisma Client | `prisma migrate dev` + `prisma generate` 通过 |
| 1.3 | ROUND_CLOSED | `record_dev_operation` | 轮次 1 闭合审计: action=ROUND_CLOSED, targetId=planName::round1 | DevOperation 表含记录 |

### 轮次 2: MCP 工具 + Hook

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 2.1 | 3 个 HITL 工具 | ~~`src/mcp/hitl-tools.ts`~~ → `templates/core/scripts/mcp-server/tools/hitl.ts` [路径修正] | create_hitl({ planName, type, _fallback? }) / update_hitl({ planName, type, status, reason?, _fallback? }) / status_hitl({ planName, type }) — 支持 inputRequired 弹框确认 + _fallback 原始代码降级 【2026-07-27 新增: 交互确认+降级模式】 | ~~create/update/status MCP 可调用~~ → ✅ [2026-07-27] → ✅ inputRequired + _fallback [2026-07-27 修订: 交互确认升级] |
| 2.2 | 3 个 Plan 工具 | ~~`src/mcp/plan-tools.ts`~~ → `templates/core/scripts/mcp-server/tools/plan.ts` [路径修正] | plan_track({ planName?, scanAll? }) / plan_status({ planName }) / plan_sync({ planName }) | ~~track/status/sync MCP 可调用~~ → ✅ [2026-07-27] |
| 2.3 | 3 个 Review 工具 | ~~`src/mcp/review-tools.ts`~~ → `templates/core/scripts/mcp-server/tools/review.ts` [路径修正] | review_track({ planName }) / review_status({ planName }) / review_sync({ planName }) | ~~track/status/sync MCP 可调用~~ → ✅ [2026-07-27] |
| 2.4 | hook 拦截 | `templates/core/hooks/pre-tool-use.sh` | 仅拦截 plans/ 全部 + reviews/ 中匹配 review-template 特征的文件（PLAN_REVIEW），implementation/runtime review 走现有逻辑 | 无标记时阻断
| 2.5 | index 注册 | ~~MCP tools/index~~ → `templates/core/scripts/mcp-server/tools/index.ts` | 9 工具注册到 MCP server（总 27 tools） | ~~工具列表含全部 9 个~~ → ✅ [2026-07-27] |
| 2.6 | ROUND_CLOSED | `record_dev_operation` | 轮次 2 闭合审计: action=ROUND_CLOSED, targetId=planName::round2 | ~~DevOperation 表含记录~~ → ✅ [2026-07-27] |

### 轮次 3: SKILL / Rules / Templates

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 3.1 | SKILL 更新 | `templates/core/skills/add-paradigm/SKILL.md` | ~~Plan/Review 流程含 create_hitl + status_hitl 步骤~~ → §0.0 跨轮上下文恢复、§A.0 增量修订、DEVELOPMENT.md 深层引用、HITL MCP 工具流、devlog Step 8 操作细则 ~~[2026-07-27 修订: 实际产出]~~ → + inputRequired 交互/降级双轨文档 [2026-07-27 修订: SKILL 三重更新 + 交互降级文档] | ~~SKILL 文本含上述关键词~~ → ✅ 已完成 [2026-07-27] |
| 3.2 | ~~ADD-13 规则~~ → ADD-7 devlog 原则 | ~~`templates/core/rules/project_rules.md`~~ → 已完成 | ~~HITL 人机审核强制规则~~ → devlog 双层记录与轮次闭合（ADD-7 扩展） [2026-07-27 修订: 不新增 ADD-13] | ~~规则文件含"禁止跳过 HITL"~~ → ✅ 已完成 [2026-07-27] |
| 3.3 | 模板 + schema | `templates/core/templates/hitl-template.md` + `.schema.json` | HITL 提案模板及结构校验 | schema 校验通过 |
| 3.4 | guard 扩展 | `templates/core/hooks/doc-format-guard.sh` | 提案文件走 hitl schema 校验 | schema 匹配命中 |
| 3.5 | 验证扫描 | 调用 plan_track scanAll | 补录 agent-memory-plan-v1 三表记录 | 三表均有记录 |
| 3.6 | review 验证 | 调用 review_track | 解析 agent-memory 的 review 文件 | p0/p1/backflowRate 落表 |
| 3.7 | sync 验证 | weather_proxy 执行 sync | `npx add-coder sync --adapter qoder --patch` | HITL 规则在 weather_proxy 生效 |
| 3.8 | ROUND_CLOSED | `record_dev_operation` | 轮次 3 闭合审计: action=ROUND_CLOSED, targetId=planName::round3 | DevOperation 表含记录 |

---

## 五、验收标准

- [ ] `prisma migrate dev` 通过，三表可读写
- [ ] `npx tsc --noEmit` 通过
- [ ] `create_hitl({ planName, type })` — 默认弹 inputRequired 确认框，用户确认后写入 DB + 生成 hitl.md
- [ ] `create_hitl({ planName, type, _fallback: true })` — 跳过弹框直接创建（降级模式）
- [ ] `update_hitl({ planName, type })` — 默认弹框显示「同意/驳回/取消」三按钮，选「同意」自动 TONGYI，选「驳回」自动 BOHUI
- [ ] `update_hitl({ planName, type, status: "TONGYI", _fallback: true })` — 降级模式跳过弹框直接写哨兵
- [ ] `update_hitl({ planName, type, status: BOHUI, reason })` — 弹框确认后记录驳回时间+原因
- [ ] `pre-tool-use.sh` 无 tongyi 标记时阻断正式 Plan/Review 写入
- [ ] `plan_track({ scanAll: true })` 成功补录现存 Plan → PlanRecord + ReviewRecord
- [ ] `plan_status({ planName })` 能区分「正常运行」和「review 缺失」
- [ ] `review_track({ planName })` 正确解析 review 文件 → p0/p1/backflowRate
- [ ] weather_proxy `npx add-coder sync --adapter qoder --patch` 后 HITL 规则生效
- [ ] 每轮完成后 `record_dev_operation` 记录 `ROUND_CLOSED`（action=ROUND_CLOSED, targetType=PLAN, targetId=planName::roundN）

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| HITL 审议证据 | [`add-coder-hitl-mcp-hook-plan-v1.temporary.md`](./add-coder-hitl-mcp-hook-plan-v1.temporary.md) |
| ADD Route | `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-hitl-mcp-hook-review-v1.md` |
| Spec | `.qoder/specs/add-coder-hitl-mcp-hook/spec.md` |
| Tasks | `.qoder/specs/add-coder-hitl-mcp-hook/tasks.md` |
| Checklist | `.qoder/specs/add-coder-hitl-mcp-hook/checklist.md` |
| 验证用例 | `.qoder/plans/2026-07/16/add-coder-agent-memory-plan-v1.md` |
| 参考规范 | codein2027 `docs/大田精准耕播智能决策系统/knowledge/02-规范/《开发操作审计存档规范》.md` |
