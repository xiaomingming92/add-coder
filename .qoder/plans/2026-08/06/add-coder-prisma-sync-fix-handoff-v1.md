# add-coder — Prisma Schema 同步器缺陷修复 交接手册

> **对应 Plan**: `add-coder-prisma-sync-fix-plan-v1.md`（标准版）
> **状态**: ✅ 已完成 2026-08-06（Step 8 验收通过）

---

## 1. 交接前状态

- `sync --patch` 的 Prisma schema 同步路径存在 3 个注入缺陷（RPT-20260806-01/02/03，farm-agent 现场复现）：
  1. enum 缺失值注入静默失败（"已补充 0 个字段"）
  2. 字段注入插在 `@@` 块属性之后 → schema 非法
  3. 模型块被行内注释 `}` 截断 → 注入不完整
- CLI 运行时走 `bin/add-coder.js → dist/index.js`，src 修复需 build 才生效

## 2. 交接后状态（目标）

- `parseSchemaBlocks`（writer.ts）：行级扫描重写（`//` 剥离 + 括号深度计数），完整提取含注释块，已导出
- `getBaseFieldLines`（sync.ts）：enum 值行直取（Review P0-1 回流）
- `injectFieldLines`（sync.ts）：model/enum 双类型 + `@@` 前插入 + 零注入告警，已导出
- `injectMissingModels`（sync.ts）：已导出
- `tests/prisma-sync.test.ts`：5 用例全绿（enum 注入 / @@ 前插入 / 注释括号 / 零注入告警）
- `dist/`：tsup 重建，含修复逻辑

## 3. 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `src/cli/writer.ts` | 修改 | parseSchemaBlocks 行级扫描重写 + SchemaBlock 导出（+79 行） |
| 2 | `src/cli/commands/sync.ts` | 修改 | getBaseFieldLines enum 值直取 + injectFieldLines 双类型/@@ 前插入/告警 + 双函数导出（+95 行） |
| 3 | `tests/prisma-sync.test.ts` | 新建 | 5 组回归用例 |
| 4 | `dist/` | 重建 | tsup build（78.76 KB） |
| 5 | 文档配套 | 新建/修改 | Plan / Review / Specs 三元组 / add-route / 报告 / AGENTS.md / gen-report-index.sh |

## 4. 回滚方案

### 代码回滚

```bash
cd /home/xmm/ai/add-coder
git checkout -- src/cli/writer.ts src/cli/commands/sync.ts
npm run build   # dist 同步回退
```

### 数据回滚

- 无数据库变更（本次不涉及 schema/数据）
- farm-agent 侧 add.prisma 为可重新生成资产（sync 自动注入）

## 5. 执行前置检查

- [x] `npx tsc --noEmit` 通过
- [x] `npx vitest run tests/prisma-sync.test.ts` 5/5 全绿
- [x] `npm run build` 成功
- [x] 现场回归（farm-agent 破坏-注入-校验）通过

## 6. 执行 Task 摘要

```text
Task 1.1 parseSchemaBlocks 行级扫描重写（writer.ts）
   │  ▼
Task 1.2 injectFieldLines/getBaseFieldLines 修复（sync.ts）
   │  ▼
Task 1.3 最小导出面（双文件 export）
   │  ▼
Task 1.4 tests/prisma-sync.test.ts（5 用例全绿）
   │  ▼
Task 1.5 npm run build 重建 dist
   │  ▼
Task 1.6 现场回归（farm-agent 破坏-注入-校验：HitlType=1 / PlanRecord=8 / CollabContract 完整 / validate valid）
```

## 7. 关键风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 全局 add-coder 命令指向发布版（非 link） | CLI 修复不生效 | 已确认 farm-agent 走本地 link + dist；发布时需 `pnpm publish` 新版本 |
| 交互式 CLI 管道输入 EOF | 字段注入无法走交互确认 | 已用直接函数调用验证（同代码路径） |
| farm-agent add.prisma 手工状态 | sync 注入结果与手工修复可能重复 | 注入幂等（已存在字段跳过） |

## 8. 恢复上下文审计查询（新 AI Session 首次启动必读）

### 总体一键恢复

```text
query_audit_logs({ keyword: "add-coder-prisma-sync-fix" })
```
→ 预期返回 4 条记录（COMPONENT_FIXED ×2 / TEST_CREATED / BUILD_REBUILT）

### 逐任务/逐文件审计查询

```text
query_audit_logs({ targetId: "src/cli/writer.ts" })
→ 预期返回 COMPONENT_FIXED: parseSchemaBlocks 行级扫描重写

query_audit_logs({ targetId: "src/cli/commands/sync.ts" })
→ 预期返回 COMPONENT_FIXED: 注入修复 + 导出

query_audit_logs({ targetId: "tests/prisma-sync.test.ts" })
→ 预期返回 TEST_CREATED: 5 用例

query_audit_logs({ targetId: "dist/" })
→ 预期返回 BUILD_REBUILT: tsup 重建
```

### SQL 管理员验证

```sql
SELECT action, "targetType", "targetId", reason, "createdAt"
FROM "DevOperation"
WHERE "planKeyword" = 'add-coder-prisma-sync-fix'
ORDER BY "createdAt" DESC;
```

### 恢复判定标准

- action 命中数 ≥ 4
- grep 验证命令：

```bash
grep -R "add-coder-prisma-sync-fix" .qoder/
```
