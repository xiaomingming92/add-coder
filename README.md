# add-coder

Make 0.75 into one.

<p align="left" style="width: 100%;  background: linear-gradient(135deg, #b8a0a0ff 0%, #ce9674ff 100%); display: flex; justify-content: space-between; align-items: center; padding: 6px">
   <img src="https://img.shields.io/npm/dm/add-coder" alt="npm downloads">
   <img src="https://img.shields.io/badge/npmcharts-4.9k%2Fmonth-blue" alt="npmcharts">
   <a href="https://www.npmcharts.com/compare/add-coder?interval=30" style="color:#c41a16;font-weight:700">📈 趋势</a>
 </p>

```bash
# 第一次过死亡谷耗时 19天
~ $ curl -s https://api.npmjs.org/downloads/point/last-month/add-coder                          {"downloads":5161,"start":"2026-06-29","end":"2026-07-28","package":"add-coder"}~ $             ~ $ npm info add-coder@0.1.0                                                                    add-coder@0.1.0 | MIT | deps: 3 | versions: 35  Initialize ADD paradigm workflow templates for Claude Code, Qoder, and VS Code.                                                                 keywords: add, add-paradigm, claude, qoder, vscode, mcp, workflow, codein2027, 集中裁决层, caijuehub
                                                bin: add-coder
                                                dist
.tarball: https://registry.npmjs.org/add-coder/-/add-coder-0.1.0.tgz
.shasum: 3266ddb5304d303705694edec7c2f41efc24881d                                               .integrity: sha512-MxFICLEoAgTVxnHaiIOli5eVyCXvB+xnSzpfmu0mrigEeM9NxzBOm2Auzjn1GKUTXSWelT0FecwwlYmsCf+TWQ==
.unpackedSize: 704.9 kB

dependencies:
zod: ^3.24.0, commander: ^13.1.0, smol-toml: ^1.7.0

maintainers:
- wujixmm <wujixmm@gmail.com>

dist-tags:
latest: 0.3.5
preview: 0.3.6-feature-hitl-enhance-v1.2

published 2 weeks ago by wujixmm <wujixmm@gmail.com>

```
> 🀄中文 | 🔤[English](#-english-readme)

**AI 代码治理的落地方案** — [codein2027](https://github.com/xiaomingming92/codein2027) 快速构建 ADD 编程范式的完整脚手架。以「审计即基础设施」为核心，彻底打破编程过程黑盒与跨轮失忆，让编程范式进化为可审计、可追溯、可收敛的新时代。 [NPM](https://www.npmjs.com/package/add-coder) · [GitHub](https://github.com/xiaomingming92/add-coder)


> 🧭 **从零上手实操？** 请参见 [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md) — 包含触发词速查、需求转 Plan、完整链路演练。
>
> 📖 **想看 ADD 范式真实落地案例？** → [老设备续命工程](#-案例示范老安卓设备续命工程) — weather_proxy 实践。->或者add-coder项目本身就是很好的落地案例(自举成功)。
>
> 🔄 **add-coder 升级后担心更新本地Skills,rules,hooks,templates等等会很麻烦？** `npx add-coder sync --adapter=qoder --patch` — 实操看 [GUIDE.md §版本升级](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md#%E4%B8%83add-coder-%E5%8D%87%E7%BA%A7%E5%90%8E%E6%80%8E%E4%B9%88%E6%9B%B4%E6%96%B0%E6%9C%AC%E5%9C%B0%E6%96%87%E4%BB%B6) | 原理看 [DEVELOPMENT.md](https://github.com/xiaomingming92/add-coder/blob/main/DEVELOPMENT.md)

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

### ② Caijuehub 集中裁决层：从 sync 到三域覆盖

Caijuehub 是 add-coder 历史上第一个实现 **TOML 规则声明 → 自动生成策略 → 业务代码消费** 的裁决引擎。从最初 sync --patch 的单域实验，到今天覆盖 HITL 审批和 DPS 评分的三域体系，演进路径本身证明了集中裁决层的扩展性。详见 [docs/caijuehub.md](./docs/caijuehub.md)。

| 裁决域 | 规则文件 | 消费者 | 说明 |
|--------|---------|--------|------|
| add-coder run sync --patch | `sync-rules.toml` | `sync.ts` | **npm 包史上首个集中裁决热更新案例**（eating my own dog food：add-coder 用 caijuehub 管理自己的模板同步） |
| HITL 审批 | `hitl-interaction-rules.toml` | `hitl.ts` | 每 IDE 独立声明交互模式 |
| DPS 评分 | `dps-scoring-rules.toml` | `gateway.ts` | 文档质量闸门：语义/熵/CPM/结构 四维权重+阈值，AI 调参不碰代码 |

> 📊 [sync-magic benchmark](./docs/sync-magic-benchmark-report.md)：caijuehub 改造实测——4 组对比，TS vs bash，熵值 vs 速度的场景价值分析。
>
> 🧠 [什么是酷的软件](./docs/what-makes-software-cool.md)：从 benchmark 出发抽象工程美学框架——标准符合度 × 熵值 × runtime 容忍区间。含 IT 运营 vs 个人认知双视角分析、达索案例。

**改规则不改代码**——产品经理读 TOML 即可理解软件行为，市场人员改 TOML 即可调整策略参数。AI Agent 大规模索引、检索、修改规则时，操作的是同一张决策表。认知负担从 O(N×M) 降为 O(1)。

### ③ Prompt Cache 原生友好 — 月费 ¥218，节省 98%

ADD 范式不仅是方法论——它的结构化 Step 流程天然适配 DeepSeek Prompt Cache 的前缀匹配机制，带来极致的 Token 成本效率。**实测数据验证**：

| 指标 | 数值 |
|------|------|
| DeepSeek 7月实际账单 | **¥218.35** |
| 若无 Prompt Cache 理论费用 | ¥11,100 |
| Cache 命中率 | **99.31%** |
| 缓存命中 vs 未命中价差 | **120 倍**（¥0.025/M vs ¥3/M） |
| 总费用节省 | **98.1%** |

```
传统 IDE 自由对话:  cache 命中率 85-91%, 每次请求 MISS 5,000 tokens
ADD 范式 + Qoder:     cache 命中率 99.31%, 每次请求 MISS 仅 2,426 tokens
```

> 📊 [完整分析报告](./docs/ADD范式缓存命中分析报告.md) — 含 4 张 Mermaid 图表、17 天逐日数据、跨 IDE 对比与成本建模。

### ④ 门禁驱动，而非自由对话

传统 AI coding 是「你说我做」，质量完全依赖 LLM 当天状态。add-coder 在架构中嵌入了 **双质量闸门**，不是「建议」，是**架构阻断**：

```
DPS (Documentation Precision Score) — TF-IDF/Jaccard 语义 + 香农/Deng 熵 + CPM 关键路径 + 结构完整度
  → 四维复合评分 + FFT 自适应权重，≥ 85 进入 Step 1
RAHS (Runtime Architecture Health Score) — 运行时架构健康度
  → 五维判定：范围保真 + 类型安全 + 审计完整 + Spec 合规 + 阶段对称，≥ 90 通过
```

DPS 全部参数由 caijuehub TOML 驱动——AI 可以跑分→看弱项→调参→再跑分，全程不改代码。

### ⑤ 跨轮记忆，而非每轮失忆

AI 对话的致命缺陷：上次讨论的架构决策、已修复的 Bug、达成的约定，下轮对话全部遗忘。add-coder 在架构层面解决：

- **Handoff 文档** — 每轮 Session 结束时自动生成结构化交接文档，下轮会话自动加载
- **Plan 索引** — 所有 Plan 通过 `index.md` 集中索引，支持模糊匹配快速定位
- **DevLog 时序记录** — 每一步操作写入 `{YYYY-MM}/{DD}/` 时间轴，可回溯任意历史状态

### ⑥ Policy-Update-Loop：治理自我进化(脚手架不包含此架构能力,接下来会给到DEMO仓库让大家更好理解Policy-Update-Loop和Report体系)

不是静态模板，而是**闭环自适应系统**：

```
执行 → 审计 → 边界报告 → 规则调整 → 下一轮执行
```

运行时产生的 Report 会反过来更新 governance rules，实现治理策略的持续进化。

### ⑦ 多 IDE 的 Hook 即治理层

hook 不是「通知推送」，而是 **ADD 范式在 IDE agent 生命周期中的 17 个确定性治理卡位**。每个 IDE（Claude Code / Qoder CN / VS Code Copilot / Trae / Codex）有各自的 hook 机制，但治理逻辑统一——架构一致，适配层不同。

| IDE | 治理文档 | 覆盖事件 | Hook 配置 |
|---|---|---|---|
| Claude Code | [ADD-governance-claude-code.md](./ADD-governance-claude-code.md) | 14/17 | `.claude/hooks/*.sh` |
| Qoder CN | [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md) | 10/17 | `.qoder/hooks/*.sh` |
| VS Code Copilot | [ADD-governance-vscode-copilot.md](./ADD-governance-vscode-copilot.md) | 10/17 | `.github/hooks/*.json` → `.vscode/hooks/*.sh` |
| Trae | [ADD-governance-trae.md](./ADD-governance-trae.md) | 6/17 | `hooks.json` → `.trae/hooks/*.sh` |
| Codex | [ADD-governance-codex.md](./ADD-governance-codex.md) | 0 (原生) / 14 (导入 Claude) | `.codex/hooks.json` |

> 实施 Plan: [add-coder-hook-full-alignment-plan-v1](./.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md) | 触发源: [GitHub Issue #6](https://github.com/xiaomingming92/add-coder/issues/6)

### ⑧ HITL 人机审核：审批即基础设施

AI 写代码绕过人类决策是 AI coding 最大的结构性风险。add-coder 的 HITL 不是"弹个框问一下"，而是**架构级强制审批**：

| 能力 | 实现 |
|------|------|
| **8 维决策表** | 实施主体 / 数据模型 / MCP 工具 / 文件命名 / 模板 / 依赖 / 文件数 / 轮次——每行独立同意/调整 |
| **双轨制交互** | Qoder → genui widget 聊天内嵌审批面板；其他 IDE → MCP inputRequired 弹框降级 |
| **caijuehub 驱动** | 交互模式由 TOML 声明，新增 IDE 只加一行配置 |
| **hook 强制拦截** | 无 `.hitl-tongyi` 哨兵 → 禁止写入正式 Plan/Review 文件 |

### ⑨ IDE 代办清单：Plan 任务直通编码面板

Plan 里的 Task 不应该停留在文档里。add-coder 将 tasks.md 末尾的 JSON 任务清单直接加载到 IDE 代办面板，完成一个勾一个，进度实时可见。session-init 两场景分流——新对话让用户选 Plan，编码阶段自动定位当前 Plan 加载。

```
tasks.md §IDE JSON → TodoWrite → IDE 面板
```



---

## 📖 案例示范：老安卓设备续命工程

[weather_proxy](https://github.com/xiaomingming92/weather_proxy) 是 ADD 范式在真实项目中的完整落地案例——为一个 2010 年代的旧 Android 设备（中兴 V880 / HTC G13）重建天气服务。

- 🧓 **硬件完好，软件死亡** — 厂商天气服务全部关停，设备只能看不能用
- 📐 **ADD 范式全链路可见** — 从 `.trae/specs/` 早期三元组 → `.qoder/` 标准化 → 集中裁决层 TOML 化
- 🔧 **集中裁决层实战** — `caijuehub/` 三层架构：TOML 声明 → 转录引擎 → 策略消费，新增机型只需 10 行配置
- 📊 **DeviceRegistry 重构** — cron-service.ts 647→232 行，stop() 全覆盖，4 个历史 Bug 修复
- 🧪 **45 用例全覆盖** — vitest，tsc --noEmit 零错误，ESLint 零新增

> ⚠️ 仅限个人学习与技术讨论。详见 [weather_proxy/README.md](https://github.com/xiaomingming92/weather_proxy#readme)。

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
| ③ | 数据库部署 | `db-ensure.sh` 启容器/PG 连接 + `injectPrisma()` 集中裁决层（Prisma init → AddUser 模型复制 → db push → generate） |
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

`init` 自动部署 MCP 服务器 (`mcp-server.ts`) 到项目中，IDE 通过 `mcp.json` 加载。基于 **MCP 协议六大能力**（四大原语 + 两个横切）：

```
MCP 能力            方向              当前状态     说明
─────────────────────────────────────────────────────────────
Tools              Client→Server     ✅ 已实现     18 个审计与治理工具（pull 模式）
Resources+Sub      Client←Server     ✅ 已实现      8 个端点 Plan/Review/Route/Task/Hook 状态推送
Notifications      Server→Client     ✅ 已实现      HITL 就绪 + Hook 拦截事件推送
Sampling           Server→Client     ✅ 已实现      服务端回调 AI 生成 Review (HITL 两步法)
── 横切 ──
Elicitation        Server→Client     ✅ 已实现      向用户请求 HITL 确认/风险输入
Tasks (实验性)     双向              ✅ 已实现      长任务持久化 + 状态追踪
```

**当前已实现的 18 个 Tools**：

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
| `get_hook_events` | 查询 Hook 拦截事件（planKeyword/hook/时间过滤+分组） | 治理审计、阈值告警 |

> 完整六能力架构设计见 [MCP 重构 Plan](.qoder/plans/2026-07/23/add-coder-mcp-restructure-plan-v1.md)。

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
    ┌──────────┬───────────┼────────┬─────┐
    ▼          ▼           ▼        ▼     ▼
┌──────┐ ┌──────┐ ┌──────────┐ ┌──────┐ ┌──────┐
│Claude│ │Qoder │ │ VS Code  │ │ Trae │ │Codex │
│Hooks │ │Hooks │ │  Config  │ │Hooks │ │Hooks │
│14/17 │ │10/17 │ │  10/17   │ │ 6/17 │ │ 6/17 │
└──────┘ └──────┘ └──────────┘ └──────┘ └──────┘
                           │
                           |
                           ▼
       ┌─────────────────────────────────────┐
       │     Caijuehub 集中裁决层               │
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
>     POSTGRES_DB: <your-db>
>     POSTGRES_USER: <your-db-user>
>     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
> ```
> 数据卷建议挂载到 `~/data/your_project/postgres/`，避免容器销毁丢失数据。

> 📦 [更新日志 (CHANGELOG)](./CHANGELOG.md)

---

## 🎬 预告

| 计划 | 说明 |备注|
|------|------|------|
| Demo 仓库演示 | 提供完整示例仓库，展示 Policy-Update-Loop 与 Report 体系的端到端闭环实践 |--|
| MCP 能力重构 | ✅ v0.2.9 MCP 工具链架构升级，提升审计与门禁工具的可扩展性和独立部署能力 | 2026-07/23/add-coder-mcp-restructure-plan-v1.md |
| Hook 通知升级 | ✅ v0.2.9 Hook 拦截事件 jsonl → fs.watch → record_dev_operation 落库 + Notification + 治理信号 | 2026-07/24/add-coder-hook-notify-upgrade-plan-v1.md |
| ide插件 | 解耦ADD范式代码和被治理项目的代码 |在做了,大家拭目以待吧,让编程更有趣,我的目标其实不在于IDE,我的工作顺手的事情 |
| 对话记忆增强 | 长期项目知识记忆和plan级别的稀疏记忆 |--|



---
## 🔤 English README

**AI Governance, Implemented** — The complete scaffolding from [codein2027](https://github.com/xiaomingming92/codein2027) for rapidly building the ADD programming paradigm. Built on the core principle of **Audit as Infrastructure**, it shatters the black-box programming process and cross-session amnesia, evolving the programming paradigm into an auditable, traceable, and convergent new era. [NPM](https://www.npmjs.com/package/add-coder) · [GitHub](https://github.com/xiaomingming92/add-coder)


> 🧭 **Getting hands-on?** See [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md) — trigger word quick reference, requirements-to-Plan, and full workflow walkthrough.
>
> 📖 **Want to see ADD in action?** → [Old Android Device Revival](#-case-study-breathing-life-back-into-old-android-devices) — weather_proxy practice.
>
> 🔄 **Worried about updating local Skills, rules, hooks, templates after upgrading add-coder?** `npx add-coder sync --adapter=qoder --patch` — how-to: [GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md#%E4%B8%83add-coder-%E5%8D%87%E7%BA%A7%E5%90%8E%E6%80%8E%E4%B9%88%E6%9B%B4%E6%96%B0%E6%9C%AC%E5%9C%B0%E6%96%87%E4%BB%B6) | principles: [DEVELOPMENT.md](https://github.com/xiaomingming92/add-coder/blob/main/DEVELOPMENT.md)

```bash
npx add-coder init
```

<p align="left" style="width:100%;background:linear-gradient(135deg,#a0b8a0 0%,#74ce74 100%);display:flex;justify-content:space-between;align-items:center;padding:6px">
  <img src="https://img.shields.io/npm/dm/add-coder" alt="npm downloads">
  <img src="https://img.shields.io/badge/npmcharts-4.9k%2Fmonth-blue" alt="npmcharts">
  <a href="https://www.npmcharts.com/compare/add-coder?interval=30" style="color:#1a6b1a;font-weight:700">📈 Trend</a>
</p>

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

### ② Caijuehub — The Centralized Adjudication Layer: From Sync to Three Domains

Caijuehub is add-coder's first implementation of **TOML declaration → auto-generated strategy → business code consumption**. From the initial sync --patch experiment to today's three-domain coverage spanning HITL and DPS, the evolution proves the extensibility of the centralized adjudication layer. Details: [docs/caijuehub.md](./docs/caijuehub.md).

| Domain | Rules File | Consumer | Description |
|--------|---------|--------|------|
| sync --patch | `sync-rules.toml` | `sync.ts` | **First centralized adjudication hot-update in npm history** (eating my own dog food: add-coder manages its own template sync via caijuehub) |
| HITL Approval | `hitl-interaction-rules.toml` | `hitl.ts` | Per-IDE interaction mode declaration |
| DPS Scoring | `dps-scoring-rules.toml` | `gateway.ts` | Doc quality gateway: semantic/entropy/CPM/structure 4D weights+thresholds, AI self-tuning without touching code |

> 📊 [sync-magic benchmark](./docs/sync-magic-benchmark-report.md): Caijuehub refactoring measured — 4-group comparison, TS vs bash, scenario-value analysis of entropy vs speed.
>
> 🧠 [What Makes Software Cool](./docs/what-makes-software-cool.md): An engineering aesthetics framework derived from the benchmark — standards compliance × entropy × runtime tolerance. IT ops vs personal cognition perspectives, Dassault case study.

**Edit rules, not code** — product managers read TOML to understand software behavior, marketers modify TOML to adjust strategy parameters. When AI agents index, search, and modify rules at scale, they operate on the same decision table. Cognitive load drops from O(N×M) to O(1).

### ③ Prompt Cache Native — ¥218/mo, 98% Savings

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

### ④ Gateway-Driven, Not Free-Form Conversation

Traditional AI coding is "you say, I do" — quality depends entirely on the LLM's state that day. add-coder embeds **dual quality gateways** into the architecture. These are not "suggestions" — they are **architectural blocks**:

```
DPS (Documentation Precision Score) — TF-IDF/Jaccard semantics + Shannon/Deng entropy + CPM critical path + structural completeness
  → 4D composite scoring + FFT adaptive weights, ≥ 85 to enter Step 1
RAHS (Runtime Architecture Health Score) — runtime architecture health
  → 5D assessment: scope fidelity + type safety + audit completeness + spec compliance + phase symmetry, ≥ 90 to pass
```

All DPS parameters are driven by caijuehub TOML — AI can run→analyze weak spots→tune→rerun, all without touching code.

### ⑤ Cross-Session Memory, Not Per-Session Amnesia

The fatal flaw of AI conversations: architectural decisions from last session, bugs fixed, agreements reached — all forgotten in the next conversation. add-coder solves this at the architecture level:

- **Handoff Documents** — Automatically generated structured handoff at the end of each session, auto-loaded by the next session
- **Plan Index** — All Plans are centrally indexed via `index.md`, supporting fuzzy-match quick lookup
- **DevLog Timeline** — Every operation is written to the `{YYYY-MM}/{DD}/` timeline, enabling full historical state traceability

### ⑥ Policy-Update-Loop: Self-Evolving Governance (the scaffold itself does not include this architectural capability; a DEMO repo will be provided next to better illustrate the Policy-Update-Loop and Report system)

Not a static template, but a **closed-loop adaptive system**:

```
Execute → Audit → Boundary Report → Rule Adjustment → Next Execution
```

Runtime-generated Reports feed back into governance rules, enabling continuous evolution of governance strategies.

### ⑦ Multi-IDE Hooks as the Governance Layer

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

### ⑧ HITL Human-in-the-Loop: Approval as Infrastructure

AI generating code without human oversight is the greatest structural risk in AI coding. add-coder's HITL is not "a popup checkbox" — it is **architecture-level mandatory approval**:

| Capability | Implementation |
|------|------|
| **8-dimension decision table** | Implementer / Data Model / MCP Tools / File Naming / Templates / Dependencies / File Count / Rounds — per-row agree/adjust |
| **Dual-track interaction** | Qoder → genui widget inline approval panel; Other IDEs → MCP inputRequired dialog fallback |
| **caijuehub-driven** | Interaction mode declared in TOML; adding a new IDE = one line of config |
| **Hook enforcement** | No `.hitl-tongyi` sentinel → blocked from writing formal Plan/Review files |

### ⑨ IDE Task Panel: Plan Tasks Directly in Your Editor

Tasks in Plan docs shouldn't stay in docs. add-coder loads the JSON task list from tasks.md directly into the IDE task panel — check off as you go, progress visible in real time. session-init dual-scenario dispatch — new thread lets user pick a Plan; coding phase auto-locates the current Plan and loads.

```
tasks.md §IDE JSON → TodoWrite → IDE panel
```

---

## 📖 Case Study: Breathing Life Back into Old Android Devices

[weather_proxy](https://github.com/xiaomingming92/weather_proxy) is a complete ADD paradigm implementation — rebuilding weather services for 2010-era Android devices (ZTE V880 / HTC G13).

- 🧓 **Hardware intact, software dead** — official weather services all shut down
- 📐 **Full ADD pipeline** — `.trae/specs/` triads → `.qoder/` standardization → Caijuehub TOML
- 🔧 **Caijuehub in action** — 3-layer architecture: TOML declaration → transcribe engine → strategy consumption
- 📊 **DeviceRegistry refactor** — cron-service.ts 647→232 lines, 4 historical bugs fixed
- 🧪 **45 test cases** — vitest, zero tsc errors, zero new ESLint warnings

> ⚠️ Personal learning & technical discussion only. See [weather_proxy/README.md](https://github.com/xiaomingming92/weather_proxy#readme).

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
       │  Caijuehub — Centralized            │
       │  Adjudication Layer                  │
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
>     POSTGRES_USER: <your-db-user>
>     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
> ```
> Mount data volume to `~/data/your_project/postgres/` to avoid data loss on container removal.

> 📦 [Changelog](./CHANGELOG.md)

---

## 🎬 Coming Soon

| Plan | Description | remark |
|------|-------------|:---:|
| Demo Repo | Full example repository showcasing Policy-Update-Loop with Report system end-to-end | 📋 |
| ~~MCP Restructure~~ | ✅ v0.2.9 3,467-line monolith → 27 modules covering all six MCP primitives | 2026-07/23/... |
| ~~Hook Notification Upgrade~~ | ✅ v0.2.9 ~36 files: hook intercept → jsonl → fs.watch → record_dev_operation | 2026-07/24/... |
| Memory Enhancement | Long-term project knowledge memory and plan-level sparse memory | 📋 |

---

My hometown 

<img width="720"  alt="hometown outside" src="https://github.com/user-attachments/assets/7aad93de-9cea-4194-b09d-cbd892d61cc2" />
