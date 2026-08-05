# add-coder-collab-contract Spec

> 对应 Plan: `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md`

---

## Plan→Spec 映射

| # | Plan 决策 | 文件 | 关键变更 |
|---|------|------|------|
| 1 | 模板补全(P2 #4 收尾) | collab-contract-template.md | 补 §7 持久化设计(§7.1 模型/§7.2 HitlType/§7.3 迁移) |
| 2 | Schema(已实施+根环境) | templates/core/prisma/add.prisma + 根 prisma/add.prisma | CollabContract + ContractRole + 根环境同步(P1 #2) |
| 3 | MCP 工具(已实施+收尾) | tools/contract.ts + plan.ts + hitl.ts | 解析告警(P3 #6) + plan_status 契约角色(P3 #5) + hitl 状态回写核对(P3 #6) |
| 4 | Caijuehub(已实施+文档) | caijue.toml + transcribe.ts + docs/caijuehub.md | CONTRACT 裁决入口(P3 #5 文档) |

---

## 0. 根环境打通（P1 #2 回流）

> **Plan 决策**: 轮次 0 根环境（见 Plan 6.5.2）
> **文件**: 根 `prisma/add.prisma`、`prisma/migrations/`、`src/generated/prisma/`

### 类型/接口定义

- 根 `prisma/add.prisma` 同步模板真源 `templates/core/prisma/add.prisma` 的契约模型（CollabContract + ContractRole + PlanRecord 契约字段）
- 迁移：`prisma migrate dev --name add_collab_contract`（**禁止 db push**）
- 生成：`prisma generate` → `src/generated/prisma` 含 `collabContract` 模型

### WHEN-THEN

- WHEN `contract_track` 在 add-coder 自身执行 → THEN 不报错（client 含契约模型）
- WHEN 迁移失败 → THEN `migrate resolve` 处理（参照 htc 侧 `20260805060540_add_collab_contract` 先例）
- WHEN 根 schema 与模板真源不同步 → THEN 以模板真源为准同步

---

## 1. 模板补全（§7 持久化）

> **Plan 决策**: 模板补全（见 Plan §3.4 + 6.5.4）
> **文件**: `templates/core/templates/collab-contract-template.md`、`collab-contract-template.schema.json`

### 类型/接口定义

模板结构（§3.6 HITL 配套 + 主从字段，止于 §六 关联文档）：

```markdown
## 三、协作规则（契约主体）
### 3.6 契约自身 HITL 审批配套——必填
## 六、关联文档
```

> **持久化不在契约文档承载** [2026-08-05 修订: 开发者删除模板 §7]——落库/审批/迁移是 add-coder 平台机制（`contract_track` 自动落库 CollabContract，模型真源 `templates/core/prisma/add.prisma`），契约文档作者只写业务内容（参与者/阶段/边界），不写平台实现细节。

schema.json `fileBoundaries` items 补字段：

```json
"isolationMode": { "type": "string", "enum": ["file", "worktree"] }
```

### WHEN-THEN

- WHEN 模板渲染契约文档 → THEN 结构止于 §六（§3.6 HITL 齐全），无平台实现细节
- WHEN schema 校验契约文档 → THEN fileBoundaries.isolationMode 合法值（file/worktree）
- WHEN contract_track 扫描契约文档 → THEN 自动落库（解析 participants/stages/fileBoundaries/dependencyGraph，与 §7 存在与否无关）

---

## 2. 数据模型

> **Plan 决策**: Schema（已实施 977e976，根环境为真实缺口）
> **文件**: `templates/core/prisma/add.prisma`、根 `prisma/add.prisma`

### 类型/接口定义

```prisma
enum ContractRole { MASTER SUB }
model CollabContract {
  id String @id @default(cuid())
  contractName String @unique
  contractPath String
  masterPlanName String @unique
  masterPlan PlanRecord @relation(fields: [masterPlanName], references: [planName], onDelete: Restrict)
  participants Json
  stages Json
  fileBoundaries Json
  status String @default("ACTIVE")
  version Int @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### WHEN-THEN

- WHEN 根环境迁移完成 → THEN `contract_track` 实证成功
- WHEN PlanRecord 为契约 MASTER → THEN masterContract 关联存在
- WHEN 删除总控 Plan → THEN 外键 Restrict 阻止（契约不被误删）

---

## 3. MCP 工具

> **Plan 决策**: 工具（已实施 977e976，3 处收尾）
> **文件**: `templates/core/scripts/mcp-server/tools/contract.ts`、`plan.ts`、`hitl.ts`

### 类型/接口定义

- `contract_track({ contractName?, scanAll? })`：扫描 `plans/*-collab-contract-*.md` → CollabContract 落库（按 contractName 去重，增量更新）
- `contract_status({ contractName })`：查询契约状态（版本/参与者/阶段/边界）
- `create_hitl/update_hitl`：支持 type=COLLAB_CONTRACT

收尾项（P3 #5/#6 回流）：

```typescript
// contract.ts parseContractDoc 空结果告警（P3 #6）
if (stages.length === 0 || fileBoundaries.length === 0) {
  console.warn(`[contract_track] 解析结果为空——表头可能不匹配模板（${file}）`);
}
// plan.ts plan_status 契约角色展示（P3 #5）
// 输出行: contractRole / contractName（如 PlanRecord 已设置）
// hitl.ts update_hitl 状态回写核对（P3 #6）
// .hitl.md 提案文件头状态与哨兵一致（DRAFT → TONGYI）
```

### WHEN-THEN

- WHEN `contract_track` 扫描到契约文档 → THEN 落库/更新 CollabContract
- WHEN 契约文档表头与模板不一致 → THEN 输出解析告警而非静默空结果
- WHEN `plan_status` 查询契约 Plan → THEN 展示 contractRole/contractName
- WHEN 契约 HITL 审批 TONGYI → THEN 提案文件状态与哨兵一致

---

## 4. Caijuehub 裁决

> **Plan 决策**: Caijuehub 注册（已实施 977e976，文档收尾）
> **文件**: `src/caijuehub/caijue.toml`、`docs/caijuehub.md`

### WHEN-THEN

- WHEN caijuehub 加载 → THEN 契约裁决入口（collab-contract rules）已注册
- WHEN 阅读 docs/caijuehub.md → THEN 含 CONTRACT 裁决说明（P3 #5 收尾）

---

## Impact

- Affected specs: 无（新能力统筹）
- Affected code: 模板 + MCP 工具 + Prisma schema + Caijuehub 注册 + 根环境
- 父 Plan: `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md`
- 依赖: htc 验证版（已 TONGYI + 迁移成功）
- 后续依赖: 无

## Boundaries

本次只允许:
- 模板/schema 补全、根环境迁移、工具收尾、文档同步

本次禁止:
- 禁止 `prisma db push`（迁移必须走 migrate dev）
- 禁止改动 htc 侧既有迁移/数据
- 禁止重新设计契约模型（对齐 htc 已验证版）
