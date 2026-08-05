# add-coder-collab-contract-plan-v1

# add-coder 并发协作契约能力（Collab Contract）统筹需求

> **性质**：功能统筹 Plan——将 htc_g13_extra_time 项目验证成熟的「并发协作契约」能力（模板/schema/持久化/HITL 配套）收敛为 add-coder 正式能力。
> **来源**：htc 侧验证（`htc-g13-extra-time-quest-collab-contract-v1.md` + CollabContract 持久化已落地，HITL TONGYI）。

## PLAN 元信息

- **Plan 名称**: add-coder-collab-contract-plan-v1
- **启动时间**: 2026-08-05T15:00:00+08:00
- **主导 AI**: Qoder
- **目标仓库**: `/home/xmm/ai/add-coder`
- **关联文档**:
  - 验证实例: `/home/xmm/ai/htc_g13_extra_time/.qoder/plans/2026-08/05/htc-g13-extra-time-quest-collab-contract-v1.md`
  - 模板雏形: `templates/core/templates/collab-contract-template.md`（已提交 5875fa7，未发布）
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| templates/core/templates/collab-contract-template.md | TEMPLATE | TEMPLATE_MODIFIED | 雏形（无 HITL 配套/持久化/主从字段） | 完整版（HITL 配套 + 主从 Plan 关系） | 待实施 |
| templates/core/templates/collab-contract-template.schema.json | TEMPLATE | TEMPLATE_MODIFIED | 雏形 schema | 含 participants.description/isolationMode | 待实施 |
| templates/core/scripts/mcp-server/tools/contract.ts | COMPONENT | COMPONENT_CREATED | 不存在 | contract_track/contract_status MCP 工具 | 待实施 |
| templates/core/scripts/mcp-server/tools/hitl.ts | COMPONENT | COMPONENT_MODIFIED | HitlType 无 COLLAB_CONTRACT | 支持契约审批 | 待实施 |
| templates/core/scripts/mcp-server/tools/plan.ts | COMPONENT | COMPONENT_MODIFIED | PlanRecord 无契约字段 | 支持 contractRole/contractName | 待实施 |
| templates/core/prisma/add.prisma | SCHEMA | SCHEMA_MODIFIED | 无 CollabContract | CollabContract + ContractRole + 外键 | 待实施 |
| templates/core/templates/hitl-template.md | TEMPLATE | TEMPLATE_MODIFIED | 无契约审批说明 | 契约审批类型说明 | 待实施 |
| docs/caijuehub.md | DOC | DOC_MODIFIED | 无契约裁决入口 | 注册 contract 裁决 | 待实施 |

---

## HITL 计划总览（一次性提交人类审核）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | 模板体系 + MCP 工具 + Prisma schema + Caijuehub | 同意/调整 |
| 预估文件数 | 8 个（4 修改 / 2 新建 / 2 模板） | 同意/调整 |
| 架构变更 | 新增「并发协作契约」文档类型 + CollabContract 持久化 + contract_track 工具 | 同意/调整 |
| 新增依赖 | 无 | 同意/调整 |
| 风险等级 | 🟡 中（schema 迁移 + MCP 工具新增，需回归 plan_track/hitl） | 同意/调整 |
| 预计轮次 | 3 轮（模板完善 / 持久化+MCP / Caijuehub+发布） | 同意/调整 |

> **人类确认后**：展开完整设计。

---

## 一、背景与目标

### 1.1 问题现状

htc 项目已把「并发协作契约」从概念验证到落地：
- 契约文档（§2.1 能力矩阵 / §3.1 触发+依赖 / §3.2 文件边界 / §3.6 HITL 配套 / §7 持久化）
- CollabContract 模型 + ContractRole 枚举（Plan 主/从角色）+ 外键
- HITL 审批类型扩展 COLLAB_CONTRACT

但 add-coder 真源的模板仍是**雏形**（无 HITL 配套/持久化/主从字段），且**无 MCP 工具**（contract_track/status）——能力不可用，无法服务其他项目。

### 1.2 目标

1. 模板补全：HITL 配套（§3.6）+ 主从 Plan 关系 + 持久化设计（§7）——对齐 htc 验证版
2. Prisma schema：CollabContract + ContractRole + PlanRecord 外键/角色字段（对齐 htc 已迁移版）
3. MCP 工具：contract_track（扫描契约落库）/ contract_status（查询）/ 契约 HITL 支持
4. Caijuehub 注册：契约裁决入口（CONTRACT 类型）
5. 发布：验证后 bump 版本发布（待 htc 侧验证充分）

---

## 二、方案选型

| 方案 | 复用度 | 工作量 | 风险 | 结论 |
|------|--------|--------|------|------|
| A: 从 htc 验证版反向移植（本方案） | 高（已验证） | 中 | 低 | ✅ |
| B: 重新设计 | 低 | 高 | 中 | ❌ 重复劳动 |
| C: 仅模板不落代码 | 中 | 低 | 高（能力不可用） | ❌ |

**选型理由**：htc 版已通过 HITL TONGYI + 迁移成功 + 数据写入实证——直接反向移植最稳。

---

## 三、架构设计

### 3.1 数据流转

```
                    ┌─────────────────────────────┐
                    │ 用户创建契约文档（模板生成）    │
                    └──────────────┬──────────────┘
                                   ▼
              ┌─────────────────────────────────────┐
              │ contract_track（MCP 工具，新增）      │
              │  扫描 plans/*-collab-contract-*.md   │
              │  解析 participants/stages/boundaries │
              │  → CollabContract 表落库             │
              └──────────────┬──────────────────────┘
                             ▼
              ┌─────────────────────────────────────┐
              │ contract_status（查询）               │
              │  状态/版本/参与者/依赖拓扑              │
              └──────────────┬──────────────────────┘
                             ▼
              ┌─────────────────────────────────────┐
              │ HITL 审批（type=COLLAB_CONTRACT）     │
              │  contract 变更 → create_hitl → TONGYI│
              └─────────────────────────────────────┘
```

### 3.2 数据模型（对齐 htc 已迁移版）

```prisma
enum ContractRole {
  MASTER  // 总控 Plan（契约持有者）
  SUB     // 子 Plan（契约实施单元）
}

model PlanRecord {
  // ... 已有字段
  contractRole   ContractRole?   // 该 Plan 在契约中的角色
  contractName   String?         // 所属契约名
  masterContract CollabContract? // 作为 MASTER 持有的契约
  // @@index([contractName])
}

model CollabContract {
  id                 String   @id @default(cuid())
  contractName       String   @unique
  contractPath       String
  masterPlanName     String   @unique
  masterPlan         PlanRecord @relation(fields: [masterPlanName], references: [planName], onDelete: Restrict)
  participants       Json     // [{role, platformEntity, boundPlan, planKeyword, description}]
  abilityMatrix      Json?
  stages             Json     // [{stage, expert, trigger, parallelism}]
  dependencyGraph    String?
  fileBoundaries     Json     // [{expert, exclusiveDomain, forbidden, isolationMode}]
  completionCriteria Json?
  status             String   @default("ACTIVE")
  version            Int      @default(1)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

enum HitlType {
  PLAN
  PLAN_REVIEW
  COLLAB_CONTRACT
}
```

### 3.3 MCP 工具设计

| 工具 | 功能 | 参数 |
|------|------|------|
| `contract_track` | 扫描契约文档 → CollabContract 落库（按 contractName 去重，增量更新） | contractName? / scanAll? |
| `contract_status` | 查询契约状态（版本/参与者/阶段/边界） | contractName（必填） |
| `create_hitl` | 扩展 type=COLLAB_CONTRACT | 复用现有 |

### 3.4 Plan→Spec 实施映射

| Plan 决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| 模板补全 | Spec §1 模板 | collab-contract-template.md | §3.6 HITL + §7 持久化 + 主从字段 |
| Schema | Spec §2 数据模型 | templates/core/prisma/add.prisma | CollabContract + ContractRole |
| MCP 工具 | Spec §3 工具 | tools/contract.ts + plan.ts + hitl.ts | contract_track/status + 类型扩展 |
| Caijuehub | Spec §4 裁决 | caijue.toml + transcribe.ts | CONTRACT 裁决入口 |

---

## 四、实施 Task 概要

```
轮次 1: 模板 + Schema 完善（对齐 htc 验证版）
  ├── Task 1.1: collab-contract-template.md 补 §3.6 HITL + §7 持久化
  ├── Task 1.2: collab-contract-template.schema.json 补字段
  └── Task 1.3: add.prisma 加 CollabContract + ContractRole（含迁移）
        │
        ▼
轮次 2: MCP 工具 + HITL 扩展
  ├── Task 2.1: tools/contract.ts（contract_track/status）
  ├── Task 2.2: hitl.ts 支持 COLLAB_CONTRACT
  └── Task 2.3: plan.ts 支持 contractRole/contractName
        │
        ▼
轮次 3: Caijuehub + 发布准备
  ├── Task 3.1: caijue.toml 注册 CONTRACT 裁决
  ├── Task 3.2: npm run sync 全 IDE 分发
  └── Task 3.3: 验证（contract_track 实证 + lint + tsc）→ bump 版本
```

---

## 五、验收标准

- [ ] 模板与 htc 验证版结构一致（HITL 配套/持久化/主从字段）
- [ ] Schema 迁移成功（CollabContract 表 + ContractRole 枚举 + 外键）
- [ ] `contract_track` 扫描 htc 契约 → 落库成功
- [ ] `contract_status` 查询契约（参与者/阶段/边界）
- [ ] 契约 HITL 审批走通（COLLAB_CONTRACT → TONGYI）
- [ ] plan_track/hitl 回归通过（无破坏）
- [ ] npm run sync 全 IDE 分发一致
- [ ] lint + tsc 零错误

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| htc 验证实例 | `/home/xmm/ai/htc_g13_extra_time/.qoder/plans/2026-08/05/htc-g13-extra-time-quest-collab-contract-v1.md` |
| 模板雏形 | `templates/core/templates/collab-contract-template.md` |
| Qoder 能力依据 | https://docs.qoder.com/zh/extensions/subagent + /quest/experts-mode |
