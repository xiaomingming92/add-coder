# add-coder — HITL 人机审核架构 5 轮原子事务交接手册

> **适用场景**：多轮原子事务变更，每轮独立收敛。Prisma 模型 → MCP 工具+Hook → SKILL/Rules/Templates → sync 验证 → 验收修复。
>
> **用途**：每个新对话开始时，把对应 Round 章节粘贴给 LLM。它需要明确自己是第几轮、上游交付了什么、文件边界在哪、验证标准是什么、审计关键词是什么。

---

## 全局元信息

- **父 Plan**: [add-coder-hitl-mcp-hook-plan-v1.md](./add-coder-hitl-mcp-hook-plan-v1.md)
- **原子事务拓扑**: [add-coder-hitl-mcp-hook-add-route-v1.md](./add-coder-hitl-mcp-hook-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 约 16 个独立文件（11 核心 + 5 adapter hooks）
- **Round 数**: 5 轮局部闭包（原 4 轮 + 验收修复轮）
- **拆分原则**: 以业务原子闭包为主，以对话上下文容量为辅

```text
第1轮 ── Prisma 模型定义 + migration
            │
            ├──────────────┐
            ▼              ▼
第2a轮 ── MCP 工具 9 个    第2b轮 ── pre-tool-use §C 拦截
            │              │
            └──────┬───────┘
                   ▼
第3轮 ── SKILL/Rules/Templates 配套
                   │
                   ▼
第4轮 ── weather_proxy sync 验证
                   │
                   ▼
第5轮 ── 验收修复（Step 8 发现项）
```

---

## 原子事务边界说明

本手册中的"轮"按轮次级闭包划分（ADD 范式 §0.7）：

- **轮次级闭包**：一轮内的文件集合形成独立边界——该轮修改的文件不会被其他轮次回头修改，该轮的验证不依赖"下一轮补齐"。轮次之间是生产者-消费者关系，不是互相修补。
- **独立验证**：每轮完成后可通过 `tsc --noEmit` + checklist [T] 项独立验证。

因此：

- **第 2a 与 2b 轮虽共享 Prisma 模型上游但拆成不同轮**——因为 `templates/core/scripts/mcp-server/tools/`（工具层）与 `templates/*/hooks/`（守卫层）修改的是完全不同的文件集合，合并会导致一轮内既要关注工具注册又要关注 hook 拦截逻辑，文件归属混乱，验证标准也无法合并（MCP 工具验证是"可调用"，hook 验证是"写入阻断"）。
- **第 5 轮（验收修复）不是前 4 轮的补丁**——前 4 轮已经独立收敛并通过验证；第 5 轮是 Step 8 系统级验收发现合规与回归问题的独立修复轮次，每一项修复都有自己独立的 checklist 验证，不是"补前一轮没做完的"。
- **第 4 轮（sync 验证）依赖前 3 轮全部完成**——因为 weather_proxy 需要消费 templates 目录的全部产物，缺少任意一轮都会导致 sync 不完整。
- 每一轮完成后必须能够独立证明收敛，不能依赖"下一轮再补齐"才能成立。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明 Round 位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以 `{{magicDir}}/specs/add-coder-hitl-mcp-hook/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准，不允许按 handoff 的简写自行简化实现。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## <第1轮> Prisma 模型定义 + migration

### 你当前的位置

你是第 1 轮。无上游依赖。

### 上游已完成

无。本轮为基础模型层。

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "prisma/add.prisma" })
→ MODEL_CREATED: beforeState "无三表", afterState "新增 HitlRecord+PlanRecord+ReviewRecord+三枚举"

query_audit_logs({ keyword: "MODEL_CREATED", planKeyword: "add-coder-hitl-mcp-hook" })
→ 2 条：prisma/add.prisma + prisma/migrations/

query_audit_logs({ keyword: "ROUND_CLOSED", planKeyword: "add-coder-hitl-mcp-hook" })
→ 1 条：PLAN::round1 闭合
```

**恢复顺序建议**：
```
1. query_audit_logs({ keyword: "hitl-round1" })           → 拉取全部 3 条记录
2. read prisma/add.prisma                                  → 查看三表定义
3. read {{magicDir}}/specs/add-coder-hitl-mcp-hook/spec.md
```

### 原子事务目标

覆盖 `add-coder-hitl-mcp-hook-plan-v1` 的 Step 1-2。在 `prisma/add.prisma` 中新增 HITL 三表 + 三枚举 + 生成 migration。

### spec 文件

- `{{magicDir}}/specs/add-coder-hitl-mcp-hook/spec.md`
- `{{magicDir}}/specs/add-coder-hitl-mcp-hook/tasks.md`（Task 1.1-1.2）
- `{{magicDir}}/specs/add-coder-hitl-mcp-hook/checklist.md`（二、数据模型验收）

### 架构文档

- `prisma/add.prisma` — 三表数据模型定义（HitlRecord / PlanRecord / ReviewRecord + 3 enum）

### 你要改的文件（1 个修改 + 1 个生成）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `prisma/add.prisma` | 修改 | 新增 HitlRecord/PlanRecord/ReviewRecord 三表 + HitlType/HitlStatus/ReviewType 三枚举 |
| `prisma/migrations/` | 生成 | `prisma migrate dev --name add_hitl_tables` |

### 核心设计

```text
HitlRecord: planName + round @@unique + status(DRAFT/SUBMITTED/TONGYI/BOHUI)
PlanRecord: planName @unique + tasks/checklist 进度计数
ReviewRecord: planName 非 @unique(1:N) + type(PLAN_REVIEW/IMPLEMENTATION/RUNTIME) + p0/p1
HitlRecord.planName → PlanRecord.planName (可选 @relation)
ReviewRecord.planName → PlanRecord.planName (必选 @relation)
```

### 关键契约细化

- `prisma/add.prisma`：禁止修改 AuditLog / DevOperation 已有模型。
- `prisma/add.prisma`：ReviewRecord.planName 必须非 @unique（Review #1 1:N 修正）。
- `prisma/add.prisma`：HitlRecord 必须含 `round` 字段 + `@@unique([planName, round])`。

### 高风险误区

- 禁止提前实现 MCP 工具逻辑（第 2 轮实现）。
- HitlStatus 含 SUBMITTED 无害，可保留（Review #4 可选）。
- ReviewRecord → PlanRecord 的外键方向不要搞反——ReviewRecord 引用 PlanRecord，不是 PlanRecord 引用 ReviewRecord。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODEL_CREATED` | MODEL | `prisma/add.prisma` | 新增三表 + 三枚举 | ✅ 已完成 |
| `MODEL_CREATED` | MODEL | `prisma/migrations/` | migration 生成 + 执行 | ✅ 已完成 |
| `ROUND_CLOSED` | PLAN | `PLAN::round1` | 轮次 1 闭合审计 | ✅ 已完成 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hitl-round1" })
→ 返回全部 3 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- [x] `npx tsc --noEmit` 通过 — tsc=0
- [x] `prisma migrate dev` 通过，三表可读写 — `prisma migrate status` 显示 up to date
- [x] HitlRecord 含 round + `@@unique([planName, round])` — grep `@@unique` 确认
- [x] PlanRecord.planName `@unique` — prisma schema 确认
- [x] ReviewRecord.planName 非 `@unique`（1:N）— prisma schema 确认

#### 未执行的端到端验证（保留给运行时复测）

- [ ] 三表 CRUD 操作验证（无法在编译期验证，需运行时调用 MCP 工具测试）

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`：

| 文件 | action |
|------|--------|
| `prisma/add.prisma` | `MODEL_CREATED` |
| `prisma/migrations/` | `MODEL_CREATED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "hitl-round1" })
→ 确认 3 条全部落库
```

---

## <第2a轮> MCP 工具 9 个

### 你当前的位置

你是第 2a 轮。上游第 1 轮已完成（Prisma 三表 + 枚举就绪）。

### 上游已完成

- `prisma/add.prisma` 定义了 `HitlRecord`, `PlanRecord`, `ReviewRecord` 三模型
- `prisma/migrations/202607270147_add_hitl_tables` 已生成并执行
- `HitlType`/`HitlStatus`/`ReviewType` 三枚举已定义

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/hitl.ts" })
→ COMPONENT_CREATED: beforeState "不存在", afterState "3 个 HITL MCP 工具可调用"

query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/plan.ts" })
→ COMPONENT_CREATED: beforeState "不存在", afterState "3 个 Plan MCP 工具可调用"

query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/review.ts" })
→ COMPONENT_CREATED: beforeState "不存在", afterState "3 个 Review MCP 工具可调用"

query_audit_logs({ keyword: "COMPONENT_CREATED", planKeyword: "add-coder-hitl-mcp-hook" })
→ 3 条：hitl.ts / plan.ts / review.ts
```

**恢复顺序建议**：
```
1. query_audit_logs({ keyword: "hitl-round2a" })          → 拉取全部记录
2. read templates/core/scripts/mcp-server/tools/hitl.ts     → 查看 3 工具实现
3. read templates/core/scripts/mcp-server/tools/plan.ts
4. read templates/core/scripts/mcp-server/tools/review.ts
```

### 原子事务目标

覆盖 Task 2.1-2.3 + 2.5。在 `templates/core/scripts/mcp-server/tools/` 下实现 9 个 MCP 工具（HITL 3 + Plan 3 + Review 3）并注册到 index。

### spec 文件

- `{{magicDir}}/specs/add-coder-hitl-mcp-hook/tasks.md`（Task 2.1 HITL 工具, Task 2.2 Plan 工具, Task 2.3 Review 工具, Task 2.5 index 注册）
- `{{magicDir}}/specs/add-coder-hitl-mcp-hook/checklist.md`（三、MCP 工具验收）

### 架构文档

- `templates/core/scripts/mcp-server/tools/index.ts` — MCP 工具注册中心

### 你要改的文件（3 新建 + 1 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/scripts/mcp-server/tools/hitl.ts` | 新建 | create_hitl / update_hitl / status_hitl |
| `templates/core/scripts/mcp-server/tools/plan.ts` | 新建 | plan_track / plan_status / plan_sync |
| `templates/core/scripts/mcp-server/tools/review.ts` | 新建 | review_track / review_status / review_sync |
| `templates/core/scripts/mcp-server/tools/index.ts` | 修改 | 注册 9 个工具 |

### 核心设计

```text
create_hitl({planName,type}) → HitlRecord DRAFT + 按 hitl-template.md 生成提案文件
update_hitl({planName,type,status,reason?}) → TONGYI→写哨兵; BOHUI→记录驳回
status_hitl({planName,type?}) → 查询最新 round 状态
plan_track({planName?,scanAll?}) → 解析 tasks/checklist → PlanRecord
review_track({planName}) → 解析 review-*.md → ReviewRecord(p0/p1/backflowRate)
```

### 关键契约细化

- `templates/core/scripts/mcp-server/tools/plan.ts`：`specDirName = basename(t.name).replace(/-plan-v\d+$/, "")` — 正则不能多匹配 `.md`。
- `templates/core/scripts/mcp-server/tools/review.ts`：外键查找必须用 `contains` 匹配 PlanRecord.planName（因为 review 文件名中的 derivedPlan 可能不含 `-plan-v{n}` 后缀）。
- `templates/core/scripts/mcp-server/shared/prisma.ts`：PrismaClient 的 PROJECT_ROOT 需通过三层 fallback 推导，生成 client 的路径在不同 adapter 下可能不同。

### 高风险误区

- 工具路径在 `templates/core/scripts/mcp-server/tools/` **不是** `src/mcp/`——tools 是模板文件，通过 sync 同步到各 magic 目录。
- `plan_track` 的 `specDirName` 不要把 `.md` 包含进去（已修复：`-plan-v\d+\.md$` → `-plan-v\d+$`）。
- `review_track` 中不要假设 derivedPlan 包含完整 planName（已修复：改用 `contains` 匹配）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `COMPONENT_CREATED` | COMPONENT | `templates/core/scripts/mcp-server/tools/hitl.ts` | 3 HITL 工具 | ✅ 已完成 |
| `COMPONENT_CREATED` | COMPONENT | `templates/core/scripts/mcp-server/tools/plan.ts` | 3 Plan 工具 | ✅ 已完成 |
| `COMPONENT_CREATED` | COMPONENT | `templates/core/scripts/mcp-server/tools/review.ts` | 3 Review 工具 | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/core/scripts/mcp-server/tools/index.ts` | 注册 9 工具 | ✅ 已完成 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hitl-round2a" })
→ 返回全部 4 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- [x] 9 个 MCP 工具已注册：`templates/core/scripts/mcp-server/tools/index.ts` 中 hitl/plan/review 三组可见
- [x] `npx tsc --noEmit` 通过 — HITL 相关代码无编译错误

#### 未执行的端到端验证（保留给运行时复测）

- [ ] `create_hitl` 实际 MCP 调用返回正确（需在 MCP Server 运行中测试）
- [ ] `plan_track({ scanAll: true })` 全量补录正确（需运行时验证 DB 记录）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `templates/core/scripts/mcp-server/tools/hitl.ts` | `COMPONENT_CREATED` |
| `templates/core/scripts/mcp-server/tools/plan.ts` | `COMPONENT_CREATED` |
| `templates/core/scripts/mcp-server/tools/review.ts` | `COMPONENT_CREATED` |
| `templates/core/scripts/mcp-server/tools/index.ts` | `CONFIG_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "hitl-round2a" })
→ 确认 4 条全部落库
```

---

## <第2b轮> pre-tool-use.sh §C HITL 拦截

### 你当前的位置

你是第 2b 轮。上游第 2a 轮已完成（MCP 工具就绪，`.hitl-tongyi` 标记文件可由 update_hitl 生成）。

### 上游已完成

- `update_hitl(status=TONGYI)` 可写 `.hitl-tongyi-{planName}` 哨兵文件
- `update_hitl(status=BOHUI)` 可写 `.hitl-bohui-{planName}` 哨兵文件（记录驳回）

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "templates/core/hooks/pre-tool-use.sh" })
→ CONFIG_MODIFIED: beforeState "无 HITL 拦截", afterState "§C tongyi 哨兵检查"

query_audit_logs({ keyword: "CONFIG_MODIFIED", planKeyword: "add-coder-hitl-mcp-hook" })
→ 多条记录，按 targetId 区分 core 版和 adapter 版
```

**恢复顺序建议**：
```
1. query_audit_logs({ keyword: "hitl-round2b" })
2. read templates/core/hooks/pre-tool-use.sh (重点关注 §C 段)
```

### 原子事务目标

覆盖 Task 2.4。在 `pre-tool-use.sh` 中各 §C 段追加 HITL tongyi 哨兵检查拦截逻辑。

### 架构文档

- `templates/core/hooks/pre-tool-use.sh` — §C HITL 拦截实现（带 `_do_hitl` 分流）
- `templates/adapters/*/hooks/pre-tool-use.sh` — 各 adapter 同步版本（阻断协议各有差异）

### 你要改的文件（6 个：1 core + 5 adapters）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/hooks/pre-tool-use.sh` | 修改 | 新增 §C：`_do_hitl` 分流逻辑 |
| `templates/adapters/qoder/hooks/pre-tool-use.sh` | 同步 | 同 §C 逻辑（`exit 2` + JSON 阻断协议） |
| `templates/adapters/claude/hooks/pre-tool-use.sh` | 同步 | 同 §C 逻辑（`exit $EXIT_BLOCK`） |
| `templates/adapters/vscode/hooks/pre-tool-use.sh` | 同步 | 同 §C 逻辑（`exit $EXIT_BLOCK`） |
| `templates/adapters/trae/hooks/pre-tool-use.sh` | 同步 | 同 §C 逻辑（`exit 2` + JSON） |
| `templates/adapters/codex/hooks/pre-tool-use.sh` | 同步 | 同 §C 逻辑（`exit 2` + JSON） |

### 核心设计

```text
§C 拦截逻辑（_do_hitl 分流）:
  plans/ → 总是需要 HITL
  reviews/ → 含 -(implementation|runtime) 跳过 HITL
             其余（PLAN_REVIEW）需要 HITL
```

### 关键契约细化

- `templates/core/hooks/pre-tool-use.sh`：§C 必须使用 `echo JSON`（`{"hookSpecificOutput":...}`）输出阻断原因，不能只写 stderr 文本。
- `templates/adapters/claude/hooks/pre-tool-use.sh`：阻断使用 `exit $EXIT_BLOCK`（非 `exit 2`）。
- `templates/adapters/vscode/hooks/pre-tool-use.sh`：`$PROJECT_DIR` 规则为 `$PWD`，不要用 `${CLAUDE_PROJECT_DIR:-$PWD}`。
- 所有 6 个文件的 `_do_hitl` 分流逻辑必须完全一致，仅阻断协议和 PROJECT_DIR 变量可以不同。

### 高风险误区

- 标记文件统一为无 `.md` 后缀格式（Review #6）：`.hitl-tongyi-{planName}` / `.hitl-bohui-{planName}`。
- implementation/runtime review 不受 HITL 影响——只能用 §B 活跃 Plan 检查，不能拦。
- qoder 版 hook 脚本需要 `chmod +x` 权限才能被触发（文件权限陷阱）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `CONFIG_MODIFIED` | CONFIG | `templates/core/hooks/pre-tool-use.sh` | §C HITL 拦截 | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/adapters/qoder/hooks/pre-tool-use.sh` | 同步 §C | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/adapters/claude/hooks/pre-tool-use.sh` | 同步 §C | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/adapters/vscode/hooks/pre-tool-use.sh` | 同步 §C | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/adapters/trae/hooks/pre-tool-use.sh` | 同步 §C | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/adapters/codex/hooks/pre-tool-use.sh` | 同步 §C | ✅ 已完成 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hitl-round2b" })
→ 返回全部 6 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- [x] core + 5 adapter 均含 §C 且 `_do_hitl` 分流逻辑一致
- [x] qoder 版 use `exit 2` + `echo JSON`
- [x] claude/vscode 版 use `exit $EXIT_BLOCK`
- [x] trae/codex 版 use `exit 2` + `echo JSON`

#### 未执行的端到端验证（保留给运行时复测）

- [ ] 无 `.hitl-tongyi` 时写入 plans/ → BLOCKED（需在 MCP hook 运行中测试）
- [ ] 有 `.hitl-tongyi` 时写入 plans/ → 放行（需手动创建哨兵文件测试）
- [ ] implementation/runtime review 不受 HITL 影响（需写入 reviews/ 验证）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `templates/core/hooks/pre-tool-use.sh` | `CONFIG_MODIFIED` |
| `templates/adapters/qoder/hooks/pre-tool-use.sh` | `CONFIG_MODIFIED` |
| `templates/adapters/claude/hooks/pre-tool-use.sh` | `CONFIG_MODIFIED` |
| `templates/adapters/vscode/hooks/pre-tool-use.sh` | `CONFIG_MODIFIED` |
| `templates/adapters/trae/hooks/pre-tool-use.sh` | `CONFIG_MODIFIED` |
| `templates/adapters/codex/hooks/pre-tool-use.sh` | `CONFIG_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "hitl-round2b" })
→ 确认 6 条全部落库
```

---

## <第3轮> SKILL/Rules/Templates 配套

### 你当前的位置

你是第 3 轮。上游第 1 轮 + 第 2 轮已完成（Prisma 模型 + MCP 工具 + Hook 拦截就绪）。

### 上游已完成

- Prisma 三表 + migration 已就绪
- 9 个 MCP 工具已注册可调用
- pre-tool-use.sh §C 已实现 plans/reviews 写入拦截
- `.hitl-tongyi-{planName}` / `.hitl-bohui-{planName}` 哨兵机制已实现

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "templates/core/skills/add-paradigm/SKILL.md" })
→ DOC_UPDATED: beforeState "无 HITL 流程", afterState "含 create_hitl/status_hitl 步骤"

query_audit_logs({ targetId: "templates/core/rules/project_rules.md" })
→ DOC_UPDATED: beforeState "无 HITL 强制规则", afterState "新增 ADD-18"

query_audit_logs({ targetId: "templates/core/templates/hitl-template.md" })
→ TEMPLATE_CREATED: beforeState "不存在", afterState "HITL 提案模板可用"
```

**恢复顺序建议**：
```
1. query_audit_logs({ keyword: "hitl-round3" })
2. read templates/core/rules/project_rules.md (ADD-18 章节)
3. read templates/core/templates/hitl-template.md
```

### 原子事务目标

覆盖 Task 3.1-3.4。更新 SKILL.md（含 create_hitl/status_hitl 步骤），project_rules.md 新增 ADD-18 HITL 强制规则，创建 hitl-template.md + schema.json，扩展 doc-format-guard.sh。

### 架构文档

- `templates/core/rules/project_rules.md` — ADD-18 人机审核强制规则（完整章节含强制流程+适用范围+异常处理）
- `templates/core/skills/add-paradigm/SKILL.md` — HITL 流程步骤定义
- `templates/core/templates/hitl-template.schema.json` — HITL 提案文件 schema 校验

### 你要改的文件（2 修改 + 2 新建 + 1 扩展）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/skills/add-paradigm/SKILL.md` | 修改 | 新增 HITL 流程步骤 + `create_hitl`/`status_hitl` 引用 |
| `templates/core/rules/project_rules.md` | 修改 | 新增 ADD-18 人机审核强制规则（优先级表+映射表+完整章节） |
| `templates/core/templates/hitl-template.md` | 新建 | HITL 提案模板（含计划总览表 + 审议证据链） |
| `templates/core/templates/hitl-template.schema.json` | 新建 | 提案文件结构校验 schema |
| `templates/core/hooks/doc-format-guard.sh` | 修改 | 扩展 schema 校验路径含 hitl-template |

### 核心设计

```text
ADD-18 HITL 强制规则:
  ① create_hitl({planName,type}) → HitlRecord DRAFT，生成 hitl.md 提案文件
  ② 人类审阅 hitl.md → 逐行拍板
  ③ update_hitl({planName,status:"TONGYI"}) → 写 .hitl-tongyi-{planName} 哨兵
  ④ TONGYI 后：正式写入 Plan/Review 文件（hook §C 放行）
  ⑤ BOHUI 后：create_hitl 新 round+1，重新审批
  ⑥ 适用范围：所有 PLAN 和 PLAN_REVIEW 类型
```

### 关键契约细化

- `templates/core/rules/project_rules.md`：ADD-18 编号不能与 ADD-13 冲突（ADD-13 已被 DPS 闸门占用）。
- `templates/core/templates/hitl-template.schema.json`：JSON schema 必须通过 `python3 -m json.tool` 解析。
- `templates/core/hooks/doc-format-guard.sh`：schema 匹配逻辑必须用全路径，避免误匹配。

### 高风险误区

- ADD-13 已被 DPS 闸门占用，不要覆盖——用 ADD-18。
- hitl-template.md 中不要使用 `temporary.md` 命名（已废弃），统一用 `hitl-template.md` 格式。
- SKILL.md 修改时注意不要破坏已有的跨轮上下文加载逻辑。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `DOC_UPDATED` | DOC | `templates/core/skills/add-paradigm/SKILL.md` | 新增 HITL 流程 | ✅ 已完成 |
| `DOC_UPDATED` | DOC | `templates/core/rules/project_rules.md` | 新增 ADD-18 | ✅ 已完成 |
| `TEMPLATE_CREATED` | TEMPLATE | `templates/core/templates/hitl-template.md` | HITL 提案模板 | ✅ 已完成 |
| `CONFIG_CREATED` | CONFIG | `templates/core/templates/hitl-template.schema.json` | schema 校验 | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/core/hooks/doc-format-guard.sh` | 扩展 schema 路径 | ✅ 已完成 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hitl-round3" })
→ 返回全部 5 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- [x] SKILL.md 含 `create_hitl` + `status_hitl` 关键词（grep 5 次/4 次匹配）
- [x] project_rules.md 含 ADD-18 HITL 强制规则章节（强制流程+适用范围+异常处理）
- [x] hitl-template.md + schema.json 存在且格式正确
- [x] doc-format-guard.sh 含 hitl-template 识别规则

#### 未执行的端到端验证（保留给运行时复测）

- [ ] schema 校验实际命中（需写入不合规的 hitl 文件验证）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `templates/core/skills/add-paradigm/SKILL.md` | `DOC_UPDATED` |
| `templates/core/rules/project_rules.md` | `DOC_UPDATED` |
| `templates/core/templates/hitl-template.md` | `TEMPLATE_CREATED` |
| `templates/core/templates/hitl-template.schema.json` | `CONFIG_CREATED` |
| `templates/core/hooks/doc-format-guard.sh` | `CONFIG_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "hitl-round3" })
→ 确认 5 条全部落库
```

---

## <第4轮> weather_proxy sync 验证

### 你当前的位置

你是第 4 轮。上游第 1~3 轮已完成（全部核心能力就绪）。

### 上游已完成

- 全部 HITL 三表 + MCP 工具 + Hook 拦截 + SKILL/Rules/Templates

### 恢复上下文审计查询

```text
query_audit_logs({ keyword: "TEST_CREATED", planKeyword: "add-coder-hitl-mcp-hook" })
→ 运行时验证记录
```

### 原子事务目标

覆盖 Task 4.1。在 weather_proxy 项目运行 `npx add-coder sync --adapter qoder --patch` 验证 HITL 规则生效。

### 架构文档

- `weather_proxy` 项目 `.qoder/hooks/pre-tool-use.sh` — sync 后的 HITL 拦截生效确认

### 你要改的文件（0 个——仅验证，不修改代码）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| 无 | 验证 | 远程 weather_proxy sync 后 HITL 规则生效 |

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `TEST_CREATED` | TEST | `weather_proxy::sync` | sync 后 HITL 规则生效验证 | 待记录 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hitl-round4" })
→ 返回 1 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- [ ] weather_proxy `npx add-coder sync --adapter qoder --patch` 执行通过

#### 未执行的端到端验证（保留给运行时复测）

- [ ] weather_proxy sync 后 pre-tool-use.sh §C HITL 拦截生效
- [ ] weather_proxy 中 HITL MCP 工具可调用

### 完成后记录 ADD-7 审计

```text
完成后一键验证：
query_audit_logs({ keyword: "hitl-round4" })
→ 确认全部落库
```

---

## <第5轮 验收修复> 合规补全与回归优化

### 你当前的位置

你是第 5 轮（验收修复轮）。上游第 1~4 轮已完成全部核心功能实现，本轮通过 Step 8 验收发现的 4 项问题进行修复。

### 上游已完成

- 全部核心功能已实现并部署至 weather_proxy

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "templates/core/hooks/pre-tool-use.sh", planKeyword: "add-coder-hitl-mcp-hook" })
→ 2 条 CONFIG_MODIFIED：原始 §C 实现（第2b轮）+ 第5轮 _do_hitl 分流重构

query_audit_logs({ targetId: "templates/core/rules/project_rules.md", planKeyword: "add-coder-hitl-mcp-hook" })
→ 2 条 DOC_UPDATED：第3轮 ADD-18 新增 + 第5轮 补充映射表

query_audit_logs({ keyword: "fix/project-rules-add18" })
→ project_rules.md 新增 ADD-18 的完整记录

query_audit_logs({ keyword: "fix/review-plan-track-keys" })
→ review.ts + plan.ts 修复记录
```

**恢复顺序建议**：
```
1. query_audit_logs({ keyword: "hitl-round5-acceptance" })
2. read templates/core/hooks/pre-tool-use.sh (§C 检查 _do_hitl 分流)
3. read templates/core/rules/project_rules.md (ADD-18 章节)
```

### 原子事务目标

覆盖 Step 8 验收发现的修复项：
1. pre-tool-use.sh §C 区分 review 类型（PLAN_REVIEW 需 HITL，implementation/runtime 跳过）
2. project_rules.md 新增 ADD-18 HITL 规则（替代原 ADD-13，因 ADD-13 已被 DPS 闸门占用）
3. review_track 外键违例修复（用 `contains` 匹配 PlanRecord.planName）
4. plan_track specDirName 正则修复（去多余 `.md`）

### 架构文档

- `templates/core/rules/project_rules.md` — ADD-18 完整章节（优先级表+映射表+强制流程+适用范围+异常处理）

### 你要改的文件（8 个：1 core hook + 5 adapter hooks + 1 rules + 2 tools）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/hooks/pre-tool-use.sh` | 修改 | §C `_do_hitl` 分流：plans→强制、reviews→仅 PLAN_REVIEW |
| `templates/adapters/qoder/hooks/pre-tool-use.sh` | 同步 | 同上分流逻辑 |
| `templates/adapters/claude/hooks/pre-tool-use.sh` | 同步 | 同上分流逻辑 |
| `templates/adapters/vscode/hooks/pre-tool-use.sh` | 同步 | 同上分流逻辑 |
| `templates/adapters/trae/hooks/pre-tool-use.sh` | 同步 | 同上分流逻辑 |
| `templates/adapters/codex/hooks/pre-tool-use.sh` | 同步 | 同上分流逻辑 |
| `templates/core/rules/project_rules.md` | 修改 | ADD-18 新增（优先级表+映射表+完整章节） |
| `templates/core/scripts/mcp-server/tools/review.ts` | 修改 | 外键查找改为 `contains` 匹配 PlanRecord.planName |
| `templates/core/scripts/mcp-server/tools/plan.ts` | 修改 | specDirName regex `-plan-v\d+\.md$` → `-plan-v\d+$` |

### 核心设计

```text
_do_hitl 分流逻辑:
  plans/ → true（必须经 HITL 审批）
  reviews/ → 含 -(implementation|runtime) → false（跳过 HITL）
             否则 → true（PLAN_REVIEW 需 HITL）

review_track 外键修复:
  const planMatch = await db.plan.findFirst({ where: { planName: { contains: derivedPlan } } })
  // 用 contains 代替 exact match，兼容 review 文件名不含 "-plan-v{n}" 后缀的情况
```

### 关键契约细化

- `templates/core/hooks/pre-tool-use.sh`：qoder/claude/vscode 三种 adapter 的 PROJECT_DIR 推导方式不同（`${QODER_PROJECT_DIR}` / `${CLAUDE_PROJECT_DIR}` / `$PWD`），不能硬编码。
- `templates/core/scripts/mcp-server/tools/review.ts`：外键查找新增 `db.plan.findFirst` 必须声明在 `db` 对象中（已新增 `get plan()` getter）。

### 高风险误区

- pre-tool-use.sh 各 adapter 的阻断协议必须保留原有风格——qoder 用 `exit 2` + `echo JSON`，claude 用 `exit $EXIT_BLOCK`。
- 第 5 轮不是"前 4 轮没做完收尾"——它是独立的合规修复轮，有自己的验证标准。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `DOC_UPDATED` | DOC | `templates/core/hooks/pre-tool-use.sh` | §C review 类型分流 | ✅ 已完成 |
| `DOC_UPDATED` | DOC | `templates/adapters/{5}/hooks/pre-tool-use.sh` | 同步 §C 分流 | ✅ 已完成 |
| `DOC_UPDATED` | DOC | `templates/core/rules/project_rules.md` | 新增 ADD-18 | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/core/scripts/mcp-server/tools/review.ts` | 外键 contains 匹配 | ✅ 已完成 |
| `CONFIG_MODIFIED` | CONFIG | `templates/core/scripts/mcp-server/tools/plan.ts` | specDirName 正则修正 | ✅ 已完成 |
| `ROUND_CLOSED` | PLAN | `PLAN::round2` | 验收修复轮闭合 | ✅ 已完成 |

**恢复关键词**：
```text
query_audit_logs({ keyword: "hitl-round5-acceptance" })
→ 返回全部 6 条本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- [x] 6 个 pre-tool-use.sh 均含 `_do_hitl` 分流逻辑（grep 确认每文件 5 次匹配）
- [x] project_rules.md 含 ADD-18 完整规则（强制流程+适用范围+异常处理）
- [x] review_track 外键不报错（`contains` 匹配 PlanRecord.planName）
- [x] plan_track specDirName 正确（无多余 `.md`）
- [x] tsc --noEmit 通过（HITL 代码无新增错误）

#### 未执行的端到端验证（保留给运行时复测）

- [ ] weather_proxy sync 后验证全部修复项生效
- [ ] implementation/review 写入不被 HITL 拦截（运行时确认）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `templates/core/hooks/pre-tool-use.sh` | `DOC_UPDATED` |
| `templates/adapters/{5}/hooks/pre-tool-use.sh` | `DOC_UPDATED` |
| `templates/core/rules/project_rules.md` | `DOC_UPDATED` |
| `templates/core/scripts/mcp-server/tools/review.ts` | `CONFIG_MODIFIED` |
| `templates/core/scripts/mcp-server/tools/plan.ts` | `CONFIG_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "hitl-round5-acceptance" })
→ 确认 6 条全部落库
```

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列，是每轮原子事务完成的强制性前置条件。

### checklist 证据要求

每轮结束时，`checklist.md` 必须满足以下条件才算收敛：

- [ ] **全部项已勾选**（不得有空勾选、不得有"推测通过"）
- [ ] **每项勾选有可验证证据**：
  - 编译/类型项：附 `npx tsc --noEmit` 输出或错误数
  - 运行项：附终端输出、截图或日志摘要
  - 代码项：附文件路径 + 行号引用
  - 跨轮依赖项：附 `query_audit_logs` 查询结果（如"确认第 1 轮已完成"）
- [ ] **未执行项诚实保留**：无法在当前 Round 验证的项（如运行时端到端验收），保留为未勾选 `- [ ]`，并在旁注明"待后续运行时验证"
- [ ] **证据可直接获取**：后续 AI Session 通过 `query_audit_logs` 按 targetId/keyword 可查到 checklist 对应的验证证据

### tasks 证据要求

- [ ] **全部任务已完成**（tasks.md 中全部 `- [x]`）
- [ ] **每个任务有对应的 checklist 项覆盖**（不允许 task 完成但无 checklist 验证记录）
- [ ] **task 完成状态与 ADD-7 审计记录一致**：每完成一个 task 的代码修改，必须有对应的 `record_dev_operation` 记录

### 收敛声明规则

当前 Round AI 不得自行声明"本轮已收敛"并直接进入下一轮。收敛声明只能由以下角色做出：

1. **开发者确认** — 开发者审核 checklist/tasks 证据后宣布收敛
2. **Review AI 确认** — 独立的 review AI Session 通过 `query_audit_logs` 验证后宣布收敛

执行 AI 的职责是完成 checklist/tasks 并附证据，而非自我判定收敛。

---

## 附录：每轮启动模板

新对话开始时，直接把下面内容 + 对应 Round 章节粘贴给 LLM：

```text
## 上下文

你在执行 add-coder HITL 人机审核架构的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .qoder/plans/2026-07/25/add-coder-hitl-mcp-hook-handoff-v1.md 的 <第N轮> 章节。

## 启动操作（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（含 Step 0 文档先行）
3. 读本轮对应 {{magicDir}}/specs/add-coder-hitl-mcp-hook/spec.md
4. 读本轮对应 {{magicDir}}/specs/add-coder-hitl-mcp-hook/tasks.md
5. 读本轮对应 {{magicDir}}/specs/add-coder-hitl-mcp-hook/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → **附可验证证据** → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 写入审计后：query_audit_logs 按 action/targetId/keyword 回查确认落库
10. 全部代码完成后：按本轮 handoff 的 ADD-7 恢复关键词逐项回查确认可恢复
11. 收敛后：回到 add-paradigm SKILL Step 0.6，验收后回看架构文档，标记偏差点

## 关键提醒

- 当前执行的是 [第N轮]/5
- 当前 Round 是一个原子工程事务，不允许拆到下一轮补齐
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- 禁止自行声明收敛：收敛声明只能由开发者或 Review AI 做出
- 禁止简化代码实现
- 禁止跳过 MCP 回查；只写 record_dev_operation 不算审计闭环完成
```

---

### 脱敏要求

Handoff 文档中 **禁止出现** 数据库密码、Chroma auth token、JWT 密钥、API Key 等硬编码凭据。所有凭据值通过 `${ENV_VAR}` 引用。
