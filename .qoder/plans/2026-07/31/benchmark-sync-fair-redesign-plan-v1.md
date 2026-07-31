# benchmark-sync 公平化改造 + transcribe 双通道对比-plan-v1

> 精简版 Plan：聚焦 benchmark 方法论修复 + bash caijuehub 配置解耦 + transcribe 双通道对比。

**创建时间**: 2026-07-31T12:00:00+08:00
**主导 AI**: Qoder

---

## HITL 计划总览

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 涉及文件 | 8 个（3 新建 + 3 修改 + 2 重写） | ✅ 同意 |
| 改动类型 | 重构 benchmark + 新增 bash caijuehub + transcribe.sh | ✅ 同意 |
| 方案/设计决策 | ① TOML 解耦（TS/bash 各自独立）② 4 组对比 ③ transcribe 双通道 ④ 10 轮逐轮 ⑤ 对称指标含控制流 ⑥ 不预设结论 | ✅ 同意 |
| 风险等级 | 🟡中 | ✅ 同意 |

---

## 一、Plan 概述

- **现状**: 原 `benchmark-sync.ts` 有 4 个计量缺陷（噪声分类不对称、configScatter 硬编码为 0、验证时间虚假、定性偏倚）。bash 版无 caijuehub 对照组。
- **目标**: 4 组公平对比 + 10 轮逐轮输出 + 对称指标 + 不预设结论。
- **核心原则**: TOML 不耦合、指标对称、不预设结论、transcribe 双通道对比。

---

## 二、变更范围

### 2.1 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/caijuehub/sync-magic-rules.toml` | 不改 | TS 专用 |
| `src/caijuehub/sync-magic-bash-rules.toml` | **新建** | bash 专用 |
| `src/caijuehub/caijue.toml` | 修改 | 注册新条目 |
| `src/caijuehub/transcribe.ts` | 修改 | 加 Shell 生成器 |
| `scripts/transcribe.sh` | **新建** | 原生 bash TOML 解析 |
| `scripts/sync-magic-config.sh` | **新建**(生成) | bash caijuehub 配置 |
| `scripts/sync-magic.sh` | 修改 | source 配置 + 循环驱动 |
| `scripts/benchmark/benchmark-sync.ts` | **重写** | 4 组 10 轮对称对比 |

### 2.2 关键设计决策

1. **TOML 解耦**: TS 用 `[[hooks]]` 表格，bash 用 `[hooks]` map，各自独立
2. **transcribe 双通道**: `transcribe.ts`（跨语言）vs `transcribe.sh`（同语言），对比转录管线
3. **4 组对比**: A=裸bash, B=bash+TS-transcribe, C=bash+SH-transcribe, D=TS+TS-transcribe
4. **对称噪声分类**: 控制流关键字（if/for/while/fi/done）两方对称计入 noise
5. **10 轮逐轮输出**: avg/median/stddev/min/max/p99

---

## 三、Tasks

- [ ] Task 1: 新建 `sync-magic-bash-rules.toml` + 注册 caijue 条目
- [ ] Task 2: `transcribe.ts` 加 Shell 配置生成器（跨语言通道）
- [ ] Task 3: 新建 `scripts/transcribe.sh`（同语言通道）+ diff 验证一致性
- [ ] Task 4: 改造 `sync-magic.sh` 为 caijuehub 驱动
- [ ] Task 5: 重写 `benchmark-sync.ts`

---

## 四、Handoff

### 4.1 交接后状态（目标）
- bash 有独立 caijuehub TOML，新增 adapter 改 1 行
- transcribe.sh 与 transcribe.ts 产出 shell config diff 一致
- benchmark 4 组 10 轮对称对比，无预设结论

### 4.2 后置确认
- [ ] `npx tsc --noEmit` 通过
- [ ] `bash scripts/sync-magic.sh` 改造前后同步结果一致
- [ ] `bash scripts/transcribe.sh` 产出与 TS 通道 diff 一致
- [ ] `tsx scripts/benchmark/benchmark-sync.ts` 正常输出

---

## 五、验收标准
- [ ] bash 有独立 caijuehub TOML，不耦合 TS 版
- [ ] transcribe 双通道产出 diff 一致
- [ ] benchmark 4 组 10 轮对称对比
- [ ] 报告不含预设结论

## 六、关联

| 类型 | 路径 |
|------|------|
| 原 benchmark | `docs/sync-magic-benchmark-report.md` |
| TS transcribe | `src/caijuehub/transcribe.ts` |
