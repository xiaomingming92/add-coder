# add-coder

> 🌐 [🀄中文](https://github.com/xiaomingming92/add-coder/blob/main/README.md) | 🔤[English] — ⚠️ This file is temporarily unmaintained. The English translation is now embedded in README.md (scroll to ## 🔤 English README). Will resume standalone maintenance when the community grows.

**AI Governance, Implemented** — The complete scaffolding from [codein2027](https://github.com/xiaomingming92/codein2027) for rapidly building the ADD programming paradigm. Built on the core principle of **Audit as Infrastructure**, it shatters the black-box programming process and cross-session amnesia, evolving the programming paradigm into an auditable, traceable, and convergent new era. [NPM](https://www.npmjs.com/package/add-coder) · [GitHub](https://github.com/xiaomingming92/add-coder)


> 🧭 **Getting hands-on?** See [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md) — trigger word quick reference, requirements-to-Plan, and full workflow walkthrough.

```bash
npx add-coder init
```

---

## Not a Template Tool — An Architectural Difference

There are already plenty of AI coding templates, hook adapters, and MCP scaffolds. What fundamentally sets add-coder apart is not "what files it generates," but a **paradigm shift at the architectural level**:

### ① Audit Is Infrastructure, Not After-the-Fact Logging

Traditional AI development: Chat → Generate code → Dig through chat history afterward to find "who changed what"

| Traditional Model | add-coder |
|-------------------|-----------|
| Logs are append-only text files | Audit is a **structured data table** (DevOperation + AuditLog), supporting multi-dimensional queries by plan/step/agent/tool |
| Auditing relies on developer discipline | The **MCP audit toolchain** automatically records every operation; system gateways enforce checks |
| No traceability | Audit events are naturally linked: Plan → Spec → Task → Step → Tool Call, forming a complete evidence chain |

### ② Prompt Cache Native — ¥218/mo, 98% Savings

The ADD paradigm isn't just methodology — its structured Step workflow naturally aligns with DeepSeek's Prompt Cache prefix-matching mechanism, delivering extreme token cost efficiency. **Real-world billing validation**:

| Metric | Value |
|--------|-------|
| July actual DeepSeek bill | **¥218.35** |
| Theoretical cost without cache | ¥11,100 |
| Cache hit rate | **99.31%** |
| Cache hit vs miss price gap | **120x** (¥0.025/M vs ¥3/M) |
| Total cost savings | **98.1%** |

```
Traditional IDE free chat:  cache hit rate 85–91%, ~5,000 MISS tokens/req
ADD paradigm + Qoder:       cache hit rate 99.31%, only 2,426 MISS tokens/req
```

> 📊 [Full analysis report](./docs/ADD范式缓存命中分析报告.md) — 4 Mermaid diagrams, 17-day daily data, cross-IDE comparison, and cost modeling.

### ③ Gateway-Driven, Not Free-Form Conversation

Traditional AI coding is "you say, I do" — quality depends entirely on the LLM's state that day. add-coder embeds **dual quality gateways** into the architecture:

```
DPS (Design-Process Symmetry)  — Design / Implementation / Docs / Audit, each weighted 25%, < 85% BLOCKED
RAHS (Runtime Architecture Health Score) — Runtime architecture health, < 90% BLOCKED
```

These are not "suggestions" — they are **architectural blocks**. A Step cannot advance without passing its gateway.

### ④ Cross-Session Memory, Not Per-Session Amnesia

The fatal flaw of AI conversations: architectural decisions from last session, bugs fixed, agreements reached — all forgotten in the next conversation. add-coder solves this at the architecture level:

- **Handoff Documents** — Automatically generated structured handoff at the end of each session, auto-loaded by the next session
- **Plan Index** — All Plans are centrally indexed via `index.md`, supporting fuzzy-match quick lookup
- **DevLog Timeline** — Every operation is written to the `{YYYY-MM}/{DD}/` timeline, enabling full historical state traceability

### ⑤ Policy-Update-Loop: Self-Evolving Governance (the scaffold itself does not include this architectural capability; a DEMO repo will be provided next to better illustrate the Policy-Update-Loop and Report system)

Not a static template, but a **closed-loop adaptive system**:

```
Execute → Audit → Boundary Report → Rule Adjustment → Next Execution
```

Runtime-generated Reports feed back into governance rules, enabling continuous evolution of governance strategies.

### ⑥ Multi-IDE Hooks as the Governance Layer

Hooks are not "notification push" — they are the **IDE runtime interception layer**:

| Hook Type | Function |
|-----------|----------|
| PreToolUse | Validates whitelist before tool invocation, injects context, DPS condition checks |
| PostToolUse | Automatic audit logging, Plan sync detection, format guarding |
| PreCompact | Forces retention of critical document paths during cross-session context compression |
| PromptSubmit | Injects ADD vocabulary triggers, ensuring zero-latency LLM response to commands like "acceptance" and "gateway" |

Each IDE（Claude Code / Qoder CN / VS Code Copilot / Trae / Codex）has its own hook implementation, but the **governance logic is unified** — the architecture is consistent, only the adapter layer differs.

| IDE | Governance Doc | Events Covered | Hook Config |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./ADD-governance-claude-code.md) | 14/17 | `.claude/hooks/*.sh` |
| Qoder CN | [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md) | 10/17 | `.qoder/hooks/*.sh` |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./ADD-governance-vscode-copilot.md) | 10/17 | `.github/hooks/*.json` → `.vscode/hooks/*.sh` |
| Trae | [ADD-governance-trae.md](./ADD-governance-trae.md) | 6/17 | `hooks.json` → `.trae/hooks/*.sh` |
| Codex | [ADD-governance-codex.md](./ADD-governance-codex.md) | 0 native / 14 (via Claude import) | `.codex/hooks.json` |

---

## Quick Start

```bash
npx add-coder init
```

The first `init` auto-detects your IDE and interactively guides you through database selection (PostgreSQL / SQLite / self-managed), container runtime (podman / docker / self-managed), Prisma initialization, and ADD template deployment.

```bash
npx add-coder init
# → Choose IDE (Qoder / Claude / VS Code)
# → Choose database (PostgreSQL / SQLite / self-managed)
# → Choose container (podman / docker / self-managed)
# → prisma init + add.prisma copied
# → prisma db push (adds new tables only, no data deletion)
# → prisma generate
# → ADD governance model ready ✓
```

> **Env file priority**: `.env.development.local` > `.env.development` > `.env.local` > `.env`

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize ADD templates, supports `--adapter claude\|qoder\|vscode\|auto` |
| `sync` | Incrementally sync missing files |
| `status` | Check template integrity |

### init Internal Flow

| Step | Action | Description |
|------|--------|-------------|
| ① | Detect IDE | Scan for `.qoder/` `.claude/` `.vscode/` existence, or specify via `--adapter` |
| ② | Load config | Interactive Q&A > `add-coder.config.ts` > auto-detect > defaults |
| ③ | DB deployment | `db-ensure.sh` starts container/PG connection + `injectPrisma()` Caijue layer (Prisma init → AddUser model copy → db push → generate) |
| ④ | Render templates | 55 core template files (skills/agents/templates/plans/specs/scripts…) |
| ⑤ | Deploy adapters | Copy core content to `.add/` `.qoder/` `.claude/` directories, supplement IDE-specific hooks/mcp |
| ⑥ | Write files | Four modes: interactive / yes / force / dry-run; `.sh` scripts auto `chmod` |
| ⑦ | Output summary | Created / skipped / overwritten stats + next-step hints |

### init Options

| Option | Description |
|--------|-------------|
| `--adapter <type>` | Target IDE: claude / qoder / vscode / trae / codex / auto (default) |
| `--config <path>` | Specify config file |
| `--yes` | Skip interactions, create new files only |
| `--force` | Overwrite existing files |
| `--dry-run` | Preview mode, no writes |

## Generated Content

| Directory | Content |
|-----------|---------|
| `.add/` | ADD shared core (skills, agents, docs, scripts, rules, etc.) |
| `.claude/` | Claude Code adapter (hooks, settings.json, mcp.json) |
| `.qoder/` | Qoder adapter (hooks, settings.json, mcp.json) |
| `.vscode/` | VS Code adapter (settings.json, tasks.json) |
| `.trae/` | Trae adapter (hooks.json, settings.json) |
| `.codex/` | Codex adapter (hooks.json, settings.json) |

## MCP Audit Toolchain

`init` automatically deploys the MCP server (`mcp-server.ts`) into the project, loaded by the IDE via `mcp.json`. The following audit and governance tools are provided:

| Tool | Purpose | Trigger Scenario |
|------|---------|-----------------|
| `record_dev_operation` | Record development operation audits (before/after/reason) | Every file change, config modification |
| `query_audit_logs` | Query audit records by planKeyword / targetId | Cross-session context recovery, iteration evidence verification |
| `get_project_context` | Get ADD workflow status snapshot | Fresh conversation start |
| `get_db_schema` | Get Prisma schema info | Database-related operations |
| `check_dps` | DPS gateway (Design/Implementation/Docs/Audit, each 25%) | End of Step 0 |
| `check_rahs` | RAHS gateway (runtime architecture health) | Step 4/8 |
| `check_add_route_status` | add-route file existence check | Before Step 3 |
| `check_spec_sync` | Spec doc checkbox status vs. code consistency | After Spec execution |
| `find_related_docs` | Search related architecture/spec documents | Context understanding |

> Full tool list: [MCP Toolchain Specification](https://github.com/xiaomingming92/codein2027/blob/main/docs/大田精准耕播智能决策系统/knowledge/02-规范/%E3%80%8A%E5%BC%80%E5%8F%91%E6%93%8D%E4%BD%9C%E5%AE%A1%E8%AE%A1%E5%AD%98%E6%A1%A3%E8%A7%84%E8%8C%83%E3%80%8B.md).

## Architecture Overview

```
                    ┌─────────────┐
                    │  ADD Paradigm│
                    │  Step 0-9    │
                    └──────┬──────┘
                           │ Gateway-driven
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │DPS Gateway│ │RAHS Gate │ │Compliance│
       └────┬─────┘ └────┬─────┘ └────┬─────┘
            │            │            │
              ▼            ▼            ▼
       ┌─────────────────────────────────────┐
       │        Audit Infrastructure Layer    │
       │  DevOperation / AuditLog Tables      │
       │  MCP Audit Toolchain                 │
       │  Handoff / DevLog Timeline Docs      │
       └─────────────────────────────────────┘
                           │
    ┌──────────┬───────────┼───────────┬──────────┐
    ▼          ▼           ▼           ▼          ▼
┌──────┐ ┌──────┐ ┌──────────┐ ┌──────┐ ┌──────┐
│Claude│ │Qoder │ │ VS Code  │ │ Trae │ │Codex │
│Hooks │ │Hooks │ │  Config  │ │Hooks │ │Hooks │
│14/17 │ │10/17 │ │  10/17   │ │ 6/17 │ │ 6/17 │
└──────┘ └──────┘ └──────────┘ └──────┘ └──────┘
                           │
              ┌────────────┘
              ▼
       ┌─────────────────────────────────────┐
       │       Caijuehub Rule Engine          │
       │  TOML-Driven Policy System           │
       │  Detect / Adapt / Prisma / Write —   │
       │  Fully Configurable                  │
       └─────────────────────────────────────┘
```

## Prerequisites

- Node.js >= 20
- Prisma ^7.0 (auto-detected during `init`, guided installation if missing)
- PostgreSQL / SQLite (MCP toolchain depends on DevOperation + AuditLog tables)

> **Recommended**: Run PostgreSQL via Podman/Docker, reference config:
> ```yaml
> postgres:
>   image: docker.io/postgres:16-alpine
>   ports: ["127.0.0.1:5433:5432"]
>   environment:
>     POSTGRES_DB: mydb
>     POSTGRES_USER: admin
>     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
> ```
> Mount data volume to `~/data/your_project/postgres/` to avoid data loss on container removal.

> 📦 [Changelog](./CHANGELOG.md)

---

## 🎬 Coming Soon

| Plan | Description |
|------|-------------|
| Demo Repo | A full example repository showcasing end-to-end closed-loop practice of Policy-Update-Loop and the Report system |
| MCP Restructure | MCP toolchain architecture upgrade, improving audit and gateway tool extensibility and standalone deployment capability |
| Memory Enhancement | Long-term project knowledge memory and plan-level sparse memory |

---
<details id="chinese-readme">
<summary>🀄 中文 README</summary>

**AI 代码治理的落地方案** — [codein2027](https://github.com/xiaomingming92/codein2027) 快速构建 ADD 编程范式的完整脚手架。以「审计即基础设施」为核心，彻底打破编程过程黑盒与跨轮失忆，让编程范式进化为可审计、可追溯、可收敛的新时代。 [NPM](https://www.npmjs.com/package/add-coder) · [GitHub](https://github.com/xiaomingming92/add-coder)

> 🧭 **从零上手实操？** 请参见 [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md)

```bash
npx add-coder init
```

## 这不是模板工具，这是架构差异

### ① 审计是基础设施，而非事后日志
| 传统模式 | add-coder |
|---|---|
| 日志是 append-only 文本文件 | 审计是 **结构化数据表**（DevOperation + AuditLog），支持按 plan/step/agent/tool 多维查询 |
| 审计靠开发者自觉记录 | **MCP 审计工具链** 自动记录每次操作 |
| 无关联性 | Plan → Spec → Task → Step → Tool Call，形成完整证据链 |

### ② 门禁驱动，而非自由对话
```
DPS (Design-Process Symmetry)  — 设计/实现/文档/审计 四维各 25%，< 85% BLOCKED
RAHS (Runtime Architecture Health Score) — 运行时架构健康度，< 90% BLOCKED
```
这不是「建议」，是**架构阻断** — 不通过闸门的 Step 无法推进到下一步。

### ③ 跨轮记忆，而非每轮失忆
- **Handoff 文档** — 每轮 Session 结束时自动生成结构化交接文档
- **Plan 索引** — 所有 Plan 通过 `index.md` 集中索引
- **DevLog 时序记录** — 每一步操作写入 `{YYYY-MM}/{DD}/` 时间轴

### ④ Policy-Update-Loop：治理自我进化
```
执行 → 审计 → 边界报告 → 规则调整 → 下一轮执行
```
运行时产生的 Report 会反过来更新 governance rules。

### ⑤ 多 IDE 的 Hook 即治理层
| IDE | 治理文档 | 覆盖事件 | Hook 配置 |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./ADD-governance-claude-code.md) | 14/17 | `.claude/hooks/*.sh` |
| Qoder CN | [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md) | 10/17 | `.qoder/hooks/*.sh` |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./ADD-governance-vscode-copilot.md) | 10/17 | `.github/hooks/*.json` → `.vscode/hooks/*.sh` |
| Trae | [ADD-governance-trae.md](./ADD-governance-trae.md) | 6/17 | `hooks.json` → `.trae/hooks/*.sh` |
| Codex | [ADD-governance-codex.md](./ADD-governance-codex.md) | 0 (原生) / 14 (导入 Claude) | `.codex/hooks.json` |

## 快速开始
```bash
npx add-coder init
```

| 命令 | 说明 |
|---|---|
| `init` | 初始化 ADD 模板，支持 `--adapter claude\|qoder\|vscode\|trae\|codex\|auto` |
| `sync` | 增量同步缺失文件 |
| `status` | 检查模板完整性 |

| 选项 | 说明 |
|---|---|
| `--adapter <type>` | 目标 IDE：claude / qoder / vscode / trae / codex / auto |
| `--force` | 覆盖已有文件 |
| `--dry-run` | 预览模式，不写入 |

## MCP 审计工具链
| 工具 | 用途 |
|---|---|
| `record_dev_operation` | 记录开发操作审计 |
| `query_audit_logs` | 按 planKeyword / targetId 查询审计记录 |
| `check_dps` | DPS 闸门（< 85% BLOCKED） |
| `check_rahs` | RAHS 闸门（< 90% BLOCKED） |

## 前置条件
- Node.js >= 20 · Prisma ^7.0 · PostgreSQL / SQLite

## 🎬 预告
| 计划 | 说明 |
|---|---|
| Demo 仓库演示 | Policy-Update-Loop 与 Report 体系端到端闭环实践 |
| MCP 能力重构 | MCP 工具链架构升级 |
| 对话记忆增强 | 长期项目知识记忆和 plan 级别的稀疏记忆 |

> 📦 [更新日志](./CHANGELOG.md)
</details>
