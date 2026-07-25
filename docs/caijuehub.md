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

## 原则

- **规则声明 ≠ 业务逻辑**：TOML 定义「做什么」，TypeScript 实现「怎么做」
- **修改规则不改代码**：调整 PATCH_GUARD、策略参数、提示文本都只改 TOML
- **生成文件不可手动编辑**：`*.strategy.ts` 由 `transcribe.ts` 自动生成
- **薄壳消费**：业务代码通过 `import { SYNC_CONFIG }` 读取策略，不硬编码
