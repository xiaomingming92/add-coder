# 项目规则 — 可审计开发范式（ADD）强制约束

## 规则优先级（数字越小优先级越高）

| 优先级 | 规则 | 说明 | 是否实现 | 备注 |
|--------|------|------|----------|------|
| P0 | `session-init` SKILL | 每次新对话必须先执行 | ✅ 已实现 | |
| P0 | `add-paradigm` SKILL | 每次开发必须先执行 | ✅ 已实现 | |
| P0 | `add-paradigm` Step 0 | 文档先行（Documentation First）| ✅ 已实现 | |
| P0 | ADD-0.2 用户代码与思想完整性 | IDE 不得结构化、匿名化或利用用户的代码与思维方式 | ✅ 已定义 | |
| P0 | ADD-16 裁决层契约强制门禁 | 涉及审计/日志等跨模块治理模块的变更，必须先读取裁决层契约 + 核对 caijue.toml + 调用 Guardian 门禁 | ✅ 已实现 | 2026-06-25 引入 |
| P1 | MCP-5 稀疏推理 | 新对话必须调 query_audit_logs | ✅ 已实现 | |
| P1 | ADD-7 开发操作审计 | 每次改代码必须调 record_dev_operation | ✅ 已实现 | |
| P1 | ADD-0.1 文档先行 | 广义文档贯穿全生命周期（Plan → Review → Spec → Code → Checklist → runtime-review → 回归校准）。具体约束见 ADD-9~ADD-12 | ✅ 已实现 | |
| P1 | ADD-0.3 自动审计机制 | 数据流转路径必须可观测，裁决层输入/输出优先 | ✅ 已实现 | 第7轮 `AuditCallback` 实现 |
| P2 | ADD-1 可观测性优先 | 审计基础设施先于业务逻辑 | ✅ 已实现 | |
| P2 | ADD-2 阶段标记对称 | 每阶段 Start/End 成对 | ✅ 已实现 | |
| P2 | ADD-3 最小可观测单元 | 粒度细化到操作最小单元 | ✅ 已实现 | |
| P2 | ADD-4 三通道输出 | console + file + DB | 🔶 逐步覆盖 | console + file 全量覆盖；DB 通道：agent-audit-logger 部分函数接入、layer2-callback 全量写入、audit-logger（知识库）未接入（伴随能力专家扩容时改动一同改） |
| P2 | ADD-5 审计数据即业务数据 | 审计指标回写业务表 | 🔶 逐步覆盖 | 核心节点已覆盖：`Document.metadata.lastSyncAudit`、`ChainTraceRecord`、`ChatThread.auditData`；其余业务表伴随功能改动时顺势补齐 |
| P2 | ADD-6 失败路径等价审计 | catch 块与 try 块信息密度等价 | 🔶 逐步覆盖 | `check_failure_path` MCP 工具已就绪；关键路径 catch 块已覆盖，其余伴随功能改动时用工具验证并补齐 |
| P2 | ADD-9 方向错误的成本非线性 | 方向错误发现越晚修复成本越高。方案审查是方向验证 | ✅ 已实现 | |
| P2 | ADD-10 意图与实现的语义鸿沟 | 意图与实现是两层抽象，对齐只能靠显式对照 | ✅ 已实现 | |
| P2 | ADD-11 证据的不可再生性 | 运行时上下文不可再生，证据必须优先持久化 | 🔶 待实现 | 需 runtime hook + predev 脚本 |
| P2 | ADD-12 双源头漂移的必然性 | 代码与文档无同步必漂移，漂移代价由下一个接手者承担 | ✅ 已实现 | |
| P2 | ADD-13 DPS 上游文档质量闸门 | Plan 概括度 → Review 注意力稀释 → Specs 遗漏 → 实现偏差。`check_dps`（DPS ≥ 85）在 Step 0 末尾量化阻断 | ✅ 已实现 | 2026-06-11 引入 |
| P2 | ADD-14 RAHS 下游执行健康度闸门 | 范围保真度 + 类型安全 + 审计完整度 + Spec 合规 + 阶段对称性。`check_rahs`（RAHS ≥ 90）在 Step 4/8 量化阻断 | ✅ 已实现 | 2026-06-11 引入 |
| P2 | ADD-15 add-route 闭环自检 | Step 3 代码完成后必须调用 `check_add_route_completeness` 扫描 add-route Step 完成度，防止执行遗漏。返回 complete 方可进入 Step 3.5 | ✅ 已实现 | 2026-06-11 引入 |


### P0 规则：不可跳过

**session-init SKILL** 和 **add-paradigm SKILL** 是本项目所有 AI 操作的**前置条件**。
AI 助手必须先恢复到基线、找到对应的 SKILL 文件并按步骤执行，然后才能响应用户的具体需求。
任何跳过 SKILL 直接响应用户需求的行为，都是违反项目规则的。

---

### ADD 词汇→操作映射（L1 预埋）

> **完整词汇表已独立维护**：`.qoder/vocabulary/add-governance-vocabulary.md`
> **六类分类**: A.文档类型 / B.ADD阶段 / C.门禁/闸门 / D.MCP工具 / E.Skills/Subagents / F.核心概念
> **消费者**: IDE 侧 LLM + 未来治理 AI。领域触发词汇（面向 {{projectName}} 运行时用户 LLM）另有独立路径。

### 理论→实践映射

> 完整结构化映射：`.qoder/rules/theory-practice-map.toml`（可被脚本解析验证）

| 规则 | 实践位置 | 触发时机 |
|------|---------|---------|
| ADD-0 | `project_rules.md` | 始终 |
| ADD-0.1 | `add-paradigm` Step 0 + Step 8 第二阶段 | 变更开始 / 收敛后 |
| ADD-1 | `add-paradigm` Step 2 | 编码前 |
| ADD-2 | `add-paradigm` Step 3 + MCP `check_phase_symmetry` | 编码中 / 合规检查 |
| ADD-3 | `add-paradigm` Step 3 | 编码中 |
| ADD-4 | `add-paradigm` Step 2 | 编码前 |
| ADD-5 | `add-paradigm` Step 2.2 + Step 3 | 编码前 + 编码中 |
| ADD-6 | `add-paradigm` Step 3 + MCP `check_failure_path` | 编码中 / 合规检查 |
| ADD-7 | `add-paradigm` 全程 + `session-init` Step 2 | 文件改动 / 会话启动 |
| ADD-8 | `add-paradigm` 附录 A | 文件创建时 |
| ADD-9 | `add-paradigm` Step 0 | Plan 完成后 |
| ADD-10 | `add-paradigm` Step 3.5 | checklist [T] 全部通过后 |
| ADD-11 | `session-init` Step 1 + `scripts/check-runtime-review.ts` | 运行时异常 / 会话启动 |
| ADD-12 | `add-paradigm` Step 8 | 收敛判断通过后 |
| ADD-13 | `add-paradigm` Step 0 末端 + MCP `check_dps` | Step 0 产出检查 |
| ADD-14 | `add-paradigm` Step 4 末端 + Step 8 收敛 + MCP `check_rahs` | Step 4 合规检查 / Step 8 收敛判定 |
| ADD-15 | `add-paradigm` Step 3.6 + MCP `check_add_route_completeness` | Step 3 代码完成后自检 |
| ADD-16 | `add-paradigm` Step 9 | runtime-fix plan 收敛后，关闭 gateway.md 运行时发现 |

---

## SKILL-1：会话初始化（session-init）

**触发条件**：每次新对话启动时，作为第一个操作执行。

SKILL 文件位于 `.qoder/skills/session-init/SKILL.md`，包含 4 个步骤：
1. 查询 `query_audit_logs({})` 获取最近的开发操作记录
2. 分析审计日志推断上下文
3. 构建上下文摘要
4. 开始正常对话

**AI 必须按步骤执行，不可跳过任何一步。**

---

## SKILL-2：ADD 范式开发（add-paradigm）

**触发条件**：用户提出任何功能开发、Bug 修复、系统修改需求时。

SKILL 文件位于 `.qoder/skills/add-paradigm/SKILL.md`，包含 10 个阶段（Step 0 - Step 9），每个阶段包含若干子步骤：
0. 文档先行（Documentation First — 在编写任何代码之前更新项目文档 + 验收后回看架构文档）
1. 功能分析与审计阶段定义
2. 审计基础设施实现
3. 业务逻辑实现与审计植入
4. 审计数据验证
5. AI 自动合规检查
6. 从审计数据定位问题
7. 修复并验证
8. 收敛判断

**AI 必须按步骤执行，不可跳过任何一步。**

---

## ADD-0：范式边界与消费者定义

ADD 是**开发阶段**的编程范式，不是运行时范式。
- ADD 的反馈闭环消费者是：IDE 中的 AI 助手 + 编程人员
- AI 助手消费审计数据：自动检查合规性、调整代码生成策略、提示修复方向
- 编程人员消费审计数据：从审计数据定位问题根因、判断功能是否收敛
- 运行时范式（裁决层/能力模型/组件消费能力对象）是独立的下一步演化，不在 ADD 范围内
- ADD 产出的 AuditPhase 枚举天然可桥接到运行时状态定义，但桥接是后续步骤

## ADD-0.1：广义文档先行（Documentation First）

**文档不是开发结束后写的，而是贯穿开发全生命周期的证据链。**

广义"文档"包括：Plan、Review、Spec、Checklist、runtime-review、架构文档。它们不是参考资料，而是开发流程的强制产物，每一步产出都对应一条规则：

| 阶段 | 规则 | 产物 |
|------|------|------|
| Plan 后 | ADD-9 方向错误的成本非线性 | `review-template.md` |
| Code 后 | ADD-10 意图与实现的语义鸿沟 | `review-implementation-template.md` → `review-runtime.md` |
| Deploy 后 | ADD-11 证据的不可再生性 | `review-runtime.md`（异常自动追加） |
| Converge 后 | ADD-12 双源头漂移的必然性 | 架构文档最终校准 |

详细流程约束见下文 ADD-9~ADD-12。

### 适用范围

以下变更必须执行文档先行流程。如果纯 Bug 修复（不涉及接口、合约、外部行为变更）可以跳过，但必须在 Plan 中说明理由。

| 变更类型 | 必须更新的文档 | 说明 |
|---------|--------------|------|
| 新增功能 | 需求 + 架构 + 规范 | 功能描述、模块设计、约束规则 |
| 修改功能 | 需求 + 架构 + 规范 | 功能描述变更、模块设计变更、接口定义变更 |
| 删除功能 | 需求 + 架构 + 规范 | 废弃项标记、模块删除、兼容性说明 |
| 架构重构 | 架构文档 | 模块职责、数据流、依赖关系 |
| API 变更 | 架构文档 + 规范文档 | 接口合约、请求/响应格式 |
| Schema 变更 | 架构文档 | 数据模型、字段定义、关联关系 |
| 规范/规则变更 | 规范文档 | 约束规则、编码规范、流程规范 |

### 项目文档分类

| 类别 | 目录 | 内容 |
|------|------|------|
| 需求文档 | `docs/*/knowledge/00-需求/` | PRD、规划说明书、功能需求 |
| 架构文档 | `docs/*/knowledge/01-架构/` 或 `02-架构/` | 架构说明书、系统设计、模块定义 |
| 规范文档 | `docs/*/knowledge/02-规范/` 或 `03-规范/` | 开发规范、AI 核心规范、状态机规范 |

**此外，ADD 工作流的核心产物由 `.qoder/templates/` 下的 11 个模板定义**，这些模板不是参考资料，而是每次变更必须产出的文档骨架。分析变更影响范围时，必须同步确认需要创建/更新哪些模板产物：

| 模板 | 用途 | 对应阶段 |
|------|------|---------|
| `plan-template.md` | 需求方案：元信息 + 背景目标 + 方案选型 + 架构设计 + 实施步骤 + 验收标准 + ADD-7审计策略 | 需求理解 |
| `spec-template.md` | 功能规格：Why / What Changes / Impact / WHEN-THEN Requirements | Step 0~1 |
| `tasks-template.md` | 任务拆分：Phase → Task → SubTask 层级 | Step 1 |
| `checklist-template.md` | 验收清单：业务检查项 + ADD 规则合规检查 + 跨项目联调检查 [T]/[R] | Step 3.5 / Step 8 |
| `review-template.md` | 方案审查（ADD-9）：元信息 + 问题复现 + 方案对比 + 决策结论 + 影响评估 | Plan 后 |
| `review-implementation-template.md` | 实现审查（ADD-10）：格式契约 + 框架版本 + 数据模型 + 环境变量 + API 选择 + E2E curl | Code 后 |
| `review-runtime-template.md` | 运行时纠偏（ADD-11）：发现列表 + 根因分析 + 流程改进项 + 回流确认 | Deploy 后 |
| `handoff-template.md` | 交接总览索引（指向单轮/多轮） | Step 8 后 |
| `handoff-single-round-template.md` | 单轮交接：9 章节（含恢复上下文审计查询） | 单轮变更完成后 |
| `handoff-multi-round-template.md` | 多轮交接：全局拓扑 + 每轮 13 子章节 + 收敛规则 + 启动模板 | 多轮原子事务完成后 |

> **AI 首次学习 ADD 范式时，必须读取上述全部 11 个模板文件。遗漏模板 = 遗漏范式全貌。**
### 审计要求

每次文档变更必须记录到 AuditLog（通过 `record_dev_operation` 工具），`targetType` 为 `"DOC"`，`action` 为 `"DOC_UPDATED"` 或 `"DOC_CREATED"`，`targetId` 为文档文件路径。

### 与 ADD 工作流的关系

文档先行是 ADD 工作流的**前置步骤**，在 `add-paradigm` SKILL 的 Step 0 中执行。执行顺序为：

1. **分析变更影响范围** — 确定本次变更涉及哪些文档类别
2. **查找相关项目文档** — 调用 `find_related_docs` MCP 工具搜索
3. **阅读并理解相关文档** — 逐篇阅读命中的文档
4. **更新项目文档** — 先改文档，再改代码
5. **确认文档合约一致性** — 文档中的接口/合约定义必须与即将实现的代码一致
6. **验收后回看架构文档** — 代码实现完成并验证通过后，重新阅读架构文档，确认文档中的接口/合约/数据流与最终实现一致。如有偏差：标记偏差点（差异位置 + 文档描述 vs 实际实现），**通知开发者决策**是修正代码还是修正文档，AI 不自动修改。

---

## ADD-0.2：用户代码与思想完整性（User Code & Thought Integrity）

**IDE 平台不得结构化、匿名化或利用用户的代码与思维方式。**

ADD 范式产出的不仅是代码，更是编程人员的思维过程、架构决策、问题分析路径和代码组织方式。这些是用户的核心知识产权，IDE 平台无权将其结构化、匿名化后用于训练或分发。

- ADD 范式的审计数据归用户所有，不出仓库、不上传云端、不参与任何形式的匿名化处理
- 代码可以开源，但思维过程不可以被掠夺——这是 ADD 范式与 IDE 平台的根本分界线

---

## ADD-0.3：自动审计机制（Automatic Audit Mechanism）

### 核心原则

系统的数据流转路径必须可观测、可追溯。数据经过的每一个关键节点都应留下记录，使得任意一次操作的全链路可被审计重构。

审计的目标不是记录 CRUD 操作本身，而是记录两件事：

- **数据流经事实** — 数据经过了哪些关键节点
- **业务决策结果** — 裁决逻辑的输入与输出、状态迁移的触发条件与目标状态、能力模型匹配的过程与结论

以上都必须自动记录到 `AuditLog` 表。业务代码中不得出现手动的审计调用——审计是系统行为，不是业务逻辑。

### 实现层级

根据项目成熟度，审计覆盖范围分为两档：

| 层级 | 覆盖范围 | 要求 |
|------|---------|------|
| **最低（核心路径）** | 裁决层（或等价业务判断集中点）的输入/输出 | 必须实现。核心业务的流转事实可审计，非核心路径可暂缺 |
| **理想（全链路）** | 数据从源头到消费的每一个架构节点 | 目标状态。全链路无死角；能力模型动态验证（能力授予/回收、匹配/不匹配的全路径）可审计；"数据入库 → 拉取 → 裁决 → 能力对象 → 消费"每一步都可追溯 |

**强制底线**：任何系统至少达到"最低"层级。低于此线 = 不可审计。

### 规则定义

系统必须通过**横切机制**（Callback / Middleware / 拦截器）自动捕获数据流转生命周期事件，并在事件发生时异步写入 `AuditLog` 表。

**关键要求**：
1. **自动触发** — 审计由框架层机制（非业务代码）触发
2. **不阻塞响应** — 异步写入，`.catch()` 兜底不抛异常
3. **成功/失败等价** — 成功路径和失败路径均有审计记录（ADD-6）
4. **节点/接口过滤** — 可配置白名单/黑名单，支持跳过路径（如 login、health check）
5. **脱敏** — 敏感字段（password/token/secret）自动替换为 `***`
6. **裁决层优先** — 裁决层的输入/输出是最高优先级的审计点，比 CRUD 记录更重要

### 与 ADD-5 的关系说明

ADD-0.3 禁止的是**业务代码手动写入 Layer 2 的 `AuditLog` 表**——这应该由横切机制（Callback / Middleware）自动完成。

ADD-5 要求的**业务表 metadata 字段写入**（如 `Document.metadata.lastSyncAudit`、`ChatThread.auditData`）是另一种审计数据写入方式：
- **写入目标不同**：ADD-0.3 写 `AuditLog` 表（永久审计记录），ADD-5 写业务表的 metadata 字段（审计指标回写业务表）
- **写入方式不同**：ADD-0.3 由框架层自动触发（横切机制），ADD-5 由业务代码在适当时机调用（如服务层的 `saveAuditData()` 方法）
- **用途不同**：AuditLog 用于全链路追溯和前端查询，metadata 用于业务查询和前端展示（如"某文档最后同步的审计状态"）

**两者互补，不冲突。**

---

## ADD-1：可观测性优先于功能实现

任何新功能或修复，必须先建立审计基础设施，再编写业务逻辑。
- 编码前先定义该功能的 AuditPhase 枚举
- 审计日志器必须在业务服务之前实现
- 禁止出现"先写功能后补日志"的情况

## ADD-2：阶段标记对称

每个业务阶段必须有进入/退出对称标记：
- 入口调用 `auditPhaseStart(phase, description)`
- 出口调用 `auditPhaseEnd(phase, detail)`
- 只有 Start 没有 End = 阶段中途异常崩溃，必须在代码审查时发现
- 视觉格式：`═══ [PHASE] 开始: 描述 ═══` / `═══ [PHASE] 结束: 结果 ═══`

## ADD-3：最小可观测单元

审计粒度细化到操作的最小单元，而非只记录宏观结果：
- 知识库：记录每个 chunk 的 token 数和耗时，而非只记录"向量化完成"
- Agent 节点：记录每个节点的输入快照和输出摘要，而非只记录"节点执行完成"
- 消息持久化：记录每条消息的保存结果，而非只记录"消息已保存"
- 循环体内每次迭代都必须有审计记录

## ADD-4：三通道输出

审计数据必须通过三个通道输出：
1. 控制台（console.log）— 实时开发调试
2. 文件日志（fs.appendFile）— 事后分析，程序可解析
3. 数据库（Prisma 业务字段）— 结构化查询，前端展示

**约束不变**：每个审计点都必须同时输出到全部三个通道。

### 三层可插拔架构

审计日志按消费者和生命周期分为三个层次。差异在于**语义、开关、DB 写入位置**，不变的是**每个层次都走三通道**：

| 层次 | 消费者 | 输出通道 | DB 写入位置 | 开关 |
|------|--------|---------|------------|------|
| **Layer 1 开发审计** | AI 助手 + 开发者 | console + file + DB | 业务表 metadata（临时字段，可覆盖） | `NODE_ENV=development`（可插拔） |
| **Layer 2 运行时审计** | UI 组件 + 最终用户 | console + file + DB | AuditLog 表（永久记录，不可覆盖） | 始终开启 |
| **Layer 3 调试日志** | 开发者 | console | 无 | `LOG_LEVEL` |

关键差异说明：
- **Layer 1 写 metadata**：开发阶段的阶段标记和对称性数据写入业务表的 `metadata.lastDevAudit`，仅用于 AI 合规检查，生产环境可关闭
- **Layer 2 写 AuditLog**：用户操作记录写入 `AuditLog` 表，前端可查询"谁在什么时候做了什么"，不可关闭
- **Layer 1 可插拔**：`if (process.env.NODE_ENV !== "development") return` 整体跳过，不影响业务逻辑
- **Layer 2 不可插拔**：业务数据必须记录

### 分层后的文件命名

```
src/lib/{feature}-dev-logger.ts    Layer 1 开发审计（可插拔）
src/lib/{feature}-audit.ts         Layer 2 运行时业务审计（始终）
src/lib/log-user.ts                Layer 1+2 日志代理用户 ID（共享模块）
(调试日志直接用 console)            Layer 3 调试日志（LOG_LEVEL）
```

### 日志代理用户 ID（Layer 1 + Layer 2 共用）

**所有 AuditLog 写入操作必须通过 `src/lib/log-user.ts` 中的 `getLogUserId()` 获取用户标识**，禁止硬编码 `"system"`、`"ai-assistant"` 等字符串作为 `userId`。

| 约束 | 说明 |
|------|------|
| **唯一入口** | `getLogUserId()` 是获取日志代理用户 ID 的唯一函数，禁止各模块自行实现 |
| **upsert 原子操作** | 使用 `prisma.user.upsert` 确保并发安全，避免 P2002 唯一约束冲突 |
| **用户标识** | 日志代理用户为 `ai-assistant`（email: `ai-assistant@internal`），与历史审计链连续 |
| **适用范围** | Layer 1 开发审计 + Layer 2 运行时业务审计的数据写入，以及业务表的 `createdBy`/`createdById` 字段 |

**调用示例**：

```typescript
import { getLogUserId } from "@/lib/log-user"

// AuditLog 写入
await prisma.auditLog.create({
  data: {
    userId: await getLogUserId(),  // ✅ 正确
    // userId: "system",          // ❌ 禁止：硬编码字符串
    // userId: "ai-assistant",    // ❌ 禁止：绕过共享模块
    action: "SOME_ACTION",
    // ...
  },
})

// 业务表字段
await prisma.document.create({
  data: {
    createdBy: await getLogUserId(),  // ✅ 正确
  },
})
```

格式统一（Layer 1 和 Layer 2 均适用）：`[PREFIX] [ISO时间] [阶段] 详情 | {JSON extra}`

项目现有审计日志器（历史原因，Layer 1 + Layer 2 混合）：
- `src/lib/audit-logger.ts` — 知识库审计 [KB-AUDIT]
- `src/lib/agent-audit-logger.ts` — Agent审计 [AGENT-AUDIT]

**新建业务域审计日志器应遵循三层分离模式**（如 personnel 模块首次示范）。

### traceId 运行时排查体系

`AuditLog` 表新增 `traceId String?` 字段（含 `@@index([traceId])`），用于关联同一请求/操作的所有审计记录。

**设计原则**：
- 每个 HTTP 请求或 Agent 调用生成唯一 `traceId`
- 该请求生命周期内所有审计事件（Layer 1 开发审计 + Layer 2 运行时审计）都携带此 `traceId`
- 通过 `query_audit_logs({ traceId })` 可查询完整调用链

**典型场景**：
```
query_audit_logs({ traceId: "trace-abc123" })
→ STREAM_START → NODE_START_intention → NODE_END_intention
→ NODE_START_retrieval → NODE_END_retrieval
→ NODE_START_reasoning → NODE_END_reasoning
→ NODE_START_response → RESPONSE_EMPTY_CONTENT ← 定位到 bug
→ STREAM_DONE (totalTokens=0)
```

**traceId 来源**：
- 流式请求：`stream/route.ts` 中 `tracer.getTraceId()` 生成
- 非流式请求：`crypto.randomUUID()` 生成
- 通过 `conversationContext.traceId` 在 Agent 节点间传递

**写入时机**：
- `stream/route.ts`：STREAM_START、4 个过滤点（RESPONSE_NO_MESSAGES / RESPONSE_SKIP_NON_ASSISTANT / RESPONSE_EMPTY_CONTENT）、STREAM_DONE
- `agents/index.ts`：每个节点的 NODE_START / NODE_END / NODE_ERROR
- 业务服务层：通过 `recordXxxAudit()` 写入（Layer 2 运行时审计）

## ADD-5：审计数据即业务数据

审计指标必须回写数据库，成为业务数据的一部分：
- 知识库：`Document.metadata.lastSyncAudit`
- Agent：`ChainTraceRecord` 独立表
- 聊天线程：`ChatThread.auditData`
- 审计数据不仅用于调试，还用于前端展示和历史查询

## ADD-6：失败路径等价审计

catch 块中的审计调用必须与 try 块具有相同的信息密度：
- 必须包含：阶段标识、错误消息、已处理量、耗时
- 禁止空 catch 或仅 `console.error(error)` 的写法
- 失败路径的 extra 字段不能少于成功路径

## ADD-7：开发操作审计（Development Operation Audit）

每次 AI 助手对代码进行修改/创建/删除操作，都必须记录到 `AuditLog` 表。这是**稀疏推理（Sparse Inference）**的基础——后续 AI Session 通过查询 DB 中的开发操作记录来恢复上下文，即使对话窗口已切换。

### 记录时机

以下操作必须调用 `record_dev_operation` MCP 工具写 AuditLog：

| 操作类型 | targetType | action 示例 | 记录内容 |
|---------|-----------|------------|---------|
| API Route 修改 | `API_ROUTE` | `API_PAGINATION_ENABLED`, `API_ENDPOINT_MODIFIED` | beforeState/afterState 记录 API 合约变更 |
| 组件修改 | `COMPONENT` | `COMPONENT_REFACTOR`, `COMPONENT_CREATED` | 描述关键改动 |
| Schema 变更 | `SCHEMA` | `SCHEMA_FIELD_ADDED`, `SCHEMA_MODEL_CREATED` | beforeState/afterState 记录字段变化 |
| 规则文件变更 | `RULE` | `RULE_ADDED`, `RULE_MODIFIED` | 记录新增/修改的规则摘要 |
| 依赖变更 | `DEPENDENCY` | `DEPENDENCY_ADDED`, `DEPENDENCY_REMOVED` | 记录包名和版本 |
| MCP 工具变更 | `MCP_TOOL` | `MCP_TOOL_ADDED`, `MCP_TOOL_MODIFIED` | 记录工具名和参数变化 |
| **文档变更** | **`DOC`** | **`DOC_UPDATED`, `DOC_CREATED`** | **记录文档路径和变更摘要** |

### 记录格式要求

```
action: 大写动作（如 API_PAGINATION_ENABLED）
targetType: 大写目标类型（如 API_ROUTE）
targetId: 文件路径或标识符（如 /api/knowledge/documents）
beforeState: JSON 字符串，描述改动前的关键信息
afterState: JSON 字符串，描述改动后的关键信息（至少包含本次变更摘要）
reason: 中文/英文说明本次改动的目的
```

### targetId 路径格式

**所有 `targetId` 必须使用相对于 workspace 根目录的路径，禁止使用绝对路径。**

错误示例：
- ❌ `{{projectRoot}}/src/middleware.ts`（绝对路径，Linux 下不可移植）
- ❌ `C:\Users\xxx\{{projectName}}\src\middleware.ts`（绝对路径，Windows 下不可移植）

正确示例：
- ✅ `src/middleware.ts`（{{projectName}} workspace 内）
- ✅ `agrisynapse/src/api/agent/types.ts`（跨项目时带项目名前缀）
- ✅ `.qoder/plans/{{projectName}}-agrisynapse-integration-plan-v1.md`（.qoder 内文件）

原因：`query_audit_logs({ targetId })` 做精确匹配，绝对路径和相对路径是两条不同的记录，导致漏查。

### 批量操作场景

一个 plan 包含多个文件改动时，建议：
1. 在实施前先调用一次 `record_dev_operation` 记录「计划开始」
2. 每个文件完成改动后分别记录一次（粒度 = 文件级）
3. 所有文件改完后记录一次「计划完成」

## ADD-8：目录路径与文件命名约定

ADD 开发流程产生多种产物（方案、拆分、交接、评审、spec），必须按约定的目录和命名规范存放，保证文件可追溯到需求来源。

### 目录结构

| 目录 | 内容 | 可见性 |
|------|------|--------|
| `docs/哲学理论/` | 哲学理论基础文章 | 公开 |
| `{{docsDir}}/` | 项目文档（需求/架构/规范） | 公开 |
| `TODO/` | 开源协作 TODO，与 docs/ 平级 | 公开 |
| `.qoder/plans/` | 需求方案（plan）+ 任务拆分（execution）+ 轮间交接手册（handoff） | 开发内部 |
| `.qoder/reviews/` | 方案评审 + 逐轮 spec 评审 | 开发内部 |
| `.qoder/specs/` | 每轮 spec + tasks + checklist（三件套） | 开发内部 |
| `.qoder/templates/` | 文档模板（plan/spec/tasks/checklist/review） | 开发内部 |
| `.qoder/rules/` | 项目规则文件 | 开发内部 |
| `.qoder/skills/` | SKILL 行为定义 | 开发内部 |
| `.qoder/scripts/` | 工具脚本 + MCP 服务器 | 开发内部 |

### 命名规范

格式：`{需求域名}-{本轮核心内容}-{产物类型}-v{版本号}`

- **需求域名** 必须与对应的需求/功能保持一致，保证文件名可追溯到需求来源
- **产物类型** 使用英文关键词：`plan`（方案）、`execution`（拆分）、`handoff`（交接）、`review`（评审）、`spec-review`（spec 评审）
- 单个需求的所有文件共享同一需求域名前缀，可通过 `grep` / `ls` 一次捞出全部相关文件

### ADD 工作流三大阶段与目录对应

```
需求理解 + 任务拆分 → .qoder/plans/      （plan + execution + handoff）
    ↓
Review（强制关卡）    → .qoder/reviews/    （plan-review + roundN-spec-review）
    ↓
Spec 执行              → .qoder/specs/       （三件套：spec + tasks + checklist）
```

**Review 强制关卡约束**：每轮计划在实际代码改动之前，必须先生成 Review 文件并通过评审。
- Review 是 **spec → 代码** 之间的强制关卡，未通过 Review 不得写代码
- Review 至少包含：元信息（对象/方案/时间/类型）、问题复现、方案对比、决策结论
- 每轮的 Review 文件路径：`.qoder/reviews/{需求域名}-round{N}-{核心内容}-spec-review-v{版本}.md`

### 文档产出物模板

ADD 开发流程产生五类文档，模板文件位于 `.qoder/templates/`：

| 模板 | 文件路径 | 说明 |
|------|---------|------|
| Plan | `.qoder/templates/plan-template.md` | 元信息 + 背景目标 + 方案选型 + 架构设计 + 实施步骤 + 验收标准 + 关联文档 |
| Spec | `.qoder/templates/spec-template.md` | Why + What Changes + Impact + Requirements(WHEN/THEN) |
| Tasks | `.qoder/templates/tasks-template.md` | Phase → Task → SubTask 层级 |
| Checklist | `.qoder/templates/checklist-template.md` | Phase 检查项 + ADD 规则合规检查 |
| Review | `.qoder/templates/review-template.md` | 元信息 + 问题复现 + 方案对比 + 决策结论 + 影响评估 |
| Handoff（单轮） | `.qoder/templates/handoff-single-round-template.md` | 单轮变更 Handoff 基础格式（9 章节） |
| Handoff（多轮） | `.qoder/templates/handoff-multi-round-template.md` | 多轮原子事务 Handoff（全局结构 + 13 子章节 + 收敛规则 + 启动模板） |

使用时直接复制模板文件到目标路径，将 `{...}` 占位符替换为实际内容。

### 文档增量修订规则

Plan、Spec、Handoff 文档的修改必须使用**增量更新**格式，不得覆盖原内容后无迹可查：

- 旧内容使用 `~~删除线~~` 标记，不删除原文
- 新内容紧跟其后，使用 `→` 引导
- 末尾标注修订日期和修订原因

**格式**：

```
~~旧内容~~ → 新内容 [2026-06-03 修订: 修订原因]
```

**适用范围**：plan、execution、handoff、spec、tasks、checklist 的全部修订。

**原则**：
- 每一个修订点必须是独立的增量行，不与相邻修订行混排
- 禁止整段覆盖后只改一句话——读者无法判断哪里变了
- 单次修订涉及多处变更时，每处独立标记，不合并

### Handoff 文件格式要求

Handoff 分两种场景，格式要求不同：

- **简单 handoff**（单阶段变更，如 Podman 数据卷拆离、Layer 2 横切审计）：9 章节基础格式，适用于不跨轮、无原子事务依赖的变更。
- **多轮 handoff**（多轮原子事务，如 7 轮管线演进）：在基础格式上扩展为**每轮标准化小节 + 全局控制结构**。

#### 简单 Handoff 基础格式（9 章节）

适用于单阶段变更的 handoff：

1. **交接前状态** — 当前数据/文件分布
2. **交接后状态（目标）** — 数据/文件目标布局
3. **改动清单** — 表格列出所有文件
4. **回滚方案** — 代码回滚 + 数据回滚
5. **执行前置检查** — 执行前必须确认的条件
6. **执行步骤摘要** — 依赖图
7. **关键风险点** — 表格
8. **恢复上下文审计查询（新 AI Session 首次启动必读）** — **强制要求**：
   - 必须包含总体一键恢复 `query_audit_logs` 关键字查询
   - **必须包含逐任务/逐文件审计查询**（每个文件对应一个 `query_audit_logs` 调用，含 `keyword` + 可选的 `targetId`）
   - 必须包含 SQL 直接查询作为管理员验证手段
   - 必须包含恢复判定标准（action 命中数 + grep 验证命令）
9. **后置确认** — checklist

#### 多轮 Handoff 扩展格式

多轮 handoff 在简单 handoff 基础上新增以下全局结构，**必须**在文件顶部定义：

| 章节 | 必须 | 说明 |
|------|:---:|------|
| 全局元信息 | ✅ | 父 Plan 链接、原子事务拓扑链接、目标仓库、总文件数、轮次数、拆分原则 |
| 拓扑依赖图 | ✅ | ASCII 图展示各轮次之间的依赖关系（哪些可并行、哪些串行） |
| 原子事务边界说明 | ✅ | 解释为什么这样拆分、每轮独立收敛意味着什么、handoff 与 spec 的优先级关系 |
| 每轮标准化小节 | ✅ | 见下文「每轮标准化小节结构」 |
| 收敛判定补充规则 | ✅ | checklist 证据要求、tasks 证据要求、收敛声明规则 |
| 附录：每轮启动模板 | ✅ | 新对话开始时粘贴给 LLM 的标准化启动指令 |

**拓扑依赖图** 必须是 ASCII 图，箭头标注 `│ ├ ▼` 表达并行/串行关系，每行只有一个人工可读的轮次缩写。

**原子事务边界说明** 必须包含：
- 拆分的判定依据（是业务闭包边界，不是文件数量边界）
- 每轮完成后的独立收敛定义
- "禁止提前实现下一轮内容"的明确声明
- handoff vs spec/tasks/checklist 的优先级声明（以 spec/tasks/checklist 为准）

#### 每轮标准化小节结构

多轮 handoff 中，每一轮 **必须** 包含以下标准小节：

| 序号 | 小节 | 必须 | 说明 |
|:---:|------|:---:|------|
| 1 | **你当前的位置** | ✅ | 一句话声明"你是第 N 轮"，一句话说明上游依赖 |
| 2 | **上游已完成** | ✅ | 列表：上游本轮依赖的能力/文件/状态（不允许靠记忆，必须写清楚） |
| 3 | **恢复上下文审计查询** | ✅ | MCP 工具调用列表，按"第一步搜索代码 → 第二步搜索文档 → 第三步按行动词"组织。每个 `query_audit_logs` 写清楚预期命中数和返回内容摘要 |
| 4 | **原子事务目标** | ✅ | 一句话概括本轮目标；覆盖父 Plan 的哪个 Step |
| 5 | **spec 文件** | ✅ | `.qoder/specs/{spec-name}/spec.md` + `tasks.md` + `checklist.md` 三件套路径 |
| 6 | **架构文档** | ✅ | 关联的 `docs/` 下架构/技术文档路径 + 对应章节号 |
| 7 | **你要改的文件** | ✅ | 表格：文件路径 + 操作（新建/修改）+ 改什么（一句话） |
| 8 | **核心设计** | 🔶 | 本轮最关键的代码片段/设计要点，不超过 10 行 |
| 9 | **关键契约细化** | 🔶 | 列表：本轮必须遵守的契约约束（如"禁止改 Schema"、"必须浅合并 metadata"）。每条以文件路径开头 |
| 10 | **高风险误区** | ✅ | 列表：最常见的错误做法，用"禁止…"句式。**必须包含"禁止提前实现下一轮 X"** |
| 11 | **ADD-7 审计记录** | ✅ | 表格：action + targetType + targetId + 说明。标注哪些已落库、哪些待记录。附带恢复关键词列表 |
| 12 | **验证标准** | ✅ | 分"已完成验证"和"未执行的端到端验证"两组。未执行项诚实保留，注明"保留给运行时复测" |
| 13 | **完成后记录 ADD-7 审计** | ✅ | 每文件对应的 audit action 列表 + 一键汇总查询语句 |

第 8、9 项视轮次复杂度可选（简单轮次可省略），其余项全部必须。

**恢复上下文审计查询的组织原则**：
- 必须分三步组织：第一步按 targetId 搜代码文件 → 第二步搜文档变更（DOC_UPDATED）→ 第三步按 action 关键词快速定位
- 每条查询写清楚预期返回数和内容摘要
- 必须包含一键汇总查询（如 `query_audit_logs({ keyword: "RESPONSE_STRATEGY" })` → 返回全部 N 条本轮记录）
- 必须给新 AI Session 提供"恢复顺序建议"（从 session-init 到 read spec 的完整步骤）

**验证标准的原则**：
- 已完成验证项：附代码行号/终端输出等可验证证据
- 未执行项（运行时端到端）：必须保留为 `- [ ]` 并注明原因和复测条件
- 不允许空勾选或"推测通过"

#### 多轮 Handoff 附加全局章节

##### 收敛判定补充规则

与 `add-paradigm` SKILL Step 8 并列，每轮必须额外满足：

**checklist 证据要求**：
- 全部项已勾选，不得有空勾选或"推测通过"
- 每项勾选有可验证证据（编译输出/终端截图/代码行号/`query_audit_logs` 结果）
- 未执行项诚实保留为 `- [ ]` 并注明"待后续运行时验证"
- 证据可通过 `query_audit_logs` 按 targetId/keyword 跨会话获取

**tasks 证据要求**：
- 全部任务已完成（`- [x]`）
- 每个 task 有对应 checklist 项覆盖
- task 完成状态与 ADD-7 审计记录一致

**收敛声明规则**：
- 执行 AI 不得自行声明"本轮已收敛"
- 收敛声明只能由开发者或 Review AI 做出
- 执行 AI 的职责是完成 checklist/tasks 并附证据，而非自我判定

##### 附录：每轮启动模板

必须包含一个标准化的启动指令模板，供新对话开始时直接粘贴给 LLM。模板至少包含：
- 上下文声明（"你在执行第 N 轮"）
- 启动步骤（从 session-init → add-paradigm → read spec → 逐 task 执行，11 步完整清单）
- 关键提醒（当前轮次位置、原子事务约束、架构文档同步要求、禁止自我判定收敛）

### Handoff 脱敏要求

Handoff 文档中 **禁止出现** 以下类型的硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。

---

## ADD-9：方向错误的成本非线性

**方向错误发现得越晚，修复成本越高——Plan 阶段的纠正和编码后的纠正，代价差距是指数级的。**

代码写完后发现方向错误，意味着已经投入的时间和精力全部沉没。方案审查就是方向验证——它不关心实现细节，只关心决策是否正确。方案审查失败的唯一代价是重新 Plan，这比重写整个实现便宜得多。

---

## ADD-10：意图与实现的语义鸿沟

**意图（设计）和实现（代码）是两层抽象，对齐只能靠显式对照，不能靠推断。**

编译器能验证语法正确性，但无法验证"做的是不是该做的"——这是语义层的问题。跨系统的格式对齐、框架 breaking change、外键完整性，这些编译期不可见但运行时致命的错误，不会出现在任何类型错误里。如果跳过对照直接交付，遗漏的问题会在运行时暴露，此时修复代价呈指数增长。

---

## ADD-11：证据的不可再生性

**运行时上下文是不可再生的——日志滚动、内存释放、状态变化会在几分钟内消灭证据。**

人类对错误的记忆是损耗性、自纠偏的——"刚才那个报错是什么来着"是最常见的 Debug 起点。机器捕获的证据是确定性的，但证据窗口稍纵即逝。证据落盘后，Debug 可以等、可以换人、可以跨会话；没落盘的证据永远消失了。这不仅是一个技术原则，也是一个认知原则——证据是客观的，记忆是主观的。

---

## ADD-12：双源头漂移的必然性

**任何双源头系统（代码 + 文档）缺乏同步机制必漂移。漂移的代价由下一个接手者全额承担，而非作者——这是结构性的道德风险。**

实现过程中一定有偏离设计的决策（妥协、优化、意外发现）。这些偏差不会报错、不会崩溃，只会沉默地积累，让下一个接手的人花三倍时间理解系统。关闭偏差不是削足适履，也不是放任漂移，而是显式标记差异并交由决策——因为只有人才能判断"文档过时了"还是"代码写错了"。

---

## ADD-13：DPS 上游文档质量闸门

**Plan 概括不是美德，是债务。Plan 每缺一个细节，下游就要脑补一次，注意力就被稀释一分。**

从 Plan → Review → Specs → 代码实现，存在一条注意力衰减链：Plan 粗粒度 → Review 需自行展开细节 → 注意力被多维度稀释 → Review 只覆盖部分维度 → 缺口进入 Specs → Step 3 实现时发现缺口 → 临时补 → 敷衍 → 与 Plan 脱节。

DPS（Documentation Precision Score）在 Step 0 末尾量化上游文档质量，三维判定：
- Plan 可执行粒度（30%）：每个 Phase 有独立验收标准、每个 Task 指定具体文件、无占位词
- Review 覆盖完备度（35%）：覆盖 Plan 的 7 个架构维度
- Specs 精确度（35%）：Requirements 数与 Plan Phase 数 1:1 映射

**执行方式**：`check_dps({ planKeyword: "..." })`。DPS ≥ 85 进入 Step 1；70–84 回退补齐；< 70 回退细化 Plan。

---

## ADD-14：RAHS 下游执行健康度闸门

**代码实现的质量可以用范围扩散、类型错误、审计漏记三个信号量化。这三个信号合在一起就是注意力漂移的指纹。**

RAHS（Round Attention Health Score）在 Step 4 末尾和 Step 8 收敛时量化本轮执行健康度，五维判定：
- 范围保真度（30%）：计划文件与修改文件的交集/计划文件数
- 类型安全（20%）：`max(0, 100 − tscErrors × 10)`
- 审计完整度（25%）：record_dev_operation 调用数 / 计划文件数
- Spec 合规（15%）：check_spec_sync 通过/失败
- 阶段对称性（10%）：check_phase_symmetry 通过/失败

**执行方式**：`check_rahs({ planKeyword: "..." })`。RAHS ≥ 90 进入下一阶段；70–89 自检；< 70 注意力漂移严重，强制返工 Step 3。

**DPS 是 RAHS 的先决条件**：DPS 不过，不要指望 RAHS 能过——不要进入 Step 3。

---

## ADD-15：add-route 闭环自检

**add-route 是 Plan 与代码实现之间的唯一映射表。Step 3 产出检查只验证代码级审计植入，不验证 add-route 文档本身的 Step 执行完整度。**

AI 可能在完成 Step 3 代码后标记 Task 为 ✅ 但跳过 Step 3.5/4/5/8 的文档闭环。ADD-15 要求 Step 3 代码实现全部完成后，强制调用 `check_add_route_completeness` 扫描 add-route 文件内容，统计所有 `[ ]` vs `[x]`，确保没有任何 Step 被遗漏。

**四种返回状态**：
- `complete` — 所有 Step 产出项全部 [x]，进入 Step 3.5
- `incomplete` — 存在未勾选项，逐 Step 完成未闭环项后重新调用
- `file_missing` — 未找到 add-route 文件，回退 Step 0.5
- `errors` — 文件存在但解析出错，检查格式

**执行方式**：`check_add_route_completeness({ planKeyword: "..." })`。与 `check_add_route_status`（Step 3 前置守卫）形成首尾互锁——前者确认 add-route 存在，后者确认 add-route 闭环。

---

## ADD-16：裁决层契约强制门禁

**裁决层契约（caijue.toml + 裁决层写入契约文档）是所有跨模块治理变更的强制前置条件。AI 不得在未确认契约合规的情况下修改被管辖代码。**

### 强制范围

以下文件/模块的任何代码变更（新建/修改/删除），AI 必须：
1. **编码前**读取 `《裁决层-AuditLog写入契约》.md` 确认 L1/L2 归属与 action 命名空间
2. **编码前**确认 `caijue.toml` 中已有对应 `[[caijue]]` 条目（无则先注册）
3. **编码后**调用 `add-flow-guardian` 执行 Step 3 出口门禁（含审计调用覆盖 + try/catch 审计检查）

| 管辖模块 | 文件 |
|:--|:--|
| Agent 管线审计 | `src/lib/agent-audit-logger.ts` |
| 流式事件总线审计 | `src/lib/stream-bus-logger.ts`, `src/agents/stream-bus.ts` |
| Gateway 审计 | `src/lib/agent-gateway-audit.ts` |
| Farm-Server 客户端 | `src/lib/farm-server-client.ts` |
| 凭证管理 | `src/lib/auth/credential-store.ts` |
| 运行时诊断 | `src/lib/append-runtime-finding.ts` |
| 聊天流式路由 | `src/app/api/agent/chat/stream/route.ts` |
| Layer 2 回调 | `src/lib/layer2-callback.ts` |
| **任何新建的** `*-logger.ts` 或 `*-audit.ts` | 全部 |

### 判定规则

```
管辖文件有代码变更？
  ├─ 是 → 必须执行 ①读取契约 ②caijue.toml 核对 ③Guardian 门禁
  │       任一未执行 → 违反 ADD-16，回退执行
  └─ 否 → 正常 ADD 流程
```

### 与 ADD-0.1 的关系

ADD-0.1 要求"文档先行"（先改文档再改代码）。ADD-16 是对 ADD-0.1 的细化——当变更涉及审计/日志等跨模块治理领域时，"文档"具体指裁决层契约文档 + caijue.toml。

---

---

## 项目技术约束

### 审计日志器模式

每个业务域的审计日志器必须遵循 `audit-logger.ts` 的完整模式：
- `PREFIX` 常量：`[DOMAIN-AUDIT]` 格式
- `LOG_DIR`：`logs/{domain}/` 目录
- `AuditPhase` 类型：枚举所有业务阶段
- `audit()` / `auditPhaseStart()` / `auditPhaseEnd()` 三函数
- `readRecentLogs()` / `clearLogs()` 读写函数
- `ENABLE_FILE_LOG` 环境变量控制，开发环境默认启用

### 数据库 Schema

Prisma schema 修改时：
- 新增模型必须有审计数据字段（Json 类型）
- 关联关系必须定义 `onDelete: Cascade`
- 使用 `@id @default(cuid())` 生成 ID
- 使用 `@updatedAt` 自动更新时间戳

### Agent 节点

LangGraph 节点实现时：
- 必须通过 `wrapNodeWithAudit` 包装
- `inputSnapshot` 不能为空对象 `{}`
- 路由决策必须调用 `agentAuditRoute()`
- 检索节点必须记录证据链 diff

### 代码质量

- TypeScript 编译必须通过（`npx tsc --noEmit`）
- ESLint 零 error（`npx eslint src/` 不得出现 error 级别问题，warning 逐步降低）
- 禁止 `any` 类型（必须显式定义）
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 新增文件必须在项目已有目录结构内，遵循现有命名规范

---

## MCP 工具约束

本项目配置了 MCP（Model Context Protocol）服务器，将 ADD 范式约束从"AI 读取规则后尝试遵守"升级为"AI 调用工具获取确定性结果"。

### MCP-1：上下文优先

AI 助手在生成任何代码前，必须先调用以下工具获取真实信息，不得凭记忆假设：
- `get_project_context` — 获取项目结构、技术栈、可用脚本
- `get_db_schema` — 获取 Prisma Schema 模型定义
- `get_audit_logger_pattern` — 获取现有审计日志器模式
- `find_related_docs` — 查找与变更相关的项目文档（ADD-0.1 文档先行）

### MCP-2：生成优先于手写

AI 助手在以下场景不得手写代码，必须调用生成工具：
- 新建审计日志器 → 调用 `generate_audit_logger`
- 生成的功能骨架必须包含完整的三通道审计

### MCP-3：编码中验证

AI 助手在生成包含审计阶段的代码后，必须调用验证工具检查合规性：
- `check_phase_symmetry` — 验证 ADD-2 阶段标记对称性
- `check_failure_path` — 验证 ADD-6 失败路径审计等价

### MCP-4：工具调用链

AI 助手遵循"调用工具 → 获得结果 → 编码 → 验证"的闭环流程：
1. 调用 `get_audit_logger_pattern` 或 `generate_audit_logger` 获取审计日志器代码
2. 编码业务逻辑
3. 调用 `check_phase_symmetry` 和 `check_failure_path` 验证
4. 如有不合规则修正后重新验证

### MCP-5：稀疏推理恢复（Sparse Inference Recovery）

AI 助手在**每次新对话启动时**，必须先执行 `.qoder/skills/session-init/SKILL.md`（SKILL-1 会话初始化），作为**不可跳过的前置操作**。

`session-init` SKILL 的 Step 1 要求调用 `query_audit_logs` 工具查询开发操作审计记录，以恢复开发上下文。

**执行顺序**（新对话启动时的首个操作）：
1. 定位并执行 `session-init` SKILL（`.qoder/skills/session-init/SKILL.md`）
2. 按 SKILL 的 Step 1 调用 `query_audit_logs({})` 查询
3. 按 SKILL 的 Step 2 分析推断上下文
4. 按 SKILL 的 Step 3 构建摘要
5. 恢复完成后响应用户需求

**如果 `query_audit_logs` 返回空结果**：可能原因包括数据库未运行、之前未使用 `record_dev_operation` 记录、或者确实是新会话。此时按正常流程处理。

### MCP-6：Plan 命名与审计策略

每个 Plan（计划文件）必须包含以下元信息：

```markdown
## PLAN 元信息
- **Plan 名称**: {功能英文名}-{序号} (如 document-list-pagination-v1)
- **启动时间**: {ISO 时间戳}
- **主导 AI**: {AI 助手标识}
- **ADD-7 审计策略**: 列出本次 Plan 涉及的文件及其 audit action
```

**命名规范**:
- Plan 名称使用 `{功能}-{改动}-v{版本}` 格式
- 示例: `document-list-pagination-v1`, `chat-persistence-fix-v2`
- 每个 Plan 文件名格式: `PLAN-{名称}.md`

**审计策略格式**（位于 PLAN 文件的元信息中）:

```markdown
| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| route.ts | API_ROUTE | API_PAGINATION_ENABLED | 无分页 | page/pageSize 分页 | 待记录 |
```

### MCP 配置

MCP 服务器配置在 `.qoder/mcp.json`，通过 `npx tsx .qoder/scripts/mcp-server.ts` 启动。
Trae IDE 加载项目时自动连接 MCP 服务器。

### 附录

#### A. {{projectName}} ADD-0.3 实现（AuditCallback）

{{projectName}} 通过 **LangChain `BaseCallbackHandler` 继承模式** 实现自动审计：

- `AuditCallback extends BaseCallbackHandler` — 继承 LangChain 标准回调接口
- `handleChainStart()` / `handleChainEnd()` / `handleChainError()` — 节点进入/退出/异常自动记录
- `handleLLMEnd()` — LLM 调用完成时记录 token 用量
- `handleToolStart()` / `handleToolEnd()` — Tool 调用完成时记录输入/输出

注入方式（`src/agents/index.ts`）：
```typescript
const callback = new AuditCallback(traceId, userId)
agent.invoke(input, { callbacks: [callback] })
```

**与 Layer 1 dev-logger 的关系**：
- Layer 1（`wrapNodeWithAudit`）：console + file，仅开发环境，AI 助手消费
- Layer 2（`AuditCallback`）：AuditLog 表，所有环境始终开启，最终用户消费
- 两者共存互补，互不干扰

**设计目标达成情况**：

| 目标 | 状态 |
|------|:----:|
| 自动记录 | ✅ |
| 不阻塞响应 | ✅ |
| 成功/失败等价 | ✅ |
| 节点过滤 | ✅ |
| traceId 全链追踪 | ✅ |

#### B. 历史参考（milktea 项目）