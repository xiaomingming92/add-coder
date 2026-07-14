# add-coder 实践指南

> 从零开始，用 ADD 范式完成一个需求的完整闭环。
>
> 📦 **项目概览、架构设计、MCP 工具链** 请参见 [README.md](./README.md)。

---

## 目录

- [前置条件](#前置条件)
- [一、认识 ADD 工作流](#一认识-add-工作流)
- [二、触发词在哪里看](#二触发词在哪里看)
- [三、需求如何转为 Plan](#三需求如何转为-plan)
  - [3.1 产品写 PRD](#31-产品写-prd)
  - [3.2 AI 根据 PRD 生成 Plan](#32-ai-根据-prd-生成-plan)
  - [3.3 PRD 修改了怎么办](#33-prd-修改了怎么办)
- [四、Plan 如何实施](#四plan-如何实施)
  - [4.1 启动 ADD 工作流](#41-启动-add-工作流)
  - [4.2 关键步骤要等人确认](#42-关键步骤要等人确认)
  - [4.3 两个闸门会强制阻断](#43-两个闸门会强制阻断)
  - [4.4 每轮都有交接文档](#44-每轮都有交接文档)
- [五、目录结构速查](#五目录结构速查)
- [六、一条完整链路走一遍](#六一条完整链路走一遍)

---

## 前置条件

```bash
# 1. 安装
npx add-coder init

# 2. 配置数据库（.env.development）
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb?schema=public"

# 3. 第二次执行完成迁移
npx add-coder init --yes
```

完成后，你的项目里会多出 `.add/`（共享核心）和 `.qoder/`（IDE 适配）两个目录。

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

所有触发词在 `.qoder/vocabulary/add-governance-vocabulary.md`。这份词汇表预埋到 AI 的 always-on 上下文中，AI 听到关键词时零额外 prompt 执行正确操作。

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

使用 `prd-standard-template.md` 写需求文档，项目开发存入 `docs/{项目}/knowledge/00-需求/`。

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

### 3.2 AI 根据 PRD 生成 Plan

对 AI 说 `生成plan`，AI 会读 PRD（特别是 §十 §十一）并自动生成 Plan。

> **建议逐个功能单独生成 Plan**，不要一次性生成所有 Plan。PRD 覆盖的功能越多，AI 注意力越分散，Plan 质量越低。一次只聚焦一个子功能。

### 3.3 PRD 修改了怎么办

用 `prd-incremental-template.md` 写增量变更，AI 会自动更新 Plan 拆分建议。

---

## 四、Plan 如何实施

### 4.1 启动 ADD 工作流

```
你对 AI 说：开始实施
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

---

## 五、目录结构速查

```
.qoder/
├── plans/{YYYY-MM}/{DD}/    ← Plan + add-route + handoff
├── reviews/                 ← 方案审查 + 实现审查 + 运行时审查
├── specs/{任务名}/           ← spec + tasks + checklist 三元组
├── templates/               ← 所有文档模板（查 index.md 看选型指南）
└── vocabulary/              ← 触发词语汇表

docs/{项目}/knowledge/
├── 00-需求/                 ← PRD 文档
├── 01-架构/                 ← 架构说明书
└── 02-规范/                 ← 技术规范 + API 对接文档
```

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
