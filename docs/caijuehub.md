# Caijuehub 规则引擎

> add-coder CLI 的配置驱动层——TOML 声明规则 → `transcribe.ts` 生成策略 → 业务代码消费。

## 概述

Caijuehub 是 add-coder 的集中裁决层：将 CLI 命令中易变的配置（正则、路径、策略、提示文本）从 TypeScript 硬编码中抽离为 TOML 规则文件。修改行为只需编辑 TOML 并运行 `npm run generate`，无需触碰业务代码。

## 架构

```
caijue.toml                     ← 主索引：注册所有裁决入口
    │
    ├── adapter-rules.toml ───→ adapter.strategy.ts ──→ detect.ts
    ├── detect-rules.toml  ───→ detect.strategy.ts  ──→ detect.ts
    ├── prisma-rules.toml  ───→ prisma.strategy.ts  ──→ prisma-injector.ts
    ├── writer-rules.toml  ───→ writer.strategy.ts  ──→ writer.ts
    └── sync-rules.toml    ───→ sync.strategy.ts    ──→ sync.ts ← 首个业务直驱案例
            │
            │  npm run generate（调用 transcribe.ts）
            ▼
    src/caijuehub/strategies/*.strategy.ts（自动生成，不要手动编辑）
```

## 首个业务直驱案例：sync --patch

sync 命令的 `--patch` 模式是 caijuehub 历史上第一个从 TOML 规则直驱业务代码的实现。

### 规则定义（`sync-rules.toml`）

```toml
[guard]           # ⑥ PATCH_GUARD — 永不触碰的路径
patterns = ["[/]plans[/]", "[/]specs[/]", "[/]reviews[/]"]

[hash]            # 双 hash 机制配置
output_file = ".add-coder-hash.json"
hex_length = 8

[patch]           # 6 hash 矩阵 → 3 行为参数
on_missing = "write"          # ⑤ 文件不存在
on_conflict = "interactive"   # ②④ 内容有差异
on_same = "skip"              # ① 内容一致

[version]         # 3 版本边界
on_first_patch = "baseline"   # 首次安装
on_upgrade = "baseline"       # 版本升级
on_hash_lost = "conflict"     # hash 文件丢失

[default]         # 默认模式（无 --patch）
on_missing = "write"
on_existing = "skip"
```

### 消费（`sync.ts`）

```typescript
import { SYNC_CONFIG } from "../../caijuehub/strategies/sync.strategy";

// 直接使用生成的常量
const guard = SYNC_CONFIG.PATCH_GUARD;
const sentinel = SYNC_CONFIG.VERSION_SENTINEL;
```

### 修改流程

```
编辑 sync-rules.toml → npm run generate → 策略生效，无需改 sync.ts
```

## 第二个案例：HITL 人机交互策略

每个 IDE 独立声明审批交互模式，新增 IDE 只需加一行 TOML，不改 `hitl.ts` 代码。

### 规则定义（`hitl-interaction-rules.toml`）

```toml
[qoder]
mode = "genui"
widget_path = "templates/core/templates/hitl-approval-widget.html"

[claude]
mode = "inputRequired"

[vscode]
mode = "inputRequired"
```

### 消费（`hitl.ts`）

```typescript
import { HITL_INTERACTION_CONFIG } from "../shared/hitl-interaction.strategy.js";
// 薄壳消费：不再硬编码 IDE 判断
```

### 修改流程

```
编辑 hitl-interaction-rules.toml → npm run generate → 策略生效
```

## 第三个案例：DPS 评分全参数

**DPS（Documentation Precision Score）是 ADD 范式的上游质量闸门**——在 ADD 范式的rules的Step 0 末尾量化 Plan/Review/Specs 文档质量，≥85 才放行进入编码。它不是"建议"，是架构阻断。

### 为什么 DPS 参数要 caijuehub 化

DPS 有 30+ 个可调参数（四维权重、子权重、阈值、扣分值、FFT 冷启动），调优需要反复实验。如果硬编码在 `gateway.ts` 里，每次调参都要改代码、重启 MCP、重新评测——迭代成本高到不可接受。

caijuehub 化后，AI 可以：
1. 跑 `check_dps` 看各维得分 → 发现"语义分偏低、CPM 分虚高"
2. 改 TOML 调参：`semantic_weights` 提 Review 侧权重、`cpm_overlap_multiplier` 收紧
3. `npm run generate` 即时生效 → 再跑 `check_dps` 对比
4. 收敛到最优参数 → 提交 TOML 就行，不动代码

这正是 caijuehub 的设计初衷：**让 AI 大规模索引、检索、修改规则**，而非每次调参都走"改代码→PR→review"的人类流程。

### 规则定义（`dps-scoring-rules.toml`）

```toml
[semantic]
weights = [0.35, 0.45, 0.08, 0.12]
missing_review_penalty = 0.0

[cpm]
sub_weights = [0.4, 0.35, 0.25]
max_task_pairs = 200

[thresholds]
pass = 85
warn = 70
```

### 消费（`gateway.ts`）

```typescript
import { DPS_SCORING_CONFIG as CFG } from "../shared/dps-scoring.strategy.js";
// 零硬编码：所有参数由 TOML 驱动
const semScore = ... * CFG.SEMANTIC_WEIGHTS[0] ...;
if (N < CFG.FFT_COLD_START) return [...CFG.FFT_DEFAULT_WEIGHTS];
```

### 修改流程

```
编辑 dps-scoring-rules.toml → npm run generate → MCP 工具即时生效（无需重启）
```

## 新增裁决入口

1. 新建 `*-rules.toml` 定义规则
2. 在 `transcribe.ts` 添加 `gen*Rules` 生成器函数
3. 注册到 `GENERATORS` 映射表
4. 在 `caijue.toml` 添加 `[[caijue]]` 条目
5. 运行 `npm run generate`
6. 在业务代码中导入生成的策略常量

## 现有裁决入口

| ID | 规则文件 | 产出 | 消费者 |
|------|------|------|------|
| `detect-ide` | `detect-rules.toml` | `detect.strategy.ts` | `detect.ts` |
| `resolve-adapters` | `adapter-rules.toml` | `adapter.strategy.ts` | `detect.ts` |
| `prisma-inject` | `prisma-rules.toml` | `prisma.strategy.ts` | `prisma-injector.ts` |
| `write-files` | `writer-rules.toml` | `writer.strategy.ts` | `writer.ts` |
| `sync-patch` | `sync-rules.toml` | `sync.strategy.ts` | `sync.ts` |
| `hitl-interaction` | `hitl-interaction-rules.toml` | `hitl-interaction.strategy.ts` | `hitl.ts` |
| `dps-scoring` | `dps-scoring-rules.toml` | `dps-scoring.strategy.ts` | `gateway.ts` |

## 原则

- **规则声明 ≠ 业务逻辑**：TOML 定义「做什么」，TypeScript 实现「怎么做」
- **修改规则不改代码**：调整 PATCH_GUARD、策略参数、提示文本都只改 TOML
- **生成文件不可手动编辑**：`*.strategy.ts` 由 `transcribe.ts` 自动生成
- **薄壳消费**：业务代码通过 `import { SYNC_CONFIG }` 读取策略，不硬编码
