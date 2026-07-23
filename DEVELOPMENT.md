# add-coder 开发指南

> 给 add-coder 贡献者的开发手册 — 目录结构、sync 机制、init 流程、唯一真源原则。

📦 **用户使用文档** → [README.md](./README.md) | **实践指南** → [GUIDE.md](./GUIDE.md)

---

## 目录

- [一、核心概念：两个 sync](#一核心概念两个-sync)
- [二、目录结构全景](#二目录结构全景)
- [三、唯一真源原则](#三唯一真源原则)
- [四、sync 映射关系](#四sync-映射关系)
- [五、数据流转](#五数据流转)
- [六、init 流程剖析](#六init-流程剖析)
- [七、多 adapter hooks 差异化](#七多-adapter-hooks-差异化)
- [八、常见开发场景](#八常见开发场景)
- [九、鸡生蛋蛋生鸡：自举的时间边界](#九鸡生蛋蛋生鸡自举的时间边界)

---

## 一、核心概念：两个 sync

add-coder 有两个名字相同但用途完全不同的 `sync`：

| | `npm run sync`（自举） | `add-coder sync`（CLI） |
|---|---|---|
| **谁用** | add-coder 开发者 | 终端用户 |
| **做什么** | 将 `templates/` 源同步到运行时 magic 目录 | 给用户项目补全缺失的模板文件 |
| **入口** | `bash scripts/sync-magic-dirs.sh` | `npx add-coder sync` |
| **方向** | 源 → 目标（覆盖） | core → 用户项目（只补缺） |
| **触发** | 修改 templates/ 后手动执行 | 用户发现文件缺失时 |

> 本文档聚焦 **`npm run sync`（自举同步）**。用户侧 `add-coder sync` 的说明见 [README.md#命令](./README.md#命令)。

---

## 二、目录结构全景

```
add-coder/
├── templates/                     ← ★ 唯一真源（所有产出的根）
│   ├── core/                      ← 跨 IDE 共享核心（77 个文件）
│   │   ├── hooks/                 ←   通用 hooks 脚本（15 文件 + lib/）
│   │   │   └── lib/               ←     hooks 共享库（7 文件）
│   │   ├── templates/             ←   文档模板（36 文件含 schema）
│   │   ├── agents/                ←   子代理模板
│   │   ├── skills/                ←   SKILL 定义
│   │   ├── scripts/               ←   db-ensure.sh 等基础设施脚本
│   │   ├── plans/specs/reports/   ←   Plan/Spec/Report 模板
│   │   ├── docs/                  ←   知识库模板（01-架构 等）
│   │   ├── rules/                 ←   治理规则模板
│   │   ├── vocabulary/            ←   触发词语汇表
│   │   ├── tools/                 ←   MCP 工具定义
│   │   └── prisma/                ←   Prisma schema 片段
│   └── adapters/                  ← 各 IDE 专属适配层
│       ├── claude/hooks/          ←   Claude Code hooks（17 文件，无 lib/）
│       ├── qoder/hooks/           ←   Qoder hooks（15 文件 + lib/）
│       ├── vscode/hooks/          ←   VS Code hooks（11 文件，无 lib/）
│       ├── trae/hooks/            ←   Trae hooks（从 core 派生，15 文件 + lib/）
│       └── codex/hooks/           ←   Codex hooks（从 core 派生，15 文件 + lib/）
│
├── .add/                          ← 运行时：ADD 共享核心（从 core 同步）
│   ├── hooks/                     ←   从 core/hooks/ 同步（含 lib/）
│   ├── templates/                 ←   从 core/templates/ 同步
│   ├── plans/ specs/ reports/     ←   运行时产出，不同步
│   └── ...
│
├── .claude/                       ← 运行时：Claude Code 适配（从 adapters/claude 同步）
│   ├── hooks/                     ←   从 adapters/claude/hooks/ 同步（含 adapter 特有文件）
│   ├── templates/                 ←   从 core/templates/ 同步
│   └── settings.json              ←   IDE 配置，不同步
│
├── .qoder/                        ← 运行时：Qoder 适配（从 adapters/qoder 同步）
│   ├── hooks/                     ←   从 adapters/qoder/hooks/ 同步（含 lib/）
│   ├── templates/                 ←   从 core/templates/ 同步
│   ├── mcp.json                   ←   MCP 配置，不同步
│   └── settings.json              ←   IDE 配置，不同步
│
├── .vscode/                       ← 运行时：VS Code 适配（从 adapters/vscode 同步）
│   ├── hooks/                     ←   从 adapters/vscode/hooks/ 同步
│   └── templates/                 ←   从 core/templates/ 同步
│
├── scripts/
│   └── sync-magic-dirs.sh         ← ★ 自举同步脚本
│
├── src/                           ← TypeScript 源码
│   ├── cli/commands/              ←   init / sync / status CLI 命令
│   ├── core/renderer.ts           ←   核心模板渲染引擎
│   ├── adapters/                  ←   各 IDE 适配器渲染器
│   └── caijuehub/                 ←   裁决引擎
│
└── package.json                   ← "sync": "bash scripts/sync-magic-dirs.sh"
```

---

## 三、唯一真源原则

add-coder 遵循 **单一真源（Single Source of Truth）** 原则：

> 任何文件的「正确答案」只存在于一个地方。其他位置都是它的同步副本。

### 真源划分

```
┌─────────────────────────────────────────────────────────┐
│                    templates/ （唯一真源）                │
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  core/               │  │  adapters/               │ │
│  │  （跨 IDE 共享真源）   │  │  （IDE 专属真源）         │ │
│  │                      │  │                          │ │
│  │  hooks/  templates/  │  │  claude/hooks/           │ │
│  │  agents/ skills/     │  │  qoder/hooks/            │ │
│  │  plans/  scripts/    │  │  vscode/hooks/           │ │
│  │  ...                 │  │  （codex/trae 无真源，    │ │
│  │                      │  │   从 core 派生）          │ │
│  └──────────┬───────────┘  └────────────┬─────────────┘ │
└─────────────┼───────────────────────────┼───────────────┘
              │                           │
              │  npm run sync             │  npm run sync
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  运行时 magic 目录        │  │  运行时 magic 目录        │
│  .add/hooks/             │  │  .claude/hooks/          │
│  .add/templates/         │  │  .qoder/hooks/           │
│  codex/hooks/            │  │  .vscode/hooks/          │
│  trae/hooks/             │  │  各 dir templates/       │
└──────────────────────────┘  └──────────────────────────┘
```

### 关键规则

| 规则 | 说明 |
|------|------|
| **改真源，别改副本** | 永远修改 `templates/` 下的文件，不要直接改 `.add/` `.claude/` 等 |
| **改完就跑 sync** | 修改真源后立即 `npm run sync`，确保所有副本对齐 |
| **adapter 特有文件只在真源** | 如 claude 的 `permission-denied.sh`，只存在于 `templates/adapters/claude/hooks/` |
| **templates 全局共享** | 所有文档模板只有一个真源 `templates/core/templates/` |

---

## 四、sync 映射关系

`npm run sync` 执行 7 对源→目标同步：

```
源（唯一真源）                          目标（运行时副本）
══════════════════════════════════    ══════════════════════════════════

① templates/adapters/claude/hooks/ → .claude/hooks/
    含 adapter 特有文件:
      permission-denied.sh           ← Claude 独有权限拒绝钩子
      stop-failure.sh                ← Claude 独有停止失败钩子

② templates/adapters/qoder/hooks/  → .qoder/hooks/
    含 lib/ 目录（state-detect / vocabulary / context-inject 等）

③ templates/adapters/vscode/hooks/ → .vscode/hooks/
    11 个文件，无 lib/、无 doc-format-guard

④ templates/core/hooks/            → .add/hooks/
    .add 无自有 hooks，完全从 core 派生

⑤ templates/core/templates/        → .add/templates/
                                    → .claude/templates/
                                    → .qoder/templates/
                                    → .vscode/templates/
    36 个模板文件 + schema，4 个 magic 目录完全一致

⑥ templates/core/hooks/            → templates/adapters/codex/hooks/
    codex 无自有 hooks，从 core 派生

⑦ templates/core/hooks/            → templates/adapters/trae/hooks/
    trae 无自有 hooks，从 core 派生
```

### 同步策略

| 特性 | 实现 |
|------|------|
| **同步方式** | `rsync -av --delete` → **烘焙（bake）**：将模板中的动态变量替换为确定性硬编码值 |
| **烘焙内容** | 将 `MAGIC_DIR="$(basename ...)"` 动态检测替换为 `MAGIC_DIR=".add"` 等具体值；修复 grep 单引号导致 `$MAGIC_DIR` 不展开的 bug |
| **备份机制** | 同步前自动备份到 `.backup/YYYYMMDD_HHMMSS/` |
| **排除项** | `.gitkeep`、`.DS_Store`、`debug-dump/`、`*.log` |
| **安全保护** | adapter 特有文件（如 claude 的 permission-denied.sh）不会丢失，因为它们存在于源中 |

---

## 五、数据流转

### 5.1 开发修改 hooks

```
修改 templates/adapters/qoder/hooks/pre-tool-use.sh
        │
        ▼
    npm run sync
        │
        ├─→ .qoder/hooks/pre-tool-use.sh      自动对齐
        │
        ▼
    重启 Qoder IDE → hook 生效
```

### 5.2 开发修改 templates

```
修改 templates/core/templates/simple-plan-template.schema.json
        │
        ▼
    npm run sync
        │
        ├─→ .add/templates/simple-plan-template.schema.json
        ├─→ .claude/templates/simple-plan-template.schema.json
        ├─→ .qoder/templates/simple-plan-template.schema.json
        └─→ .vscode/templates/simple-plan-template.schema.json
```

### 5.3 新增 lib 文件到 core

```
新建 templates/core/hooks/lib/new-util.sh
        │
        ▼
    npm run sync
        │
        ├─→ .add/hooks/lib/new-util.sh          ✅
        ├─→ templates/adapters/codex/hooks/lib/  ✅
        └─→ templates/adapters/trae/hooks/lib/   ✅
```

但 claude / qoder / vscode 这三个 adapter 的 hooks 不在 sync 映射中——
它们各有自己的独立真源（`templates/adapters/{name}/hooks/`），不受 core 变更影响：

| adapter | 是否有 lib/ | sync 覆盖 | 如需要新 lib 文件 |
|---------|:----------:|:--------:|------------------|
| .add / codex / trae | ✅（来自 core） | ✅ 自动 | 无需操作 |
| qoder | ✅（独立维护） | ❌ | 手动复制到 `templates/adapters/qoder/hooks/lib/` |
| claude / vscode | ❌ 无 lib | ❌ | 先确认是否需要（当前不需要） |

> **一句话**：core 的 lib 只自动同步到 .add / codex / trae。qoder 虽有 lib 但独立维护。claude/vscode 压根没 lib。

### 5.4 回流 adapter 增强到 core

```
qoder 的 pre-tool-use.sh 新增了 §A Bash 裸写保护
        │
        ▼
    手动合并到 templates/core/hooks/pre-tool-use.sh
        │
        ▼
    npm run sync
        │
        ├─→ .add/hooks/pre-tool-use.sh          ✅
        ├─→ codex/hooks/pre-tool-use.sh          ✅
        └─→ trae/hooks/pre-tool-use.sh           ✅
        
⚠️  claude/vscode 的 hooks/ 不受影响 — 它们需要手动合并
```

---

## 六、init 流程剖析

`npx add-coder init` 是用户侧入口，内部 7 个阶段：

```
┌──────────────────────────────────────────────────────────────────┐
│                     npx add-coder init [--adapter qoder]         │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
  ① IDE 检测
     ├─ 扫描 .qoder/ .claude/ .vscode/ 存在性
     └─ 或通过 --adapter 手动指定 → 映射到 MAGIC_DIR_MAP
        │
        ▼
  ② 加载配置
     ├─ 交互式问答（数据库引擎/容器/凭据）
     └─ > add-coder.config.ts > 自动检测 > 默认值
        │
        ▼
  ③ 步骤 A：写 compose / env
     ├─ 生成 podman-compose.add.yml（PG 部署）
     └─ 凭据写入 .env.development
        │
        ▼
  ④ 步骤 B：模板渲染 + 写入
     ├─ renderCore() → 77 个 core 文件
     │   └─ 写入 .add/ + target magic dir（如 .qoder/）
     ├─ renderAdapter() → IDE 专属 hooks/mcp/settings
     │   └─ 如 qoder: .qoder/hooks/*.sh + mcp.json + settings.json
     └─ writeFiles() → 交互/yes/force/dry-run 四种模式
        │
        ▼
  ⑤ 步骤 C：数据库部署
     ├─ bash db-ensure.sh postgresql podman --migrate
     └─ injectPrisma() → Prisma init → AddUser 模型 → db push → generate
        │
        ▼
  ⑥ 步骤 D：文档落地
     └─ core/templates/01-架构/ → docs/{project}/knowledge/01-架构/
        │
        ▼
  ⑦ 步骤 E：摘要 + 依赖安装
     ├─ 新建/跳过/覆盖 统计
     └─ 安装 peerDependencies
```

### 关键：init 如何利用 templates/

init 本质上是 **从 templates/ 渲染到用户项目** 的过程：

```
templates/core/                      用户项目/
──────────────────────────────      ──────────────────────────
hooks/                    →          .add/hooks/ + .qoder/hooks/
templates/                →          .add/templates/ + .qoder/templates/
skills/                   →          .add/skills/ + .qoder/skills/
agents/ scripts/ ...      →          .add/... + .qoder/...

templates/adapters/qoder/ →          .qoder/mcp.json
                           →          .qoder/settings.json
```

---

## 七、多 adapter hooks 差异化

不同 IDE 的 hooks 能力不同，因此 hooks 集也不同：

| Hook 文件 | core | claude | qoder | vscode | codex | trae |
|-----------|:----:|:------:|:-----:|:------:|:-----:|:----:|
| `doc-format-guard.sh` | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `pre-tool-use.sh` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `prompt-submit.sh` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `permission-gate.sh` | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `permission-denied.sh` | — | ✅ | — | — | — | — |
| `stop-failure.sh` | — | ✅ | — | — | — | — |
| `review-checklist.sh` | ✅ 343B | ✅ 343B | ✅ 7147B | — | ✅ 343B | ✅ 343B |
| `lib/` 目录 | ✅ 7 文件 | — | ✅ 7 文件 | — | ✅ 7 文件 | ✅ 7 文件 |

> **规则**：claude/qoder/vscode 的 hooks 独立维护在 `templates/adapters/{name}/hooks/`。codex/trae 没有独立 hooks，运行时从 core 派生。

---

## 八、常见开发场景

### 场景 1：修复一个 hook bug（影响所有 IDE）

```bash
# 1. 修改 core 真源
vim templates/core/hooks/doc-format-guard.sh

# 2. 同步到 .add + codex + trae
npm run sync

# 3. 手动合并到各 adapter（它们的 hooks 是独立维护的）
vim templates/adapters/claude/hooks/doc-format-guard.sh
vim templates/adapters/qoder/hooks/doc-format-guard.sh
# vscode 无此 hook，跳过

# 4. 再次同步
npm run sync
```

### 场景 2：新增一个文档模板

```bash
# 1. 在 core 真源创建模板
vim templates/core/templates/my-new-template.md

# 2. 同步到所有 magic 目录
npm run sync

# → my-new-template.md 自动出现在 4 个 magic dir 的 templates/ 中
```

### 场景 3：修改 schema 的 forbidden_terms

```bash
# 1. 修改真源
vim templates/core/templates/simple-plan-template.schema.json

# 2. 同步
npm run sync

# 3. 验证各目录一致
diff templates/core/templates/simple-plan-template.schema.json \
     .qoder/templates/simple-plan-template.schema.json
```

### 场景 4：回滚误同步

```bash
# 同步前自动备份到 .backup/，可按时间戳恢复
cp -r .backup/20260723_073802/hooks/* .qoder/hooks/
```

---

## 九、鸡生蛋蛋生鸡：自举的时间边界

### 9.1 问题本质

add-coder 的核心矛盾：

> **add-coder 的 hooks 保护 add-coder 自己的开发，但 hooks 本身又是 add-coder 的产出。**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   templates/core/hooks/pre-tool-use.sh              │
│          │                                          │
│          │  npm run sync                            │
│          ▼                                          │
│   .qoder/hooks/pre-tool-use.sh                      │
│          │                                          │
│          │  Qoder IDE 加载                          │
│          ▼                                          │
│   拦截开发者对 src/*.ts 的裸写操作                    │
│   （但这个 hook 本身也是 src/*.ts 的产物！）           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

hooks 脚本是 bash，不依赖 TypeScript 编译——这是关键。hooks 可以独立于 CLI 运行，所以"鸡"（hooks）可以先于"蛋"（CLI）存在。

### 9.2 生命周期四个轮次

```
① 手工创世                           ② 首次发布
┌──────────────────┐                 ┌──────────────────┐
│ 手写 templates/   │                 │ npm publish       │
│ 手写 src/         │                 │ npx add-coder init│
│ 手动创建 magic dirs│ ──── build ──▶ │ 对用户可用         │
│ 无 hooks 保护     │                 │ 自身仍手工维护     │
└──────────────────┘                 └────────┬─────────┘
                                              │
                                              │ git clone 到新机器
                                              ▼
③ hooks 上岗                          ④ 半自举（当前）
┌──────────────────┐                 ┌──────────────────┐
│ magic dirs 在 git │                 │ npm run sync      │
│ clone 即带 hooks  │ ──── sync ────▶│ 改 templates/     │
│ 配好 IDE 后生效   │                 │ → sync 到各 magic  │
│ 开始保护自身开发   │                 │ → IDE 自动加载     │
└──────────────────┘                 └──────────────────┘
```

### 9.3 每个轮次的"谁生谁"

| 轮次 | 谁生谁 | hooks 从哪来 | 何时可用 |
|------|--------|-------------|---------|
| **手工创世** | 人 → templates/ | 手写 | 写完就可用 |
| **首次发布** | templates/ → npm 包 | npm 包内含 templates/ | `npm install` 后 |
| **hooks 上岗** | git 仓库 → magic dirs | git clone 自带 | clone 完就可用 |
| **半自举** | templates/ → sync → magic dirs | 改 templates/ 后 `npm run sync` | sync 完 + 重启 IDE |

### 9.4 关键时间边界

#### 边界 A：clone 后到第一次 sync 前

```bash
git clone add-coder
cd add-coder
# 此时 .qoder/hooks/ 已存在（git 跟踪），hooks 立即可用
# 不需要 npx add-coder init（那会覆盖开发中的文件）
npm install
npm run sync   # 确保 magic dirs 和 templates/ 对齐
```

> **magic dirs 在 git 中，不在 .gitignore 中。这是有意为之——保证 clone 即用。**

#### 边界 B：修改 templates/ 后到 sync 前

```
修改 templates/core/hooks/doc-format-guard.sh
        │
        │  ⚠️ 间隙窗口：真源已改，副本未跟上
        │     IDE 仍在用旧 hook，直到 sync + 重启
        │
        ▼
    npm run sync          ← 关闭间隙
        │
        ▼
    重启 IDE → 新 hook 生效
```

#### 边界 C：改 src/ 后到 build 前

```
修改 src/cli/commands/init.ts
        │
        │  hooks 仍用旧逻辑（bash hooks 不依赖 TS build）
        │  CLI 命令用旧逻辑（node_modules/.bin/add-coder 是旧版本）
        │
        ▼
    npm run build          ← 新 CLI 生效
        │
        ▼
    npx add-coder init --dry-run  ← 验证新逻辑
```

### 9.5 为什么不做"完全自举"

理论上可以：`npx add-coder init --self`，用 add-coder 自己的 `init` 命令生成自己的 magic dirs。但这存在三个风险：

| 风险 | 说明 |
|------|------|
| **死亡螺旋** | 如果 init 有 bug → 生成的 hooks 有 bug → hooks 拦截所有修复操作 → 无法修复 init |
| **循环依赖** | init 需要 templates/ → templates/ 的真源又在 git 中 → 那 init 生成的意义是什么？只是"测试自己" |
| **CI 复杂性** | init 需要数据库、交互问答——不适合 CI 自动化 |

当前的 **半自举** 是更务实的选择：

```
templates/（手写真源，永不出 bug 死锁）
    │
    │  npm run sync（纯 bash，不依赖 CLI）
    ▼
magic dirs（git 跟踪，clone 即用）
    │
    │  IDE 加载
    ▼
hooks 保护 add-coder 自身开发 ← 闭环达成
```

### 9.6 什么时候应该用 init 验证自己

`init --self` 不适合日常开发，但适合以下场景：

```bash
# 场景 1：发布前验证 — 确保 init 产出和 git 中的 magic dirs 一致
npm run build
npx add-coder init --adapter qoder --dry-run
# 如果 dry-run 显示"覆盖"或"新建"，说明 init 逻辑和 templates/ 脱节

# 场景 2：新贡献者 bootstrap（如果 magic dirs 被 .gitignore 了）
# 但当前 magic dirs 在 git 中，不需要这一步

# 场景 3：测试 init 命令本身的行为
npx add-coder init --adapter claude --force --dry-run
```

### 9.7 决策矩阵：什么操作走什么路径

| 你要做什么 | 走这条路径 | 为什么 |
|-----------|-----------|------|
| 改一个 hook 逻辑 | 改 `templates/` → `npm run sync` | hooks 是 bash，不依赖 build |
| 改 init 渲染逻辑 | 改 `src/` → `npm run build` → dry-run 验证 | 需要 TypeScript 编译 |
| 新增文档模板 | 改 `templates/core/templates/` → `npm run sync` | 模板是纯文本，不依赖 build |
| 新 clone 仓库 | `npm install && npm run sync` | 不需要 init |
| 验证 init 正确性 | `npm run build && npx add-coder init --dry-run` | 测试 init 产出是否和 git 一致 |
| 发布到 npm | `npm run sync && npm run build && npm publish` | 确保 templates/ 和 magic dirs 对齐 |

---

## 关联文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 用户文档：快速开始、命令、架构全景 |
| [GUIDE.md](./GUIDE.md) | 实践指南：从零上手 ADD 工作流 |
| [scripts/sync-magic-dirs.sh](./scripts/sync-magic-dirs.sh) | 自举同步脚本 |
| [.qoder/plans/.../add-coder-selfhost-sync-plan-v1.md](./.qoder/plans/2026-07/23/add-coder-selfhost-sync-plan-v1.md) | 同步方案 Plan |
| [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md) | Qoder 治理文档（hooks 覆盖说明） |
