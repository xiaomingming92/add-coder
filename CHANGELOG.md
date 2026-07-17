# CHANGELOG

> 本文档记录 add-coder 各版本的变更历史，与 [README.md](./README.md) 中的版本号保持联动。
>
> 版本号格式遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.2.0] - 2026-07-17

### 新增

- **四端 Hook 能力完全对齐**：Claude Code / Qoder CN / VS Code Copilot / Trae 四端 hook 脚本从 echo 占位符升级为完整 ADD 治理逻辑（四路守卫 / 四象限验收 / Layer 1-3 路由 / 验收幂等保护 / exit 2 阻断）
- **Codex 适配器**：新增 Codex IDE 适配（hooks.json + 6 脚本 + 治理文档），支持导入 Claude Code Hook
- **VS Code Copilot 10 事件全注册**：`.github/hooks/` 下 10 个 JSON 配置文件，含 SubagentStart + SessionEnd，`.vscode/hooks/` 独立维护完整 hook 脚本
- **Trae 适配器**：新增 Trae IDE 适配（hooks.json 6 事件 + settings.json），Claude Hook 导入支持
- **renderAdapterBase 统一行走器**：四端 renderer 重构为薄包装，magicDir 参数化，消除重复代码
- **四端治理文档**：`ADD-governance-*.md` 覆盖 Claude/Qoder/VS Code/Trae/Codex，`npx add-coder init` 输出到项目根
- **pre-tool-use 终端写文件拦截增强**：新增 mv /tmp/ + python/node > + touch 拦截，禁止绕过 IDE Write 工具
- **Qoder CN stdout JSON additionalContext 注入**：SessionStart/UserPromptSubmit/Stop/SubagentStart/SessionEnd/SubagentStop 六事件全覆盖，经实测验证

### 变更

- **全部 hook 脚本能力对齐**：core/hooks/ 14 脚本从精简版升级为完整治理逻辑，Trae 通过 core 继承
- **Qoder 专属文件清理**：state-detect.sh / vocabulary.sh / context-inject.sh 从 core/lib 迁至 Qoder adapter，不再泄漏到非 Qoder 端
- **doc-format-guard.sh**：magicDir 正则从 `.qoder/` 扩展为 `.(qoder|claude|add|vscode|trae)/` 五端覆盖
- **VS Code settings.json**：MCP 命令 `npx` → `{{mcpServerCommand}}`，路径 `scripts/add-coder-mcp-server.ts` → `.vscode/scripts/mcp-server.ts`
- **VS Code tasks.json**：`.qoder/` 硬编码替换为 `{{magicDir}}` 占位符
- **.github/hooks/*.json 路径统一**：默认指向 `.vscode/hooks/`，可切换至 `.claude/hooks/`
- **init.ts**：Adapters 注册 Trae + Codex，VS Code/Trae/Codex 同步产出 `.claude/`（Agent Host 双通道）
- **README 双语**：中英双语文档 + `<details>` 折叠原地切换 + package.json 中英 description
- **治理文档模板分发**：`templates/core/docs/` → init 时输出到项目根
- **SKILL.md 活跃判定规则**：表述从硬编码 `.claude` 改为以 IDE 为例的解释
- **mcp-server.ts 注释补全**：六端 magicDir 全量列表

### 修复

- **Qoder prompt-submit.sh PROJECT_DIR 在 source 之后**：修复词汇表加载失败导致 JSON 注入静默跳过
- **Qoder stop-check / session-end / subagent-stop / subagent-guard**：全部改为 stdout JSON additionalContext 输出
- **Claude doc-format-guard.sh 空壳对齐**：16 行 → 172 行
- **schema 路径 -template 修复**：`handoff-multi-round-template.schema.json` → `handoff-multi-round.schema.json`
- **pre-compact.sh Qoder 端同步**：12 行 → 37 行（状态保存 + tpl 清理）
- **notification.sh Claude/VS Code 端补齐**：从 8 行空壳 / 不存在 → 37 行完整 Review 提醒
- **subagent-guard.sh Claude/Qoder 端补齐**：从空壳 → detect_active_add + Plan/Step/Rounds/Handoff 完整上下文注入
- **project_rules.md / SKILL.md / tasks.json**：多处 `.qoder` 硬编码替换为 `{{magicDir}}`

### 变更

- **init 流程优化 v1**：改进 CLI 初始化交互体验与健壮性
- **podman 示例对齐**：`podman-compose.example.yml` 挂载卷路径与 README 保持一致

## [0.1.13] - 2026-06-29

### 新增

- **injectPrisma**：CLI init 集成 Prisma 裁决层，自动检测/初始化/迁移数据库
- **magicDir 参数化**：适配器感知的目标目录参数化，支持 qoder/claude/vscode 独立部署
- **PRD 模板落地**：`prd-standard-template.md` 与 `prd-incremental-template.md` 双模板部署
- **文档锚定**：模板部署后自动补充 `.qoder/reports/` 等文档目录

### 变更

- **Prisma 7 架构升级**：全域迁移至 Prisma 7，AddUser 改为自包含模型
- **策略层集成**：Caijuehub TOML 规则引擎与 Prisma 适配层打通
- **仓库清理**：移除 farm-agent 残留引用，同步所有已部署目录
- **文档补链**：GUIDE.md 补充缺失链接

## [0.1.12] - 2026-06-22

### 新增

- **Podman 支持**：`podman-compose.example.yml` 增加 Podman 容器运行时支持

### 变更

- 文档更新与表述优化

## [0.1.11] - 2026-06-20

### 变更

- GUIDE.md 地址更新

## [0.1.10] - 2026-06-19

### 变更

- init 流程优化
- GUIDE.md 地址更新

## [0.1.9] - 2026-06-16

### 变更

- README 文档更新

## [0.1.8] - 2026-06-13

### 新增

- **CLI init 重写**：全新交互式 init 流程，集成数据库自动部署与 Prisma 7 迁移

### 变更

- CI release 流程更新

## [0.1.7] - 2026-06-09

### 新增

- **适配器感知 MAGIC_DIR**：根据目标 IDE（Claude/Qoder/VS Code）自动适配输出目录
- **spawnSync 安全加固**：CLI 执行安全性增强
- **文档模板校验**：部署后的模板文件自动校验完整性
- **自动化 CI/CD**：准备 GitHub Actions 自动化发布能力

### 变更

- 文档表述调整，项目地址更新，关联仓库地址补充
- 构建产物优化

### 首次发布

- 核心 CLI、Renderer、Caijuehub 规则引擎
- Claude / Qoder / VS Code 三 IDE 适配模板
- 完整架构与使用指南文档
