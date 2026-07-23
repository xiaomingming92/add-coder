# add-coder 实践指南

> 从零开始，用 ADD 范式完成一个需求的完整闭环。
>
> 📦 **项目概览、架构设计、MCP 工具链** 请参见 [README.md](./README.md)。🛠 **开发者文档（sync 机制 / 唯一真源 / 自举原理）** 请参见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

---

## 目录

- [前置条件](#前置条件)
- [一、认识 ADD 工作流](#一认识-add-工作流)
- [二、触发词在哪里看](#二触发词在哪里看)
- [三、需求如何转为 Plan](#三需求如何转为-plan)
  - [3.1 产品写 PRD](#31-产品写-prd)
  - [3.2 AI 根据 PRD 生成 Plan](#32-ai-根据-prd-生成-plan)
  - [3.3 PRD 修改了怎么办](#33-prd-修改了怎么办)
  - [3.4 Plan 的 HITL 审核：先拍板再展开](#34-plan-的-hitl-审核先拍板再展开)
- [四、Plan 如何实施](#四plan-如何实施)
  - [4.1 启动 ADD 工作流](#41-启动-add-工作流)
  - [4.2 关键步骤要等人确认](#42-关键步骤要等人确认)
  - [4.3 两个闸门会强制阻断](#43-两个闸门会强制阻断)
  - [4.4 每轮都有交接文档](#44-每轮都有交接文档)
  - [4.5 Review 的 HITL 审核：先过总览再逐条分析](#45-review-的-hitl-审核先过总览再逐条分析)
- [五、目录结构速查](#五目录结构速查)
- [六、一条完整链路走一遍](#六一条完整链路走一遍)

---

## 前置条件

```bash
# 一键完成：数据库配置 + Prisma 初始化 + 模板部署
npx add-coder init
# → 选择 IDE（Qoder / Claude / VS Code）
# → 选择数据库（PostgreSQL / SQLite / 自行管理）
# → 选择容器（podman / docker / 自行管理）
# → prisma init + add.prisma 复制 + prisma db push + prisma generate
# → ADD 治理模型已就绪 ✓
```

> PostgreSQL 默认端口 5433，数据卷在 `./data/postgres/{项目名}/`。
> 环境文件优先级：`.env.development.local` > `.env.development` > `.env.local` > `.env`

---

## 一、认识 ADD 工作流

ADD 不是"写代码时顺便打日志"，而是一套覆盖全开发周期的标准化流程。每个需求走一次完整闭环：

```
需求(PDR) → Plan → Review → Spec → 代码+审计 → 验收 → Handoff
  ↑                                                    │
  └──────────── 下个 Session 稀疏恢复 ──────────────────┘
```

### 十个 Step 一览

| Step | 名称 | 做什么 | 关键产出 |
|:--:|------|------|------|
| 0 | 文档先行 | 写 PRD → 生成 add-route → DPS 门禁 | PRD + add-route |
| 1 | 功能分析 | 确定审计 Phase，扩展 AgentAuditPhase | 审计阶段定义 |
| 2 | 审计基础设施 | 确认 agentAudit 通道可用 | — |
| 3 | 业务逻辑实现 | add-route 守卫 → 写代码 + 审计植入 | 代码 |
| 3.5 | 实现审查 | 跑 checklist [T] 项 → 生成 review | review-implementation |
| 4 | 审计验证 | 阶段对称性 + 失败路径 + RAHS 门禁 | 审计数据 |
| 5 | 合规检查 | AI 自动检查 ADD 原则 | 合规报告 |
| 6 | 定位问题 | 从审计数据推断根因 | 根因分析 |
| 7 | 修复验证 | 修复 → 重新验证 | — |
| 8 | 收敛判断 | devlog + handoff + 架构回看 | handoff 文档 |
| 9 | Report Closure | 仅 runtime-fix plan，关闭 gateway 发现 | — |

---

## 二、触发词在哪里看

所有触发词在 `.qoder/vocabulary/add-governance-vocabulary.md`（运行时副本；真源在 `templates/core/vocabulary/add-governance-vocabulary.md`，如需修改触发词请改真源后执行 `npm run sync`）。这份词汇表预埋到 AI 的 always-on 上下文中，AI 听到关键词时零额外 prompt 执行正确操作。

### 最常用的几个

| 你对 AI 说 | AI 做什么 |
|-----------|---------|
| `生成plan` / `创建plan` | 读模板 → 生成 Plan → check_dps |
| `开始实施` / `实施` | 进入 add-paradigm SKILL，从当前 Step 开始执行 |
| `验收` / `收敛` | 五步闭环：devlog + handoff + 架构回看 |
| `继续` | 沿用上一条消息中提出的 Step（**不会跳到写代码**） |
| `DPS` / `RAHS` | 跑对应闸门，不通过就阻断 |
| `看依赖` | 先查 `.qoder/plans/index.md` 匹配 Plan |

### 常用文档操作

| 你对 AI 说 | AI 做什么 |
|-----------|---------|
| `PRD` / `写需求文档` | 读 `prd-standard-template.md` → 写到 `docs/*/00-需求/` |
| `增量更新 PRD` | 读 `prd-incremental-template.md` → 在原 PRD 上追加/修改 |
| `Plan` / `plan` | 先查 index.md → 定位 plan 文件 |
| `Handoff` / `交接` | 先查 index.md → 定位 handoff 文件 |
| `review` | 先查 index.md → 定位关联 Review |

---

## 三、需求如何转为 Plan

### 3.1 产品写 PRD

使用 [`prd-standard-template.md`](https://github.com/xiaomingming92/add-coder/blob/main/templates/core/templates/prd-standard-template.md) 写需求文档，项目开发者存入 `docs/{项目}/knowledge/00-需求/`。

PRD 有两个必填章节是专门写给 AI 看的：

**§十 Plan 拆分建议** — 告诉 AI 怎么拆 Plan：

```text
Plan 1: 类型收敛 ── 聚焦: thinkingLevel 路由 + DTO 统一
            │  依赖: 无
            ▼
Plan 2: 响应策略 ── 聚焦: ResponseStrategy 裁决节点
            │  依赖: Plan 1 完成的类型定义
            ▼
Plan 3: 管线集成 ── 聚焦: 端到端串联
            依赖: Plan 2 完成的裁决逻辑
```

**§十一 裁决层关联** — 告诉 AI 哪些规则要进 caijue.toml：

| 规则 | 类型 | 建议裁决条目 |
|------|------|------|
| thinkingLevel=fast 走直回 | edge | `[[caijue]] id="route-by-thinkingLevel"` |
| 单次检索 topK 上限 20 | strategy | `[[caijue]] id="retrieval-topk-cap"` |

**模板选择（简单 vs 复杂 Plan）** — §十 中为每个 Plan 指定用 `simple` 还是 `standard` 模板：

| 任务特征 | 选择模板 | 典型场景 |
|---------|---------|------|
| ≤3 文件、无新模块/架构、无外部 API | `simple-plan-template.md` | 配置收敛、重构、修复、单文件新增 |
| 多模块/跨系统/含架构或外部 API | `standard-plan-template.md` | 新功能模块、数据模型变更、跨仓库集成 |

> **精简版 Plan 的特点**：Tasks 合并在 Plan 体内（无需独立 spec 文件），Handoff 融合在 §四（无需独立 handoff 文件）。选精简版是因为任务确实简单——如果 AI 为复杂任务偷选精简版，HITL 表中的文件数会对不上，人类审核时会拒绝。

推荐在 PRD §十 中的写法：

```text
Plan 1: 数据层改造 ── 模板: standard ── 聚焦: 模型变更 + 迁移
            │  依赖: 无
            ▼
Plan 2: 配置收敛  ── 模板: simple   ── 聚焦: 统一 .env 变量名
            依赖: Plan 1 完成
```

### 3.2 AI 根据 PRD 生成 Plan

对 AI 说 `生成plan`，AI 会读 PRD（特别是 §十 §十一）并自动生成 Plan。如果ai降智,可以先对ai说了解下add范式或者add工作流,把add范式仓库[codein2027](https://github.com/xiaomingming92/codein2027)\指导文档[GUIDE.md](https://github.com/xiaomingming92/add-coder/blob/main/GUIDE.md)告诉ai

> **建议逐个功能单独生成 Plan**，不要一次性生成所有 Plan。PRD 覆盖的功能越多，AI 注意力越分散，Plan 质量越低。一次只聚焦一个子功能。

### 3.3 PRD 修改了怎么办

用 [`prd-incremental-template.md`](https://github.com/xiaomingming92/add-coder/blob/main/templates/core/templates/prd-incremental-template.md) 写增量变更，AI 会自动更新 Plan 拆分建议。

### 3.4 Plan 的 HITL 审核：先拍板再展开

AI 生成 Plan 时不是一次性写完整个 Plan 等你审，而是采用 **HITL（Human-In-The-Loop）两步模式**：

**第一步：AI 先写 `## HITL 计划总览` 表**，只填关键决策维度：

| 维度 | 示例内容 | 你的决策 |
|------|---------|:---:|
| 影响模块 | 哪些模块/子系统会被改动 | 同意 / 调整 |
| 预估文件数 | 修改 N 个 + 新建 M 个 | 同意 / 调整 |
| 架构变更 | 是否新增/重构模块 | 同意 / 调整 |
| 新增依赖 | 是否引入新包/服务 | 同意 / 调整 |
| 风险等级 | 🔴高 / 🟡中 / 🟢低 | 同意 / 调整 |
| 预计轮次 | 1-2 轮 / 3-5 轮 | 同意 / 调整 |

**第二步：你逐行拍板后，AI 才展开正文**——背景与目标、方案选型、架构设计、Task 依赖图、验收标准。

> ⚠️ **为什么先写 HITL 表而不是直接写正文**：Plan 正文可能有几百行，你逐段审会漏掉全局问题（比如"为什么多了个新模块？""这个文件数合理吗？"）。HITL 表是方向校准入口——先对齐全局，再展开细节。无论精简版还是标准版 Plan，都必须先过 HITL 表。

---

## 四、Plan 如何实施

### 4.1 启动 ADD 工作流

```
你对 AI 说：开始实施.如果ai降智,可以先对ai说了解下add范式或者add工作流
```

AI 自动进入 `add-paradigm` SKILL，按 Step 0→1→2→... 逐步执行。

### 4.2 关键步骤要等人确认

**ADD 不会自动跳步。** 每个 Step 转换都需要你确认。比如：
- "生成 review" 只做 review，不会自动跳到回流 Plan
- "继续" 沿用上一句提出的操作，不会跳到写代码

### 4.3 两个闸门会强制阻断

| 闸门 | 位置 | 阈值 | 不通过就 |
|------|------|:--:|------|
| DPS | Step 0 末尾 | ≥ 85 | 回退补齐文档 |
| RAHS | Step 4 + Step 8 | ≥ 90 | 自检修复 |

### 4.4 每轮都有交接文档

Step 8 收敛后会生成 Handoff。下次新对话开始时 AI 通过 Handoff 恢复上下文——你不需要重新解释上轮做了什么。

### 4.5 Review 的 HITL 审核：先过总览再逐条分析

Review 同样采用 HITL 两步模式——AI 不能边发现边修改，必须一次性列出所有发现等你拍板：

**第一步：AI 先写 `## HITL 发现总览` 表**，列出所有发现：

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 你的决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🔴 高 | 架构/安全 | 一句话描述 | 建议 | 接受 / 拒绝 / 修改 |
| 2 | 🟡 中 | 规范/兼容 | 一句话描述 | 建议 | 接受 / 拒绝 / 修改 |
| 3 | 🟢 低 | 风格/优化 | 一句话描述 | 建议 | 接受 / 拒绝 / 修改 |

**第二步：你一次性审核所有发现后，AI 才逐条展开详细分析**——问题复现、方案对比、决策结论、影响评估。

两种 Review 模板都有 HITL 表：

| Review 类型 | 模板 | 触发时机 |
|-----------|------|---------|
| 方案 Review（方向验证） | `review-template.md` | Plan 生成后、写代码前 |
| 实现 Review（语义对齐） | `review-implementation-template.md` | 代码写完后 |

> ⚠️ **HITL 表是批量审批入口，不是逐条对话**。AI 如果逐条向你确认每一条发现，你会被琐碎信息淹没，看不到全局。正确做法是 AI 在表中一次性列出所有发现，你拍板接受/拒绝/修改后，AI 再统一展开分析、统一修复。

---

## 五、目录结构速查

```
.add/                       ← 跨 IDE 共享核心（skills、agents、hooks、templates 等）
├── hooks/ + lib/           ←   通用 hooks 脚本 + 共享库
├── templates/              ←   所有文档模板
├── skills/ agents/         ←   SKILL 定义 + 子代理模板
└── plans/ specs/ reports/  ←   Plan/Spec/Report 运行时产出

.qoder/                     ← IDE 适配层（Qoder 专属 hooks/mcp/settings）
├── plans/{YYYY-MM}/{DD}/   ← Plan + add-route + handoff
├── reviews/                ← 方案审查 + 实现审查 + 运行时审查
├── specs/{任务名}/          ← spec + tasks + checklist 三元组
├── templates/              ← 模板副本（与 .add/templates/ 同步）
└── vocabulary/             ← 词汇表副本（与 .add/vocabulary/ 同步）

docs/{项目}/knowledge/
├── 00-需求/                ← PRD 文档
├── 01-架构/                ← 架构说明书
└── 02-规范/                ← 技术规范 + API 对接文档
```

> 💡 **文件缺失或过期？** 运行 `npx add-coder sync` 补全缺失的模板文件。`npx add-coder status` 可检查模板完整性。

---

## 六、一条完整链路走一遍

以一个真实流程为例：

```
① 产品写 PRD → docs/.../00-需求/品种推荐功能-PRD-v1.md
    └─ §十: 建议拆 2 个 Plan（数据层 + UI 层）
    └─ §十一: 品种推荐策略 + topK 上限 进裁决层

② 产品对 AI 说: 生成plan
    └─ AI 读 PRD → 生成 Plan → DPS ≥ 85 通过

③ 开发者对 AI 说: 开始实施
    └─ AI 进入 add-paradigm → Step 0 生成 add-route
    └─ Step 3 前置守卫 check_add_route_status → 通过
    └─ Step 3 写代码 + agentAudit 植入
    └─ Step 4 RAHS ≥ 90 通过
    └─ Step 8 收敛 → 写 devlog → 生成 handoff

④ 第二天新对话
    └─ AI 通过 session-init 自动加载 handoff → 恢复上下文
    └─ 继续 Plan 2（UI 层）开发
```
