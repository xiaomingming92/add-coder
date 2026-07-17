# add-coder

> 🌐 🀄中文 | 🔤[English](#english-readme)（⬇ 本页底部折叠）

**AI 代码治理的落地方案** — [codein2027](https://github.com/xiaomingming92/codein2027) 快速构建 ADD 编程范式的完整脚手架。以「审计即基础设施」为核心，彻底打破编程过程黑盒与跨轮失忆，让编程范式进化为可审计、可追溯、可收敛的新时代。 [NPM](https://www.npmjs.com/package/add-coder) · [GitHub](https://github.com/xiaomingming92/add-coder)


> 🧭 **从零上手实操？** 请参见 [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md) — 包含触发词速查、需求转 Plan、完整链路演练。

```bash
npx add-coder init
```

---

## 这不是模板工具，这是架构差异

市面上已有大量 AI 编程模板、hook 适配器、MCP 脚手架。add-coder 与它们的根本区别不在「生成什么文件」，而在 **架构层面的范式转换**：

### ① 审计是基础设施，而非事后日志

传统 AI 开发：对话 → 生成代码 → 事后翻聊天记录找「谁改了什么」

| 传统模式 | add-coder |
|---------|----------|
| 日志是 append-only 文本文件 | 审计是 **结构化数据表**（DevOperation + AuditLog），支持按 plan/step/agent/tool 多维查询 |
| 审计靠开发者自觉记录 | **MCP 审计工具链** 自动记录每次操作，系统闸门强制检查 |
| 无关联性 | 审计事件天然关联 Plan → Spec → Task → Step → Tool Call，形成完整证据链 |

### ② 门禁驱动，而非自由对话

传统 AI coding 是「你说我做」，质量完全依赖 LLM 当天状态。add-coder 在架构中嵌入了 **双质量闸门**：

```
DPS (Design-Process Symmetry)  — 设计/实现/文档/审计 四维各 25%，< 85% BLOCKED
RAHS (Runtime Architecture Health Score) — 运行时架构健康度，< 90% BLOCKED
```

这不是「建议」，是**架构阻断** — 不通过闸门的 Step 无法推进到下一步。

### ③ 跨轮记忆，而非每轮失忆

AI 对话的致命缺陷：上次讨论的架构决策、已修复的 Bug、达成的约定，下轮对话全部遗忘。add-coder 在架构层面解决：

- **Handoff 文档** — 每轮 Session 结束时自动生成结构化交接文档，下轮会话自动加载
- **Plan 索引** — 所有 Plan 通过 `index.md` 集中索引，支持模糊匹配快速定位
- **DevLog 时序记录** — 每一步操作写入 `{YYYY-MM}/{DD}/` 时间轴，可回溯任意历史状态

### ④ Policy-Update-Loop：治理自我进化(脚手架不包含此架构能力,接下来会给到DEMO仓库让大家更好理解Policy-Update-Loop和Report体系)

不是静态模板，而是**闭环自适应系统**：

```
执行 → 审计 → 边界报告 → 规则调整 → 下一轮执行
```

运行时产生的 Report 会反过来更新 governance rules，实现治理策略的持续进化。

### ⑤ 多 IDE 的 Hook 即治理层

hook 不是「通知推送」，而是 **ADD 范式在 IDE agent 生命周期中的 17 个确定性治理卡位**。每个 IDE（Claude Code / Qoder CN / VS Code Copilot / Trae / Codex）有各自的 hook 机制，但治理逻辑统一——架构一致，适配层不同。

| IDE | 治理文档 | 覆盖事件 | Hook 配置 |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./ADD-governance-claude-code.md) | 14/17 | `.claude/hooks/*.sh` |
| Qoder CN | [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md) | 10/17 | `.qoder/hooks/*.sh` |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./ADD-governance-vscode-copilot.md) | 10/17 | `.github/hooks/*.json` → `.vscode/hooks/*.sh` |
| Trae | [ADD-governance-trae.md](./ADD-governance-trae.md) | 6/17 | `hooks.json` → `.trae/hooks/*.sh` |
| Codex | [ADD-governance-codex.md](./ADD-governance-codex.md) | 0 (原生) / 14 (导入 Claude) | `.codex/hooks.json` |

> 实施 Plan: [add-coder-hook-full-alignment-plan-v1](./.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md) | 触发源: [GitHub Issue #6](https://github.com/xiaomingming92/add-coder/issues/6)

---

## 快速开始

```bash
npx add-coder init
```

首次 init 自动检测 IDE，交互式引导完成数据库选择（PostgreSQL / SQLite / 自行管理）、容器运行时（podman / docker / 自行管理）、Prisma 初始化、ADD 模板部署。

```bash
npx add-coder init
# → 选择 IDE（Qoder / Claude / VS Code）
# → 选择数据库（PostgreSQL / SQLite / 自行管理）
# → 选择容器（podman / docker / 自行管理）
# → prisma init + add.prisma 复制
# → prisma db push（仅新增表，不删数据）
# → prisma generate
# → ADD 治理模型已就绪 ✓
```

> **环境文件优先级**：`.env.development.local` > `.env.development` > `.env.local` > `.env`

## 命令

| 命令 | 说明 |
|------|------|
| `init` | 初始化 ADD 模板，支持 `--adapter claude\|qoder\|vscode\|auto` |
| `sync` | 增量同步缺失文件 |
| `status` | 检查模板完整性 |

### init 内部流程

| 步骤 | 动作 | 说明 |
|------|------|------|
| ① | 检测 IDE | 扫描 `.qoder/` `.claude/` `.vscode/` 存在性，或通过 `--adapter` 指定 |
| ② | 加载配置 | 交互式问答 > `add-coder.config.ts` > 自动检测 > 默认值 |
| ③ | 数据库部署 | `db-ensure.sh` 启容器/PG 连接 + `injectPrisma()` 裁决层（Prisma init → AddUser 模型复制 → db push → generate） |
| ④ | 渲染模板 | 55 个 core 模板文件（skills/agents/templates/plans/specs/scripts…） |
| ⑤ | 部署适配 | 将 core 内容复制到 `.add/` `.qoder/` `.claude/` 三目录，补 IDE 专属 hooks/mcp |
| ⑥ | 写入文件 | 交互/yes/force/dry-run 四种模式，`.sh` 脚本自动 `chmod` |
| ⑦ | 输出摘要 | 新建/跳过/覆盖统计 + 下一步提示 |

### init 选项

| 选项 | 说明 |
|------|------|
| `--adapter <type>` | 目标 IDE：claude / qoder / vscode / auto（默认） |
| `--config <path>` | 指定配置文件 |
| `--yes` | 跳过交互，只创建新文件 |
| `--force` | 覆盖已有文件 |
| `--dry-run` | 预览模式，不写入 |

## 生成内容

| 目录 | 内容 |
|------|------|
| `.add/` | ADD 共享核心（skills、agents、docs、scripts、rules 等） |
| `.claude/` | Claude Code 适配（hooks、settings.json） |
| `.qoder/` | Qoder 适配（hooks、settings.json、mcp.json） |
| `.vscode/` | VS Code 适配（settings.json、tasks.json） |

## MCP 审计工具链

`init` 自动部署 MCP 服务器 (`mcp-server.ts`) 到项目中，IDE 通过 `mcp.json` 加载。提供以下审计与治理工具：

| 工具 | 用途 | 触发场景 |
|------|------|---------|
| `record_dev_operation` | 记录开发操作审计（before/after/reason） | 每次文件变更、配置修改 |
| `query_audit_logs` | 按 planKeyword / targetId 查询审计记录 | 跨会话恢复上下文、验证迭代证据 |
| `get_project_context` | 获取 ADD 工作流状态快照 | 空白对话开局 |
| `get_db_schema` | 获取 Prisma schema 信息 | 数据库相关操作 |
| `check_dps` | DPS 闸门（设计/实现/文档/审计 四维各 25%） | Step 0 末尾 |
| `check_rahs` | RAHS 闸门（运行时架构健康度） | Step 4/8 |
| `check_add_route_status` | add-route 文件存在性校验 | Step 3 前 |
| `check_spec_sync` | Spec 文档勾选状态与代码一致性 | Spec 执行后 |
| `find_related_docs` | 检索相关架构/规范文档 | 语境理解 |

> 完整工具列表见 [MCP 工具链规范](https://github.com/xiaomingming92/codein2027/blob/main/docs/大田精准耕播智能决策系统/knowledge/02-规范/%E3%80%8A%E5%BC%80%E5%8F%91%E6%93%8D%E4%BD%9C%E5%AE%A1%E8%AE%A1%E5%AD%98%E6%A1%A3%E8%A7%84%E8%8C%83%E3%80%8B.md)。

## 架构全景

```
                    ┌─────────────┐
                    │  ADD 范式    │
                    │  Step 0-9    │
                    └──────┬──────┘
                           │ 门禁驱动
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ DPS 闸门 │ │ RAHS 闸门│ │合规检查  │
       └────┬─────┘ └────┬─────┘ └────┬─────┘
            │            │            │
              ▼            ▼            ▼
       ┌─────────────────────────────────────┐
       │         审计基础设施层                │
       │  DevOperation / AuditLog 表           │
       │  MCP 审计工具链                       │
       │  Handoff / DevLog 时序文档            │
       └─────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ Claude   │ │  Qoder   │ │  VS Code │
       │ Hooks    │ │  Hooks   │ │  Config  │
       └──────────┘ └──────────┘ └──────────┘
                           │
              ┌────────────┘
              ▼
       ┌─────────────────────────────────────┐
       │     Caijuehub 规则引擎               │
       │  TOML 驱动的策略体系                 │
       │  检测/适配/Prisma/写入 全可配置       │
       └─────────────────────────────────────┘
```

## 前置条件

- Node.js >= 20
- Prisma ^7.0（`init` 时自动检测，无则引导安装）
- PostgreSQL / SQLite（MCP 工具链依赖 DevOperation + AuditLog 表）

> **推荐**：使用 Podman/Docker 运行 PostgreSQL，参考配置：
> ```yaml
> postgres:
>   image: docker.io/postgres:16-alpine
>   ports: ["127.0.0.1:5433:5432"]
>   environment:
>     POSTGRES_DB: mydb
>     POSTGRES_USER: admin
>     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
> ```
> 数据卷建议挂载到 `~/data/your_project/postgres/`，避免容器销毁丢失数据。

> 📦 [更新日志 (CHANGELOG)](./CHANGELOG.md)

---

## 🎬 预告

| 计划 | 说明 |
|------|------|
| Demo 仓库演示 | 提供完整示例仓库，展示 Policy-Update-Loop 与 Report 体系的端到端闭环实践 |
| MCP 能力重构 | MCP 工具链架构升级，提升审计与门禁工具的可扩展性和独立部署能力 |
| 对话记忆增强 | 长期项目知识记忆和plan级别的稀疏记忆 |


---
<details id="english-readme">
<summary>🔤 English README</summary>

**AI Governance, Implemented** — The complete scaffolding from [codein2027](https://github.com/xiaomingming92/codein2027) for rapidly building the ADD programming paradigm. Built on the core principle of **Audit as Infrastructure**, it shatters the black-box programming process and cross-session amnesia, evolving the programming paradigm into an auditable, traceable, and convergent new era. [NPM](https://www.npmjs.com/package/add-coder) · [GitHub](https://github.com/xiaomingming92/add-coder)

> 🧭 **Getting hands-on?** See [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md) — trigger word quick reference, requirements-to-Plan, and full workflow walkthrough.

```bash
npx add-coder init
```

## Not a Template Tool — An Architectural Difference

### ① Audit Is Infrastructure, Not After-the-Fact Logging
| Traditional Model | add-coder |
|---|---|
| Logs are append-only text files | Audit is a **structured data table** (DevOperation + AuditLog), supporting multi-dimensional queries by plan/step/agent/tool |
| Auditing relies on developer discipline | The **MCP audit toolchain** automatically records every operation; system gateways enforce checks |
| No traceability | Audit events are naturally linked: Plan → Spec → Task → Step → Tool Call, forming a complete evidence chain |

### ② Gateway-Driven, Not Free-Form Conversation
```
DPS (Design-Process Symmetry)  — Design / Implementation / Docs / Audit, each weighted 25%, < 85% BLOCKED
RAHS (Runtime Architecture Health Score) — Runtime architecture health, < 90% BLOCKED
```
These are not "suggestions" — they are **architectural blocks**. A Step cannot advance without passing its gateway.

### ③ Cross-Session Memory, Not Per-Session Amnesia
- **Handoff Documents** — Auto-generated structured handoff at end of each session, auto-loaded by next session
- **Plan Index** — All Plans centrally indexed via `index.md`, fuzzy-match quick lookup
- **DevLog Timeline** — Every operation written to `{YYYY-MM}/{DD}/` timeline, full historical traceability

### ④ Policy-Update-Loop: Self-Evolving Governance
```
Execute → Audit → Boundary Report → Rule Adjustment → Next Execution
```
Runtime-generated Reports feed back into governance rules, enabling continuous evolution.

### ⑤ Multi-IDE Hooks as the Governance Layer
| IDE | Governance Doc | Events Covered | Hook Config |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./ADD-governance-claude-code.md) | 14/17 | `.claude/hooks/*.sh` |
| Qoder CN | [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md) | 10/17 | `.qoder/hooks/*.sh` |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./ADD-governance-vscode-copilot.md) | 10/17 | `.github/hooks/*.json` → `.vscode/hooks/*.sh` |
| Trae | [ADD-governance-trae.md](./ADD-governance-trae.md) | 6/17 | `hooks.json` → `.trae/hooks/*.sh` |
| Codex | [ADD-governance-codex.md](./ADD-governance-codex.md) | 0 native / 14 (via Claude import) | `.codex/hooks.json` |

## Quick Start
```bash
npx add-coder init
```
The first `init` auto-detects your IDE and interactively guides you through database selection, container runtime, Prisma initialization, and ADD template deployment.

| Command | Description |
|---|---|
| `init` | Initialize ADD templates, supports `--adapter claude\|qoder\|vscode\|trae\|codex\|auto` |
| `sync` | Incrementally sync missing files |
| `status` | Check template integrity |

| Option | Description |
|---|---|
| `--adapter <type>` | Target IDE: claude / qoder / vscode / trae / codex / auto |
| `--config <path>` | Specify config file |
| `--yes` | Skip interactions, create new files only |
| `--force` | Overwrite existing files |
| `--dry-run` | Preview mode, no writes |

## MCP Audit Toolchain
| Tool | Purpose |
|---|---|
| `record_dev_operation` | Record dev operation audits (before/after/reason) |
| `query_audit_logs` | Query audit records by planKeyword / targetId |
| `get_project_context` | Get ADD workflow status snapshot |
| `check_dps` | DPS gateway (< 85% BLOCKED) |
| `check_rahs` | RAHS gateway (< 90% BLOCKED) |

## Prerequisites
- Node.js >= 20
- Prisma ^7.0
- PostgreSQL / SQLite

## 🎬 Coming Soon
| Plan | Description |
|---|---|
| Demo Repo | Full example repo for Policy-Update-Loop and Report system |
| MCP Restructure | MCP toolchain architecture upgrade |
| Memory Enhancement | Long-term project knowledge memory and plan-level sparse memory |

> 📦 [Changelog](./CHANGELOG.md)
</details>
