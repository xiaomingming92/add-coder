# add-coder-prisma-sync-fix-plan-v1

> **性质**：Bug 修复 Plan——修复 Prisma schema 同步器（`sync --patch`）的 3 个注入缺陷。
> **来源**：报告 [prisma-sync-defects-report.md](../../reports/prisma-sync-defects-report.md)（RPT-20260806-01/02/03），farm-agent 现场复现。
>
> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"。详细实现（精确正则、测试用例）见 Spec。

## PLAN 元信息

- **Plan 名称**: add-coder-prisma-sync-fix-v1
- **启动时间**: 2026-08-06
- **主导 AI**: Qoder
- **目标仓库**: `/home/xmm/ai/add-coder`
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/06/add-coder-prisma-sync-fix-add-route-v1.md`（待生成）
  - Handoff: `.qoder/plans/2026-08/06/add-coder-prisma-sync-fix-handoff-v1.md`（待生成）
  - Review: `.qoder/reviews/add-coder-prisma-sync-fix-review-v1.md`（待生成）
  - 缺陷报告: `.qoder/reports/prisma-sync-defects-report.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| `src/cli/writer.ts` | COMPONENT | COMPONENT_FIXED | parseSchemaBlocks 正则被行内注释 `}` 截断 | 忽略注释内容的块解析（完整提取含 `{}` 注释的模型） | 待实施 |
| `src/cli/commands/sync.ts` | COMPONENT | COMPONENT_FIXED | injectFieldLines 仅匹配 model 块，enum 注入静默失败 | 支持 model/enum 双类型注入 | 待实施 |
| `src/cli/commands/sync.ts` | COMPONENT | COMPONENT_FIXED | 字段注入插在 `@@` 块属性之后，schema 非法 | 插入点移至最后一个 `@@` 行之前 | 待实施 |
| `tests/prisma-sync.test.ts` | TEST | TEST_CREATED | 不存在 | enum 注入 / @@ 前插入 / 注释括号解析 3 组用例 | 待实施 |
| `dist/`（构建产物） | BUILD | BUILD_REBUILT | 旧 dist（含缺陷逻辑） | tsup 重建（含修复逻辑） | 待实施 |

---

## HITL 计划总览（一次性提交人类审核）

> ✅ 已 tongyi（2026-08-06，round 1）：以下为确认后终版。

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | Prisma schema 同步器（`src/cli/writer.ts` + `src/cli/commands/sync.ts`） | ✅ 同意 |
| 预估文件数 | **3 个源码文件（2 修改 / 1 新建测试）+ `npm run build` 重建 dist（自动产物）** | ✅ 同意（调整后） |
| 架构变更 | 无（纯 bug 修复，不改 diff 引擎结构） | ✅ 同意 |
| 新增依赖 | 无 | ✅ 同意 |
| 风险等级 | 🟢 低（测试覆盖三缺陷回归） | ✅ 同意 |
| 预计轮次 | 1 轮 | ✅ 同意 |

---

## 一、背景与目标

### 1.1 问题现状

`sync --patch` 的 Prisma schema 同步路径存在 3 个注入缺陷（farm-agent 升级 0.3.18 现场复现，报告 RPT-20260806-01/02/03）：

| # | 缺陷 | 现象 | 根因位置 |
|---|------|------|---------|
| 1 | enum 注入静默失败 | `HitlType.COLLAB_CONTRACT` 确认补充后"已补充 0 个字段"，不报错 | `sync.ts` injectFieldLines 正则仅匹配 `model` 块 |
| 2 | 字段插在 `@@` 后 | `PlanRecord` 8 字段注入后 schema 校验失败 | `sync.ts` 插入点固定块尾 |
| 3 | 模型块被注释 `}` 截断 | `CollabContract` 注入缺 9 个字段，静默 | `writer.ts` parseSchemaBlocks 块正则 |

共同根因：**块解析与注入均为正则 + 固定插入点，未覆盖 enum/注释/块级属性三类 Prisma 语法边界**。

### 1.2 目标

1. `parseSchemaBlocks` 完整提取含行内注释（`// {..}`）的模型块
2. `injectFieldLines` 支持 enum 块注入（含 `getBaseFieldLines` 的 enum 值提取，Review P0-1 回流）+ 字段插到最后一个 `@@` 属性行之前
3. 新增 `tests/prisma-sync.test.ts` 覆盖三缺陷回归（被测函数最小导出，Review P1-2 回流），vitest 全绿
4. `npm run build` 重建 dist（CLI 运行时走 dist，不重建修复不生效）

### 1.3 非目标

- 不重构 diff 引擎（parseSchemaBlocks 整体替换为 AST 解析——过度设计）
- 不改动 `overwriteFieldLines` 冲突覆盖逻辑（本次未发现缺陷）
- 不调整 `diffPrisma` 的字段比较语义（`fieldName:fieldType` 前缀比较维持现状）
- 不涉及 `npm run sync`（sync-magic.ts 仓库内部脚本，与 CLI `add-coder sync` 无关）

---

## 二、方案选型

### 2.1 候选方案对比

| 方案 | 覆盖缺陷 | 侵入面 | 结论 |
|------|:---:|------|:---:|
| A: 正则修补（剥离注释行 + 双类型匹配 + @@ 感知插入） | 1+2+3 | 2 文件局部 | ✅ 选用 |
| B: 引入 Prisma 官方 schema parser 做 AST | 1+2+3 | 新依赖 + 大重构 | ❌ 过度 |
| C: 逐行括号深度扫描重写 parseSchemaBlocks | 3（+1 间接） | writer.ts 重写 | ⚠️ 作为 A 中 3 的实现子方案 |

### 2.2 选型理由

- A 为最小侵入：3 处缺陷均为**正则边界问题**，局部修补即可，无需新依赖
- 缺陷 3 的健壮实现：块解析改为**行级扫描**（维护括号深度、跳过 `//` 注释行内容），比复杂正则可靠
- 测试用真实模板片段（含 `// [{role,...}]` 注释 + `@@index` + enum）构造回归用例，直接复现 farm-agent 现场

---

## 三、架构设计

### 3.1 数据流（文件级，含回退路径）

```text
add-coder/templates/core/prisma/add.prisma（基准）
    │  diffPrisma(): parseSchemaBlocks 提取 model/enum 块（修复点 3）
    ▼
PrismaDiffResult（missing / fieldDiffs 两组结果）
    │  缺失模型 → injectMissingModels()：追加完整块（依赖修复点 3 的完整 body）
    │  缺字段   → injectFieldLines()：块内注入（修复点 1 双类型 + 修复点 2 @@ 前插入）
    ▼
消费方 prisma/add.prisma（目标）
    │
    ▼
回退路径: 任一注入函数返回 0 但输入非空 → 输出告警（新增），不静默；文件写入失败保持原文件
```

### 3.2 关键实现点

1. **parseSchemaBlocks 重写**：逐行扫描，花括号左右深度计数（左 +1 / 右 -1）；行内含 `//` 时先截断注释再计数；块结束 = 深度归零且当前行非注释
2. **injectFieldLines 正则**：块匹配同时支持 `model` 与 `enum` 两种类型；块尾锚点兼容 enum 与 model 两种闭合形式
3. **注入位置**：块内查找最后一个 `@@` 属性行（行首匹配），字段插入其前；无 `@@` 则块尾
4. **enum 值提取（Review P0-1 回流）**：`getBaseFieldLines` 对 enum 类型改用"值行直取"（行首单 token 匹配，忽略 `//` 注释与空行）——当前要求值后空白，enum 单 token 值匹配不到 → 注入恒为 0
5. **零注入告警**：`fieldKeys.length > 0 && count === 0` → 输出 `⚠️ 注入失败（N 字段未写入）` 而非静默
6. **最小导出面（Review P1-2 回流）**：`parseSchemaBlocks`（writer.ts）与 `injectFieldLines`/`injectMissingModels`（sync.ts）导出供 vitest 直测

### 3.3 数据模型变更

无（不改 Prisma schema / 数据库）。

### 3.4 Plan→Spec 实施映射

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| 行级括号深度扫描（§3.2-1） | Spec §1 parseSchemaBlocks 重写 | `src/cli/writer.ts` | 剥离注释 + 深度计数 + 导出 |
| 双类型 + @@ 前插入 + enum 值直取 + 告警（§3.2-2/3/4/5） | Spec §2 injectFieldLines/getBaseFieldLines 修复 | `src/cli/commands/sync.ts` | 正则 + 插入点 + enum 值行提取 |
| 最小导出面 + 回归测试（§3.2-6 / §2.2） | Spec §3 测试用例 | `tests/prisma-sync.test.ts` + 两源文件 | export + 4 组用例 |
| dist 重建（§1.2-4） | Spec §4 构建验证 | `dist/` | tsup build |

---

## 四、实施 Task 概要

```
轮次 1: 三缺陷修复 + 测试 + 构建
  ├── Task 1.1: parseSchemaBlocks 行级扫描重写（writer.ts）
  │     │  产出: 注释括号模型完整提取
  │     ▼
  ├── Task 1.2: injectFieldLines 双类型 + getBaseFieldLines enum 值直取（Review P0-1）+ @@ 前插入 + 零注入告警（sync.ts）
  │     │  产出: enum 注入可用、字段位置合法
  │     ▼
  ├── Task 1.3: 最小导出面（parseSchemaBlocks / injectFieldLines / injectMissingModels，Review P1-2）
  │     │  产出: vitest 可直测
  │     ▼
  ├── Task 1.4: tests/prisma-sync.test.ts（3 组回归用例）
  │     │  产出: vitest 全绿
  │     ▼
  ├── Task 1.5: npm run build 重建 dist
  │     │  产出: CLI 运行时加载修复后逻辑
  │     ▼
  └── Task 1.6: 现场场景回归（模拟 farm-agent CollabContract/HitlType 注入）
        产出: 注入结果完整 + prisma validate 通过
```

> **详细子任务 + 验证证据见 tasks.md**——Plan 只定义轮次边界和依赖顺序。

---

## 五、验收标准

- [ ] `npx vitest run tests/prisma-sync.test.ts` 全绿（enum 注入 / @@ 前插入 / 注释括号 3 组）
- [ ] 模拟 farm-agent 现场：`HitlType.COLLAB_CONTRACT` 注入成功（非 0 计数）
- [ ] 模拟 farm-agent 现场：`PlanRecord` 字段注入后位于 `@@index` 之前
- [ ] 模拟 farm-agent 现场：含 `// [{...}]` 注释的模型块完整注入（无截断）
- [ ] `npm run build` 成功，dist 重建
- [ ] 零注入场景输出告警（不静默）
- [ ] `npx tsc --noEmit` 通过（add-coder 项目）

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| 缺陷报告 | `.qoder/reports/prisma-sync-defects-report.md` |
| Spec | `.qoder/specs/add-coder-prisma-sync-fix/`（待生成） |
| Tasks | `.qoder/specs/add-coder-prisma-sync-fix/tasks.md`（待生成） |
| Checklist | `.qoder/specs/add-coder-prisma-sync-fix/checklist.md`（待生成） |
| Review | `.qoder/reviews/add-coder-prisma-sync-fix-review-v1.md`（已生成，P0-1/P1-2/P1-3 已回流） |
| Handoff | `.qoder/plans/2026-08/06/add-coder-prisma-sync-fix-handoff-v1.md`（待生成） |
