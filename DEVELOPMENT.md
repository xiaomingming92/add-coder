# add-coder 开发指南

> 给 add-coder 贡献者的开发手册 — 目录结构、sync 机制、init 流程、唯一真源原则。

📦 **用户使用文档** → [README.md](./README.md) | **实践指南** → [GUIDE.md](./GUIDE.md) | **能力清单&调试** → [docs/capabilities-and-debugging.md](./docs/capabilities-and-debugging.md) | **交互规范** → [docs/interaction-spec.md](./docs/interaction-spec.md) | **集中裁决层** → [docs/caijuehub.md](./docs/caijuehub.md)

---

## 目录

- [一、核心概念：两个 sync](#一核心概念两个-sync)
- [二、目录结构全景](#二目录结构全景)
- [三、唯一真源原则](#三唯一真源原则)
- [四、sync 映射关系](#四sync-映射关系)
- [五、数据流转](#五数据流转)
- [六、init 流程剖析](#六init-流程剖析)
- [七、多 adapter hooks 差异化](#七多-adapter-hooks-差异化)
- [八、sync --patch 热更新原理](#八sync---patch-热更新原理)
- [九、数据库同步机制（Atlas 版本化 + 统一端口分配器）](#九数据库同步机制atlas-版本化--统一端口分配器)
  - [9.1 两条链路的引擎分工](#91-两条链路的引擎分工)
  - [9.2 自身同步流程（db-ensure.sh）](#92-自身同步流程db-ensuresh)
  - [9.3 关键约束（真实环境验证）](#93-关键约束真实环境验证)
  - [9.4 宿主脚本合入指南（三步法）](#94-宿主脚本合入指南三步法避免痛苦)
  - [9.5 宿主业务表 diff 推荐做法](#95-宿主业务表-diff-推荐做法推荐-atlas不强求)
- [十、端口契约联动](#十端口契约联动)
  - [10.1 真源与同步](#101-真源与同步)
  - [10.2 生成行为契约](#102-生成行为契约)
  - [10.3 统一端口分配器（契约表 = 分配引擎）](#103-统一端口分配器契约表--分配引擎)
  - [10.4 跨项目关系](#104-跨项目关系)
- [十一、本地联调（file: 协议，替代 pnpm link）](#十一本地联调file-协议替代-pnpm-link)
- [十二、常见开发场景](#十二常见开发场景)
- [十三、鸡生蛋蛋生鸡：自举的时间边界](#十三鸡生蛋蛋生鸡自举的时间边界)
- [十四、依赖治理坑位记录](#十四依赖治理坑位记录)
- [十五、多 IDE 并发契约联动](#十五多-ide-并发契约联动)
  - [15.1 数据库生命周期拆分](#151-数据库生命周期拆分)
  - [15.2 连接模型与并发兜底](#152-连接模型与并发兜底)
  - [15.3 与协作层契约的关系](#153-与协作层契约的关系)
- [关联文档](#关联文档)

---

## 一、核心概念：两个 sync

add-coder 有两个名字相同但用途完全不同的 `sync`：

| | `npm run sync`（自举） | `add-coder sync`（CLI） |
|---|---|---|
| **谁用** | add-coder 开发者 | 终端用户 |
| **做什么** | 将 `templates/` 源同步到运行时 magic 目录 | ① 给用户项目补全缺失的模板文件 ② **Atlas 能力承诺**（检测/自动安装/降级文档）③ **宿主 db-ensure.sh 段检测**（缺 Atlas 段 → 提示三步合入）④ Prisma schema 差异检测（patch 状态机，尊重本地适配） |
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
│   │   ├── templates/             ←   文档模板（37 文件含 schema）
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
     └─ injectPrisma() → 分库引导（独立 ADD 库？统一分配器登记）
        → Prisma init → AddUser 模型 → patch 状态机（冲突/缺失/一致三态裁决）
        → Atlas 引擎（声明式 diff/apply：分库天然隔离 / 共库动态 exclude 非 ADD 表）
        → generate
        │
        ▼
  ⑥ 步骤 D：文档落地
     ├─ core/templates/01-架构/ → docs/{project}/knowledge/01-架构/
     └─ 端口契约检查（deployDocs 前）→ docs/ports.md 缺失则生成（见 §十）
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

## 八、sync --patch 热更新原理

### 8.1 问题

`npm update add-coder` 后，用户项目的模板文件（hooks/agents/skills/templates/vocabulary 等）停留在旧版本。

### 8.2 双 hash 机制

```
build 时（prepare）              用户 init 时                sync --patch 时
───────────────────            ───────────────            ───────────────
gen-src-hash.ts                  init.ts                   sync.ts
  │                               │                          │
  │ 扫描 templates/               │ renderCore+Adapter        │ 读 npm 源 hash
  │ 253 文件 SHA256(8位)           │ → 写文件                  │ 读用户产出 hash
  ▼                               ▼                          ▼
templates/                       .qoder/                    对比：
.add-coder-src-hash.json         .add-coder-hash.json       ┌──────────────┐
  ├─ _version: "0.2.10"           ├─ hooks/doc-format: "a3f" │ same → 跳过  │
  ├─ core/hooks/...: "c8e"        ├─ hooks/pre-tool: "7b1"  │ missing→写入 │
  └─ adapters/qoder/...: "fe3"    └─ ...                     │ conflict→交互│
        │                         └──────────────────────────┘
        │ npm publish
        ▼
    npm 包（templates/ 随包发布）
```

### 8.3 六场景矩阵

| # | 用户 | 源模板 | 判定 | 行为 | caijuehub 驱动 |
|:---:|------|------|------|------|------|
| ① | 没改 | 没变 | same | 跳过 | `on_same: skip` |
| ② | 没改 | 变了 | auto | 静默覆盖 | 版本边界 → baseline |
| ③ | 改了 | 没变 | skip | 不碰 | `on_conflict: skip`（用户选[a]） |
| ④ | 改了 | 变了 | conflict | 交互勾选 | `on_conflict: interactive` |
| ⑤ | — | 不存在 | missing | 静默写入 | `on_missing: write` |
| ⑥ | PATCH_GUARD | — | skip | 永不触碰 | caijuehub `[guard]` |

### 8.4 版本边界保护

`.add-coder-version` 哨兵文件（永不删除）记录安装版本。与 npm 包 `_version` 对比：

| 场景 | 判定 | 行为 |
|------|------|------|
| 无 version 文件 | `isFirstPatch` | 全部写基线（老用户首次升级） |
| version 不同 | `isUpgrade` | 全部写基线（版本升级） |
| version 相同但 hash 丢失 | `hashLost` | 全部进 conflict（保护用户数据） |

### 8.5 caijuehub 规则驱动

所有行为参数定义在 `src/caijuehub/sync-rules.toml`：

```toml
[patch]           # 6 场景 → 3 参数
on_missing = "write"          # ⑤
on_conflict = "interactive"   # ②④
on_same = "skip"              # ①

[version]         # 3 边界 → 3 参数
on_first_patch = "baseline"   # 首次
on_upgrade = "baseline"       # 升级
on_hash_lost = "conflict"     # 丢失
```

改 TOML → `npm run generate` → 策略生效。详见 [docs/caijuehub.md](./docs/caijuehub.md)。

### 8.6 hash 全量基线语义（v0.3.20+，issue #10 P0-2）

`.add-coder-hash.json` 是**完整渲染结果的全量基线**，不是本轮差异快照：

- 保存 = 旧 hash 全量保留 + 本轮处理后磁盘当前内容刷新（`mergeFullHash` 纯函数，`sync.ts`）
- 用户 `[a]` 跳过保留其修改 → hash 记录用户版本 → 下一轮不再误判冲突
- 读取时 key 统一 POSIX（`loadHashFile` 内 normalize，兼容旧 Windows 反斜杠 key）
- 修复前缺陷：只保存 missing+conflict → 300 项缩成 1 项 → 下一轮全量误判冲突

### 8.7 跨平台约束（v0.3.20+，issue #10）

Windows 下渲染路径为反斜杠、npm/npx/git 为 `.cmd`、无 bash/which——以下三条为本仓强制约束（详见 [docs/跨平台兼容开发规范.md](./docs/跨平台兼容开发规范.md)）：

1. 相对路径比较/存储 MUST 先 `normalizeRelPath()`（PATCH_GUARD、stack 筛选、hash key）
2. CLI 子进程 MUST 走 `runCommand()` 单入口（win32 .cmd 解析 + 退出码检查 + ENOENT 显式抛错）
3. env 传递 MUST 用对象（`{ env: {...process.env, ...} }`），禁止 shell 内联（不引入 cross-env）

---

## 九、数据库同步机制（Atlas 版本化 + 统一端口分配器）

> 对应 Plan: `prisma-sync-strategy-migrate`（v2 Atlas 引擎）+ `add-coder-selfhost-atlas`（自身切换）

### 9.1 两条链路的引擎分工

| 链路 | 引擎 | 迁移形态 | dev-url |
|------|------|---------|---------|
| **消费方项目**（init → injectPrisma） | Atlas **声明式**（schema diff/apply） | 空库注入（分库/共库双模式） | 常驻独立空库 `{project}-add-dev` |
| **add-coder 自身**（predev → db:ensure） | Atlas **版本化**（migrate diff/apply） | 独立目录 `prisma/atlas-migrations/` + baseline | 常驻空库（复用 shadow 5437） |

### 9.2 自身同步流程（db-ensure.sh）

```
atlas 探测（node_modules/.bin 优先）→ dev-url 解析（ATLAS_DEV_URL）
→ baseline 哨兵（podman exec 容器内 psql 探测 atlas_schema_revisions）
→ prisma migrate diff --from-empty --to-schema prisma/ --script（sed '/^◇/d' 过滤）
→ atlas migrate diff sync（--exclude atlas_schema_revisions）
→ 有变更 → atlas migrate apply；无 → 幂等出口
→ prisma generate
```

### 9.3 关键约束（真实环境验证）

1. **Prisma 迁移目录与 Atlas 不兼容**：Prisma `{ver}_{name}/migration.sql` 子目录 vs Atlas 扁平 `{ver}_{name}.sql` → **add-coder 自身**用独立 Atlas 目录 + baseline（官方 existing-database 做法）；**消费方走声明式，不接管宿主 `prisma/migrations/`**（宿主迁移历史自管）
2. **atlas 是 npm 依赖**：`@ariga/atlas`（node_modules/.bin），非 brew/curl 全局；pnpm 需在 `pnpm-workspace.yaml` allowBuilds 放行；**消费方三路径探测**（add-coder 包内 → 顶层 .bin → `npx --no-install`，pnpm 不链接传递依赖 bin 到顶层）
3. **URL 格式**：去 `schema=public` + 加 `sslmode=disable`（本地 PG 无 SSL）
4. **dev-url 常驻**：dev-url 本质 = 可重放的独立空库（任意环境），非必须临时容器；自身复用 shadow 5437，消费方 `{project}-add-dev`（init 写入 ATLAS_DEV_URL）
5. **统一端口分配器**：`ports-rules.toml`（start_hint=5433）→ `PORTS_CONFIG`；分配链 = 本地契约表复用 → 跨项目避让 → podman 实扫 → 5433 起扫空闲 → 登记 docs/ports.md；禁止分散扫描
6. **回退单轨**：切换后不再用 migrate dev；回退 = 清理 atlas_schema_revisions + 保留 _prisma_migrations
7. **宿主自管表保护（消费方实测回流）**：共库模式 diff/apply 自动 `--exclude checkpoint*`（langgraph checkpoint 等 schema 外表，2026-08-07 误删事故）；非 ADD 表变更默认拒绝兜底；宿主临时塞入 baseline 的 checkpoint DDL hack 可幂等保留（Atlas 不接管宿主目录，无双轨冲突）
8. **baseline 动态**：迁移数/版本动态扫描目录（ls + 取版本），不写死
9. **宿主日常同步入口**：`bash scripts/db-ensure.sh <engine> <container> --migrate`（模板含 Atlas 声明式段：三路径探测 → dev-url → baseline 同源 → diff/apply → 确认门槛）

### 9.4 宿主脚本合入指南（三步法，避免痛苦）

> 场景：宿主有自己的类似 `scripts/db-ensure.sh`（自定义基础设施脚本），需补上 Atlas 同步段。
> `add-coder sync --patch` 会自动检测缺失并提示（本指南即提示所指文档）。

**第 1 步：复制模板 Atlas 模块段（函数式，7 个单一职责函数）**

```bash
cd <宿主项目>
sed -n '/# ════ Atlas 声明式同步模块/,/^fi$/p' \
  node_modules/add-coder/templates/core/scripts/db-ensure.sh >> scripts/db-ensure.sh
```

**第 2 步：变量适配（对照表，只改模板段内变量）**

| 模板变量 | 宿主常见变量 | 说明 |
|---------|-------------|------|
| `PROJECT_DIR` | `SCRIPT_DIR/..` 或已有根目录变量 | 项目根路径 |
| `DB_URL` | `DATABASE_URL` | 宿主主库连接串（含 `?schema=public`，脚本自动清理） |
| `ADD_DATABASE_URL` | 同左（可选） | 存在→分库模式；不存在→共库模式（自动） |
| `ATLAS_DEV_URL` | 同左 | 常驻 dev 空库（init 自动写入，或复用 shadow 转正） |
| `PROJECT_NAME` | 同左 | 容器名前缀 `{PROJECT_NAME}-postgres` |
| `DATABASE_USER` | `POSTGRES_USER` | psql 用户（动态 exclude 查询用） |
| `ENGINE` | `$1` 或已有引擎变量 | sqlite 跳过 |
| `DO_MIGRATE` | 宿主触发标志 | 无则改为脚本默认执行 |

**第 3 步：放置位置与触发**

- 粘贴到**脚本末尾**（迁移/generate 完成之后，Atlas 同步 ADD 治理模型）
- 触发：`bash scripts/db-ensure.sh <engine> <container> --migrate`（或宿主原有入口）
- 宿主业务 schema 仍走 migrate dev/deploy（不受影响）；Atlas 只管 ADD 治理模型

**常见坑（实测）**

1. `ATLAS_DEV_URL` 未配置 → 脚本提示后退出：配置常驻 dev 空库（`add-coder init` 自动创建 `{project}-add-dev`，或 shadow 转正：清空后复用）
2. dev-url 库不干净 → Atlas 报 `database is not clean`：dev 库必须可重置（清空 schema）
3. `--exclude` 语法：**逗号分隔 + `public.` 前缀精确表名**（glob/无前缀不生效，v1.3.0 实测）——模板已动态构造，勿手写 checkpoint*
4. Atlas 无变更时输出 `Schemas are synced...` 非空 → 模板用 SQL 语句特征判定（勿用空串判断）
5. pnpm 11：`@ariga/atlas` 需 `pnpm-workspace.yaml` allowBuilds 放行
6. 宿主导出脚本 git 提交后，`add-coder sync` 提示消失（检测到 `atlas_sync` 标记）

### 9.5 宿主业务表 diff 推荐做法（推荐 Atlas，不强求）

> **职责边界**：add-coder 的 Atlas 段只同步 **ADD 治理模型（7 表）**；宿主业务表（`schema.prisma` 的模型）的 schema diff **推荐 Atlas 但不强求**。

| 宿主业务表管理方式 | 适用场景 | 说明 |
|-------------------|---------|------|
| **migrate dev/deploy（默认，受控）** | 生产需迁移文件审计 | 生产一致；dev 变更需本地生成迁移文件提交 |
| **Atlas 声明式（推荐，可选）** | 本地开发快速迭代 | `--to 宿主完整 schema` + `--exclude checkpoint*,_prisma_migrations`（不排除业务表）；dev 爽但**不产迁移文件** → 生产仍走 migrate deploy（变更需补迁移文件） |

**推荐组合（本地开发体验最优）**：

```
本地 dev：业务表用 Atlas 声明式（快速迭代）＋ ADD 模型用 add-coder Atlas 段（自动）
生产 CI ：业务表用 migrate deploy（受控）＋ ADD 模型用 db-ensure.prod.sh（宿主自管）
```

**注意（双轨风险）**：dev 用 Atlas 改了业务表 → 生产 migrate deploy 无对应迁移文件 → 需在发布前用 `prisma migrate dev --name <描述>` 补生成迁移文件并提交。因此：

- 本地探索/快速迭代 → Atlas 声明式（爽）
- 正式变更 → 生成迁移文件提交（生产受控）——两条路并存，变更以迁移文件为准

**不强求**：宿主业务表完全保持 migrate dev/deploy（现状）也完全 OK——add-coder 只保证 ADD 治理模型同步，不干预宿主业务 schema 决策。

---

## 十、端口契约联动

> 消费方项目 `docs/ports.md`（端口契约登记表）由 add-coder 自动生成，真源模板见下方。

### 10.1 真源与同步

| 环节 | 说明 |
|------|------|
| **真源** | `templates/core/templates/ports.example.md`（唯一真源，含 `{{projectName}}` 占位符） |
| **`npm run sync`（自举）** | `scripts/sync-magic.ts` CATEGORIES.templates 全量复制 → `.add/.qoder/.claude/.vscode/templates/`（保留占位符，**零代码改动**自动携带） |
| **`add-coder sync`（CLI）** | 检查用户项目 `docs/ports.md` 缺失 → 从包内 example 渲染生成（只补缺不覆盖）；另检测宿主 db-ensure.sh Atlas 段 |
| **`add-coder init`** | 步骤 D 文档落地时（deployDocs 前）同检查同生成；**分库引导时统一分配器全局登记**（主库/ADD 库/dev 库一次分配 + 登记，见 9.3） |

### 10.2 生成行为契约

1. **只补缺不覆盖**：`docs/ports.md` 已存在 → 零打扰跳过；用户修改永不丢失
2. **动态适配**：渲染时 `{{projectName}}` 替换为实际项目名（空值兜底 `add-project`）
3. **不参与 hash**：`sync --patch` 的 hash/conflict 机制只管理 magic 模板，`docs/ports.md` 是用户项目文档，天然不进入（调用点在 `saveHashFile` 之后）
4. **失败降级**：包内模板缺失 → warn 不阻断 init/sync 主流程
5. **提示引导**：生成后提示「请按项目实际登记端口，示例状态列勿直接提交」

### 10.3 统一端口分配器（契约表 = 分配引擎）

> 契约表从「登记簿」升级为「分配引擎」：分配器是端口分配的唯一入口，**禁止各模块自行分散扫描端口**。

**分配链（真实环境探测优先）**：

```
本地契约表已登记（复用） → 跨项目事实源（避让兄弟项目） → podman ps 实扫（真实占用）
→ 从 start_hint（5433，宿主标准 5432 后第一顺位）起扫真实空闲 → 分配 → 登记 docs/ports.md
```

**关键规则**：

1. **分配顺序固化**：主库 → ADD 库 → dev 库，后序跳过已占端口（空白仓库 5433/5434/5435）
2. **5433 起点**（用户决策）：宿主 PG 标准 5432 之后第一顺位，add 配套容器从 5433 起；非硬性段——真实空闲由环境探测决定
3. **caijuehub 控制面**：`ports-rules.toml`（start_hint/scan_limit/reuse_registered/read_cross_project/on_conflict）→ transcribe `genPortsRules` → `PORTS_CONFIG`；**改规则不改代码**（`npm run generate` 生效）
4. **Atlas dev 库同表登记**：dev-url 常驻空库与主库同表登记（状态列标「dev 库」），可随时重置、非数据真源
5. **实现**：`src/lib/ports-contract.ts` `allocatePortsWithContract()`（消费方分库引导/常驻 dev 容器）；`ensurePortsContract()` 负责模板生成（只补缺）

### 10.4 跨项目关系

`farm-agent/docs/ports.md` 为跨项目端口事实源（登记 add-coder 主库 5434 / shadow 5437 等）；项目本地 `docs/ports.md` 为本地契约，默认值（`DATABASE_PORT` 5433 等）与跨项目表冲突时**以跨项目表为准**。

---

## 十一、本地联调（file: 协议，替代 pnpm link）

> 场景：消费方项目（如 farm-agent）本地接入 add-coder 开发版（跨仓库）。

### 11.1 推荐：file: 协议

```bash
# 消费方项目内
pnpm add add-coder@file:../add-coder
# 或写入 package.json 后 pnpm install
"dependencies": { "add-coder": "file:../add-coder" }
```

**为什么优于 `pnpm link`**：`file:` 协议与正式依赖同等待遇——**依赖自动安装**（含 `@ariga/atlas` 二进制，`node_modules/.bin/atlas` 可用）、**peerDependencies 正常解析**。

### 11.2 pnpm link 的语义差异（未废弃，但依赖自管）

- `pnpm link ../add-coder` 只建符号链接：**linked 包的 dependencies 不会被安装**（atlas 等需消费方自行补装）、**peerDependencies 不解析**（启动时有警告）
- 适合临时快速联调；正式本地依赖请用 `file:` 协议

### 11.3 同仓库多包（monorepo）

- 若多个包属于同一 workspace（pnpm-workspace.yaml），直接用 `workspace:*` 协议——pnpm 一等公民，无需 file:/link
- farm-agent / add-coder / agrisynapse 目前是独立仓库（跨仓库关系），本地联调用 §11.1

---

## 十二、常见开发场景

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

## 十三、鸡生蛋蛋生鸡：自举的时间边界

### 13.1 问题本质

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

### 13.2 生命周期四个轮次

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

### 13.3 每个轮次的"谁生谁"

| 轮次 | 谁生谁 | hooks 从哪来 | 何时可用 |
|------|--------|-------------|---------|
| **手工创世** | 人 → templates/ | 手写 | 写完就可用 |
| **首次发布** | templates/ → npm 包 | npm 包内含 templates/ | `npm install` 后 |
| **hooks 上岗** | git 仓库 → magic dirs | git clone 自带 | clone 完就可用 |
| **半自举** | templates/ → sync → magic dirs | 改 templates/ 后 `npm run sync` | sync 完 + 重启 IDE |

### 13.4 关键时间边界

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

### 13.5 为什么不做"完全自举"

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

### 13.6 什么时候应该用 init 验证自己

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

### 13.7 决策矩阵：什么操作走什么路径

| 你要做什么 | 走这条路径 | 为什么 |
|-----------|-----------|------|
| 改一个 hook 逻辑 | 改 `templates/` → `npm run sync` | hooks 是 bash，不依赖 build |
| 改 init 渲染逻辑 | 改 `src/` → `npm run build` → dry-run 验证 | 需要 TypeScript 编译 |
| 新增文档模板 | 改 `templates/core/templates/` → `npm run sync` | 模板是纯文本，不依赖 build |
| 新 clone 仓库 | `npm install && npm run sync` | 不需要 init |
| 验证 init 正确性 | `npm run build && npx add-coder init --dry-run` | 测试 init 产出是否和 git 一致 |
| 发布到 npm | `npm run sync && npm run build && npm publish` | 确保 templates/ 和 magic dirs 对齐 |

## 十四、依赖治理坑位记录

> 消费项目视角的依赖清单与 onnxruntime 解析错位解决方案，见 [docs/DEPENDENCIES.md](./docs/DEPENDENCIES.md)（本章是其上游决策记录）。

### 坑：sharp GitHub 下载被墙 → 一级依赖升级避障

**背景**：`@xenova/transformers@2.17.2` 硬依赖 `sharp@0.32.x`，sharp 0.32 通过 prebuild-install 从 **GitHub release** 下载二进制（国内 ssh 880 端口被墙），且 `.npmrc` 镜像配置不会透传到 prebuild-install 环境，安装必失败。

**解决**：升级一级依赖 `@xenova/transformers` → `@huggingface/transformers@^3.8.1`（API 全兼容：`pipeline` / `env.remoteHost` / `feature-extraction` / `tolist()`），连带 sharp 升到 0.34.x。

**为什么升级后不再走 GitHub**：

| 包 | 二进制来源 | 说明 |
|----|-----------|------|
| sharp 0.34.x | `@img/sharp-*` 平台包 | 纯 npm registry 分发，无 GitHub |
| onnxruntime-node 1.21+ | npm 包内自含（217MB） | CPU 二进制已打包；仅 CUDA 场景才从 GitHub 下载（本项目用不到） |

**代价（已知坑，接受）**：`@huggingface/transformers` v3 将 `onnxruntime-node` 从可选改为**硬依赖**，安装体积增加约 **217MB**。AI 时代体积不是问题，但以下两点必须遵守：

1. **不要试图降级 sharp 回 0.32.x**——会重新引入 GitHub 下载失败。
2. **pnpm 11 的构建白名单在 `pnpm-workspace.yaml` 的 `allowBuilds` 字段**（`.npmrc` 的 `onlyBuiltDependencies` 已失效）。onnxruntime-node 必须为 `true`，否则其 postinstall 被忽略会触发 `ERR_PNPM_IGNORED_BUILDS` 阻断 install。

### 提醒：停留在 sharp 0.32.x 的下游用户

如果消费方项目仍依赖 `sharp@0.32.x`（旧版 add-coder 或未升级 transformers），prebuild-install 会直接从 **GitHub release** 下载二进制——此时必须显式处理，否则安装失败：

```bash
# ① 切 npm registry 镜像（nrm）
nrm use tencent        # 或 nrm use taobao / npmmirror

# ② 关键：pnpm 11 不会把 .npmrc 的 sharp_binary_host 透传给 prebuild-install，
#    必须用真实环境变量指向 npmmirror 的 sharp 二进制镜像
npm_config_sharp_binary_host=https://npmmirror.com/mirrors/sharp \
  pnpm install

# 或写入 shell 环境（bashrc / .bashrc）：
export npm_config_sharp_binary_host=https://npmmirror.com/mirrors/sharp
export npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips
```

**为什么只切 registry 不够**：sharp 0.32 的二进制不走 npm registry，而是 prebuild-install 从 GitHub 拉取；`.npmrc` 里的 `sharp_binary_host` 配置 pnpm 11 不透传，所以必须设置环境变量。升级到 sharp 0.34+ 后二进制改由 `@img/sharp-*` npm 包分发，才真正做到切 registry 即解决。

---

## 十五、多 IDE 并发契约联动

> 完整契约定义见 [docs/multi-ide-concurrency-contract.md](./multi-ide-concurrency-contract.md)（进程层 v2）。本节是开发侧联动说明。

### 15.1 数据库生命周期拆分

| 阶段 | 操作 | 执行者 | 并发保护 |
|------|------|--------|---------|
| 安装/升级 | 迁移（Atlas/prisma）、Schema Patch、初始化数据 | `db-ensure.sh`（安装时执行一次） | `pg_try_advisory_lock(0xADD001)` 非阻塞拿锁，失败 exit 1（自身脚本 + 消费方模板双改） |
| 每次启动 | 只读检查（连接可用性、表存在性） | mcp-server 启动路径 | 无写操作，无需锁 |
| 运行期 | 业务写入（Plan/Contract/Audit/DevOperation） | MCP 工具 | 幂等键 + DB 唯一索引 |

> **原则**：迁移只执行一次（锁 + 幂等）；启动只做只读检查；迁移失败必须真实非零退出，不得显示"已就绪"假成功。

### 15.2 连接模型与并发兜底

- **进程边界**：1 IDE = 1 mcp-server 子进程（stdio），进程间无共享内存——任一 IDE 断开/重启不影响其他 IDE。
- **PG 连接**：每进程 1 个 PrismaClient 单例；`connection_limit = max(1, floor(100 / N_IDE))`（N_IDE ≤ 3 时 limit=10）。
- **读写分级信号量**（`mcp-server/tools/index.ts` 装饰器）：读工具共享 8 并发、写工具共享 4 并发，超限排队（MCP 协议允许延迟响应，排队即天然反压）；429 指数退避 3 次（250ms 起步）。
- **日志脱敏**：`shared/redact.ts` 统一出口（`textResponse`/`errorResponse`/入口 catch），连接串密码段输出 `****`。

### 15.3 与协作层契约的关系

| 层 | 契约 | 职责 | 开发侧落点 |
|----|------|------|-----------|
| 协作层 v1 | collab-contract（v0.3.18） | 多智能体协作秩序（文件边界/仲裁/审计分桶） | `templates/core/templates/collab-contract-template.md` + contract_track/contract_status |
| 进程层 v2 | 本文档（v0.3.25） | MCP Server 并发行为承诺 | `docs/multi-ide-concurrency-contract.md` + 节流/脱敏/锁 |

**衔接点**：协作层的"文件边界 + 审计分桶"能成立，依赖进程层的"幂等写入 + 防串线"保证。
