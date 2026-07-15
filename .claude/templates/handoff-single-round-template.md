# {项目名} — {变更描述} 交接手册

> **适用场景**：单轮变更——Plan 内只有 1 个轮次级闭包，所有文件在一次闭包内完成，无跨轮文件边界问题。如简单 Bug 修复、单文件改动。
>
> **注意**：如果涉及多个独立文件边界（如类型定义 + 调用方修复），即使"用户能用"也需要拆为多轮，应使用 `handoff-multi-round-template.md`。

---

## 1. 交接前状态

{描述当前数据/文件分布、系统现状}

---

## 2. 交接后状态（目标）

{描述目标布局、变更完成后的系统状态}

---

## 3. 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `{文件路径}` | {新建/修改/删除} | {一句话描述改了什么} |

---

## 4. 回滚方案

### 代码回滚

```bash
git reset --hard <commit>
```

### 数据回滚

{如有数据迁移，描述回滚操作}

---

## 5. 执行前置检查

- [ ] {检查项1}
- [ ] {检查项2}
- [ ] `npx tsc --noEmit` + `eslint` 当前无 error

---

## 6. 执行 Task 摘要

```text
{依赖图 — ASCII 图，│ ├ ▼ 表达依赖关系}

Step 1 ── {描述}
            │
            ▼
Step 2 ── {描述}
            │
            ├──────────────┐
            ▼              ▼
Step 3 ── {描述}         Step 4 ── {描述}
            │              │
            └──────┬───────┘
                   ▼
Step 5 ── {描述}
```

---

## 7. 关键风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| {风险描述} | {影响说明} | {缓解措施} |

---

## 8. 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL。共 {N} 条审计记录可恢复完整开发上下文。

### 总体一键恢复

```text
query_audit_logs({ keyword: "{汇总关键词}" })
```
→ 预期返回 {N} 条记录

### 逐任务/逐文件审计查询

```text
query_audit_logs({ targetId: "{文件路径1}" })
→ 预期返回 {ACTION_1}: {描述}

query_audit_logs({ targetId: "{文件路径2}" })
→ 预期返回 {ACTION_2}: {描述}

query_audit_logs({ keyword: "{ACTION_3}" })
→ 预期返回 {N} 条: {描述}
```

### SQL 管理员验证

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

### 恢复判定标准

- action 命中数 ≥ {N}
- grep 验证命令：

```bash
grep -R "{关键字}" .claude/specs/
```

---

## 9. 后置确认

- [ ] `npx tsc --noEmit` + `eslint` 通过
- [ ] 所有文件改动已记录 ADD-7 审计（`query_audit_logs` 可回查）
- [ ] {确认项3}
- [ ] {确认项4}

---

### 脱敏要求

Handoff 文档中 **禁止出现** 以下类型的硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。
