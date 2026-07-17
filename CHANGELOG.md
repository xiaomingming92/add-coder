# CHANGELOG

> 本文档记录 add-coder 各版本的变更历史，与 [README.md](./README.md) 中的版本号保持联动。
>
> 版本号格式遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.2.0] - 2026-07-17

### 新增

- **五端 Hook 能力完全对齐**：Claude Code / Qoder CN / VS Code Copilot / Trae / Codex 五端 hook 脚本从 echo 占位符升级为完整 ADD 治理逻辑（四路守卫 / 四象限验收 / Layer 1-3 路由 / 验收幂等保护 / exit 2 阻断）
- **Codex 适配器**：新增 Codex IDE 适配，支持导入 Claude Code Hook
- **Trae 适配器**：新增 Trae IDE 适配（hooks.json 6 事件），Claude Hook 导入支持
- **VS Code 10 事件全注册**：`.github/hooks/` 10 个 JSON + `.vscode/hooks/` 独立完整脚本
- **renderAdapterBase 统一行走器**：五端 renderer 重构为薄包装
- **ADD-governance-*.md**：五端治理文档，`init` 输出到项目根
- **Qoder CN stdout JSON additionalContext 注入**：六事件全覆盖，实测通过
- **pre-tool-use 终端写文件拦截增强**：mv /tmp/ + python/node > + touch 拦截

### 变更

- **全部 hook 脚本能力对齐**：core/hooks/ 14 脚本完整治理逻辑
- **Qoder 专属文件清理**：不再泄漏到非 Qoder 端
- **doc-format-guard.sh**：五 magicDir 覆盖
- **VS Code settings.json**：npx→tsx，路径 fix
- **README 双语**：`<details>` 折叠原地切换
- **init.ts**：注册 Trae + Codex，VS Code/Trae/Codex 同步产出 `.claude/`

### 修复

- **Qoder prompt-submit.sh**：PROJECT_DIR 先于 source 导致 JSON 注入静默跳过
- **Qoder stop-check / session-end / subagent-stop**：全部改为 JSON
- **Claude doc-format-guard.sh**：16 行 → 172 行
- **schema 路径**：handoff -template 修复
- **pre-compact.sh**：Qoder 12→37 行
- **notification.sh / subagent-guard.sh**：Claude/VS Code 补齐
- **多处 .qoder 硬编码** → `{{magicDir}}`

## [0.1.17] - 2026-07-17

### 变更

- **CI release 认证调试**：修复 GitHub Actions release 流程中的认证问题

## [0.1.16] - 2026-07-17

### 新增

- **OIDC 可信发布者**：GitHub Actions OIDC trusted publisher + workflow_dispatch 自动版本 bump/publish
- **`compose .add.yml` 命名**：compose 文件以项目名命名 + JSDoc 注释补充
- **koroFileHeader JSDoc**：源码文件头部注释规范化 + `.vscode/settings.json` 配置
- **pre-push CI**：pre-push hook 指向 Actions workflow 代替手动 release

### 变更

- **standard-plan-template §四**：round-based task planning 章节对齐
- **eslint fix**：`any` 类型替换为 `Record<string, unknown>`

### 修复

- **release push**：PAT URL 直接推送绕过 checkout auth 冲突
- **release bash 语法**：修复 `node -p` 子 shell 中的嵌套引号语法错误

## [0.1.15] - 2026-07-16

### 新增

- **init 流程优化 v1**：改进 CLI 初始化交互体验与健壮性（Feature PR #4）

### 变更

- **podman 示例对齐**：`podman-compose.example.yml` 挂载卷路径与 README 保持一致

## [0.1.14] - 2026-07-16

### 变更

- **init 流程优化**：CLI 初始化交互体验改进
- **podman 示例**：podman compose 示例文件更新

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
