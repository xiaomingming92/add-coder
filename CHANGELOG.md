# CHANGELOG

> 本文档记录 add-coder 各版本的变更历史，与 [README.md](./README.md) 中的版本号保持联动。
>
> 版本号格式遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.1.14] - 2026-07-16

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
