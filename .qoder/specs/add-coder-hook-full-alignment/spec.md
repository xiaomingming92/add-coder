# add-coder Hook 体系四端对齐 Spec

## Why

Issue #6 暴露：ADD 范式的模板读取风暴在 VS Code Copilot 端触发 429 导致会话瘫痪。根因不是单个 hook 缺失，而是 ADD 范式的治理逻辑仅在 Claude Code 单端运行——Qoder CN 端有框架但内容滞后，VS Code Copilot 和 Trae 端完全缺席。需要将 17 个治理卡位落地到四家 IDE 的 agent 生命周期中。

## What Changes

| 文件 | 操作 | 说明 |
|------|------|------|
| `templates/core/hooks/lib/common.sh` | ★ 新建 | 四端通用函数（parse_input/json_get/detect_active_add/check_add_completeness/is_already_accepted） |
| `templates/core/hooks/lib/preload-templates.sh` | ★ 新建 | 模板预读脚本（--index / --full 双模式） |
| `templates/core/hooks/lib/session-end.sh` | ★ 新建 | 会话清理 + 审计结算 + Stop 兜底 |
| `templates/core/hooks/lib/subagent-stop.sh` | ★ 新建 | 子 agent 边界校验 + 审计聚合 |
| `templates/adapters/claude/hooks/` 下 6 脚本 | MODIFY | 6 核心脚本扩展（session-start / prompt-submit / pre-tool-use / post-tool-use / stop-check / pre-compact） |
| `templates/adapters/claude/hooks/` 下 4 脚本 | ★ 新建 | session-end / subagent-stop / stop-failure / permission-denied |
| `templates/adapters/qoder/hooks/` 下 8 脚本 | MODIFY | stderr 注入通道适配，prompt-submit.sh 增量插入 |
| `templates/adapters/vscode/.github/hooks/` 下 8 个 JSON | ★ 新建 | VS Code Copilot 端 hook 注册 |
| `templates/adapters/trae/` 全目录 | ★ 新建 | Trae 端 adapter（hooks.json + settings.json） |
| `templates/core/skills/add-paradigm/SKILL.md` | MODIFY | L105 增加钩子预读提示 | → 增加 renderer 分发层文件（5 个 TypeScript 源码 + 4 个 shell 脚本）[2026-07-17 修订: Review P1 #9 renderer 遗漏回流至 Spec]
| `src/core/renderer.ts` | MODIFY | `SKIP_DIRS` 无需改动（shared 已并入 core/hooks/lib/） |
| `src/adapters/claude/renderer.ts` | MODIFY | 增加 `core/hooks/lib/` 行走，输出到 `hooks/lib/` |
| `src/adapters/qoder/renderer.ts` | MODIFY | 同上 |
| `src/adapters/vscode/renderer.ts` | MODIFY | `.github/` 子目录特殊处理（输出项目根）+ `core/hooks/lib/` 行走 |
| `src/adapters/trae/renderer.ts` | ★ 新建 | Trae adapter renderer，从零创建 |

| `templates/shared/hooks-lib/common.sh` | ★ 删除 | 已并入 core/hooks/lib/common.sh [2026-07-17 修订: Review P1 #11] |

## Impact

- Affected specs: 无（本 Spec 为新建）
~~- Affected code: `templates/adapters/` 下全部四个 adapter + `templates/core/skills/add-paradigm/SKILL.md`~~ → `templates/adapters/` 下全部四个 adapter + `src/adapters/` 下全部四个 renderer + `src/core/renderer.ts` + `templates/core/skills/add-paradigm/SKILL.md` [2026-07-17 修订: renderer 纳入变更范围]
- 父 Plan: `add-coder-hook-full-alignment-plan-v1.md`
- 依赖: 无（纯模板资产，不依赖任何 runtime 代码）
- 后续依赖: 无

## Boundaries

本次只允许实现：四端 adapter 的 hook 脚本和 JSON 配置文件、shared 共享脚本库、SKILL.md L105 一行提示。

本次禁止实现：
- add-coder 的 src/ 核心逻辑、CLI 渲染器、npm 包构建流程
- MCP server 节流（RPT-01，独立交付）
- 执行节流规则到 project_rules.md（RPT-03，独立交付）

## Requirements

### Requirement: shared 共享脚本库

四个共享脚本被四端 adapter 共同引用，逻辑一份、适配层四份。

#### Scenario: common.sh 工具函数抽象

- **WHEN** 任意 adapter 的 hook 脚本需要 `detect_active_add` / `match_trigger` / `parse_input` / `build_audit_json`
- **THEN** 通过 `source shared/hooks-lib/common.sh` 获取，无需各自实现

#### Scenario: preload-templates.sh 双模式

- **WHEN** SessionStart 事件触发
- **THEN** 输出模板文件清单（文件名 + 一行用途），注入为模型上下文
- **WHEN** UserPromptSubmit 事件触发且命中 ADD 关键词且 tpl-injected 标记不存在
- **THEN** 以 `--full` 模式输出全部模板全文，注入为模型上下文，落 tpl-injected 标记

#### Scenario: session-end.sh 三层清理

- **WHEN** SessionEnd 事件触发
- **THEN** 删除 `tpl-injected-{session}` 标记文件，执行 `query_audit_logs` 汇总本会话 tool 调用统计，若 Stop 未触发验收检查则补执行 checklist 快照

### Requirement: Claude Code 端 14/17 事件闭环

Claude Code 作为 add-coder 原始端和脚本模板端，需扩展 6 脚本 + 新建 4 脚本，覆盖全部 14 个支持的事件。

#### Scenario: 模板预读封闭 429 风暴

- **WHEN** Claude Code 端 Step 0 执行时，模型发起工具调用
- **THEN** 模板读取调用数为 0（SessionStart 已注入索引，UserPromptSubmit 已注入全文）

#### Scenario: 验收阻断

- **WHEN** stop-check.sh 检测到 checklist 未完成或 tsc 不通过
- **THEN** exit 2 阻止 agent 结束

### Requirement: Qoder CN 端 stderr 适配 + 增量插入

Qoder 端已有 73 行 trigger 路由系统，模板注入需增量插入，保留 Layer 1/2/3。

#### Scenario: prompt-submit.sh 增量插入

- **WHEN** 模板全文注入分支加入 Qoder prompt-submit.sh
- **THEN** 现有 Layer 1（精准 P0 触发词）→ Layer 2（开发关键词检测）→ Layer 3（活跃 ADD 状态注入 + 验收幂等保护）逻辑不受影响，新分支插入在 Layer 2 之后

### Requirement: VS Code Copilot 端新建 + Trae 端新建

轮次 1 交付 VS Code 基础 hooks（SessionStart + UserPromptSubmit JSON），轮次 4 补齐全量 8 JSON。Trae 端从零创建整个 adapter。

#### Scenario: Issue #6 轮次 1 即消灭

- **WHEN** 轮次 1 完成后，VS Code Copilot 端执行多文件 Plan Step 0
- **THEN** 模板读取调用数为 0，429 不再触发
