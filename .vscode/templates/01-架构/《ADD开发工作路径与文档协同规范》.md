# ADD 开发工作路径与文档协同规范

> ⚠️ **偏差声明**：
> - 审计 API 使用 `agentAudit("PHASE", message, extra)`（event-based），需实现三通道输出（console + file + AuditLog 表）。add-coder 配套示例项目提供了审计日志器参考实现，见 `docs/add-coder/knowledge/02-规范/《ADD可审计开发范式案例参考》.md`。

本文档定义了 ADD 范式下从需求到交付的完整工作流、目录结构、文件命名规范及各角色的文档协同方式。

---

## 一、ADD 工作流全景

ADD 不是"写代码时顺便打日志"，而是一套覆盖全开发周期的标准化流程。每个需求走一次完整闭环（Step 0 ~ Step 9）：

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ADD 开发工作流（每个人类需求 = 一次完整闭环，Step 0 ~ Step 9）                  │
├────────────┬─────────────────────────────────────────────────────────────────┤
│  Step 0    │  文档先行（Documentation First）                                  │
│  需求对齐   │  0.1 分析变更影响范围 → 0.2 搜索相关文档 → 0.3 阅读文档            │
│            │  0.4 更新项目文档 → 0.5 生成 add-route → 0.6 确认文档合约一致性    │
│            │  🚪 0.6.5 Review 结论回流至 Plan 与 Specs（强制卡位）               │
│            │  🚪 0.7 原子闭包判定（Plan 级 + 轮次级）                           │
│            │  产物：docs/*/knowledge/ 下的规划说明书、架构文档、规范文档           │
│            │        .qoder/plans/{需求域名}-plan-v{n}.md                        │
│            │        .qoder/plans/{需求域名}-add-route-v{n}.md                   │
│            │        .qoder/reviews/{需求域名}-review-v{n}.md                    │
│            │  阈值：check_dps（DPS ≥ 85 方可进入 Step 1）                        │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 1    │  功能分析与审计阶段定义                                            │
│  审计定义   │  分析业务阶段 → 扩展 AgentAuditPhase 联合类型 → 确认审计通道        │
│            │  产物：审计日志器中新增的阶段字面量类型（AgentAuditPhase 联合类型扩展）   │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 2    │  审计基础设施实现                                                  │
│  基础设施   │  确认 agentAudit() 三通道可用（console + file + AuditLog 表）        │
│            │  确认 agentAuditNodeStart/End/Error 等语义化封装函数可用             │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 3    │  业务逻辑实现与审计植入（审计点与功能实现同步进行）                     │
│  代码实现   │  🚪 3.0 add-route 前置守卫（check_add_route_status）                │
│            │  3.1 服务层审计植入（agentAudit 打点）                                │
│            │  3.2 API Route 审计植入（traceId + 完整包裹）                        │
│            │  🚪 3.6 add-route 闭环自检（check_add_route_completeness）           │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 3.5  │  实现审查（ADD-10 意图与实现的语义鸿沟）                              │
│  实现审查   │  运行 spec checklist [T] 项 → 跨项目联调检查                         │
│            │  产物：.qoder/reviews/{需求域名}-review-implementation-v{n}.md       │
│            │        .qoder/reviews/{需求域名}-review-runtime-v{n}.md              │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 4    │  审计数据验证                                                      │
│  审计验证   │  运行功能 → 收集审计数据 → check_phase_symmetry → check_failure_path │
│            │  🚪 RAHS 闸门（check_rahs，RAHS ≥ 90 方可继续）                      │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 5    │  AI 自动合规检查                                                   │
│  合规检查   │  读取审计日志 → 执行 5 项合规检查 → 生成合规报告 → AI 根据报告调整行为  │
│            │  检查：阶段对称性 / 最小可观测单元 / 失败路径信息密度 / 三通道 / 回写     │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 6    │  从审计数据定位问题（仅 Step 4 发现异常时）                            │
│  定位问题   │  分析日志文件 → 分析数据库审计字段 → 从数据推断根因                    │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 7    │  修复并验证（仅 Step 6 定位到根因时）                                 │
│  修复验证   │  修复问题 → 重新运行验证 → 审计数据对比确认修复效果                     │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 8    │  收敛判断                                                          │
│  收敛       │  全部收敛条件满足 → 执行验收闭环（回到 Step 0 第二阶段复核架构文档）      │
│            │  → 生成 handoff 交接手册 → 记录 ADD-7 审计                            │
│            │  🚪 RAHS 最终核定（RAHS ≥ 90 方可收敛）                               │
│            │  未收敛 → 回到 Step 6 继续定位修复                                    │
├────────────┼─────────────────────────────────────────────────────────────────┤
│  Step 9    │  Report Closure（条件性：仅 runtime-fix plan 执行）                    │
│  关闭发现   │  读取 report-handoff 模板 → 在 handoff 中追加 Report Closure 章节     │
│            │  → 在 gateway.md 中追加 - [x] 标记 → 验证关闭                         │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

### 关键卡位（不可跳过）

ADD 流程中有四个强制卡位，在任何情况下都不可跳过：

| 卡位 | 位置 | 作用 | 跳过后果 |
|------|------|------|---------|
| **0.6.5 Review 回流** | Step 0 末尾 | Review 的 P0/P1 问题写回 Plan 和 Specs，防止"Review 发现了问题但 Plan 没改"的漂移 | 下游 AI 读到的 Plan 仍是未修正版本，等于没做 Review |
| **0.7 原子闭包判定** | Step 0 末尾 | 确认 Plan 级闭包（单一业务功能）和轮次级闭包（文件边界独立、互不跨轮修改） | 同一文件被多轮反复修改，handoff 失去"可独立恢复"的基础 |
| **3.0 add-route 前置守卫** | Step 3 入口 | check_add_route_status 校验 add-route 存在且 Step 闭环 | 无路线图直接写代码，实现必然偏离设计 |
| **3.6 add-route 闭环自检** | Step 3 出口 | check_add_route_completeness 扫描所有 Step 产出项勾选状态 | 代码写完但遗漏 Step 3.5/4/5/8 的文档闭环 |

### 关键设计要点

| 设计原则 | 说明 |
|---------|------|
| **每轮原子闭包** | 不是按文件数量拆分，而是按"可独立提交、验证、审计、恢复"的最小业务闭包拆分 |
| **人类评审节点** | 每轮 spec 必须经过人类 review（spec-review.md），AI 不擅自越过评审进入代码实现 |
| **三件套不可跳过** | spec.md + tasks.md + checklist.md 三者齐备才能开始写代码 |
| **日志代理用户 ID** | 所有 `AuditLog` 写入及业务表 `createdBy`/`createdById` 字段统一使用项目日志代理用户 ID 函数（禁止硬编码 `"system"` 等字符串）。详见 `.qoder/rules/project_rules.md` ADD-4 §日志代理用户 ID |
| **四层审查** | 方案审查（ADD-9 方向验证）→ 实现审查（ADD-10 语义对齐）→ 运行时纠偏（ADD-11 证据持久化）→ 验收闭环（ADD-12 漂移校准），四道关卡覆盖全生命周期 |
| **检查项 [T]/[R] 分拆** | checklist 中 [T] = 编译期可验证（AI 直接检查），[R] = 运行时验证（部署后确认，自动流转到 review-runtime.md）。[T] 全部通过时自动生成 review-runtime.md |
| **跨对话接续** | 下一轮通过 `query_audit_logs` 恢复上游审计上下文，无需人类复述 |
| **收敛判定** | 不只看编译通过，还要看 checklist 全覆盖 + 阶段对称性 + 失败路径审计等价 + RAHS ≥ 90 |
| **双质量闸门** | DPS（上游文档精确度，Step 0 末尾）和 RAHS（下游执行健康度，Step 4/8）量化阻断注意力衰减链。详见 [§八](#八双质量闸门dps-与-rahs) |

### 什么时候该用 ADD？

ADD 不是万能范式。用错了阶段反而拖慢迭代速度。

```
项目周期：
  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐
  │  MVP     │ →  │  MVP 收尾    │ →  │  持续迭代         │
  │  SOLO    │    │  ADD 预埋    │    │  ADD 全流程       │
  └──────────┘    └──────────────┘    └──────────────────┘
```

| 阶段 | 模式 | 做什么 | 为什么不早/不晚 |
|------|------|--------|----------------|
| **MVP 早期** | SOLO | 快速验证想法，一个人加一个 AI 足以跑通核心链路 | 需求还在漂移，今天写的规则明天就改——播种前先圈地 |
| **MVP 收尾** | ADD 预埋 | 核心功能收敛后，做三件事：① 写架构文档 ② 收敛类型定义 ③ 定义核心接口合约 | 功能已经稳定到可以说清楚边界了。此时不预埋，持续迭代时 AI 会在散落的 if 上继续贴 if，债务不可逆 |
| **持续迭代** | ADD 全流程 | 每个需求走完整闭环：Plan → Review → Handoff → Spec → 代码+审计 → 收敛判断 | 系统复杂度超过人脑容量，没有裁决层和审计链路就是盲飞 |

> **一句话判断**：如果你还在"这个功能到底要不要做"的阶段，用 SOLO 快跑；如果你已经到了"核心链路跑通了，接下来要稳着加功能"的阶段，ADD 预埋；如果你已经在修复"改了这里那里爆"的问题，ADD 晚了，但赶紧上还来得及止损。

---

## 二、目录结构与可见性

| 目录 | 内容 | 可见性 |
|------|------|--------|
| `docs/哲学理论/` | 哲学理论基础文章 | 公开 |
| `docs/` | 项目文档（需求/架构/规范） | 公开 |
| `TODO/` | 开源协作 TODO，与 docs/ 平级 | 公开 |
| `.qoder/plans/` | 需求方案 + 任务拆分 + 轮间交接手册 | 开发内部 |
| `.qoder/reviews/` | 方案评审 + 逐轮 spec 评审 | 开发内部 |
| `.qoder/specs/` | 每轮 spec + tasks + checklist（三件套） | 开发内部 |
| `.qoder/rules/` | 项目规则文件（权威约束） | 开发内部 |
| `.qoder/skills/` | SKILL 行为定义（AI 助手的标准行为模式） | 开发内部 |
| `.qoder/scripts/` | 工具脚本 + MCP 服务器 | 开发内部 |

### 目录层级决策原则

```
公开可见 = docs/  + TODO/
          ↑ 面向社区、贡献者、学术引用者

开发内部 = .qoder/
          ↑ 面向 AI 助手 + 核心开发者（不影响外部用户克隆体验）
```

- `TODO/` 与 `docs/` 平级而非嵌套在 `docs/` 下：TODO 是**行动清单**（"我们计划做什么"），docs 是**知识资产**（"我们做了什么、是什么"），语义不同不应混放
- `plans/` + `reviews/` + `specs/` 三者都在 `.qoder/` 下：它们是 ADD 开发流程的产物，面向 AI 和开发者，不属于公开文档
- `plans/` 下同时放 plan + add-route + handoff：三者属于"需求理解与任务拆分"这个完整的大阶段，放在同一个目录保证阶段内文件的连续性

---

## 三、文件命名规范

### 格式

```
{需求域名}-{本轮核心内容}-{产物类型}-v{版本号}
```

### 组成部分说明

| 部分 | 说明 | 约束 |
|------|------|------|
| 需求域名 | 本次需求的唯一标识，必须与对应的需求/功能保持一致 | 一个需求的所有文件共享同一需求域名前缀 |
| 本轮核心内容 | 该文件描述的本轮/本阶段核心工作（中文） | 简介明了，能从文件名判断文件用途 |
| 产物类型 | 该文件的工作流角色（英文关键词） | `plan` / `add-route` / `handoff` / `review` / `spec-review` |
| 版本号 | 递增数字 | `v1`, `v2`, ... |

### 命名示例

```
add-coder-多轮对话能力专家链路优化统一状态管理-plan-v1.md
add-coder-多轮对话能力专家链路优化统一状态管理-7轮原子事务拆分-add-route-v1.md
add-coder-多轮对话能力专家链路优化统一状态管理-7轮原子事务交接-handoff-v1.md
add-coder-多轮对话能力专家链路优化统一状态管理-方案评审-review-v1.md
add-coder-多轮对话能力专家链路优化统一状态管理-round1-类型收敛-thinkingLevel路由-spec-review-v1.md
add-coder-多轮对话能力专家链路优化统一状态管理-round2-响应策略裁决-spec-review-v1.md
add-coder-多轮对话能力专家链路优化统一状态管理-round3-专家注册分析上下文-spec-review-v1.md
```

### 命名带来的好处

1. **可追溯**：从文件名直接回答"什么需求、第几轮、什么工作、第几版本"
2. **可聚合**：`ls add-coder-*` 一条命令捞出全部关联文件
3. **可交接**：给下一个开发者/AI 的文件路径即包含完整上下文

---

## 四、specs 目录命名

格式：`{需求域名}-{闭包名}-v{版本号}`

| 目录 | 对应的工作 |
|------|-----------|
| `add-coder-type-convergence-v1` | 第1轮：类型收敛 + thinkingLevel 路由 |
| `add-coder-response-strategy-v1` | 第2轮：响应策略裁决 |
| `add-coder-expert-registry-v1` | 第3轮：专家注册 + 分析上下文 |
| `add-coder-pipeline-integration-v1` | 第4轮：管线集成 |
| `add-coder-semantic-cache-v1` | 第5轮：语义缓存 |
| `add-coder-evolution-loop-v1` | 第6轮：演化闭环 |
| `add-coder-audit-pipeline-v1` | 第7轮：审计管线 |

---

## 五、工作流三大阶段与目录映射

```
需求理解 + 任务拆分  →  .qoder/plans/      （plan + add-route + handoff）
    │
    ↓
评审                  →  .qoder/reviews/    （plan-review + roundN-spec-review）
    │
    ↓
Spec 执行             →  .qoder/specs/       （三件套：spec + tasks + checklist）
```

每个阶段的产物只放在一个目录下，不在多个目录重复存放。

---

## 六、实际案例：add-coder 7 轮原子事务

完整流程见：

| 阶段 | 文件 | 说明 |
|------|------|------|
| 需求方案 | `.qoder/plans/add-coder-多轮对话能力专家链路优化统一状态管理-plan-v1.md` | 总体设计 |
| 拆分拓扑 | `.qoder/plans/add-coder-多轮对话能力专家链路优化统一状态管理-7轮原子事务拆分-add-route-v1.md` | 7 轮依赖拓扑 |
| 方案评审 | `.qoder/reviews/add-coder-多轮对话能力专家链路优化统一状态管理-方案评审-review-v1.md` | 可行性验证 |
| 交接手册 | `.qoder/plans/add-coder-多轮对话能力专家链路优化统一状态管理-7轮原子事务交接-handoff-v1.md` | 轮间输入输出 |
| 第1轮 spec | `.qoder/specs/add-coder-type-convergence-v1/` | 类型收敛三件套 |
| 第1轮评审 | `.qoder/reviews/add-coder-多轮对话能力专家链路优化统一状态管理-round1-类型收敛-thinkingLevel路由-spec-review-v1.md` | spec 人工 review |
| ... | ... | 第2-7 轮同理 |

---

## 七、规范出处

本文档内容同时体现在：

- **`.qoder/rules/project_rules.md`** 中的 ADD-8 规则（权威约束，AI 助手强制执行）
- **`README.md`** 中的三、ADD 编程范式章节（面向外部读者的简明版本）
- **本文档**（面向开发者的完整版本，包含案例和决策说明）

---

## 八、双质量闸门：DPS 与 RAHS

> **引入背景**（2026-06-11）：ADD 流程中，从 Plan → Review → Specs → 代码实现，存在一条注意力衰减链——Plan 概括度越高，Review 需脑补越多，注意力越稀释，导致 Specs 结构性遗漏，最终引发实现偏差与敷衍式返工。DPS 和 RAHS 分别在上游和下游设置量化闸门，用数字阻断这条衰减链。

### 8.1 问题根因：上游概括度决定下游漂移量

```
Plan 粗粒度
  ↓
Review 需自行展开细节 → 注意力被多维度稀释
  ↓
Review 只覆盖部分维度 → 缺口进入 Specs
  ↓
Specs 基于不完整的 Review 生成 → Requirements 缺失或模糊
  ↓
Step 3 实现时发现缺口 → 临时补 → 敷衍 → 与 Plan 脱节
```

**核心命题**：Plan 概括不是美德，是债务。Plan 每缺一个细节，下游就要脑补一次，注意力就被稀释一分。

#### 8.1.1 Plan 与 Spec 的职责边界

"DPS 要求 Plan 不能太概括"与"Plan 不能膨胀成 Spec"是同一枚硬币的两面。边界由**信息的目的**而非**信息的详细程度**决定：

| 维度 | Plan（架构意图） | Spec（实现规格） |
|------|------------|------------|
| **定位** | 回答"改什么、为什么改、改哪里" | 回答"怎么改、改到什么程度算完成" |
| **接收方** | Review（人评审方向是否对）→ 生成 Specs（AI 展开为规格） | Step 3 代码实现（AI 按规格写代码）+ Step 4 验证 |
| **文件粒度** | 精确到**文件路径**：`src/agents/nodes/retrieval.ts` | 精确到**函数签名**：`searchKnowledgeDocuments(query, topK, opts?: SearchOptions)` |
| **类型定义** | 描述**接口形状的意图**："新增 GroundingStatus 类型，含 ready/documentCount/lastSyncedAt/indexHealth 四个字段" | 给出**完整类型定义**：`interface GroundingStatus { ready: boolean; ... }` |
| **数据流** | 描述**方向和节点**："retrieval → grounding.ready() → collection 检索 / where 降级" | 给出**精确的控制流**：WHEN-THEN 场景、分支条件、审计点位置 |
| **验收标准** | Phase 级别的**业务验收**："3 个 Expert collection 创建且文档数 ≥ 预期" | Task 级别的**可执行验证**：`expert_pest_risk.count() ≥ 5` |
| **禁止项** | 架构级**设计约束**："禁止删除全局 add-coder collection" | 实现级**操作禁止**："禁止一次性迁移超过 3 个 Expert" |

**一句话边界**：

> Plan 写到让 Review 能判断"方向对不对，有没有遗漏维度"的程度；Spec 写到让 AI 能直接写代码、人能直接打钩验收的程度。

**反例**：Plan 里写 `searchKnowledgeDocuments() 签名扩展` 而不给新签名——这就是概括导致的注意力稀释，Review 必须脑补签名才能判断覆盖度。应该在 Plan 的 Phase 描述中给出签名意图（参数从两个变一个 options 对象），但不在 Plan 中写完整 TypeScript 类型定义——那留给 Spec。

**DPS 的 Plan 粒度检查正是按此边界设计的**：
- ✅ DPS 要求 Plan 中每个 Task 指定文件路径（属于"改哪里"）
- ✅ DPS 要求 Plan 中每个 Phase 有独立验收标准（属于"改到什么程度"的架构表述）
- ❌ DPS 不要求 Plan 包含完整函数签名（那是 Spec 的职责）
- ❌ DPS 不要求 Plan 包含 WHEN-THEN 场景（那是 Spec 的职责）

### 8.2 DPS：Documentation Precision Score（上游文档质量）

在 Step 0 完成后、进入 Step 1 前调用 `check_dps`，量化 Plan → Review → Specs 三级文档的精确度。

| 维度 | 权重 | 检查内容 |
|------|:----:|------|
| Plan 可执行粒度 | 30% | 每个 Phase 是否有独立验收标准；每个 Task 是否指定具体文件；是否含占位词（"待定"/"TBD"） |
| Review 覆盖完备度 | 35% | Review 是否覆盖 Plan 的全部架构维度——数据模型、API 签名、错误路径、数据迁移、兼容性、性能、存储 |
| Specs 精确度 | 35% | Specs Requirements 数与 Plan Phase 数是否 1:1 映射（缺失的 Phase 意味着无形式化验收标准） |

**判定阈值**：

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 85 | 🟢 | 进入 Step 1 |
| 70–84 | 🟡 | 回退补齐短板（补 Review 缺失维度 / Specs 缺失 Requirement） |
| < 70 | 🔴 | 回退细化 Plan 本身——粒度不足是下游漂移的根因 |

### 8.3 RAHS：Round Attention Health Score（下游执行健康度）

在 Step 4（审计数据验证）和 Step 8（收敛判断）调用 `check_rahs`，量化本轮代码实现的注意力漂移程度。

| 维度 | 权重 | 量化方式 | 设计理由 |
|------|:----:|------|------|
| 范围保真度 | 30% | `|plannedFiles ∩ modifiedFiles| / |plannedFiles|` | 文件扩散是注意力漂移最直接的信号 |
| 类型安全 | 20% | `max(0, 100 − tscErrors × 10)` | 渐进扣分而非二元 pass/fail |
| 审计完整度 | 25% | `recordCount / plannedFileCount` | ADD-7 是防漂移的制度兜底 |
| Spec 合规 | 15% | `check_spec_sync` 通过/失败 | 文档-代码一致性 |
| 阶段对称性 | 10% | `check_phase_symmetry` 通过/失败 | 审计阶段标记完整性 |

**判定阈值**：

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入下一 Step |
| 70–89 | 🟡 | 自检：范围扩散？审计漏记？类型错误？ |
| < 70 | 🔴 | 注意力漂移严重，强制返工 Step 3 |

### 8.4 DPS → RAHS 管道关系

两个闸门不是孤立的——上游 DPS 直接影响下游 RAHS：

```
DPS（上游文档质量）          RAHS（下游执行质量）
─────────────────          ─────────────────
Plan 粒度 ──→ Review 覆盖度 ──→ Specs 精确度 ──→ 范围保真度
                                       │              │
                                       └──→ 审计完整度 ←┘
                                                 │
                                         阶段对称性
                                         类型安全
                                         Spec 合规
```

- DPS 高 → Specs 无结构性遗漏 → Step 3 实现时不需脑补 → RAHS 大概率健康
- DPS 低 → Specs 有缺口 → Step 3 临时补 → 范围扩散 + 审计漏记 → RAHS 必然漂移

**因此**：DPS 是 RAHS 的先决条件。DPS 不过，不要指望 RAHS 能过——不要进入 Step 3。

### 8.5 在 ADD 管线中的卡位

```
Step 0 文档先行
  │
  ├─ specs 三元组生成
  ├─ Plan Review 生成
  │
  └─ 🚪 DPS 闸门（§0.8 of add-route）
       │  check_dps({ planKeyword: "..." })
       │
Step 1 → Step 2 → Step 3（代码实现）
                       │
Step 4 审计数据验证
  │
  └─ 🚪 RAHS 闸门（§4.6 of add-route）
       │  check_rahs({ planKeyword: "..." })
       │
Step 5 → Step 6/7（仅异常时）
              │
Step 8 收敛判断
  │
  └─ 🚪 RAHS 最终核定
       │  check_rahs(...) → RAHS ≥ 90 方可收敛
```

### 8.6 MCP 工具与策略配置

| 工具 | 调用时机 | 对应 sync-policy 项 |
|------|---------|-------------------|
| `check_add_route_status` | Step 3 前（前置守卫） | `"add_route_exists": { "enabled": true, "severity": "block" }` |
| `check_add_route_completeness` | Step 3 代码完成后自检 | `"add_route_completeness": { "enabled": true, "severity": "block" }` |
| `check_dps({ planKeyword })` | Step 0 末尾（进入 Step 1 前） | `"dps": { "enabled": true, "severity": "block", "threshold": 85 }` |
| `check_rahs({ planKeyword })` | Step 4 末尾 + Step 8 收敛 | `"rahs": { "enabled": true, "severity": "block", "threshold": 90 }` |

策略文件位于 `.qoder/sync-policy.json`，重型 add-route 模板已内置对应的 §0.8 / §4.6 闸门段落。
