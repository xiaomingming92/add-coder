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

> **Others retry; add-coder gates.** Quality should not depend on the model's mood that day.

Traditional AI coding is "you say, I do" — quality rests entirely on the LLM's form in the moment. add-coder embeds **dual quality gateways** in the architecture — not "suggestions" but **architectural blocks**: without passing the gate, a Step cannot advance.

| Dimension | Typical practice | add-coder's dual gateways |
|-----------|------------------|---------------------------|
| **Basis** | Model self-assessment / human eyeballing | **DPS**: semantics (TF-IDF/Jaccard) + entropy (Shannon/Deng) + CPM critical path + structural completeness; **RAHS**: scope fidelity / type safety / audit completeness / Spec compliance / phase symmetry |
| **Force** | "Please make sure…" in a prompt | Cannot enter Step 1 without passing DPS (`PASS=80`, threshold sourced from `dps-scoring-rules.toml`); nothing is released without RAHS (≥90) |
| **Reproducibility** | Ask the model twice, get two answers | Same document + same parameters = same score; per-dimension scores plus a weakness list — explainable, comparable, regression-testable |
| **Tuning** | Edit code, edit prompts, re-release | **caijuehub TOML declarations**: score → read weaknesses → tune → re-score, without touching code |
| **Weights** | Hand-tuned once, then frozen | **FFT adaptive weights** that evolve with audit data — DPS parameters are data, not magic numbers |
| **Negative feedback** | "Just regenerate it" | A failed gate pinpoints the weak dimension; gate results are collected idempotently (Gate → `MetricSnapshot`) into the memory loop for review |

```text
DPS (Documentation Precision Score) — semantics + entropy + CPM critical path + structural completeness → 4-dimension composite + FFT adaptive weights
RAHS (Runtime Architecture Health Score) — scope fidelity + type safety + audit completeness + Spec compliance + phase symmetry → ≥ 90 passes
```

> Thresholds and parameters live in a readable TOML source of truth (`dps-scoring-rules.toml`), not magic numbers; `check_dps` resolves spec references across five adapters (qoder / claude / add / vscode / codex·trae, covered by `tests/dps-adapter.test.ts`).

### ④ Cross-Session Memory, Not Per-Session Amnesia

> **Other tools "remember". add-coder governs memory.** Memory is not a context-engineering problem — it is a governance problem.

The fatal flaw of AI conversations: architectural decisions from last session, bugs fixed, agreements reached — all forgotten in the next conversation. Most AI coding tools treat "memory" as **session/repo-level text excerpts plus vector search** — pasting slices of old chats or files back into context. That answers "was it seen", not "does it count, should it be injected, who is accountable when it is wrong". add-coder's memory is a **governed knowledge layer**: every conclusion carries evidence, every recall can be replayed, every revision leaves a trace, every cross-boundary leak can be sampled.

**The gap is structural, not a recall-rate gap**

| Dimension | Typical "memory" | add-coder memory loop (since v0.3.35) |
|-----------|------------------|---------------------------------------|
| **Write path** | Auto-extract, active immediately | **Candidate-only**: `propose_memory` lands CANDIDATE (dedup + secret scan + conflict detection); it turns ACTIVE only after human adjudication via `resolve_memory`, and `approve` requires ≥1 piece of evidence |
| **Grounding** | The memory text is its own justification | **Evidence chain**: conclusions and sources are separated; collection is idempotent (`sourceRef=<gate>:<planKeyword>:<runId>`; replays never duplicate); `get_memory` exposes provenance and the supersession chain |
| **Timing** | Similarity-triggered, can fire anytime | **Deterministic waypoint recall**: fires on ADD stage waypoints only (Plan draft / Spec draft / DPS / RAHS / Handoff), specificity-first word lists; produced synchronously on the Hook side, executed on the MCP side |
| **Retrieval** | Single-channel vector similarity | **FTS × vector, RRF-fused, then governed rerank** (scope / kind / importance / confidence / mandatory constraints − stale / conflict / redundancy), trimmed to a token budget |
| **Explainability** | Result only | Every hit carries `whySelected` / `scoreBreakdown` / `recallId`; `rankingVersion` stores the config snapshot — **the same recall can be replayed** |
| **Degradation** | No explicit contract | Without pgvector / sqlite-vec it runs FTS-only and returns `degradedMode` explicitly — never silently distorted |
| **Correction** | Delete or overwrite | **Governance state machine**: submit_review / approve / reject / stale / supersede / archive / restore, with scope-compatible supersession — memory can be *falsified*, not merely overwritten |
| **Boundaries** | No scope isolation | Eight-level scope isolation (ORGANIZATION / REPOSITORY / BRANCH / MODULE / PATH / SYMBOL / PLAN / SPEC) + cross-repo leakage sampling in `get_memory_health` |
| **Weighting** | Hard-coded weights | Feedback stats (channel × rank × outcome) / cold-start fitting / Kalman online estimation / FFT cadence diagnostics (never direct ranking); **the weight snapshot is the single source of truth for ranking parameters** |

**Two layers**

- **Document layer** (since v0.3.25) — Handoff documents (auto-generated each session end, auto-loaded next session) · Plan index (`index.md`, fuzzy lookup) · DevLog timeline (`{YYYY-MM}/{DD}/`, fully traceable)
- **Knowledge layer** (the v0.3.35 memory loop) — candidate-only intake → idempotent evidence collection (whitelisted tool events → `evidence-queue.jsonl` → async consumption → `MetricSnapshot`) → waypoint recall → hybrid recall + governed rerank → feedback-driven calibration, every step on the record

**Switches**: `ADD_MEMORY_RECALL_MODE=off|shadow|inject` (default `shadow`: recall runs and is audited, but is not injected yet) · `ADD_MEMORY_MAX_TOKENS` (default 600) · `ADD_MEMORY_EVIDENCE` (default `on`).

> Honest disclosure: measured Hybrid `MRR@5` 0.4867 < the 0.75 threshold (FTS-only 0.6551, Recall@5 0.9592) — the threshold stays put; data-driven calibration replaces hand-tuning. The capability runs, can be inspected and can be adjudicated — no metric inflation.
> Source layout, tables and dev workflow: [DEVELOPMENT.md](./DEVELOPMENT.md) §十七.

### ⑤ Policy-Update-Loop: Self-Evolving Governance

> **Static templates rot; closed-loop governance evolves.** Rules are not frozen constants — they are parameters that audit data can move.
> (The scaffold itself does not include the end-to-end boundary-report loop yet; a DEMO repo will illustrate the Policy-Update-Loop and Report system.)

```text
Execute → Audit → Boundary Report → Rule Adjustment → Next Execution
```

| Dimension | Static rules / templates | add-coder Policy-Update-Loop |
|-----------|--------------------------|------------------------------|
| **Where rules live** | Hard-coded in code and prompts; changing them means a release | caijuehub TOML declarations: rule sources → generated constants → inlined into artifacts; **edit rules, not code** |
| **Where rules come from** | Thresholds picked by intuition | Fed by audit data: DPS **FFT adaptive weights**; `check_doc_similarity` quantitatively re-checks look-alike documents |
| **Feedback loop** | None | **Execute → Audit (✓ live)**: hook interception / file-write events → jsonl → MCP resident consumer → DevOperation persistence (`HOOK_INTERCEPT`, idempotent dedup) |
| **Consistency** | Each endpoint implements its own, behaviour drifts | One governance contract layer + a five-endpoint consistency matrix asserting each behaviour (dangerous-command blocking / sensitive-file anchoring / audit event surface / protocol shape / zero governance duplication) |
| **Evidence of evolution** | No trail | Every interception, score and adjudication lands in the audit store — queryable, countable, reproducible |
| **Not closed yet** | — | Boundary reports (Runtime Report) end-to-end pending the DEMO repo (disclosed as-is) |

### ⑥ Multi-IDE Hooks as the Governance Layer

Hooks are not "notification push" — they are the **IDE runtime interception layer**:

| Hook Type | Function |
|-----------|----------|
| PreToolUse | Validates whitelist before tool invocation, injects context, DPS condition checks |
| PostToolUse | Automatic audit logging, Plan sync detection, format guarding |
| PreCompact | Forces retention of critical document paths during cross-session context compression |
| PromptSubmit | Injects ADD vocabulary triggers, ensuring zero-latency LLM response to commands like "acceptance" and "gateway" |

Each IDE（Claude Code / Qoder CN / VS Code Copilot / Trae / Codex）has its own hook implementation, but the **governance logic is unified** — the architecture is consistent, only the adapter layer differs.

| IDE | Governance Doc | Registrable events | Hook Config (direct node invocation) |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./templates/core/docs/ADD-governance-claude-code.md) | 11/16 | `.claude/hooks/*.mjs` (settings.json command) |
| Qoder CN | [ADD-governance-qoder-cn.md](./templates/core/docs/ADD-governance-qoder-cn.md) | 11/16 | `.qoder/hooks/*.mjs` (settings.json command) |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./templates/core/docs/ADD-governance-vscode-copilot.md) | 10/16 | `.vscode/hooks/*.mjs` (Agent Host dual channel) |
| Trae | [ADD-governance-trae.md](./templates/core/docs/ADD-governance-trae.md) | 6/16 | `hooks.json` → `.trae/hooks/*.mjs` |
| Codex | [ADD-governance-codex.md](./templates/core/docs/ADD-governance-codex.md) | 5/16 | `.codex/hooks.json` → `.codex/hooks/*.mjs` |

### ⑦ Codex Native Integration (v0.3.25)

> **Not a bolted-on MCP server, but governance landing natively.** "Templates generated" ≠ "end-to-end verified" — this is a 6-step path that has actually been exercised.

| Dimension | Typical integration | add-coder × Codex |
|-----------|--------------------|-------------------|
| **Setup cost** | Hand-written launcher scripts | Three CLI steps: `init --adapter=codex` → `--print-mcp-config` (no writes, no project init) → paste, or `--write-user-config` (backup first, duplicate-safe) |
| **Governance surface** | Tool calls only, no lifecycle governance | **Native hooks**: `.codex/hooks.json` → `.codex/hooks/*.mjs` (14 entry artifacts pre-baked in the package, invoked by `node`; 5/16 native events registrable today, the rest already placeheld, enabled with zero code once the event model grows) |
| **Approval** | Ask in chat | **Native HITL**: `create_hitl` takes the MCP Apps branch (no high-dimensional `inputRequired` in Codex); when the panel cannot render, it falls back to a markdown proposal + instance HTML, and verdicts are still persisted |
| **Runtime state** | No way to tell whether the new artifacts are running | **Four-state artifact/process freshness** + `.mcp-restart-required` marker: `sync` names the server that needs a restart |
| **Multi-project** | A pasted-wrong config silently connects to the wrong DB | `env.PROJECT_ROOT` injected at render time; a mismatched config makes mcp-server exit on startup (process-layer contract §4) |
| **Platform** | WSL required / paths patched by hand | win32 automatically emits a native `cmd /c npx.cmd` branch |

> Disclosed as-is: some Codex builds (measured `26.908`) do not render the approval widget; approval then goes through the markdown proposal + instance HTML + a chat verdict — the path works and verdicts are still persisted.

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
│11/16 │ │11/16 │ │  10/16   │ │ 6/16 │ │ 5/16 │
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
>   image: docker.io/pgvector/pgvector:pg16
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
| Memory Enhancement | ✅ **Delivered in v0.3.35**: idempotent evidence collection + deterministic waypoint recall + hybrid FTS×vector recall (RRF fusion + governed rerank) + Handoff Digest candidates + a ranking calibration foundation; defaults to `shadow` mode (recall runs and is audited, not injected yet) |

---

## 🙏 Acknowledgements

A paradigm is worth what people make of it — including the problems they find in it. The **contributor wall** and the full list (verifiable item by item, in Chinese) live in **[docs/ACKNOWLEDGEMENTS.md](./docs/ACKNOWLEDGEMENTS.md#-贡献者墙)**.

| Contributor | Contribution | What it left behind |
|-------------|--------------|---------------------|
| [@iopzhu](https://github.com/iopzhu) | Memory rotation on the `memory_cache` branch (`357b215`, 48 files / +5877 −33) | The retrieval and tooling backbone of the memory loop: `retrieval/pipeline`, RRF fusion, governed rerank, dual FTS channels, evidence/snapshot jobs, `tools/memory.ts` (609 lines) plus a 909-line recall evaluation set |
| [@Milkycoffees](https://github.com/Milkycoffees) | Ecosystem work: [`add-coder-flash`](https://www.npmjs.com/package/add-coder-flash) (npm `1.0.4`, 5 releases, plus a [public GitHub repo](https://github.com/Milkycoffees/add-coder-flash)) | A zero-dependency lightweight distribution: pure-`.mjs` hooks, no database required, assets laid down by `npm install`; auto-generates `.qoder-cn/mcp.json` and fed real constraints back (QoderCN config location, pnpm `allowBuilds`, MCP name length) |
| [@albertm88](https://github.com/albertm88) | Relentless issue reporting (#5–#7, #10–#20 — 14 issues, all closed) | Cross-session memory, 429 storms, Windows stability, native Codex adaptation, port drift, non-interactive hangs, first-run HITL approval… walking the edge cases so nobody else has to |

> Want on the wall? The criteria live in [CONTRIBUTING.md §贡献者墙](./CONTRIBUTING.md#贡献者墙) — file an [issue](https://github.com/xiaomingming92/add-coder/issues) (reproducible problems, real logs, platform differences) or open a [PR](https://github.com/xiaomingming92/add-coder/pulls); both count as hard contribution.

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

> **别的工具靠「再试一次」，add-coder 靠「先过闸门」。**

DPS（Documentation Precision Score）= 语义 + 熵 + CPM 关键路径 + 结构完整度四维复合 + FFT 自适应权重（`PASS=80`）；RAHS = 范围保真 / 类型安全 / 审计完整 / Spec 合规 / 阶段对称（≥90）。这不是「建议」，是**架构阻断**——不过闸门，Step 推进不了；阈值与权重都是可读 TOML 真源（`dps-scoring-rules.toml`），改规则不改代码。

### ③ 跨轮记忆，而非每轮失忆

> **别的工具在「记」，add-coder 在「治理记忆」。** 记忆不是上下文工程，是治理工程。

多数工具的记忆 = 会话/仓库级文本摘录 + 向量检索（解决「看过」）；add-coder 是**受治理的知识层**：候选制入库（approve 需 ≥1 证据）· 证据链 + 幂等采证 · 位点确定性召回 · FTS×向量 RRF 融合 + 治理重排 · 召回可重放（`recallId` / `rankingVersion`）· 治理状态机可证伪（supersede 强制 scope 兼容）· 八级 scope 隔离 + 越库泄漏抽查 · 权重快照即排序参数单一事实源。

**落地**：文档层（Handoff / Plan 索引 / DevLog 时序）+ 知识层（v0.3.35 记忆闭环，全链条留痕）；开关 `ADD_MEMORY_RECALL_MODE` 默认 `shadow`（召回照跑照审计、暂不注入）。
**如实登记**：Hybrid `MRR@5` 0.4867 < 0.75 门槛，门槛不下调，由排序校准线程以数据校准替代手调。

### ④ Policy-Update-Loop：治理自我进化

> **静态模板会腐化，闭环治理会进化。**

执行 → 审计（✓ 已接入：hook 拦截 / 文件写入 → jsonl → MCP 常驻消费 → DevOperation 幂等落库）→ 规则调整（✓ 已接入：caijuehub 改规则不改代码 · DPS FFT 自适应权重 · `check_doc_similarity` 量化复检）；边界报告（Runtime Report）端到端实践待 DEMO 仓库演示。

### ⑤ 多 IDE 的 Hook 即治理层
| IDE | 治理文档 | 覆盖事件 | Hook 配置 |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./templates/core/docs/ADD-governance-claude-code.md) | 11/16 | `.claude/hooks/*.mjs`（settings.json command） |
| Qoder CN | [ADD-governance-qoder-cn.md](./templates/core/docs/ADD-governance-qoder-cn.md) | 11/16 | `.qoder/hooks/*.mjs`（settings.json command） |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./templates/core/docs/ADD-governance-vscode-copilot.md) | 10/16 | `.vscode/hooks/*.mjs`（Agent Host 双通道） |
| Trae | [ADD-governance-trae.md](./templates/core/docs/ADD-governance-trae.md) | 6/16 | `hooks.json` → `.trae/hooks/*.mjs` |
| Codex | [ADD-governance-codex.md](./templates/core/docs/ADD-governance-codex.md) | 5/16 | `.codex/hooks.json` → `.codex/hooks/*.mjs` |

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
| `check_dps` | DPS 闸门（`PASS=80`，阈值以 `dps-scoring-rules.toml` 为准） |
| `check_rahs` | RAHS 闸门（< 90% BLOCKED） |

## 前置条件
- Node.js >= 20 · Prisma ^7.0 · PostgreSQL / SQLite

## 🎬 预告
| 计划 | 说明 |
|---|---|
| Demo 仓库演示 | Policy-Update-Loop 与 Report 体系端到端闭环实践 |
| MCP 能力重构 | MCP 工具链架构升级 |
| 对话记忆增强 | ✅ **v0.3.35 记忆闭环落地**：幂等采证 + 位点确定性召回 + FTS×向量混合召回 + Handoff Digest 候选 + 排序校准基座；默认 `shadow` 模式 |

> 📦 [更新日志](./CHANGELOG.md)
</details>
