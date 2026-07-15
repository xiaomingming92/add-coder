# {需求名}-plan-v{版本号}

> 精简版 Plan 模板：适用于单一聚焦改动（配置收敛、重构、修复等）。Tasks 合并于 Plan 体，无需独立 spec 文件。

**创建时间**: {ISO 时间戳}
**主导 AI**: {AI 助手标识}

---

## 一、Plan 概述

- **现状**: 一句话描述当前问题
- **目标**: 一句话描述改后状态
- **核心原则**: 本次改动遵循的关键约束

---

## 二、变更范围

### 2.1 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `path/to/file.ts` | 修改 | 一句话说明 |

### 2.2 关键设计决策

1. xxx
2. xxx

---

## 三、Tasks（合并在 Plan 中，无需独立 spec/tasks.md）

> 单轮 Plan，Task 扁平排列无需分组。依赖关系见 §4.6 执行 Task 摘要。

- [ ] Task 1: {任务描述}
  - [ ] SubTask 1.1: {子任务描述}
- [ ] Task 2: {任务描述}

---

## 四、Handoff

> 与独立 `handoff-single-round-template.md` 结构一致。

### 4.1 交接前状态

{描述当前数据/文件分布、系统现状}

### 4.2 交接后状态（目标）

{描述目标布局、变更完成后的系统状态}

### 4.3 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `{文件路径}` | 新建/修改/删除 | 一句话描述 |

### 4.4 回滚方案

```bash
git reset --hard <commit>
```

### 4.5 执行前置检查

- [ ] {检查项1}
- [ ] {检查项2}
- [ ] `npx tsc --noEmit` 当前无错误（或已知错误与本变更无关）

### 4.6 执行 Task 摘要

```text
{依赖图 — ASCII 图，│ ├ ▼ 表达依赖关系}

Step 1 ── {描述}
            │
            ▼
Step 2 ── {描述}
```

### 4.7 关键风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| {风险描述} | {影响说明} | {缓解措施} |

### 4.8 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL。共 {N} 条审计记录可恢复完整开发上下文。

#### 总体一键恢复

```text
query_audit_logs({ keyword: "{汇总关键词}" })
```
→ 预期返回 {N} 条记录

#### 逐任务/逐文件审计查询

```text
query_audit_logs({ targetId: "{文件路径1}" })
→ 预期返回 {ACTION_1}: {描述}

query_audit_logs({ targetId: "{文件路径2}" })
→ 预期返回 {ACTION_2}: {描述}

query_audit_logs({ keyword: "{ACTION_3}" })
→ 预期返回 {N} 条: {描述}
```

#### SQL 管理员验证

```sql
SELECT action, "targetType", "targetId", reason, "createdAt"
FROM "AuditLog"
WHERE action IN (
  '{ACTION_1}',
  '{ACTION_2}',
  '{ACTION_3}'
)
ORDER BY "createdAt" DESC;
```

#### 恢复判定标准

- action 命中数 ≥ {N}
- grep 验证命令：

```bash
grep -R "{关键字}" .add/
```

### 4.9 后置确认

- [ ] `npx tsc --noEmit` 通过
- [ ] {确认项2}
- [ ] {确认项3}

### 4.10 脱敏要求

Handoff 文档中 **禁止出现** 以下硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`、`LLM_API_KEY` 等）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注值见 `.env.development`。

---

## 五、验收标准

- [ ] 标准1
- [ ] 标准2

---

## 六、关联

| 类型 | 路径 |
|------|------|
| Handoff | 见本文第四部分 |
| Review | `.add/reviews/{name}-review-v{版本}.md` |
