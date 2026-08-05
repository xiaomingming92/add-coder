# add-coder-collab-contract-plan-v1

> **性质**：功能统筹 Plan——将 htc_g13_extra_time 项目验证成熟的「并发协作契约」能力（模板/schema/持久化/MCP/HITL 配套）收敛为 add-coder 正式能力。
> **来源**：htc 侧验证（`htc-g13-extra-time-quest-collab-contract-v1.md` + CollabContract 持久化已落地，HITL TONGYI）。
>
> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责（本节数据模型/工具设计已精简，完整定义见 Spec §2/§3）。

## PLAN 元信息

- **Plan 名称**: add-coder-collab-contract-plan-v1
- **启动时间**: 2026-08-05T15:00:00+08:00
- **主导 AI**: Qoder
- **目标仓库**: `/home/xmm/ai/add-coder`
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/05/add-coder-collab-contract-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-08/05/add-coder-collab-contract-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-collab-contract-review-v1.md`
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

### 3.2 数据模型变更（对齐 htc 已迁移版）

> 完整模型定义见 Spec §2（Plan 不承载类型定义——模板边界）。要点：

- **`CollabContract` 模型**（新增）：contractName(unique) / contractPath / **masterPlanName(unique, 外键→PlanRecord.planName, onDelete: Restrict)** / participants / stages / fileBoundaries(含 isolationMode) / status / version
- **`ContractRole` 枚举**（新增）：`MASTER`（总控）/ `SUB`（子 Plan）
- **`PlanRecord` 扩展**：`contractRole?` + `contractName?` + `masterContract?`（反查）+ `@@index([contractName])`
- **`HitlType` 扩展**：`COLLAB_CONTRACT`（契约审批）

### 3.3 MCP 工具设计

> 完整工具契约（参数/解析规则）见 Spec §3。架构层功能清单：

| 工具 | 功能 | 状态 |
|------|------|------|
| `contract_track` | 扫描 `plans/*-collab-contract-*.md`（排除 -plan-/add-route/handoff）→ CollabContract 落库（按 contractName 去重，增量更新） | 已实施(977e976) + 本轮过滤/告警收尾 |
| `contract_status` | 查询契约状态（版本/参与者/阶段/边界） | 已实施(977e976) |
| `create_hitl/update_hitl` | 扩展 type=COLLAB_CONTRACT；update 回写 .hitl.md 提案状态 | 已实施(977e976) + 本轮回写收尾 |

### 3.4 Plan→Spec 实施映射

| Plan 决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| 模板补全 | Spec §1 模板 | collab-contract-template.md | §3.6 HITL + §7 持久化 + 主从字段 |
| Schema | Spec §2 数据模型 | templates/core/prisma/add.prisma | CollabContract + ContractRole |
| MCP 工具 | Spec §3 工具 | tools/contract.ts + plan.ts + hitl.ts | contract_track/status + 类型扩展 |
| Caijuehub | Spec §4 裁决 | caijue.toml + transcribe.ts | CONTRACT 裁决入口 |

---

## 四、实施 Task 概要

> **Plan/Tasks 边界**：本文是概要表（Task # + 文件 + 说明 + 验收），供 HITL 审核和架构概览。
> 详细子任务拆解 + 验证证据见 `.qoder/specs/add-coder-collab-contract/tasks.md`（含 Plan→Task 映射表）。
> 轮次 0 为 Review P1 #2 回流新增（见 §六点五）。

```
轮次 0（前置，P1 #2 回流）: 根环境打通
  ├── Task 0.1: 根 prisma/add.prisma 同步契约模型（prisma/add.prisma）
  ├── Task 0.2: migrate dev --name add_collab_contract（migrations/）
  ├── Task 0.3: prisma generate（src/generated/prisma/）
  └── Task 0.4: contract_track 实证（本地契约样例）
        │
        ▼
轮次 1: 模板 + Schema 完善（对齐 htc 验证版）
  ├── Task 1.1: collab-contract-template.md 补 §3.6 HITL（已实施 977e976，§7 持久化由开发者决策删除）
  ├── Task 1.2: collab-contract-template.schema.json 补 isolationMode（schema.json）
  └── Task 1.3: hitl-template.md 契约审批说明核对（type 动态注入，无需补）
        │
        ▼
轮次 2: MCP 工具 + HITL 扩展
  ├── Task 2.1: contract.ts 解析过滤 + 空结果告警（tools/contract.ts）
  ├── Task 2.2: hitl.ts 提案文件状态回写（tools/hitl.ts）
  └── Task 2.3: plan.ts plan_status 契约角色展示（tools/plan.ts）
        │
        ▼
轮次 3: Caijuehub + 发布准备
  ├── Task 3.1: docs/caijuehub.md 补契约裁决入口（docs/caijuehub.md）
  ├── Task 3.2: npm run sync 全 IDE 分发（同步产物）
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
| ADD Route | `.qoder/plans/2026-08/05/add-coder-collab-contract-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-08/05/add-coder-collab-contract-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-collab-contract-review-v1.md` |
| Spec | `.qoder/specs/add-coder-collab-contract/spec.md` |
| Tasks | `.qoder/specs/add-coder-collab-contract/tasks.md` |
| Checklist | `.qoder/specs/add-coder-collab-contract/checklist.md` |
| htc 验证实例 | `/home/xmm/ai/htc_g13_extra_time/.qoder/plans/2026-08/05/htc-g13-extra-time-quest-collab-contract-v1.md` |
| 模板雏形 | `templates/core/templates/collab-contract-template.md` |
| Qoder 能力依据 | https://docs.qoder.com/zh/extensions/subagent + /quest/experts-mode |

---

## 六点五、Review 回流（2026-08-05，PLAN_REVIEW round 2 TONGYI）

> 补充于 2026-08-05：`.qoder/reviews/add-coder-collab-contract-review-v1.md` 6 个发现（P1×2 / P2×2 / P3×2）全部经 HITL 同意。本 Plan 的 ADD-7 表与任务结构按现状校准，避免重复劳动。

### 6.5.1 现状校准（[回流: Review P1 #1 状态脱节]）

commit 977e976（08-05 14:30）已落地约 75%，ADD-7 表校准如下：

| 文件 | 评审后状态 | 真实缺口 |
|------|-----------|---------|
| templates/core/scripts/mcp-server/tools/contract.ts | ✅ 已实施(977e976, 182 行) | parseContractDoc 空结果告警（P3 #6） |
| templates/core/scripts/mcp-server/tools/hitl.ts | ✅ 已实施(977e976, COLLAB_CONTRACT) | update_hitl 提案文件状态回写核对（P3 #6） |
| templates/core/prisma/add.prisma | ✅ 已实施(977e976, CollabContract+ContractRole) | 根环境未同步（P1 #2） |
| caijuehub 注册(caijue.toml/transcribe) | ✅ 已实施(977e976) | docs/caijuehub.md 未同步（P3 #5） |
| collab-contract-template.md | 🟡 部分实施(§3.6 HITL 已有) | **补 §7 持久化**（P2 #4） |
| collab-contract-template.schema.json | 🟡 雏形 | **补 isolationMode**（P2 #4） |
| tools/plan.ts | ❌ 未实施 | plan_status 补 contractRole/contractName（P3 #5） |
| hitl-template.md | ❌ 未实施 | 契约审批类型说明 |

### 6.5.2 新增 Task：根环境打通（[回流: Review P1 #2 环境可用性]）

> 阻断性：add-coder 自身 `contract_track` 依赖根 `src/generated/prisma` client 含契约模型，否则验收无法达成。

```
轮次 0（前置，P1 #2）: 根环境打通
  ├── Task 0.1: 根 prisma/add.prisma 同步模板真源契约模型
  ├── Task 0.2: prisma migrate dev --name add_collab_contract（禁止 db push）
  ├── Task 0.3: prisma generate → src/generated/prisma 含 collabContract
  └── Task 0.4: contract_track 实证（本地契约样例）
```

### 6.5.3 验收标准修订（[回流: Review P2 #3 验收可执行性]）

- ~~验收③ `contract_track` 扫描 htc 契约 → 落库成功~~ → **验收③ `contract_track` 扫描本地契约样例文档（plans/ 下 `*-collab-contract-*.md`）→ 落库成功** [2026-08-05 修订: 工具只扫描自身 plans/，跨仓库不可执行]

### 6.5.4 模板/schema 补全细化（[回流: Review P2 #4 模板完整性]）

- ~~Task 1.1 收尾：模板补 §7 持久化设计——§7.1 数据模型 / §7.2 HitlType 扩展 / §7.3 迁移指引（对齐 htc 验证版 §7.1/7.2/7.3）~~ → **Task 1.1 已由开发者决策关闭：模板不承载 §7 持久化**——持久化是平台机制（contract_track 自动落库 CollabContract，模型真源 templates/core/prisma/add.prisma），契约文档止于 §六 关联文档 [2026-08-05 修订: 开发者删除模板 §7]
- Task 1.2 收尾：schema.json `fileBoundaries` items 补 `isolationMode`（enum: file/worktree）

### 6.5.5 工具残留收尾（[回流: Review P3 #5 工具残留]）

- Task 2.3：plan.ts `plan_status` 增补 `contractRole/contractName` 展示
- Task 3.1 收尾：docs/caijuehub.md 补契约裁决入口说明（代码已注册）

### 6.5.6 健壮性收尾（[回流: Review P3 #6 健壮性]）

- Task 2.1 收尾：`parseContractDoc` 解析结果为空时输出告警（提示表头不匹配）
- Task 2.2 收尾：核对 `update_hitl` 是否回写 `.hitl.md` 提案文件状态（DRAFT → TONGYI 一致性）
