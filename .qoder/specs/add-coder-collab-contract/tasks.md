# Tasks: add-coder-collab-contract-v1

> 对应 Plan: `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md` §四 + §六点五

---

## 轮次依赖（复制自 Plan §四 + 6.5.2）

```
轮次 0（前置，P1 #2 回流）: 根环境打通
  ├── Task 0.1: 根 prisma/add.prisma 同步模板真源契约模型
  ├── Task 0.2: prisma migrate dev --name add_collab_contract（禁止 db push）
  ├── Task 0.3: prisma generate → src/generated/prisma 含 collabContract
  └── Task 0.4: contract_track 实证（本地契约样例）
        │
        ▼
轮次 1: 模板 + Schema 完善（收尾）
  ├── Task 1.1: 模板补 §7 持久化（§7.1 模型/§7.2 HitlType/§7.3 迁移）[P2 #4]
  ├── Task 1.2: schema.json fileBoundaries 补 isolationMode [P2 #4]
  └── Task 1.3: 模板/hitl-template 契约审批说明（已实施项核对）
        │
        ▼
轮次 2: MCP 工具收尾
  ├── Task 2.1: contract.ts parseContractDoc 空结果告警 [P3 #6]
  ├── Task 2.2: hitl.ts update_hitl 提案文件状态回写核对 [P3 #6]
  └── Task 2.3: plan.ts plan_status 契约角色展示 [P3 #5]
        │
        ▼
轮次 3: Caijuehub + 发布准备
  ├── Task 3.1: docs/caijuehub.md 补契约裁决入口 [P3 #5]
  ├── Task 3.2: npm run sync 全 IDE 分发
  └── Task 3.3: 验证（contract_track 实证 + lint + tsc）→ bump 版本
```

---

## Plan→Task 映射（对接 Spec 细节）

| Plan Task | 文件 | 验收 | 对应 Spec |
|------|------|------|------|
| 0.1 | 根 `prisma/add.prisma` | 与模板真源 diff 为空 | Spec §0 |
| 0.2 | `prisma/migrations/` | 迁移成功（禁 db push） | Spec §0 |
| 0.3 | `src/generated/prisma/` | client 含 collabContract | Spec §0 |
| 0.4 | 本地契约样例 | contract_track 落库成功 | Spec §0/§3 |
| 1.1 | `templates/core/templates/collab-contract-template.md` | §7 三小节齐全 | Spec §1 |
| 1.2 | `collab-contract-template.schema.json` | isolationMode(file/worktree) | Spec §1 |
| 2.1 | `tools/contract.ts` | 空解析告警 | Spec §3 |
| 2.2 | `tools/hitl.ts` | 提案文件状态回写核对 | Spec §3 |
| 2.3 | `tools/plan.ts` | plan_status 契约角色 | Spec §3 |
| 3.1 | `docs/caijuehub.md` | CONTRACT 裁决说明 | Spec §4 |
| 3.2 | 各 magic 目录 | sync 四 IDE 一致 | — |
| 3.3 | 版本发布 | 验收全绿 | — |

---

## 轮次 0: 根环境打通（P1 #2 回流）

### Task 0.1: 根 prisma/add.prisma 同步模板真源 | 依赖 无

- [x] 0.1.1 对比根 `prisma/add.prisma` 与 `templates/core/prisma/add.prisma` 差异，同步契约模型（CollabContract + ContractRole + PlanRecord 契约字段）
- [x] 0.1.2 验证: diff 为空（契约部分）

### Task 0.2: prisma migrate dev | 依赖 Task 0.1

- [x] 0.2.1 `prisma migrate dev --name add_collab_contract`（禁止 db push）
- [x] 0.2.2 验证: migrations 目录新增 `*_add_collab_contract` 迁移

### Task 0.3: prisma generate | 依赖 Task 0.2

- [x] 0.3.1 `prisma generate` → src/generated/prisma
- [x] 0.3.2 验证: client 含 collabContract 模型（grep 断言）

### Task 0.4: contract_track 实证 | 依赖 Task 0.3

- [x] 0.4.1 本地契约样例文档（plans/ 下 `*-collab-contract-*.md`）
- [x] 0.4.2 验证: contract_track 扫描落库成功 + contract_status 查询（验收③修订版）

---

## 轮次 1: 模板 + Schema 完善（收尾）

### Task 1.1: 模板补 §7 持久化 | 依赖 Task 0.4

- [x] 1.1.1 模板补 §7 持久化 → **已由开发者决策删除** [2026-08-05 修订×2: 先精简为 SSOT 引用,再整体删除——持久化是平台机制(contract_track 自动落库),契约文档不承载平台实现细节,止于 §六 关联文档]
- [x] 1.1.2 验证: 模板结构 §3.6 HITL 齐全,止于 §六(验收①)

### Task 1.2: schema.json 补 isolationMode | 依赖 Task 1.1

- [x] 1.2.1 `fileBoundaries` items 补 `isolationMode`（enum: file/worktree）
- [x] 1.2.2 验证: schema 校验通过（契约样例文档校验）

### Task 1.3: hitl-template 契约审批说明（核对） | 依赖 无

- [x] 1.3.1 核对 hitl-template.md 是否含 COLLAB_CONTRACT 类型说明，缺则补
- [x] 1.3.2 验证: grep COLLAB_CONTRACT 命中

---

## 轮次 2: MCP 工具收尾

### Task 2.1: contract.ts 解析告警 | 依赖 Task 0.4

- [x] 2.1.1 `parseContractDoc` 空结果（stages/fileBoundaries 为空）时 console.warn 告警
- [x] 2.1.2 验证: tsc + 表头不匹配样例触发告警

### Task 2.2: hitl.ts 提案文件状态回写核对 | 依赖 无

- [x] 2.2.1 核对 update_hitl 是否回写 .hitl.md 提案文件状态（DRAFT → TONGYI）
- [x] 2.2.2 如未回写则补（或记录为已知边界）

### Task 2.3: plan.ts 契约角色展示 | 依赖 无

- [x] 2.3.1 plan_status 输出 contractRole/contractName（PlanRecord 已设置时）
- [x] 2.3.2 验证: tsc + 契约 Plan 查询展示（验收⑥回归）

---

## 轮次 3: Caijuehub + 发布准备

### Task 3.1: docs/caijuehub.md 契约裁决说明 | 依赖 无

- [x] 3.1.1 docs/caijuehub.md 补 CONTRACT 裁决入口说明
- [x] 3.1.2 验证: grep contract 命中

### Task 3.2: npm run sync 全 IDE 分发 | 依赖 Task 1.1, Task 1.2, Task 2.1, Task 2.2, Task 2.3, Task 3.1

- [x] 3.2.1 `npm run sync` 分发
- [x] 3.2.2 验证: 四 IDE magic 目录 contract 能力一致（验收⑦）

### Task 3.3: 验证 + 版本发布 | 依赖 Task 3.2

- [x] 3.3.1 lint + tsc 零错误（验收⑧）
- [x] 3.3.2 契约 HITL 审批走通（COLLAB_CONTRACT → TONGYI）（验收⑤）
- [x] 3.3.3 plan_track/hitl 回归（验收⑥）
- [x] 3.3.4 bump 版本 + CHANGELOG 更新

---

## Verification

- [x] `npx tsc --noEmit` 通过
- [x] `npx eslint src/` 零 error
- [x] contract_track 本地实证（验收③修订版）
- [x] contract_status 查询契约（验收④）
- [x] 契约 HITL 审批走通（验收⑤）
- [x] plan_track/hitl 回归通过（验收⑥）
- [x] npm run sync 四 IDE 分发一致（验收⑦）
