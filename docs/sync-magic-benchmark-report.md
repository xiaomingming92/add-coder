# sync-magic Benchmark 报告

> 4 组对比 · 10 轮测量 · 对称噪声分类

---

## 为什么做这个对比

`sync-magic` 负责把模板文件同步到 4 个 IDE magic 目录（`.add`/`.qoder`/`.claude`/`.vscode`）。原本只有一个 bash 硬编码版，每次新增 IDE adapter 要改 3 处代码。后来用 TypeScript + caijuehub TOML 重写了一版，配置收敛到 1 行。

本 benchmark 试图回答：**TS 版和 bash 版各在什么维度有优势？caijuehub 集中配置层带来了什么价值？**

### 对比对象

| 组 | 运行时 | 配置源 | 定位 |
|:---:|--------|--------|------|
| A | bash | 硬编码 | 旧版对照 |
| B | bash | caijuehub (TS 转录) | 跨语言通道 |
| C | bash | caijuehub (SH 转录) | 同语言通道 |
| D | **TypeScript** | caijuehub (TS 转录) | **生产主线** |

---

## 维度一：执行速度

10 轮测量 (warmup=2)，单位 ms：

| 组 | avg | median | σ | min | max |
|:---:|----:|------:|---:|----:|----:|
| A-裸bash | 2670 | 2645 | 77 | 2597 | 2872 |
| B-bash+TS | 2839 | 2839 | 17 | 2806 | 2861 |
| C-bash+SH | 2874 | 2856 | 63 | 2819 | 3052 |
| D-**TS** | **476** | **470** | **18** | **458** | **522** |

TS 版比裸 bash 快 5.6 倍。bash+caijuehub 比裸 bash 慢约 8%（source 配置 + 循环开销）。

**bash 的"慢"来自 fork 子进程。** 每次 `sync_dir` 调用起一个 `rsync` 进程，而 TS 版所有操作在 Node.js 进程内完成。但这不说明 TS 在纯 I/O 上更快——bash 的 `rsync` 直通 mmap/sendfile，没有 libuv 线程池开销。TS 赢得是"少 fork"，不是"I/O 更快"。

**TS 的解释器短板是 V8/libuv 的设计目标问题，不是语言天性。** C 级运行时（如 Bun、纯编译）可以拉平甚至超越 bash 的 I/O 效率。这个差距是可修复的工程问题。

**B vs C 几乎无差异**，转录通道不影响运行时速度。

---

## 维度二：熵值（代码可维护性）

对称噪声分类——bash 和 TS 用同一套规则判定"语法噪音"：

| 指标 | A-裸bash | B-bash+TS | C-bash+SH | D-TS |
|------|--------:|----------:|----------:|-----:|
| 总行数 | 95 | 216 | 216 | 354 |
| 噪声率 | 35% | 31% | 31% | **26%** |
| 业务逻辑行 | 58 | 93 | 93 | **173** |
| 配置散落点 | 13 | 4 | 4 | **2** |

TS 版行数更多，但噪声率更低，业务逻辑量是 bash 的 3 倍——多出来的代码是逐文件 diff 验证、结构化错误处理、备份去重。

**B/C 组熵分低于 A 组**，因为 caijuehub 增加了 source 配置 + 循环代码，但换来了配置散落点大幅下降（13 → 4）。

### 熵值的战略含义

AI 时代，代码熵值的核心价值不是"好看"，是 **让非工程师也能修改业务规则**。

- A 组（裸 bash）：新增 adapter 需要找到 3 处硬编码点 → 必须开发者操作
- B/C/D 组（caijuehub）：新增 adapter 只需改 TOML 1 行 → 产品经理、销售、AI Agent 都能改

**组织能力 = 多少人能安全地改变系统行为。** 熵值就是这个能力的量化指标。381ms 的转录耗时在这个尺度上毫无意义——让一个非工程师用 1 分钟改完配置上线的价值，远超省下 375ms。

---

## 维度三：转录耗时

场景：修改 TOML → 重新生成 `sync-magic-config.sh` 所需时间。

| 组 | 转录方式 | 耗时 |
|:---:|------|----:|
| B | `transcribe.ts` (TS) | 381ms |
| C | `transcribe.sh` (SH) | **6ms** |
| D | `transcribe.ts` (TS) | 381ms |

SH 转录快 60 倍——无 `npx` 冷启动、无 Node.js 模块解析。但战略重要性远低于熵值。SH 转录是一个"有趣的技术事实"，不是决策依据。

---

## 维度四：错误处理 & 工程能力

| 能力 | A-裸bash | B/C-bash+caijuehub | D-TS |
|------|:---:|:---:|:---:|
| 类型检查 | ❌ | ❌ | ✅ `as const` + 泛型 |
| 配置中心化 | ❌ 硬编码 | ✅ caijuehub TOML | ✅ caijuehub TOML |
| 跨平台 | ⚠️ rsync+GNU diff | ⚠️ rsync+GNU diff | ✅ 纯 Node.js |
| 局部错误处理 | ❌ 仅 `set -e` | ❌ 仅 `set -e` | ✅ 逐函数 try/catch |
| 可单测 | ❌ | ❌ | ✅ |

---

## 各自优点

| | bash | TypeScript |
|---|------|-----------|
| 天然优势 | C 工具链直通 syscall，I/O 吞吐高 | 类型系统 + 结构化配置，工程可控 |
| caijuehub 加持后 | 配置从 13 散落点降到 4 | 配置从策略文件集中到 TOML，散落点 2 |
| 转录 | SH 原生解析极快 (6ms) | TS 转录需冷启动 (381ms)，但转录是低频操作 |
| 短板 | 无类型检查，错误静默吞掉 | V8/libuv I/O 栈非系统级设计 |

---

## 场景-价值映射

| 场景 | 推荐 | 原因 |
|------|:---:|------|
| 生产环境日常同步 | **TS** | 类型安全、可单测、跨平台、错误传播精细 |
| 频繁修改 adapter 配置 | **TS + caijuehub** | 非工程师可改 TOML 1 行即生效 |
| 极低频、纯 I/O 密集批处理 | bash | rsync 直通 syscall，无 libuv 开销 |
| 转录配置（一次生成） | 都可以 | 6ms vs 381ms 对一次性操作无意义 |

---

## 架构

```
src/caijuehub/                          scripts/
├── sync-magic-rules.toml  ← 生产TS配置  ├── sync-magic.ts          ← 生产入口
├── caijue.toml                         ├── sync-magic-config.sh   ← 生成产物
├── transcribe.ts          ← TS转录器    └── benchmark/
└── benchmark/                               ├── sync-magic.sh
    ├── sync-magic-benchmark-                ├── sync-magic-bare.sh
    │   bash-rules.toml     ← bash TOML      ├── transcribe.sh
    └── transcribe.sh       ← SH转录器       ├── benchmark-sync.ts
                                              └── reports/
```

**数据流**：TOML → transcribe.{ts,sh} → sync-magic-config.sh → sync-magic.sh source

---

## 复现

```bash
tsx scripts/benchmark/benchmark-sync.ts
# 报告: stdout + scripts/benchmark/reports/benchmark-{timestamp}.txt
```
