# 贡献指南

感谢你愿意为 add-coder 贡献代码！本指南面向**仓库开发者**（不是终端用户）。用户文档请看 [README.md](./README.md)，上手实操请看 [GUIDE.md](./GUIDE.md)，仓库内部机制详解请看 [DEVELOPMENT.md](./DEVELOPMENT.md)。

> 本仓库所有功能开发、Bug 修复、系统修改都必须走 **ADD 范式 10 阶段工作流**（Step 0-9），详见 [AGENTS.md](./AGENTS.md)。DO NOT skip sub-steps.

---

## 目录

- [环境准备](#环境准备)
- [快速开始](#快速开始)
- [项目结构速览](#项目结构速览)
- [核心开发规范（必读）](#核心开发规范必读)
- [开发循环](#开发循环)
- [测试](#测试)
- [提交规范](#提交规范)
- [分支与 PR](#分支与-pr)
- [文档约定](#文档约定)
- [发布](#发布)
- [常见坑位](#常见坑位)
- [相关文档](#相关文档)

---

## 环境准备

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 20 | 运行时（`.node-version` 已固定） |
| pnpm | 11.x（推荐 11.9.0） | 包管理器（`packageManager` 已固定） |
| podman + podman-compose | 最新 | 本地 PostgreSQL 部署（`podman-compose.add.yml`） |
| bash | 3.2+ | 基础设施脚本（db-ensure.sh、githooks） |

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/xiaomingming92/add-coder.git
cd add-coder
pnpm install

# 2. 同步 templates/ 真源到各 magic 目录（.add/ .qoder/ .claude/ ...）
pnpm run sync

# 3. 启动数据库 + 迁移（Podman 容器，主库 5434 / shadow 5437）
pnpm run db:ensure

# 4. 验证环境
pnpm run build && pnpm lint && pnpm test
```

> magic 目录（`.add/`、`.qoder/` 等）在 git 中，clone 即带 hooks，无需 `npx add-coder init`。

## 项目结构速览

```
add-coder/
├── templates/        ★ 唯一真源（hooks/agents/skills/templates/rules/... 的根）
│   ├── core/         跨 IDE 共享真源（governance 治理契约层、hooks、模板、脚本）
│   └── adapters/     IDE 专属适配真源（claude/qoder/vscode/trae/codex）
├── src/              TypeScript 源码（CLI、renderer、caijuehub 裁决引擎）
├── scripts/          自举脚本（sync-magic.ts、db-ensure.sh、hook-bake.ts ...）
├── prisma/           Prisma schema + Atlas 版本化迁移（atlas-migrations/）
├── tests/            vitest 测试（单元 + 集成）
└── .add/ .qoder/ ... 运行时 magic 目录（templates/ 的同步副本，git 跟踪）
```

完整结构图与 sync 映射关系见 [DEVELOPMENT.md#二目录结构全景](./DEVELOPMENT.md#二目录结构全景)。

## 核心开发规范（必读）

### 1. 唯一真源原则

> 任何文件的「正确答案」只存在于 `templates/` 一个地方，其他位置都是同步副本。

- ✅ **改真源**：修改 `templates/` 下的文件
- ❌ **不要直接改副本**：`.add/`、`.qoder/`、`.claude/`、`.vscode/`、`.trae/` 中的文件
- **改完必同步**：`pnpm run sync`，确保所有 magic 目录对齐
- **adapter 特有文件只在各自真源**：如 claude 的 `permission-denied` 事件，只存在于 `templates/adapters/claude/hooks/`
- **代码x 例外**：`.codex/` hooks 是完整独立真源（不入 sync 映射），改动后生成态已 git 入库

> ⚠️ claude / qoder / vscode 三个 adapter 的 hooks 是**独立真源**：core 的改动不会自动覆盖它们，需要手动回流（见 [DEVELOPMENT.md#五四-回流-adapter-增强到-core](./DEVELOPMENT.md#54-回流-adapter-增强到-core)）。

### 2. ADD 范式工作流

所有开发必须走 [AGENTS.md](./AGENTS.md) 定义的 ADD 范式 10 阶段（Step 0-9），其中：

- **Step 0** 末尾必须通过 DPS 门禁（`check_dps`，四维各 25%）
- **Step 3** 前必须校验 add-route 存在性（`check_add_route_status`）
- **Plan Review 的 P0/P1 问题必须在进入 Step 1 前回流至 Plan 体**（未回流 = Review 白做）

### 3. 数据库规范

- ❌ **禁止 `prisma db push`**（任何情况下）
- ✅ 自身库迁移：Atlas 版本化（`prisma/atlas-migrations/`），入口 `bash scripts/db-ensure.sh`
- ✅ Schema 变更：改 `prisma/schema.prisma` → `pnpm run db:ensure`（diff/apply）→ `prisma generate`
- ✅ 消费方项目走 Atlas 声明式（分库/共库双模式），不接管宿主 `prisma/migrations/`
- 端口：主库 5434 / shadow 5437（勿占用邻居项目端口，新端口先查跨项目事实源）

### 4. caijuehub：改规则不改代码

策略/阈值/规则由 `src/caijuehub/*.toml` 声明（sync-rules、hook-*、dps-scoring、ports-rules 等），改规则后执行：

```bash
pnpm run generate        # TOML → 常量生成
pnpm run generate:check  # 幂等性检查（出厂质检）
```

## 开发循环

```bash
# 改模板（hooks/agents/skills/...）→ 同步生效
修改 templates/xxx → pnpm run sync

# 改 TS 源码 → 构建生效
修改 src/xxx → pnpm run build

# 常驻监听构建
pnpm run dev

# 质量门禁
pnpm lint            # eslint src/
pnpm lint:fix
pnpm test            # vitest run
```

推送前有 pre-push 门禁：`pnpm build` + `pnpm lint`（max-warnings 20）任一不通过即阻断推送。

## 测试

```bash
pnpm test    # 全部测试（vitest run）
pnpm test -- <file>   # 单个测试文件
```

- 单元测试放 `tests/*.test.ts`，纯逻辑无外部依赖
- 集成测试（如 `plan-lifecycle-postgres.integration.test.ts`）依赖本地 PostgreSQL，先 `pnpm run db:ensure`
- 修改 hook 治理逻辑时，同步更新 `tests/fixtures/hook-golden/*.golden.json` 行为基线
- 修改 caijuehub 规则时，同步更新对应 TOML 的幂等性测试

## 提交规范

仓库强制 [Conventional Commits](https://www.conventionalcommits.org/)（`.githooks/commit-msg` 自动校验，未启用时可手动执行 `git config core.hooksPath .githooks`）：

```
type(scope): description
```

允许的 type：`feat | fix | chore | docs | style | refactor | perf | test | build | ci | revert | merge | rebase`

```bash
feat: 新增生产计划成本核算接口
fix(agent-gateway): 修复 SSE 断连问题
chore: 升级 prisma 到 7.x
docs: 补充 H5 API 契约文档
```

## 分支与 PR

- 功能开发在 `feature/xxx` 分支进行，合并到 `main` 前先自测全绿（build + lint + test）
- PR 描述说明：改动内容、关联 Plan/Spec、测试覆盖、文档回流情况
- `main` 受保护：版本 bump 与正式发布由 CI 统一完成，不在本地直接打正式 tag 发布

## 文档约定

- 用户文档（README / GUIDE）与开发文档（DEVELOPMENT）职责分离，新机制先在 `docs/` 落专项文档，再回流到对应手册
- **评审结论必须回流**：Plan Review / 代码评审的 P0/P1 问题，未解决前不得进入下一步
- 新增端口/服务时，同步登记端口契约表（跨项目事实源见 `docs/ports.md`）

## 发布

发布流程（preview 分支 / 正式 main tag 触发 CI）详见 [docs/npm-publish-guide.md](./docs/npm-publish-guide.md)。要点：

```bash
# preview（当前分支）
pnpm run build
npm version prerelease --no-git-tag-version
npm publish --tag=preview --no-git-checks

# 正式（main，tag 触发 CI）
git checkout main && git merge feature/xxx
npm version patch   # 或 minor
git push --follow-tags
```

## 常见坑位

| 问题 | 原因 | 解决 |
|------|------|------|
| `ERR_PNPM_IGNORED_BUILDS` | pnpm 11 构建白名单配置 | `pnpm-workspace.yaml` 的 `allowBuilds` 放行 `onnxruntime-node` / `@ariga/atlas`（`.npmrc` 的 `onlyBuiltDependencies` 已失效） |
| sharp 安装失败 | 0.32.x 从 GitHub 下载二进制被墙 | 保持 `@huggingface/transformers@^3.8.1`（sharp 0.34+ 走 npm 分发），**不要降级** |
| Atlas 报 `database is not clean` | dev-url 库不干净 | dev 库必须可重置（清空 schema） |
| `--exclude` 不生效 | 语法错误 | 逗号分隔 + `public.` 前缀精确表名（v1.3.0 实测） |
| Windows 下路径/命令异常 | 反斜杠、`.cmd`、无 bash | 遵循 [docs/跨平台兼容开发规范.md](./docs/跨平台兼容开发规范.md) 三条强制约束 |

完整依赖治理记录见 [DEVELOPMENT.md#十四依赖治理坑位记录](./DEVELOPMENT.md#十四依赖治理坑位记录)。

## 相关文档

| 文档 | 内容 |
|------|------|
| [README.md](./README.md) | 用户使用文档（命令、init、sync --patch） |
| [GUIDE.md](./GUIDE.md) | 从零上手实操（触发词、需求转 Plan、完整链路） |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 开发手册（目录结构、sync 机制、init 流程、数据库、端口契约） |
| [AGENTS.md](./AGENTS.md) | ADD 工作流入口、端口约定 |
| [docs/caijuehub.md](./docs/caijuehub.md) | 集中裁决层（规则供应链工厂） |
| [docs/npm-publish-guide.md](./docs/npm-publish-guide.md) | 发布手册 |
| [docs/跨平台兼容开发规范.md](./docs/跨平台兼容开发规范.md) | Windows/macOS/Linux 跨平台约束 |
