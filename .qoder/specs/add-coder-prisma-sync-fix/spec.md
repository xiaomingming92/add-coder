# Spec: add-coder-prisma-sync-fix

> 对应 Plan: [add-coder-prisma-sync-fix-plan-v1](../../plans/2026-08/06/add-coder-prisma-sync-fix-plan-v1.md)
> 缺陷报告: [prisma-sync-defects-report.md](../../reports/prisma-sync-defects-report.md)（RPT-20260806-01/02/03）

## Plan→Spec 映射

| # | Plan 设计决策 | Spec 实施 | 文件 |
|---|------|------|------|
| 1 | 行级括号深度扫描（Plan §3.2-1） | §1 parseSchemaBlocks 重写 | `src/cli/writer.ts` |
| 2 | 双类型 + @@ 前插入 + enum 值直取 + 告警（Plan §3.2-2/3/4/5） | §2 injectFieldLines/getBaseFieldLines 修复 | `src/cli/commands/sync.ts` |
| 3 | 最小导出面 + 回归测试（Plan §3.2-6 / §2.2） | §3 测试用例 | `tests/prisma-sync.test.ts` + 两源文件 |
| 4 | dist 重建（Plan §1.2-4） | §4 构建验证 | `dist/` |

---

## 1. parseSchemaBlocks 行级扫描重写（writer.ts）

### 类型/接口定义

```typescript
// 导出（Review P1-2 回流）：原为私有函数
export interface SchemaBlock {
  type: "model" | "enum";
  name: string;
  body: string;      // 完整块原文（含注释），供 injectMissingModels 原样注入
  fields: string[];  // model: "fieldName:fieldType"；enum: 值行（trim 后）
}

export function parseSchemaBlocks(content: string): Map<string, SchemaBlock>;
```

实现要点（行级扫描，替代 L48 正则）：

```typescript
// 逐行处理：
// 1. line = 原始行；commentless = line.split("//")[0]（剥离行内注释）
// 2. 遇 /^(model|enum)\s+(\w+)\s*\{/ → 开块：type/name 记录，深度=1，块行收集
// 3. 块内：对 commentless 计数 '{' → 深度+1；'}' → 深度-1
// 4. 深度归 0 → 块结束（body = 收集行 join("\n")，含末尾 "}"）
// 5. fields 提取复用现有逻辑（model: fieldRegex；enum: 值行 trim 过滤）
```

### WHEN-THEN

- WHEN 输入含 `participants Json // [{role, ...}]` 行注释（含 `{`/`}`）
- THEN 块完整提取：body 包含注释行及后续全部字段，不截断（RPT-20260806-03 修复）
- WHEN 输入为 enum 块（`enum HitlType { ... }`）
- THEN fields 为值行数组（`["PLAN", "PLAN_REVIEW", ...]`），body 完整

---

## 2. injectFieldLines + getBaseFieldLines 修复（sync.ts）

### 类型/接口定义

```typescript
// 导出（Review P1-2 回流）：
export function injectFieldLines(
  targetPath: string, basePath: string, modelName: string, fieldKeys: string[],
): number;
export function injectMissingModels(
  targetPath: string, models: { type: string; name: string; body: string }[],
): number;
```

### 2.1 getBaseFieldLines：enum 值直取（Review P0-1 回流）

```typescript
// 现有 L439: const fm = line.match(/^\s*(\w+)\s+/);   ← enum 值无尾随空白，匹配不到
// 改为按块类型分路：
//   model: line.match(/^\s*(\w+)\s+/)           （维持现状）
//   enum : 值行直取 —— line.match(/^\s*(\w+)\s*$/) 且非注释/空行
//   fields[值名] = line.trim()                  （供注入时原样写入）
```

### 2.2 injectFieldLines：双类型 + @@ 前插入 + 零注入告警

```typescript
// 2.2.1 块匹配正则（L468）：model → model|enum
const modelRegex = new RegExp(`((?:model|enum)\\s+${modelName}\\s*\\{)([^}]*?)(\\n\\s*\\})`, "m");

// 2.2.2 插入点（L475）：块内最后一个 @@ 属性行之前
//   1. 在块体 m[2] 中查找最后一个 /^\s*@@/ 行位置
//   2. 有 → 字段插在该行前；无 → 保持块尾插入（现逻辑）
//   3. 注意 enum 块无 @@ 行，天然走块尾

// 2.2.3 零注入告警（新增）：
if (fieldKeys.length > 0 && count === 0) {
  console.warn(`⚠️  注入失败：${modelName} 的 ${fieldKeys.length} 个字段未写入（可能块未匹配）`);
}
```

### WHEN-THEN

- WHEN 目标含 `enum HitlType` 且缺 `COLLAB_CONTRACT`，用户确认补充
- THEN 注入成功，返回 count=1（RPT-20260806-01 修复）
- WHEN 目标 `model PlanRecord` 含 `@@index([planKeyword])`
- THEN 注入字段位于 `@@index` 行**之前**，`prisma validate` 通过（RPT-20260806-02 修复）
- WHEN 字段全部已存在或块不匹配
- THEN 输出 `⚠️ 注入失败` 告警，不静默

---

## 3. 回归测试（tests/prisma-sync.test.ts）

### 类型/接口定义

```typescript
// vitest 直测导出函数（Review P1-2）
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseSchemaBlocks, diffPrisma } from "../src/cli/writer.js";
import { injectFieldLines, injectMissingModels } from "../src/cli/commands/sync.js";
```

用例设计（tmp 目录构造基准/目标文件）：

| 用例 | 场景 | 断言 |
|------|------|------|
| T1 enum 注入 | 基准 `enum HitlType { PLAN PLAN_REVIEW COLLAB_CONTRACT }`，目标缺 `COLLAB_CONTRACT` | `injectFieldLines` 返回 1；目标文件含 `COLLAB_CONTRACT` |
| T2 @@ 前插入 | 目标 `model PlanRecord` 含 `@@index`，注入 dpsComposite 等字段 | 注入后字段行位于 `@@index` 之前；`prisma validate` 通过（若环境可用） |
| T3 注释括号 | 基准模型含 `// [{role,...}]` 注释 + 9 字段，目标缺整个模型 | `injectMissingModels` 注入 body 完整（含 abilityMatrix/stages 等全部字段，无截断） |
| T4 零注入告警 | 目标已含全部字段（fieldKeys 与目标重复） | 返回 0 且 stderr 含 `⚠️ 注入失败` |

### WHEN-THEN

- WHEN 执行 `npx vitest run tests/prisma-sync.test.ts`
- THEN 4 用例全绿，无 DATABASE_URL 依赖（纯文件操作，遵守隔离运行规范）

---

## 4. 构建验证（dist）

### WHEN-THEN

- WHEN 执行 `npm run build`（tsup）
- THEN dist 重建成功，`bin/add-coder.js → dist/index.js` 链路加载修复后逻辑
- WHEN 全局 add-coder 命令存在（`which add-coder`）
- THEN 确认全局安装为 link 本地或重新安装后 CLI 生效（Review P2-4）
