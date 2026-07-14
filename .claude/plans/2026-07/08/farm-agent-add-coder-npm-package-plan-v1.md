# farm-agent-add-coder-npm-package-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。

## PLAN 元信息

- **Plan 名称**: farm-agent-add-coder-npm-package-v1
- **启动时间**: 2026-07-08T00:00:00+08:00
- **主导 AI**: Qoder (Claude 4)
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-add-route-v1.md` ✅
  - Handoff: `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-handoff-v1.md` ✅
  - Review: `.qoder/reviews/farm-agent-add-coder-npm-package-review-v1.md` ✅
  - Review v2: `.qoder/reviews/farm-agent-add-coder-npm-package-review-v2.md` ✅ — 代码实现评审，2 条 P0（spawnSync catch 失能、ask 重复定义）
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| packages/add-coder/package.json | PACKAGE | PACKAGE_CONFIG_UPDATED | private:true, 无构建流程 | public, TypeScript 构建, 发布就绪 | 待实施 |
| packages/add-coder/src/ | SOURCE | SOURCE_CREATED | 无 src 目录 | 完整 CLI + 适配器源码 | 待实施 |
| packages/add-coder/templates/ | TEMPLATE | TEMPLATE_REFACTORED | 硬编码 farm-agent 专属 | 参数化占位符 + 通用化 | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

当前 `packages/add-coder/` 是一个 **不可发布的半成品**：

1. **模板硬编码**：`templates/` 下所有文件直接来自 farm-agent 项目，包含数据库密码、项目名、特定路径等不可移植内容
2. **CLI 纯搬运**：`bin/add-coder.js`（113 行 CommonJS）只有 `init/sync/status` 三个命令，全是 `fs.copyFileSync`，无参数化渲染、无配置合并
3. **无适配层抽象**：`.qoder` 和 `.vscode` 是两套独立静态模板，无共享逻辑。加 Claude 适配需要再复制一套
4. **VS Code 无 hook 层**：`.vscode/` 只有 MCP 配置，缺少 Qoder 的 11 个 hook 等价物
5. **不可发布**：`"private": true`，`"type": "commonjs"`，无构建流程，无测试
6. **极客不可调**：用户要么全接受模板，要么全不用，没有配置入口、没有 override 机制

### 1.2 目标

将 ADD 范式做成一个**真正可用的 npm 包**：

1. **零配置可用**：`npx add-coder init` 后，ADD 范式的 skills/agents/templates/rules/hooks 自动就位，用户无需任何手动操作
2. **极客可调**：通过 `add-coder.config.ts` 覆盖任意模板变量、自定义 hook 行为
3. **多 IDE 兼容**：Claude Code（第一公民）、Qoder/QoderCN（Claude 衍生）、VS Code（阉割版），三层适配器共享同一套 ADD 核心逻辑
4. **模板参数化**：所有硬编码（项目名、数据库密码、特定路径）替换为 `{{placeholder}}`，`init` 时交互式填充或从配置文件读取
5. **配置智能合并**：不覆盖用户已有的 `.qoder/settings.json`、`.vscode/settings.json` 等配置

---

## 二、方案选型

### 2.1 候选方案对比

| 方案 | 模板引擎 | 适配器架构 | 极客入口 | 构建工具 | 结论 |
|------|---------|-----------|---------|---------|------|
| A: 保持现状修补 | 无（继续 shell sed 替换） | 无（继续扁平 templates/） | 无 | 无 | ❌ 换汤不换药 |
| B: 用 EJS/Handlebars 渲染 | EJS 模板引擎 | 无抽象 | 无 | tsup | ❌ 引入新依赖，模板语言学习成本 |
| **C: TypeScript 原生 + 分层架构** | **TS 函数直接操作字符串** | **core/ + adapters/{claude,qoder,vscode}/** | **add-coder.config.ts (Zod schema)** | **tsup** | **✅ 零额外依赖，类型安全，IDE 友好** |

### 2.2 选型理由

选 C。理由：

1. **模板引擎不需要**——ADD 模板是 Markdown + JSON + Shell，占位符替换逻辑极简单（`replace("add-coder", config.name)`），不需要引入 Handlebars 级别的模板引擎
2. **适配器天然分层**——Claude/Qoder/VS Code 的差异集中在：hook 工具名 matcher、配置 schema 格式、magic path。这三个差异正好对应三个 adapter 目录
3. **TypeScript 构建**——`tsup` 零配置打包，产出 CJS + ESM 双格式，`bin/add-coder.js` 作为 shebang 入口
4. **Zod 配置校验**——`add-coder.config.ts` 用 Zod schema 定义，类型安全 + 运行时校验

### 2.3 数据库策略

ADD 范式的 MCP 工具链（`record_dev_operation`、`check_dps`、`check_rahs` 等）依赖 PostgreSQL 数据库。npm 包必须自带数据库 schema 和迁移。

**方案选型**：

| 方案 | 隔离性 | Prisma Client | 迁移复杂度 | 结论 |
|------|:---:|:---:|:---:|:---:|
| A: 独立数据库 | ✅ 物理隔离 | 2 个 Client | 高（需运维额外 DB 实例） | ❌ 过度设计 |
| B: 独立 PostgreSQL Schema | ⚠️ 逻辑隔离 | 1 个 Client（multiSchema） | 中 | ❌ 外键无法跨 Schema |
| **C: 独立 `add.prisma` 文件** | **同库同 Schema** | **1 个 Client** | **低（Prisma 多文件自动融合）** | **✅** |

**选 C 的理由**：

1. **DevOperation 和 AuditLog 有外键 `userId → User.id`**——ADD 治理数据与业务数据（User 表）天然关联，拆到独立 DB/Schema 会导致外键失效
2. **Prisma 6.7+ 多文件 Schema** 特性——`add.prisma` 作为独立文件放入用户 `prisma/` 目录，`prisma migrate dev --schema=prisma/` 自动融合所有 `.prisma` 文件，跨文件外键自动解析
3. **零侵入**——npm 包只新增一个文件，不修改用户已有的 `schema.prisma`、`main.prisma`。卸载只需 `rm prisma/add.prisma`

**`add.prisma` 内容**：

```prisma
// add.prisma — ADD 治理模型（npm 包写入，不修改用户业务文件）

model DevOperation {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  planKeyword String
  action      String
  targetType  String
  targetId    String
  beforeState Json?
  afterState  Json?
  reason      String?
  createdAt   DateTime @default(now())

  @@index([planKeyword])
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  action      String
  targetType  String
  targetId    String
  traceId     String?
  beforeState Json?
  afterState  Json?
  reason      String?
  createdAt   DateTime @default(now())

  @@index([traceId])
}
```

**前置条件**：用户项目必须已有 `User` 模型（`id: String`），否则 `prisma migrate` 失败并报外键错误。`init` 时检测并提示。

**依赖声明**：
- `prisma` → `peerDependencies`（用户项目已有或需安装）
- `@prisma/client` → `peerDependencies`
- `prisma migrate dev` → `init` 时自动执行（幂等，已应用的迁移跳过）

---

## 三、架构设计

### 3.1 数据流转（文件级）

```
用户执行 npx add-coder init
        │
        ▼
bin/add-coder.js                ── shebang 入口，加载 dist/cli/index.js
        │
        ▼
src/cli/commands/init.ts        ── 主命令
        │
        ├── ① 检测 IDE 环境
        │     src/cli/detect.ts
        │     → 扫描 .qoder/ .claude/ .vscode/ 存在性 → 确定 targetAdapter
        │     → 若 --adapter 未指定，且检测不到任何 IDE 特征：
        │       无 package.json → 报错退出（无法确定项目根）
        │       有 package.json → 交互式提示选择 IDE（claude/qoder/vscode/auto）
        │       有 --yes → 默认 auto（三端全部署）
        │
        ├── ② 读取用户配置
        │     src/cli/config-loader.ts
        │     → 按优先级链加载配置：
        │       交互式问答（最高优先级，覆盖一切）
        │         ↓ 用户跳过 / --non-interactive 模式
        │       add-coder.config.ts（极客入口）
        │         ↓ 未配置
        │       自动检测（package.json / .env / 目录扫描）
        │         ↓ 检测不到
        │       内置默认值（兜底，仅限非敏感变量）
        │     → Zod 校验 → 合并后输出最终 config
        │
        │     CLI 标志：
        │     --config <path>  指定配置文件，跳过交互
        │     --yes / --non-interactive  跳过交互，自动检测 + 默认值（跳过已有文件）
        │     --force  覆盖已有文件，不交互（与 --yes 互斥）
        │     --dry-run  预览会生成什么，不实际写入
        │
        ├── ③ 渲染 core 模板
        │     src/core/renderer.ts
        │     → 遍历 templates/core/ 下所有模板文件
        │     → replace("add-coder", config.name)
        │     → ... 等参数化替换
        │
        ├── ④ 渲染 adapter 模板
        │     src/adapters/{target}/renderer.ts
        │     → 遍历 templates/adapters/{target}/ 下所有模板文件
        │     → 替换 adapter 特定占位符（如 matcher 工具名映射）
        │
        ├── ⑤ Prisma 模型注入 + 数据库迁移
        │     src/cli/prisma-injector.ts
        │     → 检测用户项目是否已有 Prisma（prisma/ 目录 + schema.prisma）
        │     → 无 Prisma → **阻断退出**（ADD 工作流依赖 Prisma + PostgreSQL，
        │       无 Prisma 则 DevOperation 表无法创建，MCP 工具链不可用）
        │     → 检测 User 模型是否存在（id: String）→ 无则阻断退出
        │     → 复制 templates/core/prisma/add.prisma → 用户 prisma/ 目录
        │     → 执行 prisma migrate dev --name add_workflow_init --schema=prisma/
        │       （幂等：已应用的迁移自动跳过）
        │     → 执行 prisma generate（用户已有 Client 自动包含 DevOperation + AuditLog）
        │
        │     ⚠️ Prisma 注入是 init 的硬阻断步骤。即使模板已部署，
        │     无 Prisma 则 record_dev_operation、check_dps、check_rahs 等
        │     MCP 工具无法运行，ADD 范式不可用。
        │
        ├── ⑥ 写入目标路径
        │     src/cli/writer.ts
        │     → 智能合并：已有文件 → diff 展示 → 交互确认
        │     → 新文件 → 直接写入
        │     → 设置 shell 脚本可执行权限
        │
        └── ⑦ 输出摘要
              → 列出已创建/已跳过/已合并文件
              → 提示下一步（如 "重启 IDE 加载 hook"）
```

### 3.2 目录结构

**设计原则**：`src/` 只放 TypeScript 源码（tsup 编译），`templates/` 放模板内容（Markdown/JSON/Shell，不编译，npm pack 直接打包）。代码与内容物理分离。

```
packages/add-coder/
├── bin/
│   └── add-coder.js                    # shebang 入口，加载 dist/cli/index.js
│
├── src/                                # 仅 TypeScript 源码（tsup 编译）
│   ├── core/
│   │   └── renderer.ts                 # 核心渲染器，读取 templates/core/
│   ├── adapters/
│   │   ├── claude/renderer.ts          # Claude 适配渲染器，读取 templates/adapters/claude/
│   │   ├── qoder/renderer.ts           # Qoder 适配渲染器，读取 templates/adapters/qoder/
│   │   └── vscode/renderer.ts          # VS Code 适配渲染器，读取 templates/adapters/vscode/
│   ├── cli/
│   │   ├── index.ts                    # 主入口（commander）
│   │   ├── commands/
│   │   │   ├── init.ts                 # init 命令
│   │   │   ├── sync.ts                 # sync 命令（增量同步）
│   │   │   └── status.ts               # status 命令（检查完整性）
│   │   ├── detect.ts                   # IDE 环境检测
│   │   ├── config-loader.ts            # 配置加载 + Zod 校验 + 优先级合并
│   │   ├── prisma-injector.ts          # Prisma 模型注入 + 迁移执行
│   │   └── writer.ts                   # 智能文件写入 + 合并
│   └── config/
│       ├── schema.ts                   # Zod schema for add-coder.config.ts
│       └── defaults.ts                 # 默认值
│
├── templates/                          # 模板内容（不编译，npm pack 直接打包）
│   ├── core/                           # ★ IDE 无关的 ADD 范式核心
│   │   ├── agents/                     # add-flow-guardian.md, add-orchestrator.md
│   │   ├── skills/                     # add-paradigm/SKILL.md, session-init/SKILL.md
│   │   ├── docs/                       # 15 个 .md 模板（plan/spec/tasks/checklist/handoff/review/add-route 等）
│   │   ├── docs-schema/                # 15 个 .schema.json
│   │   ├── plans/                      # 示例 plans（含 add-coder 6轮范例）
│   │   ├── specs/                      # 示例 specs（含 add-coder spec/tasks/checklist）
│   │   ├── rules/                      # project_rules.md, theory-practice-map.toml
│   │   ├── vocabulary/                 # add-governance-vocabulary.md
│   │   ├── scripts/                    # mcp-server.ts, add-coder-mcp-server.ts
│   │   ├── reports/                    # 7 个 report 模板
│   │   └── tools/                      # README.md
│   │
│   ├── adapters/                       # ★ IDE 适配层模板
│   │   ├── claude/                     # 产出 .claude/
│   │   │   ├── hooks/                  # shell 脚本（共享 core 逻辑，matcher 用标准工具名）
│   │   │   ├── settings.json
│   │   │   └── mcp.json
│   │   ├── qoder/                      # 产出 .qoder/
│   │   │   ├── hooks/                  # shell 脚本（matcher 适配双套工具名）
│   │   │   ├── settings.json
│   │   │   ├── mcp.json
│   │   │   └── sync-policy.json
│   │   └── vscode/                     # 产出 .vscode/
│   │       ├── settings.json
│   │       ├── launch.json
│   │       ├── tasks.json
│   │       └── extensions.json
│   │
│   └── shared/                         # 空目录占位（debug-dump, repowiki）
│
├── tsconfig.json
├── tsup.config.ts
├── package.json                        # public, ESM + CJS, "files": ["dist/", "templates/", "bin/"]
└── README.md
```


# ──── npx add-coder init 后的用户项目结构 ────

```
用户项目/
├── .add/                               # ★ ADD 蓝图（推荐路径）
│   ├── agents/                         # ← templates/core/agents/
│   ├── skills/                         # ← templates/core/skills/
│   ├── templates/                      # ← templates/core/docs/（.md 模板 + .schema.json，扁平）
│   ├── rules/                          # ← templates/core/rules/
│   ├── vocabulary/                     # ← templates/core/vocabulary/
│   ├── scripts/                        # ← templates/core/scripts/
│   ├── hooks/                          # ← templates/adapters/{target}/hooks/
│   ├── plans/                          # ← templates/core/plans/
│   ├── specs/                          # ← templates/core/specs/
│   ├── reports/                        # ← templates/core/reports/
│   ├── tools/                          # ← templates/core/tools/
│   ├── debug-dump/                     # ← templates/shared/debug-dump/（空目录占位）
│   ├── repowiki/                       # ← templates/shared/repowiki/（空目录占位）
│   ├── reviews/                        # ← 用户自建（init 后空目录）
│   ├── mcp.json                        # ← templates/adapters/{target}/mcp.json
│   ├── settings.json                   # ← templates/adapters/{target}/settings.json
│   └── sync-policy.json                # ← templates/adapters/qoder/sync-policy.json
│
├── .qoder/                             # ★ Qoder IDE 配置
│   ├── agents/                         # ← 同 .add/agents/
│   ├── skills/                         # ← 同 .add/skills/
│   ├── templates/                      # ← 同 .add/templates/
│   ├── rules/                          # ← 同 .add/rules/
│   ├── vocabulary/                     # ← 同 .add/vocabulary/
│   ├── scripts/                        # ← 同 .add/scripts/
│   ├── hooks/                          # ← adapter/qoder/hooks/（Qoder 专属 matcher）
│   ├── plans/                          # ← 同 .add/plans/
│   ├── specs/                          # ← 同 .add/specs/
│   ├── reports/                        # ← 同 .add/reports/
│   ├── tools/                          # ← 同 .add/tools/
│   ├── debug-dump/                     # ← 同 .add/debug-dump/
│   ├── repowiki/                       # ← 同 .add/repowiki/
│   ├── reviews/                        # ← 同 .add/reviews/
│   ├── mcp.json                        # ← adapter/qoder/mcp.json
│   ├── settings.json                   # ← adapter/qoder/settings.json
│   └── sync-policy.json                # ← adapter/qoder/sync-policy.json
│
├── .claude/                            # ★ Claude Code 配置
│   ├── agents/                         # ← 同 .add/agents/
│   ├── skills/                         # ← 同 .add/skills/
│   ├── templates/                      # ← 同 .add/templates/
│   ├── rules/                          # ← 同 .add/rules/
│   ├── vocabulary/                     # ← 同 .add/vocabulary/
│   ├── scripts/                        # ← 同 .add/scripts/
│   ├── hooks/                          # ← adapter/claude/hooks/（Claude 标准工具名）
│   ├── plans/                          # ← 同 .add/plans/
│   ├── specs/                          # ← 同 .add/specs/
│   ├── reports/                        # ← 同 .add/reports/
│   ├── tools/                          # ← 同 .add/tools/
│   ├── debug-dump/                     # ← 同 .add/debug-dump/
│   ├── repowiki/                       # ← 同 .add/repowiki/
│   ├── reviews/                        # ← 同 .add/reviews/
│   ├── mcp.json                        # ← adapter/claude/mcp.json
│   └── settings.json                   # ← adapter/claude/settings.json
│
├── .vscode/                            # ★ VS Code 配置
│   ├── settings.json                   # ← templates/adapters/vscode/settings.json
│   ├── launch.json                     # ← templates/adapters/vscode/launch.json
│   ├── tasks.json                      # ← templates/adapters/vscode/tasks.json
│   └── extensions.json                 # ← templates/adapters/vscode/extensions.json
│
├── prisma/
│   ├── schema.prisma                   # 用户已有或 prisma init 创建
│   └── add.prisma                      # injectPrisma 注入（来自 npm 包内置）
│
└── .env.development                    # prisma init 创建，用户配置 DATABASE_URL
```

> **部署策略**：`templates/core/` 内容复制到 `.add/`、`.qoder/`、`.claude/` 三个目录。
> IDE 只认自身的 magic path（`.qoder/` / `.claude/`），必须各自包含完整内容。
> `.add/` 保留作为 add-coder 推荐蓝图，供未来工具链引用。

> **⚠️ 改造待执行**：当前 `renderCore()` 仅输出到 `.add/`，需改造为三目录并行输出：
> 1. `src/core/renderer.ts`：`renderCore()` 返回值改为 `Map<string, string>[]`（三份）
> 2. `src/cli/commands/init.ts`：core 文件写入 `.add/` `.qoder/` `.claude/` 三个目标
> 3. adapter renderers：不再单独部署 core 内容，只处理 adapter 专属文件（hooks/mcp/settings）
> 4. 写入去重：三目录同名文件只写一次，后两次 skip（内容相同）

**关键命名决策**：旧的 `templates/templates/` 嵌套命名 → 改为 `templates/core/docs/`，避免 `templates/templates/` 这种令人困惑的路径。

**渲染器路径约定**：
```typescript
// src/core/renderer.ts
const TEMPLATES_ROOT = path.join(__dirname, '../../templates')
const coreDir = path.join(TEMPLATES_ROOT, 'core')
const adapterDir = path.join(TEMPLATES_ROOT, 'adapters', target)
```

### 3.3 适配器差异矩阵

> **数据来源**：[Claude Code 官方 Hooks 参考](https://code.claude.com/docs/zh-CN/hooks)（27 事件）、Qoder IDE 实测（11 事件）。

| 维度 | Claude Code | Qoder | VS Code |
|------|--------|-------|---------|
| Magic Path | `.claude/` | `.qoder/` | `.vscode/` |
| Hook 配置格式 | `settings.json` (Claude schema) | `settings.json` (Qoder schema) | 无原生 hook |
| Hook 事件数量 | 27 个（含 PreToolUse/PostToolUse/Stop/SessionStart/UserPromptSubmit/PermissionRequest 等） | ~11 个 | 0（可用 tasks.json 模拟文件保存触发） |
| 工具名 matcher | `Write`, `Edit`, `Bash`（标准名） | `Write\|write_to_file`, `Edit\|edit_file`, `Bash`（双套兼容） | N/A |
| Hook handler 类型 | 5 种（command/http/mcp_tool/prompt/agent） | 1 种（command） | N/A |
| 退出码机制 | exit 0 = 放行，exit 2 = 阻断 | exit 0 = 放行，exit 2 = 阻断 | N/A |
| Hook 脚本 | 完整（与 Qoder 共享核心逻辑，差异仅在 matcher 工具名映射） | 完整（matcher 适配） | 无 |
| MCP 配置 | `mcp.json` (Claude 格式) | `mcp.json` (Qoder 格式) | `settings.json` 内嵌 |
| Skills 加载 | `.claude/skills/` | `.qoder/skills/` | 不支持 |
| Subagents 加载 | `.claude/agents/` | `.qoder/agents/` | 不支持 |
| 能力声明 | 完整 ADD 运行时 | 完整 ADD 运行时 | 仅模板 + MCP，无 hook 执法 |

**关键发现**：Claude Code 和 Qoder 的 hook 退出码机制完全一致（exit 0/2），shell 脚本可 90% 复用。SessionStart、UserPromptSubmit、PermissionRequest 三个事件两者均原生支持，不应在迁移时移除。

### 3.4 参数化变量清单

变量分为两类：**Init-time 模板变量**（init 时替换为实际值）和 **Runtime 环境变量**（MCP 服务器每次启动时从 process.env 读取）。

#### 3.4.1 Init-time 模板变量

以下为需要在 `npx add-coder init` 时通过模板渲染替换的占位符：

| 占位符 | 含义 | 示例值 | 获取方式 | 需要交互式？ |
|--------|------|--------|---------|:--:|
| `add-coder` | 项目名 | `my-project` | package.json name 或交互式输入 | 是（若 package.json 不存在） |
| `/home/xmm/ai/add-coder` | 项目根目录绝对路径 | `/path/to/project` | 自动检测（process.cwd()） | 否 |
| `src` | 源码目录 | `src/` | 自动检测（扫描 src/ 或 app/） | 否 |
| `logs` | 日志目录 | `logs/` | 默认值 | 否 |
| `docs` | 文档目录 | `docs/` | 默认值 | 否 |
| `.env` | env 文件名 | `.env` | 默认值，可交互式覆盖 | 否 |
| `src/lib/agent-audit-logger.ts` | 审计日志器路径 | `src/lib/agent-audit-logger.ts` | 默认值，可配置覆盖 | 否 |
| `tsx` | MCP 启动命令 | `tsx` | 自动检测，可交互式覆盖 | 是（若检测不确定） |
| `@/lib/agent-audit-logger` | agentAudit 导入路径 | `@/lib/agent-audit-logger` | 默认值，可配置覆盖 | 否 |

#### 3.4.2 Runtime 环境变量

以下变量**不在 init 时交互式填入**（密码会留在 shell history），而是由用户在 `.env` 中配置，MCP 服务器每次启动时从 `process.env` 读取：

| 环境变量 | 含义 | 模板中处理方式 |
|---------|------|--------------|
| `DATABASE_URL` | 数据库连接串 | 保留 `process.env.DATABASE_URL`，**去掉兜底值**，缺失时 `throw Error` |
| 其他 API keys | 第三方服务密钥 | 保留 `process.env.XXX`，无兜底值 |

> **基建变量反模式警告**：模板代码中禁止出现 `process.env.DATABASE_URL \|\| "postgresql://..."` 这类兜底值。DATABASE_URL 是基础设施连接串，缺失意味着数据库不可用，静默使用无关项目的兜底值只会导致难以排查的运行时错误。对齐项目规范："配置初始化拒绝兜底，缺失即报错"。

#### 3.4.3 配置合并策略

- **JSON 合并**：deep merge，已有 `settings.json` 中的 `hooks` 数组追加新 hook 而非全量替换
- **用户跳过**：生成 `.new` 后缀文件，不覆盖原文件
- **幂等性**：`init` 重复执行安全，已存在的文件默认跳过（diff 展示后交互确认）

---

### 3.5 裁决层：CaijueHub（三段式裁决生成管线）

> **定位**：add-coder 聚焦管线阶段 ③④——通用转录引擎 + 编译集成。
> 阶段 ①②（产品文档 → 规则提取 → caijue.toml）由 farm-agent 的独立 Plan 承接，add-coder 不耦合业务域。

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段 ①②: farm-agent Plan 承接                              │
│                                                             │
│ 产品文档 → 提取函数 → caijue.toml                           │
│ （业务规则）  （AI/规则引擎）  （规则索引）                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ caijue.toml
┌──────────────────────────────▼──────────────────────────────┐
│ 阶段 ③④: add-coder 承接（本 Plan）                           │
│                                                             │
│ caijue.toml → 转录引擎 → strategies/*.ts → tsup → dist/     │
│ （规则索引）  （add-coder generate） （可执行 TS）  （编译）   │
└─────────────────────────────────────────────────────────────┘
```

> **add-coder 作为通用转录引擎**：类似 Prisma 的 `prisma generate`——读 caijue.toml，生成策略代码。
> 引擎本身不关心 caijue.toml 的内容来源，只负责"TOML → TS"的编译时转录。

#### 3.5.1 实际实现架构（偏离原 Plan §3.5.2，以 handoff §7 为准）

```
caijue.toml（索引）          *-rules.toml（规则参数）      strategies/*.ts
─────────────────           ────────────────────        ┌──────────────────┐
[[caijue]]                  detect-rules.toml    →      │ GENERATED (转录)  │
  rules = "detect-rules"    prisma-rules.toml    →      │ DETECT_RULES=[]   │
  impl = "strategies/..."   adapter-rules.toml   →      │ PRISMA_CONFIG={}   │
                            writer-rules.toml    →      ├──────────────────┤
                                                        │ USER CODE (手写)   │
转录流程：                                                 │ detectIDE()       │
npm run generate → transcribe.ts → GENERATED 区块         │ injectPrisma()    │
                                                        └──────────────────┘

- caijue.toml 只做索引，不耦合规则逻辑
- *-rules.toml 定义规则参数，transcribe.ts 产出 GENERATED 区块
- USER CODE 手写业务逻辑，npm run generate 不覆盖
```

#### 3.5.1 裁决点清单

| 裁决点 | 当前位置 | 决策内容 | 归入 caijue |
|------|------|------|:--:|
| IDE 检测优先级 | `detect.ts` | 环境变量 → 目录检测 → 兜底，优先级硬编码 | ✅ |
| 配置加载优先级链 | `config-loader.ts` | 交互式 > 配置文件 > 自动检测 > 默认值 | ✅ |
| Prisma 注入行为 | `prisma-injector.ts` | 阻断/跳过/交互三选一，已有 add.prisma 时的三选一 | ✅ |
| Writer 写入模式 | `writer.ts` | 交互/yes/force/dry-run 四种模式 | ✅ |
| Adapter 选择 | `init.ts` | auto → 三端全部署，显式指定 → 单端部署 | ✅ |

#### 3.5.2 caijue.toml 结构

```toml
# add-coder 裁决配置 — 用户可覆盖，npm 包自带默认值

[detect]
# IDE 检测优先级链（从上到下，命中即停）
priority = [
  { env = "QODER_CN_IDE",        value = "qoder" },  # Qoder CN
  { env = "QODERCN_AGENT",       value = "qoder" },  # Qoder CN
  { env = "QODERCN_PROJECT_DIR", value = "qoder" },  # Qoder CN
  { env = "QODER_PROJECT_DIR",   value = "qoder" },  # Qoder 国际版
  { env = "CLAUDE_PROJECT_DIR",  value = "claude" },
  { env = "TERM_PROGRAM",        match = "vscode", value = "vscode" },
  { dir = ".claude",             value = "claude" },
  { dir = ".qoder",              value = "qoder" },
  { dir = ".vscode",             value = "vscode" },
]
fallback = "auto"

[config]
priority = [
  "cli-flag",
  "interactive",
  "add-coder.config.ts",
  "auto-detect",
  "defaults",
]

[prisma]
on_missing = "block"
on_existing_add_prisma = "ask"
on_migrate_fail = "rollback"

[writer]
on_existing = "ask"
json_merge = "deep"
shell_chmod = true

[adapters]
auto_deploy = ["claude", "qoder", "vscode"]
magic_path = { claude = ".claude", qoder = ".qoder", vscode = ".vscode" }
```

#### 3.5.3 CaijueHub 加载流程

```
init 启动
  │
  ├── ① 读取 caijue.toml（npm 包内置默认值）
  │
  ├── ② 检测用户 caijue.toml（项目根目录）
  │     → 存在 → deep merge 覆盖默认值
  │
  ├── ③ CLI 标志覆盖（最高优先级）
  │     --yes     → writer.on_existing = "skip"
  │     --force   → writer.on_existing = "overwrite"
  │     --dry-run → writer + prisma 全部 dry-run
  │
  └── ④ 按 caijue 裁决表执行后续步骤
```

#### 3.5.4 审计集成

每次裁决落 ADD-7：

| 裁决点 | beforeState | afterState |
|------|------|------|
| IDE 检测 | `{ env: {}, dirs: [] }` | `{ detected: "qoder", via: "QODER_CN_IDE" }` |
| 配置加载 | `{ sources: ["auto-detect", "defaults"] }` | `{ projectName: "test", ... }` |
| Prisma 注入 | `{ prisma: "missing" }` | `{ decision: "block", reason: "无 Prisma 目录" }` |
| Writer 写入 | `{ path: ".qoder/settings.json", existing: true }` | `{ decision: "skip", reason: "--yes" }` |

#### 3.5.5 目录结构增量

```
packages/add-coder/
├── src/
│   └── caijuehub/
│       ├── caijue.ts              # CaijueHub 加载器
│       ├── caijue.toml            # 内置默认裁决
│       └── transcribe.ts          # 转录引擎（TOML → TS）
├── templates/
│   └── core/
│       └── caijue/
│           └── caijue.toml        # 模板（init 时复制到用户项目根）
```

---

## 四、实施 Task + 依赖图

**6 轮迭代**，每轮有明确的验收标准，各轮不可跳过。

```
第1轮: 基础准备
  Task 0: Prisma 模型准备 ──┐
  Task 1: 清理硬编码 ────────┘ 可并行，互不依赖
           │
           ▼
第2轮: 架构搭建
  Task 0: 适配器架构搭建
           │
           ▼
第3轮: 适配器实现
  Task 0: Claude
           │
           ▼
  Task 1: Qoder
           │
           ▼
  Task 2: VS Code
           │
           ▼
第4轮: 配置 + CLI
  Task 0: 配置系统（Zod schema）
           │
           ▼
  Task 1: CLI 重写（依赖第1轮 Task 0 + 第4轮 Task 0）
           │
           ▼
第5轮: 测试 + 发布
  Task 0: 集成测试 + 文档 + devlog
           │
           ▼
第6轮: 裁决层
  Task 0: CaijueHub（caijue.toml + caijue.ts）
           │
           ▼
  Task 1: 重构 detect/config-loader/prisma-injector/writer 读 caijue
```

### 第1轮：基础准备

#### Task 0: Prisma 模型准备

**范围**：`templates/core/prisma/add.prisma` + `src/cli/prisma-injector.ts`

- 从 farm-agent 的 `prisma/main.prisma` 中提取 DevOperation 和 AuditLog 模型定义
- 写入 `templates/core/prisma/add.prisma`（模型定义，无参数化）
- 实现 `src/cli/prisma-injector.ts`：
  - 检测用户项目是否已有 Prisma（`prisma/` 目录 + `schema.prisma`）→ 无则报错
  - 检测 User 模型是否存在（`id: String`）→ 无则报错
  - 复制 `add.prisma` → 用户 `prisma/` 目录
  - 执行 `prisma migrate dev --name add_workflow_init --schema=prisma/`（幂等）
  - 执行 `prisma generate`

**验收**：在空白 Prisma 项目中执行 `prisma migrate dev --schema=prisma/` 成功创建 DevOperation 和 AuditLog 表

> **Review v2 回流（P0-1）**：`prisma-injector.ts` 中 `spawnSync` 返回状态须检查 `r.status`，不可依赖 try/catch。迁移失败时 `add.prisma` 回滚删除。

#### Task 1: 清理硬编码 + 参数化 core 模板

**范围**：`packages/add-coder/templates/` 下所有文件（共 ~70 个文件）

**处理原则**：
- 将硬编码替换为 `{{placeholder}}` 占位符（`npx add-coder init` 时由渲染器替换为实际值）
- 数据库密码等敏感信息改为 `process.env.X`（Runtime 环境变量），**无兜底值**

**完整文件清单**：

| # | 文件组 | 文件 | 典型硬编码 | 改为 | 变量类型 |
|---|--------|------|----------|------|---------|
| 1 | 模板 | 15 个 `.md` 模板（plan/spec/tasks/checklist/handoff/review/add-route 等） | `docs/大田精准耕播智能决策系统/`、`farm-agent-*` 文件名示例 | `docs/`、`add-coder-*` | Init-time |
| 2 | 模板 Schema | 15 个 `.schema.json` | 无硬编码（结构定义） | 无需修改 | — |
| 3 | Skills | `skills/add-paradigm/SKILL.md` | `docs/大田精准耕播智能决策系统/`、`/home/xmm/ai/farm-agent/`、`farm-agent-response-strategy/` 示例 | `docs/`、`/home/xmm/ai/add-coder/`、`add-coder-*` | Init-time |
| 4 | Skills | `skills/session-init/SKILL.md` | `farm-agent-review-runtime.md` 示例 | `add-coder-review-runtime.md` | Init-time |
| 5 | Agents | `agents/add-flow-guardian.md` | 无项目特定硬编码 | 检查确认 | — |
| 6 | Agents | `agents/add-orchestrator.md` | 无项目特定硬编码 | 检查确认 | — |
| 7 | Rules | `rules/project_rules.md` | `farm-agent` 项目名、`src/agents/` 路径 | `add-coder`、`src/agents/` | Init-time |
| 8 | Rules | `rules/theory-practice-map.toml` | 无项目特定硬编码 | 检查确认 | — |
| 9 | 词汇 | `vocabulary/add-governance-vocabulary.md` | 无项目特定硬编码 | 检查确认 | — |
| 10 | 脚本 | `scripts/mcp-server.ts` | `DATABASE_URL \|\| "postgresql://farm_admin:farm_secure_pass_2024@..."`、`".env.development"` | `process.env.DATABASE_URL`（无兜底值）、`".env"` | Runtime + Init-time |
| 11 | 脚本 | `scripts/add-coder-mcp-server.ts` | 同上 | 同上 | Runtime + Init-time |
| 12 | Hook 配置 | `.qoder/settings.json` | hook 脚本绝对路径 `/home/xmm/ai/farm-agent/.qoder/hooks/` | `/home/xmm/ai/add-coder/.qoder/hooks/` | Init-time |
| 13 | MCP 配置 | `.qoder/mcp.json` | `DATABASE_URL` 硬编码密码 | `process.env.DATABASE_URL`（无兜底值） | Runtime |
| 14 | 同步策略 | `.qoder/sync-policy.json` | 无项目特定硬编码 | 检查确认 | — |
| 15 | Hook 脚本 | `.qoder/hooks/` 下 14 个 `.sh` 文件 | `state-detect.sh` 中项目名提取逻辑、hook 脚本内部绝对路径 | 使用 `$CLAUDE_PROJECT_DIR` 或 `/home/xmm/ai/add-coder` 替代 | Init-time |
| 16 | VS Code | `.vscode/settings.json` | MCP 配置中的项目特定路径 | `/home/xmm/ai/add-coder` | Init-time |
| 17 | VS Code | `.vscode/tasks.json` | 无项目特定硬编码 | 检查确认 | — |
| 18 | VS Code | `.vscode/launch.json` | 无项目特定硬编码 | 检查确认 | — |
| 19 | VS Code | `.vscode/extensions.json` | 无项目特定硬编码 | 检查确认 | — |
| 20 | Reports | `reports/` 下 7 个文件 | `farm-agent`、`/Users/milkytea/WebstormProjects/rfMain/智能体/farm-agent/` 等绝对路径 | 全部 `add-coder`、`/home/xmm/ai/add-coder` | Init-time |
| 21 | 工具 | `tools/README.md` | 无项目特定硬编码 | 检查确认 | — |
| 22 | Prisma | `prisma/add.prisma` | 无硬编码（模型定义，直接复制到用户项目） | 无需修改 | — |
| 23 | Grounding 文档 | `docs/01-架构/《ADD开发工作路径与文档协同规范》.md` | `docs/大田精准耕播智能决策系统/`、`farm-agent-*` 文件名示例（15 处） | `docs/`、`add-coder-*` | Init-time |

- 创建 `src/core/renderer.ts`：接收 config 对象，执行 `"add-coder".replace("add-coder", config.name)`

**验收**：`grep -r "farm.agent\|farm_secure_pass\|大田精准\|/home/xmm\|/Users/milkytea" templates/` 返回空

### 第2轮：架构搭建

#### Task 0: 模板目录重组 + 适配器架构搭建

**范围**：将旧的扁平 `templates/` 目录重组为 `src/`（代码）+ `templates/`（内容）分离结构，并搭建适配器三层目录。

**迁移映射表**：

| 旧路径 (`packages/add-coder/templates/`) | 新路径 | 说明 |
|------|------|------|
| `agents/` | `templates/core/agents/` | IDE 无关 |
| `skills/` | `templates/core/skills/` | IDE 无关 |
| `templates/*.md`（15 个模板） | `templates/core/docs/` | 去掉外层 `templates/` 嵌套命名 |
| `templates/*.schema.json`（15 个） | `templates/core/docs-schema/` | 同上 |
| `templates/index.md` | `templates/core/docs/index.md` | 模板索引 |
| `templates/TERMINOLOGY.md` | `templates/core/docs/TERMINOLOGY.md` | 术语表 |
| `rules/` | `templates/core/rules/` | IDE 无关 |
| `vocabulary/` | `templates/core/vocabulary/` | IDE 无关 |
| `scripts/` | `templates/core/scripts/` | IDE 无关 |
| `reports/` | `templates/core/reports/` | IDE 无关 |
| `tools/` | `templates/core/tools/` | IDE 无关 |
| `docs/`（grounding 文档：00-需求/01-架构/02-规范） | `templates/core/docs/` | 保留子目录结构 |
| `.qoder/hooks/`（14 个 .sh + lib/） | `templates/adapters/qoder/hooks/` | Qoder 适配器 |
| `.qoder/settings.json` | `templates/adapters/qoder/settings.json` | Qoder 适配器 |
| `.qoder/mcp.json` | `templates/adapters/qoder/mcp.json` | Qoder 适配器 |
| `.qoder/sync-policy.json` | `templates/adapters/qoder/sync-policy.json` | Qoder 适配器 |
| `.vscode/`（4 个文件） | `templates/adapters/vscode/` | VS Code 适配器 |
| `debug-dump/`, `repowiki/` | `templates/shared/` | 空目录占位，init 时在用户项目中创建 |
| 无（新建） | `templates/adapters/claude/` | Claude 适配器，从 qoder 派生 |
| 无（新建） | `templates/core/prisma/add.prisma` | ADD 治理模型（DevOperation + AuditLog），init 时复制到用户 `prisma/` 目录 |

**同步动作**：
- 创建 `src/adapters/{claude,qoder,vscode}/` 目录，各含 `renderer.ts`
- 定义 Adapter 接口：`render(config: AddCoderConfig, targetDir: string, dryRun: boolean): Map<string, string>`
- 从 qoder adapter 的 hooks 中提取与 Claude 共享的逻辑到 `templates/adapters/claude/hooks/`
- 旧 `templates/` 目录整体删除（迁移完成后）

**验收**：新目录结构符合 §3.2，`find templates/ -name "*.ts" | wc -l` 返回 0（模板内容不含 TS 源码）

### 第3轮：适配器实现

#### Task 0: Claude 适配器实现

**范围**：`templates/adapters/claude/` + `src/adapters/claude/renderer.ts`

- 创建 `templates/adapters/claude/settings.json` 模板（hook 配置，matcher 用标准工具名 `Write`, `Edit`, `Bash`）
- 创建 `templates/adapters/claude/mcp.json` 模板
- Hook 脚本：从 qoder adapter 迁移，**保留** SessionStart、UserPromptSubmit、PermissionRequest（经官方文档确认，Claude Code 27 个事件均原生支持），通过 matcher 工具名映射适配 Claude 标准工具名
- 共享 `templates/adapters/qoder/hooks/` 中的核心逻辑，Claude adapter 只做薄薄的工具名映射层
- 实现 `src/adapters/claude/renderer.ts`：读取 `templates/adapters/claude/`，生成 Claude 格式的 hook 配置

**验收**：`npx add-coder init --adapter claude` 生成正确的 `.claude/` 目录

#### Task 1: Qoder 适配器实现

**范围**：`templates/adapters/qoder/` + `src/adapters/qoder/renderer.ts`

- 从现有 `templates/.qoder/` 迁移到 `templates/adapters/qoder/`，清理 hardcode
- `settings.json` 的 matcher 适配：`Write|write_to_file|create_file|CreateFile` 等双套工具名
- 保留 Qoder 专有事件：`SessionStart`, `UserPromptSubmit`, `PermissionRequest`
- 实现 `src/adapters/qoder/renderer.ts`

**验收**：`npx add-coder init --adapter qoder` 生成正确的 `.qoder/` 目录

#### Task 2: VS Code 适配器实现

**范围**：`templates/adapters/vscode/` + `src/adapters/vscode/renderer.ts`

- 从现有 `templates/.vscode/` 迁移到 `templates/adapters/vscode/`
- 补充 `tasks.json` 的 hook 模拟（文件保存时触发检查等）
- 在生成的 README 中诚实声明 VS Code 的能力边界
- 实现 `src/adapters/vscode/renderer.ts`

**验收**：`npx add-coder init --adapter vscode` 生成正确的 `.vscode/` 目录

### 第4轮：配置 + CLI

#### Task 0: 配置系统

**范围**：`src/config/`

- `schema.ts`：Zod schema 定义 `AddCoderConfig`
- `defaults.ts`：合理默认值
- 支持配置项：
  - `projectName`, `sourceDir`, `docsDir`, `logDir`
  - `dbUrl`（可选）
  - `mcpServerCommand`（默认 `tsx`）
  - `adapters`：选择启用哪些适配器
  - `overrides`：覆盖任意模板文件内容

**验收**：`add-coder.config.ts` 的类型提示完整，无效配置在 Zod 校验时报错

#### Task 1: CLI 重写

**范围**：`src/cli/`, `bin/add-coder.js`

- 用 TypeScript + `commander` 重写 CLI（选 commander 理由：更轻量，ESM 支持更好，ADD 模板场景不需要 yargs 的复杂参数解析能力）
- 命令：
  - `init [--adapter claude|qoder|vscode|auto] [--config <path>] [--yes] [--dry-run]` — 初始化
  - `sync` — 增量同步缺失文件
  - `status` — 检查完整性
- `src/cli/detect.ts`：检测当前 IDE 环境
- `src/cli/config-loader.ts`：加载 `add-coder.config.ts`，Zod 校验，按优先级链合并配置（交互式 > 配置文件 > 自动检测 > 默认值）
- `src/cli/writer.ts`：智能写入（合并已有配置、diff 展示、交互确认）
- `src/cli/prisma-injector.ts`：Prisma 模型注入 + 迁移执行（依赖第1轮的 add.prisma）
- `bin/add-coder.js` 改为加载 `dist/cli/index.js`
- 配置 `tsup` 构建：`tsup.config.ts`

**验收**：`npx add-coder init` 在空白项目中成功生成完整 ADD 模板

### 第5轮：测试 + 发布

#### Task 0: 集成测试 + 文档 + devlog

- 单元测试：`renderer.ts`, `config-loader.ts`, `detect.ts`, `writer.ts`
- 集成测试：在临时目录中执行 `init` → 验证生成的文件结构
- 更新 `README.md`：完整使用文档
- 更新 `package.json`：`"private": false`，`"files"` 字段，`"bin"` 字段
- 调用 MCP `record_dev_operation` 落库 ADD 开发日志到 DevOperation 表（`planKeyword` 关联本 Plan，Step 8 验收后强制项）

### 第6轮：裁决层

#### Task 0: CaijueHub 核心（转录引擎）

**范围**：`src/caijuehub/` + `templates/core/caijue/`

- 依赖 `smol-toml`（~2KB，零依赖，纯 ESM，npm 下载量第一）
- 创建 `src/caijuehub/caijue.toml`：内置默认裁决（§3.5.2 结构）
- 创建 `src/caijuehub/caijue.ts`：TOML 读取 + deep merge + 审计
- 创建 `src/caijuehub/transcribe.ts`：转录引擎——遍历 caijue.toml 规则，生成 TypeScript 策略文件
  - `[detect]` → `strategies/detect.strategy.ts`
  - `[prisma]` → `strategies/prisma.strategy.ts`
  - `[writer]` → `strategies/writer.strategy.ts`
  - 每个策略文件含 `GENERATED` 区块（autogen）和 `USER CODE` 区块（手写保留）
- 创建 `templates/core/caijue/caijue.toml`：用户可覆盖的模板
- 新增 CLI 命令：`add-coder generate`，集成到 `tsup` build 前

#### Task 1: 重构现有模块读 caijue

**范围**：`detect.ts`、`config-loader.ts`、`prisma-injector.ts`、`writer.ts`、`init.ts`

- `detect.ts`：IDE 检测优先级从 `[detect]` 段读取，不再硬编码
- `config-loader.ts`：配置加载优先级链从 `[config]` 段读取
- `prisma-injector.ts`：阻断/交互行为从 `[prisma]` 段读取
- `writer.ts`：写入模式从 `[writer]` 段读取
- `init.ts`：adapter 选择从 `[adapters]` 段读取

**验收**：修改 `caijue.toml` 中 `[detect].priority` 顺序后，IDE 检测行为随之改变

---

### 4.8 审计维度、收敛标准、回流机制、闭环验证

**审计维度**（Step 8 验收时逐项验证）：

| 维度 | 验证方式 | 收敛标准 |
|------|---------|---------|
| 模板参数化完整性 | `grep -r "farm.agent\|farm_secure_pass\|大田精准" dist/` 返回空 | 0 条硬编码残留 |
| 模板无兜底值反模式 | `grep -r "process.env.*||" dist/` 返回空 | 0 条基建变量兜底 |
| 适配器兼容性 | `npx add-coder init --adapter claude\|qoder\|vscode` 三端通过 | 3/3 通过 |
| CLI 可用性 | 空白项目中 `npx add-coder init` 端到端通过 | 完整 ADD 模板生成 |
| TypeScript 编译 | `tsc --noEmit` 通过 | 0 errors |
| 集成测试 | 9 个 Task 对应测试全部通过 | 9/9 通过 |
| Prisma 数据库迁移 | 空白 Prisma 项目中 `prisma migrate dev --schema=prisma/` 成功创建 DevOperation + AuditLog 表 | 2 表创建成功 |
| Prisma 模型幂等 | 重复执行 `prisma migrate dev` 不报错 | 0 errors |
| CaijueHub 裁决可配置 | 修改 `caijue.toml` 后 IDE 检测/Prisma 注入/Writer 模式行为随之改变 | 3/3 裁决点可配置 |

**收敛标准**：
- `grep -r "farm.agent\|大田" dist/` 返回空
- `grep -r "process.env.*||" dist/` 返回空（基建变量无兜底值）
- `tsc --noEmit` 通过
- 集成测试全部通过
- `npm pack` 产出的 tarball 不包含 `src/`，只包含 `dist/` + `bin/` + `templates/`

**回流机制**：
- Review 发现的 P0/P1 问题回写至 Plan 对应章节
  - Review v2 P0-1（spawnSync catch 失能）：已在 Task 0 补充验收项
  - Review v2 P0-2（ask 重复定义）：已记录至 Task 1（CaijueHub 重构时一并提取到 utils）
  - Review v2 P1-1/2/3（unlinkSync 缺口、gitignore）：已记录至 CI 基建清单
- 回流完成后方可进入 Step 1 实施
- P2 问题在 Step 3 实施前解决或记录为 Known Issue

**闭环验证**：
- `npm pack` + `npx add-coder init` 在空白项目中端到端验证
- 三个适配器（claude/qoder/vscode）分别验证
- 验证已有配置合并行为（不覆盖用户 settings.json）
- 验证 Prisma 迁移幂等（重复 `init` 不报错）
- 验证 `prisma/add.prisma` 正确注入用户项目（`prisma migrate dev --schema=prisma/` 成功）

---

## 五、验收标准

- [ ] `npx add-coder init` 在空白项目中零配置生成完整 ADD 模板
- [ ] `npx add-coder init --adapter claude` 生成 `.claude/` 目录
- [ ] `npx add-coder init --adapter qoder` 生成 `.qoder/` 目录
- [ ] `npx add-coder init --adapter vscode` 生成 `.vscode/` 目录
- [ ] 模板中无 farm-agent 硬编码（`grep -r "farm.agent\|大田" dist/` 返回空）
- [ ] `add-coder.config.ts` 可覆盖项目名、源码目录、日志目录等
- [ ] 已有 `.qoder/settings.json` 时 `init` 不覆盖，展示 diff 并交互确认
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm pack` 产出的 tarball 包含 `dist/` + `templates/` + `bin/`，不包含 `src/`
- [ ] `package.json` 中 `"private": false`
- [ ] `prisma/add.prisma` 通过 `prisma migrate dev --schema=prisma/` 成功创建 DevOperation + AuditLog 表
- [ ] 重复执行 `add-coder init` 时 Prisma 迁移幂等（不报错）
- [ ] 项目无 User 模型时 `init` 报错提示（而非静默失败）
- [ ] `caijue.toml` 可覆盖 IDE 检测优先级、Prisma 注入行为、Writer 写入模式
- [ ] 修改 `caijue.toml` 后重新 `init`，行为随之改变

---

## 六、关联文档

| 文档 | 路径 | 状态 |
|------|------|:--:|
| ADD Route | `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-add-route-v1.md` | ✅ |
| Handoff | `.qoder/plans/2026-07/08/farm-agent-add-coder-npm-package-handoff-v1.md` | ✅ |
| Review | `.qoder/reviews/farm-agent-add-coder-npm-package-review-v1.md` | ✅ |
| Spec | `.qoder/specs/farm-agent-add-coder-npm-package/spec.md` | ✅ |
| Tasks | `.qoder/specs/farm-agent-add-coder-npm-package/tasks.md` | ✅ |
| Checklist | `.qoder/specs/farm-agent-add-coder-npm-package/checklist.md` | ✅ |