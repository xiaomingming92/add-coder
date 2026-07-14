# Tasks: add-coder npm 包工程化

## Preconditions

- [x] Plan 已生成
- [x] ADD Route 已生成
- [x] Review 已生成
- [x] Handoff 已创建

## Forbidden

- 禁止修改 farm-agent 业务代码（`src/`、`docs/` 等）
- 禁止引入第三方模板引擎（Handlebars/EJS 等）
- 禁止在模板代码中保留 `process.env.X || "兜底值"` 反模式

---

## 第1轮：基础准备

- [x] Task 1.0: Prisma 模型准备 — 验证: `prisma migrate dev --schema=prisma/` 成功创建 DevOperation + AuditLog 表
  - [x] 从 `prisma/main.prisma` 提取 DevOperation 和 AuditLog 模型定义
  - [x] 写入 `templates/core/prisma/add.prisma`（模型定义，无参数化）
  - [x] 实现 `src/cli/prisma-injector.ts`：
    - [x] 检测用户项目是否已有 Prisma（`prisma/` 目录 + `schema.prisma`）→ 无则报错
    - [x] 检测 User 模型是否存在（`id: String`）→ 无则报错
    - [x] 复制 `add.prisma` → 用户 `prisma/` 目录
    - [x] 执行 `prisma migrate dev --name add_workflow_init --schema=prisma/`（幂等）
    - [x] 执行 `prisma generate`
    - [x] 迁移失败时回滚 `add.prisma`（删除已复制文件）
    - [x] 已有 `add.prisma` 时：交互三选一（跳过/覆盖/diff+备份）

- [x] Task 1.1: 清理硬编码 + 参数化 core 模板 — 验证: `grep -r "farm.agent\|farm_secure_pass\|大田精准\|/home/xmm\|/Users/milkytea" templates/` 返回空
  - [x] 15 个 `.md` 模板（plan/spec/tasks/checklist/handoff/review/add-route 等）：`docs/大田精准耕播智能决策系统/` → `docs/`、`farm-agent-*` → `add-coder-*`
  - [x] 15 个 `.schema.json`：检查确认无硬编码
  - [x] `skills/add-paradigm/SKILL.md`：`/home/xmm/ai/farm-agent/` → `/home/xmm/ai/add-coder/`
  - [x] `skills/session-init/SKILL.md`：`farm-agent-*` → `add-coder-*`
  - [x] `agents/add-flow-guardian.md`：检查确认
  - [x] `agents/add-orchestrator.md`：检查确认
  - [x] `rules/project_rules.md`：`farm-agent` → `add-coder`、`src/agents/` → `src/agents/`
  - [x] `rules/theory-practice-map.toml`：检查确认
  - [x] `vocabulary/add-governance-vocabulary.md`：检查确认
  - [x] `scripts/mcp-server.ts`：`DATABASE_URL || "postgresql://..."` → `process.env.DATABASE_URL`（无兜底值）、`.env.development` → `.env`
  - [x] `scripts/add-coder-mcp-server.ts`：同上
  - [x] `.qoder/settings.json`：hook 脚本绝对路径 → `/home/xmm/ai/add-coder/.qoder/hooks/`
  - [x] `.qoder/mcp.json`：`DATABASE_URL` 硬编码密码 → `process.env.DATABASE_URL`
  - [x] `.qoder/sync-policy.json`：检查确认
  - [x] `.qoder/hooks/` 下 14 个 `.sh` + `lib/`：项目名提取逻辑 → 使用 `$CLAUDE_PROJECT_DIR` 或 `/home/xmm/ai/add-coder`
  - [x] `.vscode/` 下 4 个文件：MCP 配置中的项目特定路径 → `/home/xmm/ai/add-coder`
  - [x] `reports/` 下 7 个文件：`farm-agent`、绝对路径 → `add-coder`、`/home/xmm/ai/add-coder`
  - [x] `tools/README.md`：检查确认
  - [x] 创建 `src/core/renderer.ts`：接收 config 对象，执行 `"{{key}}".replace("{{key}}", config.key)`

---

## 第2轮：架构搭建

- [x] Task 2.0: 模板目录重组 + 适配器架构搭建 — 验证: 新目录结构符合 §3.2，`find templates/ -name "*.ts" | wc -l` 返回 0
  - [x] 迁移 `agents/` → `templates/core/agents/`
  - [x] 迁移 `skills/` → `templates/core/skills/`
  - [x] 迁移 `templates/*.md`（15 个） → `templates/core/docs/`（去嵌套）
  - [x] 迁移 `templates/*.schema.json`（15 个） → `templates/core/docs-schema/`
  - [x] 迁移 `templates/index.md` → `templates/core/docs/index.md`
  - [x] 迁移 `templates/TERMINOLOGY.md` → `templates/core/docs/TERMINOLOGY.md`
  - [x] 迁移 `rules/` → `templates/core/rules/`
  - [x] 迁移 `vocabulary/` → `templates/core/vocabulary/`
  - [x] 迁移 `scripts/` → `templates/core/scripts/`
  - [x] 迁移 `reports/` → `templates/core/reports/`
  - [x] 迁移 `tools/` → `templates/core/tools/`
  - [x] 迁移 `.qoder/hooks/`（14 个 .sh + lib/） → `templates/adapters/qoder/hooks/`
  - [x] 迁移 `.qoder/settings.json` → `templates/adapters/qoder/settings.json`
  - [x] 迁移 `.qoder/mcp.json` → `templates/adapters/qoder/mcp.json`
  - [x] 迁移 `.qoder/sync-policy.json` → `templates/adapters/qoder/sync-policy.json`
  - [x] 迁移 `.vscode/`（4 个文件） → `templates/adapters/vscode/`
  - [x] 迁移 `debug-dump/`、`repowiki/` → `templates/shared/`（空目录占位）
  - [x] 创建 `templates/adapters/claude/` 目录（空壳）
  - [x] 创建 `templates/shared/hooks-lib/common.sh`（退出码常量 + stdin JSON 解析）
  - [x] 创建 `src/adapters/{claude,qoder,vscode}/` 目录，各含 `renderer.ts` 骨架
  - [x] 定义 Adapter 接口：`render(config: AddCoderConfig, targetDir: string, dryRun: boolean): Map<string, string>`
  - [x] 删除旧 `templates/` 扁平目录

---

## 第3轮：适配器实现（串行：Claude → Qoder → VS Code）

- [x] Task 3.0: Claude 适配器实现 — 验证: `npx add-coder init --adapter claude` 生成正确的 `.claude/` 目录
  - [x] 创建 `templates/adapters/claude/settings.json` 模板（hook 配置，matcher 用标准工具名 `Write`, `Edit`, `Bash`）
  - [x] 创建 `templates/adapters/claude/mcp.json` 模板
  - [x] 创建 12 个 hook 脚本（参考 Qoder 实现，差异仅在 matcher 工具名映射）：
    - [x] `pre-tool-use.sh`（matcher: `Write`, `Edit`, `Bash`）
    - [x] `post-tool-use.sh`（matcher: 同上）
    - [x] `session-start.sh`
    - [x] `pre-compact.sh`
    - [x] `stop-check.sh`
    - [x] `notification.sh`
    - [x] `permission-gate.sh`
    - [x] `prompt-submit.sh`
    - [x] `post-tool-failure.sh`
    - [x] `subagent-guard.sh`
    - [x] `review-checklist.sh`
    - [x] `doc-format-guard.sh`
  - [x] 实现 `src/adapters/claude/renderer.ts`

- [x] Task 3.1: Qoder 适配器实现 — 验证: `npx add-coder init --adapter qoder` 生成正确的 `.qoder/` 目录
  - [x] 确认 `templates/adapters/qoder/` 下文件已清理 hardcode（第1轮 Task 1.1 已做）
  - [x] `settings.json` 的 matcher 适配：`Write|write_to_file|create_file|CreateFile` 等双套工具名
  - [x] 实现 `src/adapters/qoder/renderer.ts`

- [x] Task 3.2: VS Code 适配器实现 — 验证: `npx add-coder init --adapter vscode` 生成正确的 `.vscode/` 目录
  - [x] 确认 `templates/adapters/vscode/` 下文件已就位
  - [x] 补充 `tasks.json` 的 hook 模拟（文件保存时触发检查等）
  - [x] 在生成的 README 中诚实声明 VS Code 的能力边界（无原生 hook，仅模板 + MCP）
  - [x] 实现 `src/adapters/vscode/renderer.ts`

---

## 第4轮：配置 + CLI

- [x] Task 4.0: 配置系统 — 验证: `add-coder.config.ts` 的类型提示完整，无效配置在 Zod 校验时报错
  - [x] `src/config/schema.ts`：Zod schema 定义 `AddCoderConfig`（`projectName`, `sourceDir`, `docsDir`, `logDir`, `mcpServerCommand`, `adapters`, `overrides`）
  - [x] `src/config/defaults.ts`：合理默认值

- [x] Task 4.1: CLI 重写 — 验证: `npx add-coder init` 在空白项目中成功生成完整 ADD 模板
  - [x] `src/cli/index.ts`：主入口（commander）
  - [x] `src/cli/commands/init.ts`：init 命令（七步流程：检测 IDE → 加载配置 → 渲染 core → 渲染 adapter → Prisma 注入 → 写入 → 摘要）
  - [x] `src/cli/commands/sync.ts`：sync 命令（只同步缺失文件）
  - [x] `src/cli/commands/status.ts`：status 命令（检查完整性）
  - [x] `src/cli/detect.ts`：IDE 环境检测（扫描 `.qoder/` `.claude/` `.vscode/` 存在性）
  - [x] `src/cli/config-loader.ts`：配置加载 + Zod 校验 + 优先级合并（交互式 > 配置文件 > 自动检测 > 默认值）
  - [x] `src/cli/writer.ts`：智能写入（四种模式：交互 / `--yes` / `--force` / `--dry-run`）
  - [x] `bin/add-coder.js` 改为加载 `dist/cli/index.js`
  - [x] `tsup.config.ts`：构建配置（ESM + CJS 双格式）
  - [x] `tsconfig.json`：TypeScript 编译配置

---

## 第5轮：测试 + 发布

- [x] Task 5.0: 集成测试 + 文档 + devlog — 验证: 9/9 测试通过 + `npm pack` 产出正确
  - [x] 单元测试：`renderer.ts`、`config-loader.ts`、`detect.ts`、`writer.ts`
  - [x] 集成测试：在临时目录中执行 `init` → 验证生成的文件结构
  - [x] 三端集成测试：`init --adapter claude`、`--adapter qoder`、`--adapter vscode`
  - [x] 更新 `README.md`（关联 [codein2027](https://github.com/xiaomingming92/codein2027)，标注本 npm 包为第 8 轮架构合流闭包落地产物）
  - [x] 更新 `package.json`：`"private": false`，`"type": "module"`，`"files"` 字段，`"bin"` 字段，`"exports"` 多入口，`"engines": { "node": ">=20" }`，`"packageManager": "pnpm@11.9.0"`
  - [x] 调用 MCP `record_dev_operation` 落库 ADD 开发日志到 DevOperation 表

---

## 第6轮：裁决层

- [x] Task 6.0: CaijueHub 核心 — 验证: `caijue.toml` 可被正确解析，CLI 标志覆盖裁决项
  - [x] 创建 `src/caijuehub/caijue.toml`：内置默认裁决（detect/config/prisma/writer/adapters 五段）
  - [x] 创建 `src/caijuehub/caijue.ts`：TOML 读取 + CLI 标志覆盖 + 审计

- [x] Task 6.1: 重构现有模块读 caijue — 验证: 修改 `caijue.toml` 中 `[detect].priority` 顺序后 IDE 检测行为改变
  - [x] `detect.ts`：IDE 检测优先级从 `[detect]` 段读取
  - [x] `config-loader.ts`：配置加载优先级链从 `[config]` 段读取
  - [x] `prisma-injector.ts`：阻断/交互行为从 `[prisma]` 段读取
  - [x] `writer.ts`：写入模式从 `[writer]` 段读取
  - [x] `init.ts`：adapter 选择从 `[adapters]` 段读取

---

## Task Dependencies

```
第1轮: 基础准备
  Task 1.0: Prisma 模型准备 ──┐
  Task 1.1: 清理硬编码 ────────┘ 可并行，互不依赖
           │
           ▼
第2轮: 架构搭建
  Task 2.0: 适配器架构搭建
           │
           ▼
第3轮: 适配器实现
  Task 3.0: Claude → Task 3.1: Qoder → Task 3.2: VS Code（串行）
           │
           ▼
第4轮: 配置 + CLI
  Task 4.0: 配置系统 → Task 4.1: CLI 重写（依赖 Task 1.0 + Task 4.0）
           │
           ▼
第5轮: 测试 + 发布
  Task 5.0: 集成测试 + 文档 + devlog（依赖全部前序 Task）
           │
           ▼
第6轮: 裁决层
  Task 6.0: CaijueHub 核心 → Task 6.1: 重构模块读 caijue
```

## Verification

- [x] `npx tsc --noEmit` 通过
- [x] `grep -r "farm.agent\|大田" dist/` 返回空
- [x] `grep -r "process.env.*||" dist/` 返回空
- [x] `npx add-coder init` 在空白项目中零配置生成完整 ADD 模板
- [x] `npx add-coder init --adapter claude` 生成 `.claude/` 目录
- [x] `npx add-coder init --adapter qoder` 生成 `.qoder/` 目录
- [x] `npx add-coder init --adapter vscode` 生成 `.vscode/` 目录
- [x] `npm pack` 产出包含 `dist/` + `templates/` + `bin/`，不包含 `src/`
- [x] `prisma migrate dev --schema=prisma/` 成功创建 DevOperation + AuditLog 表
- [x] 重复执行 `add-coder init` 时 Prisma 迁移幂等
- [x] 集成测试全部通过