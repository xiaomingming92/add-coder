# add-coder-prisma-sync-fix-plan-v1-review-v1

## Review 元信息

- **Review 对象**: [add-coder-prisma-sync-fix-plan-v1.md](file:///home/xmm/ai/add-coder/.qoder/plans/2026-08/06/add-coder-prisma-sync-fix-plan-v1.md)
- **Review 范围**: Plan 结构合规性 + 缺陷根因准确性 + 修复方案完整性 + Task 可执行性
- **Review 时间**: 2026-08-06
- **Review 类型**: Plan 合规检查 + 方案评审（Bug 修复）
- **前置阅读**: `src/cli/writer.ts`、`src/cli/commands/sync.ts`、`bin/add-coder.js`、缺陷报告 `prisma-sync-defects-report.md`（RPT-20260806-01/02/03）

---

## HITL 发现总览（一次性提交人类审核）

> 以下为全部发现，等待人类一次性审核通过后再逐项推进。

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🔴 P0 | 修复不完整 | **enum 注入修复缺一环**：即使 injectFieldLines 正则支持 enum，`getBaseFieldLines`（L431-445）用 `^\s*(\w+)\s+` 提取字段——enum 值行（如 `COLLAB_CONTRACT`）无"类型"部分且无尾随空白，匹配不到 → 返回空 → L457 提前 return 0，**仍会"已补充 0 个字段"** | 修复 1 需同时改造 `getBaseFieldLines` 支持 enum 值提取（或 injectFieldLines 的 enum 分支直接从 diff 的 missingFields 取行） | 接受/拒绝/修改 |
| 2 | 🟡 P1 | 测试可测性 | **注入函数未导出**：`injectFieldLines`/`injectMissingModels` 为 sync.ts 私有函数，`parseSchemaBlocks` 为 writer.ts 私有函数；Plan §1.2 目标 3 要求新增单测，但当前模块边界无法直接测 | Spec 中明确：导出被测函数（最小导出面）或测试经 `diffPrisma`（已导出）间接断言 + CLI 集成测试 | 接受/拒绝/修改 |
| 3 | 🟡 P1 | 文档引用 | **§六 "Handoff 见本文 §四" 引用错误**：§四是"实施 Task 概要"非 Handoff；元信息已声明 Handoff 为独立文件（待生成） | 修正为"独立 handoff 文件（待生成）" | 接受/拒绝/修改 |
| 4 | 🟢 P2 | 验证增强 | 现场回归（Task 1.5）依赖 farm-agent 库链接，若全局 add-coder 非 link 安装则 CLI 回归不生效（dist 已 build 但全局命令仍指向旧包） | Spec 增加"CLI 生效性检查"（`add-coder --version` 或全局安装路径确认） | 接受/拒绝/修改 |

> **人类确认后**：AI 在下方逐条展开详细分析。

---

## 1. 问题复现

为什么需要这次评审？

报告 RPT-20260806-01/02/03 在 farm-agent 现场复现（enum 注入 0 字段 / @@ 后插入 / 注释括号截断），Plan 提出 3 处修复 + 测试 + dist 重建。需评审：
1. Plan 结构与事实是否准确（标准版模板、代码行号、dist 链路）
2. 修复方案是否**完整覆盖缺陷根因**（特别是注入函数的隐藏依赖）
3. Task 分解与验收标准是否可执行、可验证

---

## 2. 方案对比

### 2.1 方案 A：正则修补（Plan 选用）
- 最小侵入、无新依赖 ✓
- 风险：正则修补只解决"表现层"，注入函数间的隐藏耦合（getBaseFieldLines 对 enum 不适用）未纳入 Plan → 发现 1

### 2.2 方案 B：AST 解析
- 新依赖 + 大重构，Plan 已正确排除

### 2.3 方案 C：行级括号扫描（作为 A 中缺陷 3 的实现）
- Plan 已采用，合理 ✓

---

## 3. 决策结论

**Review 不通过（1 个 P0 阻塞项），方向与主体成立，修正后可回流。**

- Plan 结构合规：元信息/ADD-7 审计表/HITL（6 维度已 tongyi）/§一~§六 完整
- 事实核验通过：三缺陷根因与代码逐行对应 ✓、`bin/add-coder.js → dist/index.js` 链路确认（dist 重建必要性成立）✓、非目标界定清晰（不涉及 npm run sync）✓
- 阻塞项：P0-1 enum 注入修复缺 getBaseFieldLines 环节（否则缺陷 1 修复后仍复现）

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | 变更 | 影响 |
|------|------|------|
| `src/cli/writer.ts` | parseSchemaBlocks 重写 | diff 完整性与注入完整性（缺陷 3） |
| `src/cli/commands/sync.ts` | injectFieldLines + getBaseFieldLines 修复 | enum 注入 + 字段位置（缺陷 1/2） |
| `tests/prisma-sync.test.ts` | 新建 | 三缺陷回归 |
| `dist/` | tsup 重建 | CLI 运行时行为（bin → dist） |

### 4.2 数据流影响

```
diffPrisma（修复 3）→ missing/fieldDiffs
  → injectMissingModels（依赖完整 body）
  → injectFieldLines（修复 1 getBaseFieldLines + 1 正则 + 2 @@ 前插入）
  → 目标 schema → prisma validate（验收）
```

### 4.3 回滚风险

- 源码改动局部、测试覆盖；dist 重建可回退（重新 build 旧版本 commit）
- 零注入告警为纯增量输出，无行为破坏

---

## 5. 发现逐条展开

### 🔴 发现 1（P0）：enum 注入修复缺 `getBaseFieldLines` 环节

- **证据**：Plan §3.2-2 只改 injectFieldLines 的块匹配正则。但注入链路为：
  ```typescript
  // sync.ts L456-457
  const baseFields = getBaseFieldLines(basePath, modelName);   // ← 提取"字段定义"
  if (Object.keys(baseFields).length === 0) return 0;          // ← enum 在此提前退出
  ```
  `getBaseFieldLines`（L431-445）用 `line.match(/^\s*(\w+)\s+/)` 提取——要求"值后有空白"。enum 值行（`COLLAB_CONTRACT`）为单 token 无空白 → 提取为空 → `return 0` → 即使正则修好，enum 注入**仍输出"已补充 0 个字段"**。
- **影响**：RPT-20260806-01 修复无效，Plan 验收标准 1（enum 注入非 0 计数）必然失败。
- **建议**：修复 1 扩展为两点：① injectFieldLines 正则支持 `model|enum`；② `getBaseFieldLines` 或注入函数对 enum 类型改用"值行直取"（diffPrisma 的 `missingFields` 已含完整值行，可直接消费）。

### 🟡 发现 2（P1）：测试可测性未明确

- **证据**：`injectFieldLines`/`injectMissingModels`（sync.ts 私有）、`parseSchemaBlocks`（writer.ts 私有）均未导出；vitest 无法直接调用。Plan §1.2 目标 3 要求单测覆盖三缺陷，但未定义测试接入点。
- **影响**：验收标准 1 无法落地（无测试入口）。
- **建议**：Spec 明确最小导出面（如 `export function injectFieldLines` / `export function parseSchemaBlocks`，或经 `diffPrisma` 间接断言 + CLI 集成测试）。

### 🟡 发现 3（P1）：§六 Handoff 引用错误

- **证据**：Plan §六 `| Handoff | 见本文 §四（融合 Handoff） |`——§四为"实施 Task 概要"，无 Handoff 内容；元信息已声明独立 handoff 文件（待生成）。
- **建议**：修正为"独立 handoff 文件（待生成）"。

### 🟢 发现 4（P2）：CLI 生效性验证缺失

- **证据**：全局 `add-coder` 命令（pnpm bin shim）指向未确认的全局包位置；若为 npm 发布版安装，`npm run build` 后全局命令仍走旧 dist。
- **建议**：Spec 增加 CLI 生效性检查（`add-coder --version` + 确认全局安装路径为 link 本地或重新安装）。

---

## 6. 通过项确认（无需修正）

- ✅ 标准版模板结构完整（元信息/审计表/HITL/§一~§六）
- ✅ HITL 6 维度已 tongyi，d2 调整（3 源码 + dist 重建）合理
- ✅ 三缺陷根因与代码行号逐行对应（报告 RPT-20260806-01/02/03）
- ✅ dist 链路确认：`bin/add-coder.js → import("../dist/index.js")`，build 必要性成立
- ✅ 非目标界定清晰（不涉及 `npm run sync` sync-magic.ts）
- ✅ Task 依赖顺序合理（1.1→1.2→1.3→1.4→1.5）
- ✅ 回退路径（零注入告警、写入失败保持原文件）已覆盖

---

## Review 元信息（文件级）

- **Review 对象**: add-coder-prisma-sync-fix-plan-v1（Plan）
- **Review 版本**: v1
- **Review 时间**: 2026-08-06
- **结论**: ❌ 不通过（1 个 P0 阻塞项：enum 注入修复缺 getBaseFieldLines 环节；需回流修正后复审）
