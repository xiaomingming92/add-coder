# add-coder-sync-prisma-patch-plan-v1

> Plan 回答"改什么、为什么改、改哪里"。不写完整 TS 实现。

## PLAN 元信息

- **Plan 名称**: add-coder-sync-prisma-patch-v1
- **启动时间**: 2026-07-27
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/27/add-coder-sync-prisma-patch-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-07/27/add-coder-sync-prisma-patch-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-sync-prisma-patch-review-v1.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| src/caijuehub/sync-rules.toml | CONFIG | CONFIG_MODIFIED | 无 [prisma] 段 | 新增 prisma sync 规则 | ✅ 已实施 |
| src/caijuehub/transcribe.ts | COMPONENT | COMPONENT_MODIFIED | 无 genPrismaSyncRules | 新增生成器 | ✅ 已实施 |
| src/caijuehub/caijue.toml | CONFIG | CONFIG_MODIFIED | 无 sync-prisma-schema | 新增裁决条目 | ✅ 已实施 |
| src/caijuehub/strategies/prisma-sync.strategy.ts | COMPONENT | COMPONENT_CREATED | 不存在 | SYNC_PRISMA_CONFIG | ✅ 已实施 |
| src/cli/writer.ts | COMPONENT | COMPONENT_MODIFIED | 无 prisma diff | diff + interactive 流程 | ✅ 已实施 |
| src/cli/commands/sync.ts | COMPONENT | COMPONENT_MODIFIED | 直接硬编码交互 | handleDiffAction 策略分发 | ✅ 已实施 |

---

## HITL 计划总览（一次性提交人类审核）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | caijuehub + CLI writer | ✅ tongyi |
| 预估文件数 | 5 个（4 修改 + 1 新建） | ✅ tongyi |
| 架构变更 | 无——复用 sync→caijuehub→writer 链路 | ✅ tongyi |
| 新增依赖 | 无 | ✅ tongyi |
| 风险等级 | 🟡中——writer diff 涉及 Prisma schema 解析 | ✅ tongyi |
| 预计轮次 | 3 轮 | ✅ tongyi |

> HITL 审批: round 1 TONGYI ✅ — 进入执行。

---

## 一、背景与目标

`npm run sync` 只搬 hooks/skills/rules/scripts，不处理 Prisma schema。add-coder 新增模型后消费项目需手工 diff。

目标：caijuehub 裁决层驱动 diff + interactive 确认 + 只插不删不改。同步自动 chmod +x hook，`~/.qoder-cn/settings.json` 自动合并（TODO）。

## 二、方案选型

| 方案 | 复杂度 | 覆盖度 | 用户感知 |
|------|--------|--------|:---:|
| A: 手工文档提醒 | 零 | 低 | ❌ |
| B: sync 自动覆盖 | 中 | 中 | ❌ |
| **C: caijuehub 裁决 + diff + interactive** | **中** | **高** | **✅** |

## 三、架构设计

```
sync-rules.toml [prisma] → transcribe genPrismaRules() → prisma-sync.strategy.ts
    → writer.ts diffPrisma() → 用户 interactive 确认 → patch
```

### sync-rules.toml 新增段

```toml
[prisma]
base_schema = "prisma/add.prisma"
sync_items = ["model", "enum", "relation"]
on_diff = "interactive"
```

### 文件树

```
src/caijuehub/
├── sync-rules.toml          ← 修改：新增 [prisma] 段
├── transcribe.ts            ← 修改：genPrismaRules()
├── caijue.toml              ← 修改：裁决条目
└── strategies/
    └── prisma-sync.strategy.ts  ← 新建
src/cli/
└── writer.ts                ← 修改：diffPrisma() + interactive
```

## 四、实施 Task

```
轮次 1: caijuehub 规则
  ├── Task 1.1: sync-rules.toml + [prisma] 段
  ├── Task 1.2: transcribe genPrismaRules()
  └── Task 1.3: caijue.toml + generate 验证
轮次 2: writer diff
  ├── Task 2.1: writer.ts diffPrisma()
  ├── Task 2.2: CLI 集成
  └── Task 2.3: interactive 确认
轮次 3: 验证 + doc
  ├── Task 3.1: 自我验证
  ├── Task 3.2: weather_proxy 验证
  └── Task 3.3: DEVELOPMENT.md 更新 + ~/.qoder-cn/settings.json 自动合并
```

## 五、验收标准

- [ ] `npm run generate` 产出 `prisma-sync.strategy.ts`
- [ ] `sync --patch` 检测 schema 差异时输出 diff
- [ ] 用户确认后 patch consumer schema
- [ ] add-coder 自我 sync 无误差异

# 六、关联文档

| 文档 | 路径 |
|------|------|
| HITL 提案 | `.qoder/plans/2026-07/27/add-coder-sync-prisma-patch-plan-v1.hitl.md` |
| 参考 sync.strategy.ts | `src/caijuehub/strategies/sync.strategy.ts` |
| 参考 sync-rules.toml | `src/caijuehub/sync-rules.toml` |
| 参考 transcribe.ts | `src/caijuehub/transcribe.ts` |

---

## 七、实现增量（🔁 计划 vs 实际差异）

### 7.1 base_schema 指向变更

| 维度 | 计划 | 实际 |
|------|------|------|
| 基准路径 | `prisma/add.prisma`（项目本地） | `node_modules/add-coder/templates/core/prisma/add.prisma`（npm 包标准） |

**动因**：用户确认基准应该是 add-coder 发行版的标准表，而非项目本地的副本。

### 7.2 行为策略从单维度拆分为四维度

```toml
# 计划：
on_diff = "interactive"           # 一个策略管所有

# 实际：
on_missing_model = "interactive"  # 消费方缺表
on_field_conflict = "interactive" # 同名字段定义不同
on_missing_field = "interactive"  # 基准有、消费方无
on_extra_field = "ignore"         # 消费方特有，不做操作
```

**动因**：用户要求对三类场景精准控制。

### 7.3 字段比较逻辑从 Set 比较升级为按字段名分组

| 差异类型 | 计划 | 实际 |
|---------|------|------|
| 字段比较 | `Set<string>` 整体比较 `name:type` | 按字段名分组，拆分为 conflicts / missingFields / extraFields |

**动因**：原方案无法区分"同名不同定义冲突"和"纯粹缺字段"。

### 7.4 交互逻辑从 writer.ts 外移到 sync.ts 的策略分发器

| 计划 | 实际 |
|------|------|
| `writer.ts` 里 diff + interactive 一体 | `writer.ts` 只做 diff 数据；`sync.ts` 新增 `handleDiffAction()` 统一按策略分发 |

### 7.5 新增执行函数

| 函数 | 用途 |
|------|------|
| `injectMissingModels()` | 追加缺失 model/enum 块到目标 schema |
| `injectFieldLines()` | 向目标模型补充缺失字段 |
| `overwriteFieldLines()` | 用基准定义覆盖目标中冲突的字段行 |
| `handleDiffAction()` | 策略分发中枢：interactive/auto/skip/block |

### 7.6 实际验收标准（与计划对比）

| 验收项 | 状态 | 备注 |
|--------|:---:|------|
| `npm run generate` 产出 `prisma-sync.strategy.ts` | ✅ | 含 4 个子策略 |
| `sync --patch` 检测 schema 差异输出明细 | ✅ | 字段名级展示 |
| 缺表交互注入 | ✅ | 支持编号选择 / a 全部 / 回车跳过 |
| 字段冲突交互覆盖 | ✅ | 显示基准 vs 消费方定义差异 |
| 缺字段交互补充 | ✅ | 自动查找位置插入 |
| 多余字段忽略 | ✅ | 仅展示不做操作 |
| add-coder 自我 sync 无误差异 | ✅ | |
| CLI 策略可配置（TOML 改值即变） | ✅ | 改 sync-rules.toml → `npm run generate` |
