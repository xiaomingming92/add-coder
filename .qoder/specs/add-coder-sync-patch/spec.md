# sync-patch 实现规格

> 关联 Plan: `.qoder/plans/2026-07/24/add-coder-sync-patch-plan-v1.md`

## 概述

为 sync 命令新增 `--patch` 模式，实现 add-coder npm 包热更新。基于双 hash 机制（源 hash 打 npm + 产出 hash 记用户），两维判断矩阵 → 五路分组，精准区分"add-coder 更新的文件"和"用户改过的文件"。

## 行为决策（caijuehub 驱动）

sync --patch 的三种行为由 caijuehub `sync-rules.toml` `[patch]` 段控制：

| 参数 | 可选值 | 对应 hash 矩阵场景 | 当前值 |
|------|------|------|:---:|
| `on_missing` | write / interactive / skip | ⑤ 文件不存在 | `write` |
| `on_conflict` | write / interactive / skip | ②④ 内容有差异 | `interactive` |
| `on_same` | write / interactive / skip | ① 内容一致 | `skip` |

改 TOML → `npm run generate` → 策略生效。sync.ts 不碰。

## hash 矩阵六场景

| # | 用户 | 源模板 | 判定 | 行为 | caijuehub 参数 |
|:---:|------|------|------|------|------|
| ① | 没改 | 没变 | same | 跳过 | `on_same: skip` |
| ② | 没改 | 变了 | auto/基线 | 静默覆盖 | `on_missing`（基线模式） |
| ③ | 改了 | 没变 | skip | 不碰 | `on_conflict: skip`（用户选[a]） |
| ④ | 改了 | 变了 | conflict | 交互勾选 | `on_conflict: interactive` |
| ⑤ | — | 不存在 | missing | 静默写入 | `on_missing: write` |
| ⑥ | PATCH_GUARD | — | skip | 永不触碰 | caijuehub `[guard]` patterns |

## 版本边界（3 场景）

`.add-coder-version` 哨兵文件 + `npmVersion` 对比，在 hash 矩阵之前判断：

| 场景 | installedVersion | npmVersion | 判定 | hash 矩阵行为 |
|------|:---:|:---:|------|------|
| 首次 patch | 无 | v0.2.10 | `isFirstPatch` | 全部走基线（②），不触发 ④ |
| 版本升级 | v0.2.9 | v0.2.10 | `isUpgrade` | 全部走基线（②），不触发 ④ |
| hash 被删 | v0.2.10 | v0.2.10 | `hashLost` | 正常矩阵判定（可能大量 ④） |

## 涉及文件

| 文件 | 操作 |
|------|:---:|
| `scripts/gen-src-hash.ts` | 新建 |
| `package.json` | 修改 |
| `src/cli/commands/sync.ts` | 修改 |
| `src/cli/commands/init.ts` | 修改 |
| `src/cli/index.ts` | 修改 |
| `src/lib/select-files.ts` | 修改 |
| `src/caijuehub/sync-rules.toml` | 新建 |
| `src/caijuehub/transcribe.ts` | 修改 |
| `src/caijuehub/caijue.toml` | 修改 |

## 关键约束

- PATCH_GUARD 永不触碰 plans/specs/reviews
- 默认 sync 行为不变（原版 100% 保留）
- 复用 selectFiles 交互 UI（[a]跳过 / [A]覆盖）
- hash 8 位 hex，不依赖外部库
- `.add-coder-version` 哨兵文件永不删除
- 策略由 caijuehub/sync-rules.toml 驱动
