# add-coder npm 包工程化 Spec

## Why

当前 `packages/add-coder/` 是一个不可发布的半成品：

1. **模板硬编码**：`templates/` 下所有文件直接来自 farm-agent 项目，包含数据库密码、项目名、特定路径等不可移植内容
2. **CLI 纯搬运**：`bin/add-coder.js`（113 行 CommonJS）只有 `init/sync/status` 三个命令，全是 `fs.copyFileSync`，无参数化渲染、无配置合并
3. **无适配层抽象**：`.qoder` 和 `.vscode` 是两套独立静态模板，无共享逻辑。加 Claude 适配需要再复制一套
4. **VS Code 无 hook 层**：`.vscode/` 只有 MCP 配置，缺少 Qoder 的 11 个 hook 等价物
5. **不可发布**：`"private": true`，`"type": "commonjs"`，无构建流程，无测试
6. **极客不可调**：用户要么全接受模板，要么全不用，没有配置入口、没有 override 机制

## What Changes

将 ADD 范式做成一个真正可用的 npm 包，6 轮迭代（11 个子项）：

| 轮次 | 变更概要 | 涉及文件 |
|:--:|------|------|
| 1 | Prisma 模型准备 + 清理硬编码 | `src/cli/prisma-injector.ts`（add.prisma 内置在 npm 包）、`templates/` 下约 70 个文件 |
| 2 | 模板目录重组 + 适配器架构搭建 | `templates/core/`、`src/adapters/`、`src/core/`、旧 `templates/` 迁移 |
| 3 | 三端适配器实现（Claude → Qoder → VS Code 串行） | 见下方 Hook 清单 |
| 4 | 配置系统（Zod schema）+ CLI 重写 | `src/config/`、`src/cli/`、`bin/add-coder.js`、`tsup.config.ts` |
| 5 | 集成测试 + 文档 + devlog | 测试文件、`README.md`（关联 [codein2027](https://github.com/xiaomingming92/codein2027) 里的"本ADD范式和工作流对不同ai幻觉的或者不遵守情况还不能有效抑制" npm 包即为其落地产物）、`package.json` |
| 6 | CaijueHub 裁决层 | `src/caijuehub/caijue.toml`、`src/caijuehub/caijue.ts`、`src/caijuehub/transcribe.ts`、`templates/core/caijue/` |


### 轮次 3 Hook 清单

**Qoder 适配器**（`templates/adapters/qoder/hooks/`，12 个脚本）：

| 脚本 | 事件 | 说明 |
|------|------|------|
| `pre-tool-use.sh` | PreToolUse | 工具调用前门禁，文档路径校验 |
| `post-tool-use.sh` | PostToolUse | 工具调用后审计，`record_dev_operation` 自动落库 |
| `session-start.sh` | SessionStart | 会话启动上下文恢复 |
| `pre-compact.sh` | PreCompact | 上下文压缩前检查 |
| `stop-check.sh` | Stop | 停止前合规检查 |
| `notification.sh` | Notification | 通知事件处理 |
| `permission-gate.sh` | PermissionRequest | 权限请求门禁 |
| `prompt-submit.sh` | UserPromptSubmit | 用户输入提交前检查（ADD 关键词兜底） |
| `post-tool-failure.sh` | PostToolFailure | 工具失败后处理 |
| `subagent-guard.sh` | SubagentStop | 子代理停止前检查 |
| `review-checklist.sh` | — | Review 检查清单校验 |
| `doc-format-guard.sh` | — | 文档格式守卫 |
| `lib/` | — | 共享库（`context-inject.sh`、`state-detect.sh`、`vocabulary.sh`） |

**Claude 适配器**（`templates/adapters/claude/hooks/`，与 Qoder 一一对应）：

| 脚本 | Claude Code 事件 | 与 Qoder 差异 |
|------|------|------|
| `pre-tool-use.sh` | PreToolUse | matcher 使用标准工具名（`Write`、`Edit`、`Bash`） |
| `post-tool-use.sh` | PostToolUse | 同上 |
| `session-start.sh` | SessionStart | 事件名一致，无差异 |
| `pre-compact.sh` | PreCompact | 事件名一致，无差异 |
| `stop-check.sh` | Stop | 事件名一致，无差异 |
| `notification.sh` | Notification | 事件名一致，无差异 |
| `permission-gate.sh` | PermissionRequest | 事件名一致，无差异 |
| `prompt-submit.sh` | UserPromptSubmit | 事件名一致，无差异 |
| `post-tool-failure.sh` | PostToolFailure | 事件名一致，无差异 |
| `subagent-guard.sh` | SubagentStop | 事件名一致，无差异 |
| `review-checklist.sh` | — | 逻辑一致，参考 Qoder 实现 |
| `doc-format-guard.sh` | — | 逻辑一致，参考 Qoder 实现 |

**共享库**（`templates/shared/hooks-lib/`）：

| 脚本 | 说明 |
|------|------|
| `common.sh` | 退出码常量（`EXIT_PASS=0`、`EXIT_BLOCK=2`）+ stdin JSON 解析封装 |

**VS Code 适配器**（`templates/adapters/vscode/`）：

无 hook 脚本（VS Code 不支持原生 hook），仅提供 `settings.json`、`launch.json`、`tasks.json`、`extensions.json`。

## Impact

- Affected specs: 无（本 Plan 为全新举措）
- Affected code: `packages/add-coder/`（约 90 个文件变更），不修改 farm-agent 业务代码
- 父 Plan: `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-plan-v1.md`
- 依赖: 无
- 后续依赖: 无

## Boundaries

- 本次只改造 `packages/add-coder/` 目录，不修改 farm-agent 业务代码
- 本次不新增 AgentAuditPhase 字面量（npm 包工程化，无业务逻辑审计点）
- 审计通过 `record_dev_operation`（ADD-7）落库 DevOperation 表
- 模板引擎不引入第三方依赖（Handlebars/EJS 等），用 TypeScript 原生字符串替换
- 构建工具选 `tsup`，ESM + CJS 双格式产出
- 配置校验选 Zod，类型安全 + 运行时校验

---

## Requirements

### Requirement: CaijueHub 裁决层

系统 SHALL 提供基于 `caijue.toml` 的内部裁决配置，将 IDE 检测、Prisma 注入、Writer 写入等 CLI 决策逻辑从硬编码改为 TOML 驱动。caijue.toml 内置在 npm 包中，不部署到用户项目。

#### Scenario: caijue.toml 解析

- **WHEN** 启动 `init` 命令
- **THEN** 读取 npm 包内置的 `caijue.toml`，CLI 标志（`--yes`/`--force`/`--dry-run`）覆盖对应裁决项

#### Scenario: IDE 检测优先级可配置

- **WHEN** 修改 `caijue.toml` 中 `[detect].priority` 顺序
- **THEN** IDE 检测行为随之改变，无需修改 `detect.ts` 代码

#### Scenario: Prisma 注入行为可配置

- **WHEN** 修改 `caijue.toml` 中 `[prisma].on_missing` 为 `"ask"`
- **THEN** 无 Prisma 时不再阻断退出，改为交互式提示

#### Scenario: Writer 模式可配置

- **WHEN** 修改 `caijue.toml` 中 `[writer]` 段
- **THEN** 文件写入行为随之改变，无需修改 `writer.ts` 代码

---

### Requirement: 模板参数化（硬编码清理）

系统 SHALL 将 `templates/` 下所有文件中的 farm-agent 硬编码替换为 `{{placeholder}}` 占位符。

#### Scenario: 占位符语法

- **WHEN** 模板文件包含项目特定值
- **THEN** 使用 `add-coder` 双花括号语法，而非 `${var}` 以避免与 Markdown 代码块中的 JS 模板字符串冲突

#### Scenario: 硬编码清零

- **WHEN** 执行 `grep -r "farm.agent\|farm_secure_pass\|大田精准\|/home/xmm\|/Users/milkytea" templates/`
- **THEN** 返回空（0 条匹配）

#### Scenario: Init-time 与 Runtime 变量分离

- **WHEN** 模板变量为项目名、路径等 init 时确定的值
- **THEN** 使用 `{{placeholder}}` 占位符（init 时由渲染器替换）
- **WHEN** 模板变量为数据库连接串、API 密钥等敏感值
- **THEN** 使用 `process.env.X`（Runtime 环境变量），**无兜底值**，缺失时 `throw Error`

---

### Requirement: Prisma 模型注入

系统 SHALL 在 `npx add-coder init` 时自动将 ADD 治理模型（DevOperation + AuditLog）注入用户项目的 Prisma 目录。

#### Scenario: 正常注入

- **WHEN** 用户项目已有 Prisma（`prisma/` 目录 + `schema.prisma`）且包含 `User` 模型（`id: String`）
- **THEN** 复制 `templates/core/prisma/add.prisma` → 用户 `prisma/` 目录，执行 `prisma migrate dev --name add_workflow_init --schema=prisma/`，执行 `prisma generate`

#### Scenario: 无 User 模型

- **WHEN** 用户项目缺少 `User` 模型（`id: String`）
- **THEN** 报错退出，提示"需要 `User` 模型（id: String），请先创建后重试"

#### Scenario: 迁移失败回滚

- **WHEN** `prisma migrate dev` 执行失败
- **THEN** 删除已复制的 `add.prisma`，输出错误信息

#### Scenario: 已有 add.prisma

- **WHEN** 用户 `prisma/` 目录已存在 `add.prisma`
- **THEN** 交互三选一：跳过(s) / 覆盖(o) / diff 确认(d)；选 d 时先备份用户文件为 `add.prisma.bak`，再展示 diff

#### Scenario: 迁移幂等

- **WHEN** 重复执行 `add-coder init`
- **THEN** `prisma migrate dev` 不报错（已应用的迁移自动跳过）

#### Scenario: 三目录部署（core 内容同步到 IDE magic path）

- **WHEN** 执行 `init` 渲染 core 模板后
- **THEN** `templates/core/` 的所有文件 SHALL 同时写入 `.add/`、`.qoder/`、`.claude/` 三个目标目录
- **AND** adapter renderers SHALL 只处理 adapter 专属文件（hooks/mcp.json/settings.json/sync-policy.json），不再单独渲染 core 内容

**改造步骤**：
1. `src/core/renderer.ts`：`renderCore()` 返回值改为输出三份文件的映射（`.add/` + `.qoder/` + `.claude/`）
2. `src/cli/commands/init.ts`：写入阶段对三目录同名文件去重（内容相同则 skip）
3. `src/adapters/{claude,qoder,vscode}/renderer.ts`：删除 core 渲染逻辑，只保留 hooks + mcp + settings 等 adapter 专属文件

---

### Requirement: 适配器三层架构

系统 SHALL 实现 `core/ + adapters/{claude,qoder,vscode}/` 三层架构，Claude Code（第一公民）、Qoder、VS Code 各自独立适配。

#### Scenario: Adapter 接口签名

- **WHEN** 调用任意 adapter 的 `render` 方法
- **THEN** 签名 SHALL 为 `render(config: AddCoderConfig, targetDir: string, dryRun: boolean): Map<string, string>`

#### Scenario: Claude 适配器

- **WHEN** 执行 `npx add-coder init --adapter claude`
- **THEN** 生成正确的 `.claude/` 目录，hook 配置 matcher 使用标准工具名（`Write`, `Edit`, `Bash`）

#### Scenario: Qoder 适配器

- **WHEN** 执行 `npx add-coder init --adapter qoder`
- **THEN** 生成正确的 `.qoder/` 目录，hook 配置 matcher 适配双套工具名（`Write|write_to_file`, `Edit|edit_file`, `Bash`）

#### Scenario: VS Code 适配器

- **WHEN** 执行 `npx add-coder init --adapter vscode`
- **THEN** 生成正确的 `.vscode/` 目录，在 README 中诚实声明能力边界（无原生 hook，仅模板 + MCP）

#### Scenario: Hook 共享逻辑

- **WHEN** 编写 Claude 或 Qoder 的 hook 脚本
- **THEN** 共享逻辑（退出码常量、stdin JSON 解析）放在 `templates/shared/hooks-lib/common.sh`，各 adapter 的 hook 脚本 `source` 引用

---

### Requirement: CLI 命令

系统 SHALL 提供 `init`、`sync`、`status` 三个命令，用 TypeScript + `commander` 实现。

#### Scenario: init 命令

- **WHEN** 执行 `npx add-coder init [--adapter auto|claude|qoder|vscode] [--config <path>] [--yes] [--force] [--dry-run]`
- **THEN** 按七步流程执行：检测 IDE → 加载配置 → 渲染 core 模板 → 渲染 adapter 模板 → Prisma 注入 → 智能写入 → 输出摘要

#### Scenario: sync 命令

- **WHEN** 执行 `npx add-coder sync`
- **THEN** 只同步缺失文件，不更新已有文件

#### Scenario: status 命令

- **WHEN** 执行 `npx add-coder status`
- **THEN** 检查 ADD 模板完整性，列出缺失/过时文件

#### Scenario: 配置加载优先级

- **WHEN** 执行 `init` 加载配置
- **THEN** 按优先级链：交互式问答 > `add-coder.config.ts` > 自动检测（package.json / .env / 目录扫描）> 内置默认值

#### Scenario: 非交互模式

- **WHEN** 执行 `init --yes` 或 `init --non-interactive`
- **THEN** 跳过交互式问答，自动检测 + 默认值填充

---

### Requirement: Writer 四种写入模式

系统 SHALL 支持四种文件写入模式，通过 CLI 标志控制。

#### Scenario: 交互模式（默认）

- **WHEN** 无 `--yes`、`--force`、`--dry-run` 标志
- **THEN** 已有文件展示 diff，用户确认（y/n/skip）

#### Scenario: --yes 模式

- **WHEN** 指定 `--yes` 标志
- **THEN** 跳过已有文件，只创建新文件；`--force` 和 `--yes` 互斥，同时指定时报错

#### Scenario: --force 模式

- **WHEN** 指定 `--force` 标志
- **THEN** 已有文件直接覆盖，不交互；`--force` 和 `--yes` 互斥，同时指定时报错

#### Scenario: --dry-run 模式

- **WHEN** 指定 `--dry-run` 标志
- **THEN** 只打印会做什么，不实际写入

#### Scenario: JSON 合并

- **WHEN** 用户已有 `.qoder/settings.json` 或 `.vscode/settings.json`
- **THEN** deep merge，已有 `hooks` 数组追加新 hook 而非全量替换

---

### Requirement: 配置系统

系统 SHALL 提供 Zod schema 定义 `AddCoderConfig`，支持 `add-coder.config.ts` 覆盖默认值。

#### Scenario: Zod schema

- **WHEN** 定义配置类型
- **THEN** `schema.ts` 包含 `projectName`、`sourceDir`、`docsDir`、`logDir`、`mcpServerCommand`、`adapters`、`overrides` 字段

#### Scenario: 配置校验

- **WHEN** 用户提供无效的 `add-coder.config.ts`
- **THEN** Zod 校验报错，输出具体违规字段和原因

---

### Requirement: 构建与发布

系统 SHALL 产出可发布的 npm 包，通过 `tsup` 构建。

#### Scenario: 构建产出

- **WHEN** 执行 `npm pack`
- **THEN** tarball 包含 `dist/` + `templates/` + `bin/`，不包含 `src/`

#### Scenario: TypeScript 编译

- **WHEN** 执行 `npx tsc --noEmit`
- **THEN** 零类型错误

#### Scenario: package.json

- **WHEN** 发布配置完成
- **THEN** `"private": false`，`"type": "module"`，`"files": ["dist/", "templates/", "bin/"]`，`"exports"` 多入口（`.`、`./config`、`./renderer`、`./adapters/*`），`"engines": { "node": ">=20" }`，`"packageManager": "pnpm@11.9.0"`

#### Scenario: 模板无硬编码残留

- **WHEN** 执行 `grep -r "farm.agent\|大田" dist/`
- **THEN** 返回空

#### Scenario: 基建变量无兜底值

- **WHEN** 执行 `grep -r "process.env.*||" dist/`
- **THEN** 返回空

---

### Requirement: 端到端验收

系统 SHALL 在空白项目中通过完整的 init 流程验证。

#### Scenario: 空项目 init

- **WHEN** 在空白项目中执行 `npx add-coder init`
- **THEN** `.add/` `.qoder/` `.claude/` 三目录均含完整 ADD 内容（agents/skills/templates/rules/vocabulary/scripts/hooks/plans/specs/reports/tools），`.vscode/` 含 IDE 配置

#### Scenario: plans/specs 示例

- **WHEN** 用户首次 init
- **THEN** `.qoder/plans/` 含 add-coder 6轮范例，`.qoder/specs/` 含 spec/tasks/checklist 范例

#### Scenario: 三端兼容

- **WHEN** 分别执行 `npx add-coder init --adapter claude`、`--adapter qoder`、`--adapter vscode`
- **THEN** 三端均正确生成对应目录

#### Scenario: 已有配置不覆盖

- **WHEN** 用户已有 `.qoder/settings.json` 时执行 `init`
- **THEN** 不覆盖已有配置，展示 diff 并交互确认

#### Scenario: Prisma 迁移幂等

- **WHEN** 重复执行 `add-coder init`
- **THEN** Prisma 迁移幂等，不报错

#### Scenario: 集成测试通过

- **WHEN** 执行集成测试（在临时目录中 `init` → 验证生成的文件结构）
- **THEN** 全部通过