# add-coder-hitl-mcp-hook-review-v1

## Review 元信息

- **Review 对象**: `add-coder-hitl-mcp-hook-plan-v1.md`（HITL 人机审核架构 Plan）
- **对比方案**: 方案 A（纯文件标记）/ 方案 B（复用 AuditLog）/ 方案 C（独立表 + hook 拦截）
- **Review 时间**: 2026-07-26
- **Review 类型**: 架构决策 / 方案选型 / 数据模型合规
- **覆盖维度**: 方向验证（#1 #2 架构矛盾 + §2 方案对比） / 语义对齐（#3 外键约束 + #6 后缀统一 + #8 消费标签） / 证据持久化（#5 软删除审计 + #7 回环闭环 + #4 状态保留） / 兼容性（#9 sync 验证 + §4 影响评估）
- **DPS 维度**: 数据模型/类型定义（§1 三表字段级审查 + §4 影响评估） / 性能影响（hook stat() O(1) 无性能退化） / 存储/索引成本（3 新表 ~100KB + 2 索引无额外存储压力） / 兼容性/向后兼容（不修改 AuditLog/DevOperation，纯增量）
- **前置阅读**: `add-coder-hitl-mcp-hook-plan-v1.md`、`add-coder-hitl-mcp-hook-plan-v1.temporary.md`

---

## HITL 发现总览（一次性提交人类审核）

> **规则**：AI 必须先在此表中列出 **所有发现**，等待人类一次性审核通过后再逐项推进。
> 禁止边发现边修改——这是批量审批入口，不是逐条对话。

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🔴 高 | 架构 | ReviewRecord 1:1 约束无法支撑三种 review 类型（PLAN_REVIEW/IMPLEMENTATION/RUNTIME） | 改为 1:N 关系，planName 移除 @unique | 接受/拒绝/修改 |
| 2 | 🔴 高 | 架构 | Hook 拦截过宽——未区分 review 类型，会错误阻断实现审查和运行时审查 | 增加 review 文件类型判断，仅 review-template.md 需要 HITL 检测 | 接受/拒绝/修改 |
| 3 | 🟡 中 | 数据完整性 | 三表间缺少 Prisma 外键 @relation 声明，可产生孤儿记录 | 补充跨表外键约束 + onDelete Cascade | 接受/拒绝/修改 |
| 4 | 🟡 中 | 设计冗余 | HitlStatus 枚举中的 SUBMITTED 在数据流中无消费路径 | 删除 SUBMITTED 或补充 SUBMITTED → TONGYI/BOHUI 流转 | 接受/拒绝/修改 |
| 5 | 🟡 中 | 功能缺失 | CRUD 缺少 D（delete_hitl），但 temporary.md 要求"完整 CRUD + 软删除" | 新增 `delete_hitl` 工具，走软删除路径 | 接受/拒绝/修改 |
| 6 | 🟡 中 | 一致性 | 标记文件名 ASCII 图（无 .md）与 Mermaid 图（有 .md）不一致 | 统一为无 `.md` 后缀：`.hitl-tongyi-{planName}` | 接受/拒绝/修改 |
| 7 | 🟢 低 | 流程闭环 | BOHUI 驳回到修正的回环路径未定义 | 数据流图中补充 BOHUI → AI 修正 → 重新 submit 的回环 | 接受/拒绝/修改 |
| 8 | 🟢 低 | 清晰度 | Task 依赖图对轮次1 Prisma 模型的消费关系标注不足 | 箭头补充 `[消费 HitlRecord/PlanRecord]` 标签 | 接受/拒绝/修改 |
| 9 | 🟢 低 | 任务完整 | §5 验收标准含 weather_proxy sync 验证但无独立 Task | 在轮次3后新增 sync 验证任务 | 接受/拒绝/修改 |

> **人类确认后**：AI 在下方逐条展开详细分析。每一条展开时必须引用上方编号。

---

## 1. 问题复现

add-coder 当前治理体系中缺少通用 HITL 人机审核架构。LLM 经常跳过 HITL 提案直接写正式 Plan/Review 文件，无强制拦截机制；Plan 状态靠 grep 正则匹配 markdown checkbox 计算，无结构化数据支持。

该 Plan 提出方案 C：Prisma 三表（HitlRecord + PlanRecord + ReviewRecord）+ MCP 9 工具 + hook 拦截 + SKILL/Rules/Templates 配套，将 HITL 从"人肉提醒"升级为"DB 状态机 + hook 强制拦截 + MCP 工具查询"的工程化方案。

Review 确认该方向正确，但存在以下需修正的问题：

### 🔴 #1 ReviewRecord 1:1 约束与三种 Review 类型的矛盾

Plan §3.4 声明 `PlanRecord.planName ──(1:1)── ReviewRecord.planName`，但 `ReviewType` 枚举定义了 `PLAN_REVIEW | IMPLEMENTATION | RUNTIME` 三种值。按 ADD 范式（ADD-9/10/11），一个 Plan 应有三种独立的审查：方案审查（Plan 后）、实现审查（Code 后）、运行时审查（Deploy 后）。1:1 约束使最多只能有一条 ReviewRecord，与三种审查需求冲突。

审查 `review-template.md` 与 `review-implementation-template.md` 的模板差异可进一步确认（前者有 HITL 表，后者含格式契约/框架版本），两个模板结构不同，不适合聚合到同一条记录。

### 🔴 #2 Hook 对 Review 类型的未区分干预

Plan 描述 hook 拦截为"拦截 plans/reviews 正式文件写入，无 tongyi 标记 → BLOCKED"。但根据现有规范映射，仅 `review-template.md`（方案审查，type=PLAN_REVIEW）走 HITL 流程，`review-implementation-template.md`（实现审查）和 `review-runtime-template.md`（运行时审查）属于工程内部审查，不需要 tongyi 标记检测。

当前 hook §B 对 `plans/` 写入已有"活跃 ADD Plan"检查，对 reviews 则完全没有区分。HITL 版本应：仅对 `reviews/` 中匹配 `review-template.md` 特征的文件做 tongyi 检测，其余 review 类型走现有活跃 Plan 检查逻辑。

### 🟡 #3 三表间缺少跨表外键约束

数据模型在 temporary.md 中三表的 `planName` 各自标注 `@unique` 但不存在跨表的 `@relation`。这允许：
- 创建 PlanRecord 而无对应 HitlRecord → 绕过 HITL 审批直接注册 Plan
- 创建 ReviewRecord 而无对应 PlanRecord → 审查孤悬
- 删除 HitlRecord 后 PlanRecord 成为孤儿

修正应为：PlanRecord.planName 对 HitlRecord.planName 建立可选 @relation（历史补录允许无审批），ReviewRecord.planName 对 PlanRecord.planName 建立必选 @relation。

### 🟡 #4 SUBMITTED 状态无消费路径

HitlStatus 枚举定义 `DRAFT SUBMITTED TONGYI BOHUI`，但完整数据流中：
- `create_hitl` → DRAFT
- `update_hitl(status: TONGYI)` → TONGYI
- `update_hitl(status: BOHUI)` → BOHUI

SUBMITTED 从未出现在任何状态转换路径中。两个选择：删除 SUBMITTED（简化状态机：DRAFT → TONGYI/BOHUI）；或将 create_hitl 默认值改为 SUBMITTED 并补充 HUMAN 确认从 SUBMITTED → TONGYI/BOHUI 的交互路径。

### 🟡 #5 delete_hitl 工具缺失

Plan 定义了 create/update/status 三工具，但临时文件审议明确要求"完整 CRUD + 软删除审计"。目前缺少删除能力。且此前已有软删除策略约定：temporary.md 重命名为 `.temporary.rejected.md`，哨兵文件重命名为 `.hitl-rejected-{planName}`。

### 🟡 #6 标记文件后缀不统一

§3.1 ASCII 图写 `.hitl-tongyi-{planName}`（无后缀），§3.2 Mermaid 图写 `.hitl-tongyi-*.md`（有 `.md` 后缀）。Hook 实现时可能因后缀判断导致不匹配。

### 🟢 #7 BOHUI 驳回后纠正闭环缺失

数据流图中 BOHUI 路径终止于"提案文件保留为证据链"，未定义 AI 应如何基于驳回原因修正 Plan 后重新提交。应补充回环：BOHUI → AI 按 reason 修正 → `create_hitl` 新 DRAFT（或复用现有记录重置）。

### 🟢 #8 Task 依赖图可增加更精确标注

ASCII 图中 Task 2.2/2.3 对轮次1 Prisma 模型（PlanRecord/ReviewRecord）的消费只在文字注释中标注，无显式箭头标签。

### 🟢 #9 weather_proxy sync 验证无独立 Task

§5 验收标准要求 `npx add-coder sync --adapter qoder --patch` 后 HITL 规则生效，但 §4 Task 表中无对应的验证任务。

---

## 2. 方案对比

### 2.1 方案 A：hook 检查文件标记（无 DB）

通过 hook 检查 `.hitl-tongyi-*` 标记文件是否存在，不涉及数据库。

| 维度 | 评估 |
|------|------|
| 审计可追溯 | ❌ 文件丢失即无记录 |
| LLM 绕过难度 | 中（hook 拦截写入） |
| 状态迁移可靠 | ❌ 无状态机约束 |

### 2.2 方案 B：复用 AuditLog（弱类型）

利用现有的 AuditLog 表的 action 字段记录 HITL 状态。

| 维度 | 评估 |
|------|------|
| 审计可追溯 | ✅ |
| LLM 绕过难度 | 中 |
| 状态迁移可靠 | ❌ LLM 常漏填 action/reason |

### 2.3 方案 C：独立 HitlRecord 表 + hook 拦截（已选）

新增独立 Prisma model + enum 状态机 + hook 强制校验。

| 维度 | 评估 |
|------|------|
| 审计可追溯 | ✅ 强类型状态机 |
| LLM 绕过难度 | 低（hook 检查 DB） |
| 状态迁移可靠 | ✅ Prisma enum 约束 |

**结论**：方案 C 是唯一在 schema 层强制状态机的方案，方向正确。本 Review 的发现均可在方案 C 框架内修正，无需切换到其他方案。

---

## 3. 决策结论

| 维度 | 结论 |
|------|------|
| **架构方向** | ✅ 正确——方案 C 是唯一在 schema 层强约束状态机的方案 |
| **五层视图** | ✅ 完整——数据流转/系统构图/文件树/三表关系/数据模型均对齐规范 |
| **数据模型** | ⚠️ 需修正——#1 1:1→1:N、#3 补充外键、#4 SUBMITTED 处置 |
| **MCP 工具** | ⚠️ 需补充——#5 新增 delete_hitl |
| **Hook 拦截** | ⚠️ 需细化——#2 区分 review 类型、#6 统一后缀 |
| **流程闭环** | ⚠️ 需补充——#7 BOHUI 纠偏回环 |
| **Task 完整性** | ⚠️ 需补充——#9 sync 验证任务 |

**判决策略**：P0 修复（#1 #2）为执行前提，P1 修复（#3 #4 #5 #6）建议在同一个提交周期内完成，P2 修复（#7 #8 #9）可在执行中同步完成。

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | 修正影响 |
|------|----------|
| `prisma/add.prisma` | #1 ReviewRecord.planName `@unique` → `@relation` 1:N；#3 三表补充外键约束；#4 HitlStatus 移除/补充 SUBMITTED |
| `src/mcp/hitl-tools.ts` | #5 新增 `delete_hitl` 工具 |
| `templates/core/hooks/pre-tool-use.sh` | #2 增加 review 类型判断逻辑；#6 统一后缀匹配 |
| 数据流转图（Plan §3.1） | #7 BOHUI 回环路径补充 |
| Task 依赖图（Plan §4） | #8 消费标签补充；#9 sync 验证任务新增 |

### 4.2 数据流影响

P0 修正（#1 #2）影响数据模型的基础拓扑和 hook 行为，应在 migration 生成前完成。P1 修正（#3 #4 #5 #6）涉及 Prisma schema 和 MCP 工具，与 P0 改动可合并在同一轮次。

### 4.3 回滚风险

- **#1** 修复后 schema migration 需重做，但轮次1尚未执行，无回滚成本
- **#2** 修复只涉及 hook 脚本逻辑分支，无数据影响
- **#3** 外键增加不会破坏已有数据
- **#5** delete_hitl 为新增工具，无回溯影响
- 整体风险：**低**——所有修正均发生在执行前的设计阶段
