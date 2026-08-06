# Tasks: add-coder-prisma-sync-fix-v1

> 对应 Plan: `add-coder-prisma-sync-fix-plan-v1` | Spec: `spec.md`
> 执行规范：每个 Phase/Task 完成后**等待用户确认**再继续下一个（tasks.md Phase 分步执行规范）。

## 轮次依赖（复制自 Plan §四）

```text
轮次 1: 三缺陷修复 + 测试 + 构建
  ├── Task 1.1: parseSchemaBlocks 行级扫描重写（writer.ts）
  │     ▼
  ├── Task 1.2: injectFieldLines 双类型 + getBaseFieldLines enum 值直取 + @@ 前插入 + 零注入告警（sync.ts）
  │     ▼
  ├── Task 1.3: 最小导出面（parseSchemaBlocks / injectFieldLines / injectMissingModels）
  │     ▼
  ├── Task 1.4: tests/prisma-sync.test.ts（4 组回归用例）
  │     ▼
  ├── Task 1.5: npm run build 重建 dist
  │     ▼
  └── Task 1.6: 现场场景回归（模拟 farm-agent CollabContract/HitlType 注入）
```

## Plan→Task 映射（对接 Spec 细节）

| Plan 设计决策 | Task | Spec |
|------|------|------|
| 行级括号深度扫描 | 1.1 | Spec §1 |
| 双类型 + @@ 前插入 + enum 值直取 + 告警 | 1.2 | Spec §2 |
| 最小导出面 | 1.3 | Spec §1/§2 |
| 回归测试 | 1.4 | Spec §3 |
| dist 重建 | 1.5 | Spec §4 |
| 现场回归 | 1.6 | Spec §4 |

## 轮次 1: 三缺陷修复 + 测试 + 构建

### Task 1.1: parseSchemaBlocks 行级扫描重写 — 对应 Spec §1

**文件**: `src/cli/writer.ts`

- [x] 重写 `parseSchemaBlocks`：逐行扫描（`//` 剥离 + 括号深度计数），替代 L48 正则
- [x] `body` 保留完整块原文（含注释行）
- [x] `fields` 提取复用现有逻辑（model: fieldRegex；enum: 值行 trim）
- [x] 类型定义 `SchemaBlock`（type/name/body/fields）

**验证**: 临时脚本或后续测试 T3 覆盖注释括号块完整提取；`npx tsc --noEmit` 通过

### Task 1.2: injectFieldLines + getBaseFieldLines 修复 — 对应 Spec §2 | 依赖 Task 1.1

**文件**: `src/cli/commands/sync.ts`

- [x] `getBaseFieldLines`：enum 类型"值行直取"（`^\s*(\w+)\s*$`，忽略注释/空行）——Review P0-1
- [x] `injectFieldLines` 块匹配正则 `model` → `(?:model|enum)`——RPT-20260806-01
- [x] 注入点：块内最后一个 `@@` 行之前——RPT-20260806-02
- [x] 零注入告警：`fieldKeys.length > 0 && count === 0` → `⚠️ 注入失败`——不静默

**验证**: `npx tsc --noEmit` 通过；行为验证见 Task 1.4 测试

### Task 1.3: 最小导出面 — 对应 Spec §1/§2 | 依赖 Task 1.1/1.2

**文件**: `src/cli/writer.ts` + `src/cli/commands/sync.ts`

- [x] `export function parseSchemaBlocks`（writer.ts）——Review P1-2
- [x] `export function injectFieldLines` / `export function injectMissingModels`（sync.ts）——Review P1-2

**验证**: `npx tsc --noEmit` 通过；测试可 import 三函数

### Task 1.4: tests/prisma-sync.test.ts（4 组回归用例）— 对应 Spec §3 | 依赖 Task 1.3

**文件**: `tests/prisma-sync.test.ts`（新建）

- [x] T1 enum 注入：`HitlType.COLLAB_CONTRACT` 注入返回 1 且文件含值
- [x] T2 @@ 前插入：注入字段位于 `@@index` 之前
- [x] T3 注释括号：含 `// [{...}]` 注释模型完整注入（无截断，含全部字段）
- [x] T4 零注入告警：重复字段场景返回 0 且输出告警

**验证**: `npx vitest run tests/prisma-sync.test.ts` 全绿（纯文件操作，不触发 DATABASE_URL）

### Task 1.5: npm run build 重建 dist — 对应 Spec §4 | 依赖 Task 1.4

**验证**:
- [x] `npm run build`（tsup）成功
- [x] `dist/index.js` 存在且为最新构建

### Task 1.6: 现场场景回归 — 对应 Spec §4 | 依赖 Task 1.5

- [x] 模拟 farm-agent：`enum HitlType` 缺失 `COLLAB_CONTRACT` → 注入成功（非 0）
- [x] 模拟 farm-agent：`PlanRecord` 注入 8 字段 → 位于 `@@index` 前
- [x] 模拟 farm-agent：`CollabContract` 缺失注入 → body 完整（9+ 字段无截断）
- [x] 全局 CLI 生效性检查：`add-coder --version`（或确认全局安装路径）——Review P2-4

## Verification

- [x] `npx vitest run tests/prisma-sync.test.ts` 全绿
- [x] `npx tsc --noEmit` 通过
- [x] `npm run build` 成功
- [x] 现场回归 3 项通过 + CLI 生效
- [x] git diff 仅含：writer.ts / sync.ts / tests/prisma-sync.test.ts（+ dist 产物）
