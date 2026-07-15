---
name: "session-init"
description: "会话上下文恢复（稀疏推理）。每次新对话启动时，必须执行本 SKILL 恢复之前的开发上下文。这是 AI 助手的强制性初始化流程，不可跳过。"
---

# 会话初始化：稀疏推理上下文恢复

## 为什么必须执行本 SKILL

每次新对话启动时，AI 助手对之前的开发活动处于"零知识"状态。
通过查询 `AuditLog` 表，可以稀疏地恢复之前的开发脉络。

**不执行本 SKILL 的后果**：
- 无法知道之前改了什么代码
- 无法知道 API 合约发生了什么变化
- 可能做出冲突的修改
- 需要用户重复说明历史背景
- **遗漏未关闭的运行时发现**——部署后暴露但未被追踪的异常会持续累积

---

## Step 0：前置条件检查

在执行本 SKILL 之前，确保：

- [ ] `query_audit_logs` MCP 工具可用（MCP Server 已连接）
- [ ] `record_dev_operation` MCP 工具可用
- [ ] `get_project_context` MCP 工具可用
- [ ] 数据库正在运行（`npm run db:status`）

如果 MCP 工具不可用，**必须提示用户先启动 MCP Server**，不能跳过。

---

## Step 1：扫描运行时纠偏文档（ADD-11 证据的不可再生性）

**在查询审计日志之前，先检查是否存在未关闭的运行时发现。** 这些是部署后暴露的问题，优先级高于任何新的开发需求。

### 1.1 搜索 review-runtime.md 文件

```bash
find .add/reviews/ -name "*review-runtime*" -type f 2>/dev/null
```

### 1.2 逐文件检查未关闭发现

对每个 `review-runtime.md` 文件：
- 读取全文
- 检查 §1 发现列表中是否有标记为"未修复"或状态为 `[ ]` 的发现
- 检查是否存在未标记的发现（现象明确但无修复记录）

### 1.3 汇总未关闭发现

将未关闭发现整理为：

```markdown
## ⚠️ 运行时未关闭发现

| 文件 | 发现# | 现象摘要 | 状态 |
|------|-------|---------|------|
| add-coder-review-runtime.md | #1 | Chat 格式断裂 (SSE vs JSON) | 未修复 |
| ... | ... | ... | ... |
```

如果存在未关闭发现 → **告知用户并询问优先级**（先修还是继续前次任务）
如果不存在 → 进入 Step 2

---

## Step 2：查询开发操作审计日志

调用 `query_audit_logs` 工具，按以下优先级组合查询：

### 2.1 查最近 2 小时的全部记录（快速恢复）

```
query_audit_logs({})
```

**预期产出**：
- 最近的全部开发操作列表（action, targetType, targetId, beforeState, afterState）
- 如果非空 → 直接进入 Step 3
- 如果为空 → 进入 2.2

### 2.2 如果 2.1 为空，放宽时间范围

```
query_audit_logs({ sinceMinutes: 1440 })   // 最近 24 小时
```

### 2.3 如果仍然为空，按目标类型查询

```
query_audit_logs({ targetType: "API_ROUTE" })
query_audit_logs({ targetType: "COMPONENT" })
query_audit_logs({ targetType: "SCHEMA" })
query_audit_logs({ action: "RUNTIME_ERROR" })          // ADD-11: 运行时异常应优先持久化证据
```

### 2.4 加载 Plan 索引（L2 操作惯性 — index.md 预载）

```
读取 .add/plans/index.md
```

**预期产出**：
- 所有活跃 Plan 的列表（按日期分组）
- plan / handoff / add-route 文件路径和主题描述
- 如文件不存在 → 跳过，不阻断流程

### 2.5 获取 ADD 工作流状态（L2 操作惯性 — ADD 状态预载）

```
get_project_context({ scope: "add-state" })
```

**预期产出**：
- 当前活跃的 ADD Plan 名称和路径
- 当前所处的 ADD Step（从 add-route 推断）
- 待执行的 ADD 操作清单
- 如 MCP 工具不可用 → 跳过，不阻断流程

---

## Step 3：分析审计日志 + Plan 索引 + ADD 状态推断上下文

根据 Step 2 返回的审计记录、Step 2.4 的 Plan 索引、Step 2.5 的 ADD 状态，交叉分析：

### 3.1 推断进行中的工作

| 审计记录特征 | 推断 |
|-------------|------|
| 最近有 `API_PAGINATION_ENABLED` | 文档列表分页功能正在进行中 |
| 最近有 `COMPONENT_VIRTUAL_LIST_ADDED` | 虚拟列表渲染正在实施 |
| 最近有 `SCHEMA_FIELD_ADDED` | 数据库 Schema 刚被修改 |
| 最近有 `DEPENDENCY_ADDED` | 新依赖已安装 |

### 3.2 推断文件改动范围

```
根据 action 推断：
  targetType=API_ROUTE  → 检查 src/app/api/ 下对应文件
  targetType=COMPONENT  → 检查 src/components/ 下对应文件
  targetType=SCHEMA     → 检查 prisma/schema.prisma
  targetType=DEPENDENCY → 检查 package.json
  targetType=DOC        → 检查 docs/ 下对应文档文件
```

### 3.4 推断 ADD 状态与活跃 Plan 拓扑

根据 Step 2.4（index.md）和 Step 2.5（get_project_context）的结果：

```
从 index.md 提取:
  - 最近的 Plan 列表（按日期倒序，最近 7 天）
  - 每个 Plan 的类型（plan / handoff / add-route）和主题

从 get_project_context 提取:
  - 当前活跃 Plan 名称
  - 当前 ADD Step
  - 待执行操作清单

交叉推断:
  - 如 get_project_context 有活跃 Plan → 优先定位
  - 如 get_project_context 为空 → 从 index.md 最近日期推断最可能的活跃 Plan
  - 如 audit log 有最近操作 → 与 Plan 交叉验证一致
```

---

## Step 4：构建上下文摘要

将 Step 3 的分析结果整理成以下格式：

```markdown
## 🔄 稀疏推理上下文恢复

**检测到的开发活动**：
- 正在进行的 Plan: `{plan-name}` (如果有)
- 当前 ADD Step: {Step N}（从 get_project_context 或 add-route 推断）
- 活跃 Plan 列表（最近 7 天）:
  - {date}: {plan-name} — {主题}
  - {date}: {plan-name} — {主题}
- 已修改的文件: {file1}, {file2}, ...
- 已完成的改动: {action1}, {action2}, ...
- 待完成的改动: {action3}, {action4}, ...

**Plan 拓扑**（从 index.md 提取）:
- 最近 Plan: {links}
- 待执行 ADD 操作: {从 get_project_context 提取}

**建议下一步**：
- {根据审计记录、Plan 拓扑和 ADD 状态推断的下一步操作}
```

将此摘要作为当前会话的「上下文基准」告知用户。

---

## Step 5：开始正常对话

上下文恢复完成后，进入正常的 ADD 流程：
- 如果用户提出需求 → 按 `add-paradigm` SKILL 执行
- 如果用户要求修改 → 按 `add-paradigm` SKILL 执行
- 修改完成后 → 调用 `record_dev_operation` 记录

---

## 本 SKILL 的执行检查清单

- [ ] Step 1: 已扫描 `.add/reviews/*review-runtime*` 并汇总未关闭发现
- [ ] Step 2: 已调用 `query_audit_logs({})`（含 `RUNTIME_ERROR` 查询）
- [ ] Step 3: 已分析审计日志推断上下文
- [ ] Step 4: 已构建上下文摘要
- [ ] Step 5: 已向用户展示恢复的上下文（含未关闭运行时发现，如有）
