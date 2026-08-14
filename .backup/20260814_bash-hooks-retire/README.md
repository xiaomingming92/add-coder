# bash hooks 退役收拢（2026-08-14）

## 溯源说明

本目录为 **bash 版 hook 全量收拢**（退役动作），路径结构与原位置一一对应：

| 原位置 | 备份位置（本目录下） | 数量 | 说明 |
|------|------|:---:|------|
| `templates/core/hooks/**/*.sh` | `templates/core/hooks/` | 22 | core 源（含 lib/） |
| `templates/adapters/{claude,qoder,vscode,trae,codex}/hooks/**/*.sh` | `templates/adapters/{...}/hooks/` | 22-24/端 | 5 adapter 源（含 lib/） |
| `templates/shared/hooks-lib/common.sh` | `templates/shared/hooks-lib/` | 1 | 共享 lib 源 |
| `{magicDir}/hooks/**/*.sh`（.add/.claude/.qoder/.vscode/.trae/.codex） | 同名目录 | 22-24/端 | 分发副本（生成态） |

合计 **269 个 .sh**。恢复方式：按上表路径原样移回即可。

## 退役背景

- **前序 Plan**: `add-coder-hook-node-migration-plan-v1` 轮次 8（bash 退役）——本动作即其核心执行
- **前置条件**（已满足，见 `add-coder-hook-node-refactor-plan-v1` 9.3）：六端双形态对比全绿 + golden 反写（修复后行为）+ vitest 235 + 缺陷照搬清零
- **等价替换**: 各 magicDir `hooks/*.mjs`（TS 源码 esbuild 烘焙零依赖产物，86 入口）
- **行为基线**: `tests/fixtures/hook-golden/*.golden.json`（已按修复后行为反写）+ `bash-baseline.json`（性能基线固化）——bash 退役后双形态对比不再执行，golden 为唯一行为契约

## 保留的 .sh（非 hook，未收拢）

| 文件 | 用途 |
|------|------|
| `templates/core/scripts/db-ensure.sh` | 数据库初始化脚本 |
| `templates/core/scripts/gen-plan-index.sh` | Plan 索引生成脚本 |
| `scripts/*.sh` | 宿主侧运维脚本 |
