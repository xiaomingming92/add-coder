# add-coder — PlanRecord 补齐 addRoutePath 落库 交接手册

> **适用场景**：单轮变更——PlanRecord 加字段 + plan_track/plan_status 扩容 + 模板/Gardian 同步更新。所有改动在一次闭包内完成。

---

## 1. 交接前状态

- PlanRecord 表含 planPath/specPath/tasksPath/checklistPath，无 addRoutePath
- plan_track 只扫描 `-plan-v*.md`，不处理 add-route
- Guardian Phase 0.1 需 index.md → Plan 文件 → search_file 三级降级定位 add-route
- Orchestrator subagent 存在但无用（两层调用导致并行卡顿）
- Guardian 使用 `Glob`（Qoder 不支持）和 `Bash`（subagent 中太重）
- 模板 schema.json 与 .md 模板结构严重脱节

---

## 2. 交接后状态（目标）

### 数据库
- PlanRecord 新增 `addRoutePath String?` 字段（双项目：add-coder + farm-agent）
- Migration `20260731083508_plan_add_add_route_path`，`IF NOT EXISTS` 幂等

### MCP 工具
- `plan_track`：扫描 plans/ 时按 plan 前缀匹配 `*add-route*.md`，upsert 写入 addRoutePath
- `plan_status`：返回 addRoutePath 字段
- 双项目均验证通过（add-coder: totalTasks=4/4 + addRoute；farm-agent: totalTasks=16/13 + addRoute）

### 模板（5+3）
- `add-route-template.md` / `add-route-template-heavyweight.md`：Step 0 加 `plan_track` 落库步骤
- `spec-template.md` / `tasks-template.md`：末尾加 plan_track 提示
- `checklist-template.md`：流程衔接第 0 步加 plan_track
- 3 个 `.schema.json` 完全重写对齐实际模板结构

### Guardian
- `tools`：`Read, Grep, search_file`（Glob→search_file，去 Bash）
- Phase 0.1：三级降级（index.md → Plan 文件 → search_file）
- Phase 3：通用检查改为「提醒主 agent 执行」

### 清理
- `add-orchestrator.md` 已删除（双项目：add-coder + farm-agent sync）

### Hook 适配器对齐（追加变更）
- `post-tool-use.sh`（core+Qoder）：DPS 自动哨兵 + plan_track 提醒 + devlog 提醒 + schema regen
- `pre-tool-use.sh`（core+Qoder+claude+vscode）：模板类型前置注入 + Write 大文件适配警告
- 所有 5 个 adapter 能力对齐（qoder/claude/vscode 独立维护，codex/trae 从 core 同步）

---

## 3. 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `prisma/add.prisma`（farm-agent） | 修改 | 加 `addRoutePath String?` |
| 2 | `prisma/add.prisma`（add-coder） | 修改 | 同上 |
| 3 | `templates/core/prisma/add.prisma` | 修改 | 模板源 |
| 4 | `templates/core/scripts/mcp-server/tools/plan.ts` | 修改 | plan_track 加扫描 + plan_status 返回 |
| 5 | `templates/core/agents/add-flow-guardian.md` | 修改 | Glob→search_file，去 Bash，索引优先 |
| 6 | `templates/core/agents/add-orchestrator.md` | 删除 | 无用 subagent |
| 7 | `templates/core/templates/add-route-template.md` | 修改 | Step 0 加 plan_track |
| 8 | `templates/core/templates/add-route-template-heavyweight.md` | 修改 | 同上 |
| 9 | `templates/core/templates/spec-template.md` | 修改 | 末尾加 plan_track 提示 |
| 10 | `templates/core/templates/tasks-template.md` | 修改 | 末尾加 plan_track 提示 |
| 11 | `templates/core/templates/checklist-template.md` | 修改 | 流程衔接加 plan_track |
| 12 | `templates/core/templates/spec-template.schema.json` | 重写 | 对齐实际模板 |
| 13 | `templates/core/templates/tasks-template.schema.json` | 重写 | 对齐实际模板 |
| 14 | `templates/core/templates/add-route-template.schema.json` | 重写 | 补全 Steps + plan_track |
| 15 | farm-agent Guardian | sync | 模板覆盖 |
| 16 | farm-agent Orchestrator | sync | 删除 |
| 17 | `templates/core/hooks/post-tool-use.sh` | 修改 | DPS哨兵+plan_track+devlog+schema |
| 18 | `templates/core/hooks/pre-tool-use.sh` | 修改 | 模板注入 + Write 适配 |
| 19 | `templates/adapters/qoder/hooks/post-tool-use.sh` | 修改 | Qoder 适配版 |
| 20 | `templates/adapters/qoder/hooks/pre-tool-use.sh` | 修改 | Qoder 适配版 |
| 21 | `templates/adapters/claude/hooks/pre-tool-use.sh` | 修改 | Claude 适配版 |
| 22 | `templates/adapters/vscode/hooks/pre-tool-use.sh` | 修改 | VS Code 适配版 |

---

## 4. 回滚方案

### 代码回滚
```bash
cd add-coder && git checkout -- \
  prisma/add.prisma \
  templates/core/prisma/add.prisma \
  templates/core/scripts/mcp-server/tools/plan.ts \
  templates/core/agents/ \
  templates/core/templates/ \
  templates/core/hooks/ \
  templates/adapters/qoder/hooks/ \
  templates/adapters/claude/hooks/ \
  templates/adapters/vscode/hooks/
```

### 数据回滚
```sql
ALTER TABLE "PlanRecord" DROP COLUMN IF EXISTS "addRoutePath";
```

---

## 5. 执行前置检查

- [x] `npx tsc --noEmit` 通过
- [x] add-coder MCP 可调用 plan_track/plan_status
- [x] farm-agent MCP 可调用 plan_track/plan_status

---

## 6. 执行 Task 摘要

```text
Task 1.1 ── prisma schema 加字段（双项目 + 模板）
              │
              ▼
Task 1.2 ── plan_track 加 add-route 扫描 + upsert 写入
              │
              ▼
Task 1.3 ── plan_status 返回 addRoutePath
              │
              ├──────────────────────┐
              ▼                      ▼
Task 1.4 ── npm run sync         额外：Guardian 优化
              │                  Glob→search_file
              ▼                  去 Bash，去 Orchestrator
            farm-agent           模板 schema 重写
            prisma generate      Hook 适配器对齐
            db push              (5 adapter 全部)
            plan_track 验证
```

---

## 7. 关键风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| plan_track 前缀误匹配 add-route | addRoutePath 写入错误文件 | 前缀同时匹配，不含其他 plan 关键词 |
| prisma generate 后 MCP 未重启 | Unknown argument addRoutePath | 必须 prisma generate → MCP 重启 → db push，顺序不可乱 |
| sync 不覆盖 prisma/ | add-coder 自己的 schema 漏更新 | 手动同步 prisma/add.prisma + prisma generate |

---

## 8. 恢复上下文审计查询

### 总体一键恢复
```text
query_audit_logs({ keyword: "addRoutePath" })
```
→ 预期返回 N 条记录

### 逐任务/逐文件审计查询
```text
query_audit_logs({ targetId: "prisma/add.prisma" })
→ 预期返回 SCHEMA_MODIFIED: PlanRecord 加 addRoutePath

query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/plan.ts" })
→ 预期返回 COMPONENT_MODIFIED: plan_track + plan_status 扩容

query_audit_logs({ targetId: "templates/core/hooks/pre-tool-use.sh" })
→ 预期返回 HOOK_MODIFIED: 模板注入 + Write 适配

query_audit_logs({ keyword: "add-coder-addroute-path-persistence" })
→ 预期返回 devlog 等开发操作记录
```

### SQL 管理员验证
```sql
SELECT action, "targetType", "targetId", reason, "createdAt"
FROM "DevOperation"
WHERE "planKeyword" = 'add-coder-addroute-path-persistence'
ORDER BY "createdAt" DESC;
```

### 恢复判定标准
- DevOperation 命中数 ≥ 1
- grep 验证：
```bash
grep -R "addRoutePath" .qoder/specs/add-coder-addroute-path-persistence/
grep -R "addRoutePath" prisma/add.prisma
```

---

## 9. 后置确认

- [x] add-coder plan_track：totalTasks=4/4，addRoute ✅
- [x] add-coder plan_status：返回 addRoute + spec ✅
- [x] farm-agent prisma generate + db push ✅
- [x] farm-agent plan_track：addRoute ✅
- [x] farm-agent plan_status：返回 addRoute ✅
- [x] 模板 5+3 已 sync ✅
- [x] Guardian 已简化 + sync ✅
- [x] Orchestrator 已删除 ✅
- [x] Hook 5 adapter 能力对齐 ✅

---

## 10. 验收记录（devlog）

### 本轮改了什么
1. PlanRecord 表新增 `addRoutePath String?` 字段（双项目 prisma schema + migration + prisma generate + db push）
2. plan_track MCP 工具新增 add-route 前缀匹配扫描 + upsert 写入
3. plan_status MCP 工具新增 addRoutePath 返回
4. 5 个模板文件（add-route×2 + spec + tasks + checklist）加 plan_track 落库步骤
5. 3 个 schema.json 完全重写对齐实际模板结构
6. Guardian subagent 优化（Glob→search_file，去 Bash，索引优先查找）
7. Orchestrator subagent 删除（双项目）
8. Hook 适配器对齐：post-tool-use（DPS哨兵+plan_track+devlog+schema）、pre-tool-use（模板注入+Write适配），覆盖 core/qoder/claude/vscode 独立维护 + codex/trae 从 core 同步

### 验收结果
- DPS = 83 🟢 PASS
- add-coder: tasks 4/4 ✅，checklist [T] 5/5 ✅，[R] 2/2 ✅
- farm-agent: plan_track/plan_status 均返回 addRoute ✅
- 5 个 hook adapter 能力已全部对齐
- 双项目 MCP 验证通过

### devlog 查询语句
```text
query_audit_logs({ planKeyword: "add-coder-addroute-path-persistence" })
```
→ devlog ID: `cms8p53rh000muflz8583qw3l`

### 遗留项
- 无。重启 IDE 后新 hook 生效。

---

### 脱敏要求

Handoff 文档中 **禁止出现** 以下类型的硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。
