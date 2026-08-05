# add-coder — 并发协作契约能力 4 轮原子事务交接手册

> **用途**：每个新对话开始时，把对应Round章节粘贴给 LLM。它需要明确自己正在执行哪个原子工程事务、上游事务已经提交了什么、当前事务的文件边界是什么、验证标准是什么、完成后记录哪些 ADD-7 审计。

---

## 全局元信息

- **父 Plan**: [add-coder-collab-contract-plan-v1.md](./add-coder-collab-contract-plan-v1.md)
- **原子事务拓扑**: [add-coder-collab-contract-add-route-v1.md](./add-coder-collab-contract-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **Round数**: 4 轮（轮次 0-3，轮次 0 为 Review P1 #2 回流新增）
- **拆分原则**: 以业务原子闭包为主

```text
第0轮 ── 根环境打通（schema 同步 + 迁移幂等化 + generate + 实证）
            │
            ▼
第1轮 ── 模板/Schema 收尾（§7 删除决策 + isolationMode + hitl-template 核对）
            │
            ▼
第2轮 ── MCP 工具收尾（扫描过滤 + 解析告警 + 提案回写 + 契约角色展示）
            │
            ▼
第3轮 ── Caijuehub 文档 + 同步分发 + 验证闭环 + 版本发布
```

---

## <第0轮> 根环境打通

### 你当前的位置

你是第 0 轮。无上游（P1 #2 回流新增轮）。

### 上游已完成

- 模板真源 `templates/core/prisma/add.prisma` 已含契约模型（977e976）

### 恢复上下文审计查询

```text
query_audit_logs({ targetId: "prisma/add.prisma" })
```
→ 返回 1 条：SCHEMA MODIFY。根 add.prisma 同步契约模型（CollabContract + ContractRole + PlanRecord 契约字段 + HitlType.COLLAB_CONTRACT）。

### 原子事务目标

根环境打通：根 schema 同步 → 迁移（幂等化 SQL）→ generate → contract_track 实证。

### 你要改的文件

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `prisma/add.prisma` | 修改 | 契约模型同步 |
| `prisma/migrations/20260805083842_add_collab_contract/migration.sql` | 修改 | **幂等化**（DO 块 + IF NOT EXISTS + CREATE IF NOT EXISTS，开发者要求） |
| `src/generated/prisma/` | 重新生成 | 含 collabContract |
| `.qoder/plans/2026-08/05/add-coder-demo-collab-contract-v1.md` | 新建 | 本地契约样例（实证夹具） |

### 关键契约细化

- `prisma/migrations/` 迁移 SQL 必须幂等（已应用库重放 exit=0）——checksum 变更后需同步 `_prisma_migrations.checksum`
- 禁止 `prisma db push`
- demo 契约必须含「总控 Plan: `{planName}`」（无粗体，contract.ts 正则依赖）

### 高风险误区

- 禁止在迁移 SQL 中保留非幂等写法（CREATE TYPE/ADD COLUMN/ADD CONSTRAINT 无兜底）
- 禁止 MCP 进程残留（contract_track 新逻辑需唯一新进程）

### 验证标准

- 迁移重放 exit=0（全 skip）+ `prisma migrate status` 无漂移
- contract_track v1 创建 + v2 增量更新
- contract_status 查询完整

---

## <第1轮> 模板/Schema 收尾

### 你当前的位置

你是第 1 轮。上游第 0 轮已完成根环境打通。

### 原子事务目标

- §7 持久化删除决策落地（开发者决策：平台机制不承载于契约文档，止于 §六）
- schema.json `fileBoundaries.isolationMode`（file/worktree）
- hitl-template 核对（type 动态注入，无需补）

### 你要改的文件

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/templates/collab-contract-template.md` | 修改 | §7 删除（开发者操作，已同步 4 文档） |
| `templates/core/templates/collab-contract-template.schema.json` | 修改 | isolationMode 字段 |
| `templates/core/templates/hitl-template.md` | 核对 | COLLAB_CONTRACT 无需静态列出（type 动态注入） |

### 关键契约细化

- 契约文档职责边界：业务内容（参与者/阶段/边界），不写平台实现细节

### 验证标准

- 模板结构止于 §六（§3.6 HITL 齐全）
- schema 校验通过

---

## <第2轮> MCP 工具收尾

### 你当前的位置

你是第 2 轮。上游第 0 轮产出 client 契约模型（实证链路依赖）。

### 原子事务目标

- contract.ts：扫描严格过滤（排除 -plan-/add-route/handoff/.hitl）+ 空解析告警 + masterPlan 必需
- hitl.ts：update_hitl 回写 .hitl.md 提案状态（DRAFT→TONGYI）
- plan.ts：plan_status 契约角色展示

### 你要改的文件

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/core/scripts/mcp-server/tools/contract.ts` | 修改 | 过滤 + 告警 + masterPlan 校验 |
| `templates/core/scripts/mcp-server/tools/hitl.ts` | 修改 | 提案文件状态回写 |
| `templates/core/scripts/mcp-server/tools/plan.ts` | 修改 | contractRole/contractName 展示 |

### 关键契约细化

- `tools/registrar.ts` ToolRegistrar 基类接口（Pick<McpServer,"registerTool">），禁止 as unknown 逃逸
- contract.ts 修改后必须 sync 分发 + 重启 MCP（新进程加载）

### 验证标准

- contract_track 只扫契约文档（无误扫）
- update_hitl 后 .hitl.md 状态与哨兵一致（实证 TONGYI）
- plan_status 显示 contractRole: MASTER

---

## <第3轮> Caijuehub 文档 + 验证闭环 + 版本发布

### 你当前的位置

你是第 3 轮。上游第 1-2 轮已完成。

### 原子事务目标

- docs/caijuehub.md 补 collab-contract 裁决入口
- npm run sync 全 IDE 分发
- 验证（contract_track 实证 + lint + tsc）→ bump 版本

### 你要改的文件

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `docs/caijuehub.md` | 修改 | 裁决入口表补 collab-contract 行 |
| `package.json` + `CHANGELOG.md` | 修改 | bump 版本（0.3.17）+ 变更记录 |
| 各 magic 目录 | 同步 | contract/hitl/plan 新逻辑分发 |

### 验证标准

- 验收③-⑧ 全绿（契约链路实证 + 回归）
- 版本 bump + CHANGELOG Unreleased 移入 0.3.17

---

## 每轮收敛判定补充规则

- checklist [T]/[E] 全勾选（19 项），[R] 1 项诚实保留（跨仓库 htc 验证）
- tasks.md 35 项全勾选，描述完整
- 收敛声明由开发者或 Review AI 做出，执行 AI 不得自我判定

## 附录：每轮启动模板

```text
你在执行 add-coder 并发协作契约能力改进的 [第N轮]。
上游 [第0轮~第N-1轮] 已完成。
先读 .qoder/plans/2026-08/05/add-coder-collab-contract-handoff-v1.md 的 <第N轮> 章节。

1. 执行 session-init SKILL → 2. add-paradigm SKILL
3-5. 读 specs/add-coder-collab-contract/{spec,tasks,checklist}.md
6. 按 tasks.md 顺序执行 → 7. checklist 逐项验证勾选（附证据）
8. 每文件 record_dev_operation → 9. query_audit_logs 回查
10. 按 handoff ADD-7 恢复关键词回查 → 11. 收敛后回看架构文档
```

---

### 脱敏要求

禁止出现数据库密码/JWT/API Key 等硬编码值（凭据经 `${ENV_VAR}` 引用）。
