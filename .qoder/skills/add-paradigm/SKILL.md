---
name: "add-paradigm"
description: "Audit-Driven Development paradigm workflow. Invoke when starting any new feature development, bug fix, or system modification. Use when the user says: 开发、改功能、修 bug、加个需求、新增模块、重构、实现、接入、改造、升级任何系统行为. 10 phases (Step 0-9), each containing multiple sub-steps. Do NOT skip sub-steps — each numbered item under a phase must be executed."
---

# 可审计开发范式（ADD）工作流

本 Skill 引导你按照 ADD 范式完成功能开发。每次开始新功能、修复 Bug、或修改系统行为时，必须按此工作流执行。

**范式边界**（定义在 `.qoder/rules/project_rules.md` ADD-0）：
- ADD 是开发阶段编程范式，不是运行时范式
- 反馈闭环消费者：IDE 中的 AI 助手 + 编程人员
- 运行时范式（裁决层/能力模型）是独立的下一步演化

**核心原则**（始终生效，定义在 `.qoder/rules/project_rules.md`）：
- ADD-0：范式边界与消费者定义
- ADD-0.1：广义文档先行（Documentation First）— Plan → Review → Spec → Code → Checklist → runtime-review → 回归校准。详细流程约束见 ADD-9~ADD-12
- ADD-1：可观测性优先于功能实现
- ADD-2：阶段标记对称
- ADD-3：最小可观测单元
- ADD-4：三通道输出
- ADD-5：审计数据即业务数据
- ADD-6：失败路径等价审计
- ADD-7：开发操作审计
- ADD-9：方向错误的成本非线性
- ADD-10：意图与实现的语义鸿沟
- ADD-11：证据的不可再生性
- ADD-12：双源头漂移的必然性

### 深层参考文档

以下项目文档提供了 ADD 范式的完整工作流说明和案例参考，执行 ADD 流程时优先查阅：

| 文档 | 路径 | 用途 |
|------|------|------|
| ADD 工作路径与协同规范 | `{{docsDir}}/knowledge/01-架构/《ADD开发工作路径与文档协同规范》.md` | 目录结构、命名规范、五大阶段全貌 |
| ADD 范式案例参考 | `{{docsDir}}/knowledge/02-规范/《ADD可审计开发范式案例参考》.md` | RAG/持久化/ChainTracer 实战案例 |

---

## 独立能力：生成 Plan

> **Plan 不绑定 ADD 工作流。** Plan 只在需要开启一个正式的开发任务（新功能、Bug 修复、系统改造）时才生成。问项目架构、看脚本、查天气等日常交互不需要 plan。
>
> **触发条件**：用户说"生成plan"/"生成计划"/"创建一个plan"。无需额外声明"按ADD规范"——本步骤已内化全部约定。
>
> **Plan 是后续 ADD 工作流的输入。** 生成 plan 后如需执行，才启动下方 Step 0。

1. **模板选择**：根据任务复杂度选模板
   - **精简版** `simple-plan-template.md`：≤3 文件、无新模块/架构、无外部 API 契约变更。Tasks 合并在 Plan 体内，无需独立 spec 文件。
   - **标准版** `standard-plan-template.md`：多模块、跨系统集成、含架构选型或数据模型设计。
2. **读取模板**：读选定的模板文件，禁止凭记忆
3. **命名规范**：`{项目名}-{功能名}-plan-v1.md` → `.qoder/plans/{YYYY-MM}/{DD}/`（按当天日期创建子目录）
4. **HITL 总览（先写 temporary.md）**：doc-format-guard 要求写入 `.qoder/plans/` 的文件必须包含完整章节，但 HITL 第一步只写总览表不写正文。因此先在项目根目录写 `{plan-name}.temporary.md`（只含 HITL 表，不受 guard 检查），人类拍板后再写正式 Plan 文件并删除 temporary.md。
5. **HITL 确认后展开**：人类拍板后，再填写以下正文章节。
6. **必含章节（标准版）**：
   - PLAN 元信息（名称/时间/关联文档/ADD-7审计策略表）
   - HITL 计划总览（人类拍板入口）
   - 一、背景与目标
   - 二、方案选型
   - 三、架构设计
   - 四、实施 Task + 依赖图
   - 五、验收标准
   - 六、关联文档
6. **必含章节（精简版）**：
   - HITL 计划总览（人类拍板入口）
   - 一、Plan 概述
   - 二、变更范围
   - 三、Tasks（合并在 Plan 中）
   - 四、Handoff
   - 五、验收标准
   - 六、关联
7. **文档链路**：plan 作为枢纽节点，必须包含与后续 review/handoff 的双向链接占位
8. **记录审计**：plan 生成后调用 `record_dev_operation`（targetType: "PLAN"）

---

## ADD 工作流入口

> **以下 Step 0~9 在"按 plan 执行开发"时才启动。** 日常问答不进入此流程。

---

## Step 0：文档先行（Documentation First）

> Step 0 分两个阶段：**第一阶段**在编写任何代码之前，更新项目文档使其反映即将实现的变更；**第二阶段**在 Step 8 收敛判断通过后，回到架构文档做最终校准。两个阶段缺一不可。

### 第一阶段：实施前项目文档更新

#### 0.1 分析变更影响范围

确定本次变更涉及的业务域和功能范围，列出受影响的文档类别：

| 文档类别 | 目录位置 | 典型文件 |
|---------|---------|---------|
| 需求文档 | `docs/*/knowledge/00-需求/` | PRD、规划说明书 |
| 架构文档 | `docs/*/knowledge/01-架构/` 或 `02-架构/` | 架构说明书、系统设计 |
| 规范文档 | `docs/*/knowledge/02-规范/` 或 `03-规范/` | 开发规范、状态机规范、核心规范 |
| AI 核心文档 | `docs/*/knowledge/03-规范/` | AI 智能体核心规范 |

**此外，ADD 工作流的核心产物由 `.qoder/templates/` 下的 13 个模板定义**，这些模板不是参考资料，而是每次变更必须产出的文档骨架。分析变更影响范围时，必须同步确认需要创建/更新哪些模板产物：

| 模板 | 用途 | 对应阶段 |
|------|------|---------|
| `prd-standard-template.md` | 产品/系统需求文档（新建）：背景目标 + 用户场景 + 功能需求 + 非功能需求 + 验收标准 | 需求定义 |
| `prd-incremental-template.md` | 产品/系统需求文档（增量）：在已有 PRD 基础上追加/修改/删除 | 需求变更 |
| `simple-plan-template.md` | 精简版 Plan：≤3 文件单一改动，Tasks+Handoff 融合在 Plan 体内，无需独立 spec/handoff 文件 | 简单任务 |
| `standard-plan-template.md` | 标准版 Plan：多模块/跨系统/含架构设计，需独立 spec/tasks/checklist | 复杂任务 |
| `add-route-template.md` | Plan→ADD 十阶段执行映射：Step 0-9 具体动作 + Task 映射表 + 审计阶段清单 + 依赖拓扑 | Step 0 |
| `spec-template.md` | 功能规格：Why / What Changes / Impact / WHEN-THEN Requirements | Step 0~1 |
| `tasks-template.md` | 任务拆分：Phase → Task → SubTask 层级 | Step 1 |
| `checklist-template.md` | 验收清单：业务检查项 + ADD 规则合规检查 | Step 5 / Step 8 |
| `review-template.md` | ADD-9 方向验证：元信息 + **HITL 发现总览**（一次性人类审核表） + 问题复现 + 方案对比 + 决策结论 + 影响评估 | Review 关卡 |
| `review-implementation-template.md` | ADD-10 语义对齐：元信息 + **HITL 发现总览** + 格式契约 + 框架版本 + 数据模型 + 环境变量 + API 选择 + E2E curl | Code 后 |
| `review-runtime-template.md` | ADD-11 证据持久化：发现列表 + 根因分析 + 流程改进项 + 回流确认 | Deploy 后 |
| `handoff-template.md` | 交接总览索引（指向单轮/多轮）。**注意**：精简版 Plan 不需要生成此文件——Handoff 已融合在 Plan §四 | Step 8 后 |
| `handoff-single-round-template.md` | 单轮交接：9 章节（含恢复上下文审计查询） | 单轮变更完成后 |
| `handoff-multi-round-template.md` | 多轮交接：全局拓扑 + 每轮 13 子章节 + 收敛规则 + 启动模板 | 多轮原子事务完成后 |

> **AI 首次学习 ADD 范式时，必须读取上述全部 13 个模板文件。遗漏模板 = 遗漏范式全貌。**
>
> **每次根据模板生成文档时（plan/spec/review/handoff），MUST 先重新读取对应的模板文件，再填充内容。禁止凭记忆生成——模板可能已在迭代中更新，记忆中的版本可能不完整。**

> **Review 的 HITL 磋商（temporary.md 机制）**：生成方案 Review（`review-template.md`）或实现 Review（`review-implementation-template.md`）时，和 Plan 一样——doc-format-guard 要求完整章节才放行，HITL 第一步只写总览表会被阻断。因此 Review 也走 temporary.md 流程：先写 `{review-name}.temporary.md`（只含 HITL 发现总览表）→ 人类拍板 → 生成完整 Review 写入 `.qoder/reviews/` → 删除 temporary。具体步骤见下方 Step 3.5.3（实现 Review）和 Step 0 方案 Review 产出。

#### 0.2 搜索相关项目文档

调用 MCP 工具 `find_related_docs` 查找与当前变更相关的项目文档：

```
find_related_docs({ query: "功能关键词" })
```

预期产出：
- 匹配的项目文档列表（路径 + 标题 + 摘要）
- 按相关性排序的文档列表

#### 0.3 阅读并理解相关文档

逐篇阅读命中的文档，重点关注：
- 与本次变更直接相关的章节
- 文档中定义的接口、合约、数据流
- 依赖关系和约束条件

#### 0.4 更新项目文档（文档先行）

**在修改代码之前，先更新项目文档，使文档反映即将实现的变更。** 包含但不限于：

- **新增功能**：补充需求文档中的功能描述 → 更新架构文档中的模块设计 → 更新规范文档中的约束规则
- **修改功能**：修改需求文档中的功能描述 → 修改架构文档中的模块设计 → 修改规范文档中的接口定义
- **删除功能**：标记需求文档中的废弃项 → 删除架构文档中的模块 → 更新规范文档中的兼容性说明

#### 0.5 生成 ADD 执行路线图（add-route）

> **add-route 是 Plan 和 Handoff 之间的桥梁**：它将 Plan 的抽象 Task 映射到 ADD 十阶段的每一步具体动作。

调用 `get_add_template({ template: "add-route-template-heavyweight" })` 读取重型模板（本项目默认），然后按以下内容填充：

> **模板模式**：
> - **`add-route-template`（轻量）**：标准 ADD Step 产出检查，适合前端项目、小型改动。验证完即进入下一步，不强制 spec 文档同步。
> - **`add-route-template-heavyweight`（重型）**：每个 Step 产出检查使用"验证并更新项目状态"措辞，强制调用 `check_spec_sync` 做文档-代码交叉校验。适合后端系统、多层管线、审计合规场景。**本项目默认重型。**

1. **元信息**：绑定 Plan + Spec + Tasks + Handoff 路径
2. **Step 0~2 状态**：根据当前执行进度填写（首次生成时仅 Step 0 标记为进行中，Step 1~8 为待执行）
3. **Step 3 Task 映射表**：从 `tasks.md` 提取每个 Task 的改动文件、审计植入点、依赖关系
4. **ADD-7 审计策略**：从 Plan 元信息 ADD-7 策略表复制，逐文件填写 targetType/action/beforeState/afterState
5. **文件清单**：汇总所有涉及文件的 targetType 和操作类型

**命名**：`{需求域名}-{核心内容}-add-route-v1.md` → `.qoder/plans/{YYYY-MM}/{DD}/`（与 Plan 同目录）

**关键约束**：
- [ ] add-route 必须先于任何代码变更生成（Step 1 依赖 add-route 中的审计阶段清单）
- [ ] Task 映射表必须与 `tasks.md` 完全一致（不能漏 Task、不能多 Task）
- [ ] 依赖拓扑必须与 Plan §4 对齐
- [ ] 每个 ADD-7 文件的 beforeState/afterState 必须描述该文件在本次变更前后的具体差异
- [ ] 生成后调用 `record_dev_operation`（targetType: "PLAN"，action: "DOC_CREATED"）

#### 0.6 确认文档合约一致性

每次文档更新必须遵循以下原则：

- [ ] 文档更新在代码变更之前完成
- [ ] 需求文档、架构文档、规范文档中与变更相关的部分已同步更新
- [ ] 文档中的接口/合约定义与即将实现的代码一致
- [ ] 如果本次变更不需要修改项目文档，在注释中说明理由（例如：纯 bug 修复不影响外部合约）
- [ ] 文档更新后，调用 `record_dev_operation` 记录文档变更（`targetType: "DOC"`）

#### 0.6.5 Review 结论回流至 Plan 与 Specs（强制卡位）

> **MUST NOT 跳过。** Plan Review 的结论如果只留在 Review 文件里、不写回 Plan 体，下游 AI 读 Plan 时看到的仍是未修正的原始版本——等于没做 Review。
>
> **核心原则**：Review 是诊断报告，Plan 是治疗方案。诊断报告的结论必须写进治疗方案，病人才能按修正后的方案治疗。

**什么时候触发**：
- Plan Review 已生成（`.qoder/reviews/{需求域名}-*review-v{n}.md` 存在）
- Review 中有 P0/P1/P2 问题清单
- 人类已确认 Review 结论（通过评审）

**回流步骤**：

1. **读取 Review 的问题清单**：提取所有 P0/P1/P2 问题的编号、描述、修复建议
2. **逐问题判定回流目标**：

   | Review 问题类型 | 回流到 Plan 的什么位置 | 回流到 Specs 的什么位置 |
   |:--|:--|:--|
   | 架构设计缺口（如缺失字段、签名不明确） | Plan §3 架构设计中对应子章节 | Spec §Requirements 中对应 Requirement |
   | 实施步骤缺口（如 roadmap 不完整） | Plan §4 实施步骤新增 Phase/步骤 | Spec §What Changes 新增改动项 |
   | 范围/边界缺口 | Plan 新增 §8 补充说明 | Spec §Boundaries 更新禁止项 |
   | P0 文档缺失（add-route/specs/handoff） | Plan §7 关联文档更新引用路径 | 如 Specs 已补建则无需修改 |
   | 编号/命名冲突 | Plan §4 Phase → Task Group | 对应更新 |

3. **逐问题写入 Plan**：
   - P0 问题：必须在 Plan 中显式关闭（补引用、补文件）
   - P1 问题：必须在 Plan 中显式响应（接受并修改，或接受并推迟并给出理由）
   - P2 问题：建议响应，非强制但不响应需在 Plan 中标记为 "已知不处理"
   - **不要**简单复制 Review 文字——要把修复建议转成 Plan 的具体文字（新增章节、修改表格、补充步骤）
   - **增量修订（强制）**：回流涉及修改已有内容时（非新增），必须遵循 ADD 文档增量修订规则——旧内容用 `~~删除线~~` 包裹保留，新内容紧跟后以 `→` 引导，末尾标注 `[修订日期: 修订原因]`。**禁止直接删除或覆盖原文**。格式示例：`~~VS Code 端放在轮次 4~~ → VS Code 基础 hooks 并入轮次 1 [2026-07-17 修订: Review P1 #6 实施顺序调整]`。仅新增内容（如新增 Task、新增约束块）无需删除线，但仍需标注修订原因
   - 回流完毕后，Plan 中的内容应与 Review 修复建议一致，但表达方式适应 Plan 的叙述风格
   - **回流标记格式（强制）**：每个回流点必须在 Plan 对应用 `[回流: Review {P0/P1} #{编号} {简述}]` 显式标注，供 DPS 扫描器计数回流完整度。回流标记与增量修订可合并——增量修订的 `修订原因` 段包含 `Review` 关键字即视为有效标记。示例：`[回流: Review P1 #6 实施顺序调整]`。格式说明：
     - `Review` 关键字固定
     - `{P0/P1}` 为 Review 中对应问题的严重度
     - `#{编号}` 为 Review §4.1 P0/P1 问题清单中的编号
     - `{简述}` 为 5-10 字中文简述
     - 回流标记可放置在 Plan 正文任意位置（章节标题、表项说明、约束块等），DPS 通过正则 `/\[回流\s*[:：]/g` 计数

4. **逐问题写入 Specs**：
   - 如果 Review 发现 Implementation Requirements 层面的缺口（如 `RetrieveBudget` 缺 `perExpertTopK`），在 Spec §Requirements 中新增对应的 WHEN-THEN Scenario
   - 如果 Review 发现 Boundaries 层面的缺口，更新 Spec §Boundaries

5. **验证回流完整性**：
   - 对 Review 中每个 P0/P1 问题，确认能在 Plan/Specs 中找到对应的"已修正后的文字"
   - 调用 `check_dps({ planKeyword: "..." })` 确认 DPS ≥ 85——如果回流后 DPS 仍然不达标，说明 Review 本身覆盖度不足或回流遗漏

6. **记录审计**：调用 `record_dev_operation`（`targetType: "PLAN"`，`action: "DOC_UPDATED"`，`beforeState`: Review 问题编号列表，`afterState`: 每个问题的回流位置）

**反例（禁止出现）**：
- Plan 写 `searchKnowledgeDocuments() 签名扩展`，Review 指出签名不明确 → 回流后 Plan 仍然写同样的文字 ❌
- Review 发现缺少 perExpertTopK，Specs 补了但 Plan §3.3 数据流图仍然是旧版 `topK` ❌

> **为什么这个卡位是强制性的**：与 ADD-12（代码后回看架构文档）形成对称——ADD-12 防止"代码改了但文档没改"的漂移，0.6.5 防止"Review 发现了问题但 Plan 没改"的漂移。两条原则合在一起：**文档的双源（Plan + Code）之外还有第三个源（Review），三源之间的回流如果不闭环，任何一源都会成为漂移的起点。**
>
> 详见 Expert Grounding RAG 适配的实战教训：Review 发现 8 个缺口（3 P0 + 5 P1），但未回流到 Plan。下游 AI 读到的 Plan 仍然是 `Phase 1-5`、`3/11`、`topK` 而非 `perExpertTopK`——按未修正的 Plan 实现了，与 Review 预期"天地之别"。

#### 0.7 原子闭包判定（强制卡位）

> **MUST NOT 跳过。** 在进入 Step 1 代码实现前，必须对 Plan 中的 Task Groups 执行双层闭包判定。
>
> 原子闭包分两层：
> - **Plan 级闭包**：整个 Plan 交付的完整业务功能是什么。一个 Plan 对应一个 Plan 级闭包，Plan 之间不重叠。
> - **轮次级闭包**：每个轮次的改动边界是什么。一轮内的文件改动不越界、不污染其他轮次，每轮可独立验证（tsc + eslint + checklist）。
>
> **Plan 级闭包的定义**：一组改动共同构成一个完整的业务功能，任缺其一则用户无感知、功能不可用、价值不完整。这是 Plan 拆分的上限——两个 Plan 之间不应有"缺了 A 则 B 不可用"的硬依赖。
>
> **轮次级闭包的定义**：一轮内的文件集合形成独立边界——该轮修改的文件不会被其他轮次回头修改，该轮的验证不依赖"下一轮补齐"。轮次之间是生产者-消费者关系，不是互相修补。
>
> ⚠️ **常见错误**：把"用户能用吗"当作轮次拆分的唯一标准，导致"都不能用所以合并成一轮"的错误合并。正确的做法是：Plan 级用业务价值判定（一个 Plan 一个闭包），轮次级用文件边界和独立验证判定（一轮内的文件互不跨轮修改）。

**判定输入**：`tasks.md` 中的 Task Groups + Plan §1 业务功能描述。

**Step 1：Plan 级闭包确认**

从 Plan §1 提取本次要交付的业务功能，确认是否可以在一个 Plan 内完成：

| 问题 | 判定 |
|------|------|
| 这个 Plan 描述的是几个完整的业务功能？ | 一个 → 单 Plan 级闭包；多个 → 拆成多个 Plan |
| 有没有"缺了 A 则 B 不可用"的 Plan 间硬依赖？ | 有 → Plan 边界错误，应合并 |

**Step 2：轮次级闭包划分**

对 Plan 内的 Task Groups，按文件边界划分轮次：

1. **逐文件归属**：把每个 Task 涉及的文件列出来，同一个文件只归属到一个轮次——如果发现一个文件被两个轮次同时修改，说明轮次边界有问题，需要重新划分
2. **依赖方向检查**：轮次 N+1 只消费轮次 N 的产出（读取轮次 N 新建/修改的文件），不回头修改轮次 N 的文件
3. **独立验证**：每个轮次完成后可通过 `tsc --noEmit` + `eslint` + checklist [T] 项独立验证——不允许出现"这轮编译不过，等下一轮修"的设计

**判定表**：

| 判定维度 | Plan 级闭包 | 轮次级闭包 |
|---------|-----------|----------|
| **判定标准** | 完整的业务功能，用户可感知 | 文件边界独立，互不跨轮修改 |
| **验证方式** | Plan §五验收标准，端到端 | tsc + checklist（该轮范围内的 [T] 项） |
| **审计** | Plan 级 ADD-7 审计字面量 | 每轮独立 audit action，可独立 query_audit_logs |
| **恢复** | 整个 Plan 的 handoff | 每轮独立章节，后续 Session 可单轮恢复 |

**判定产出**（写入 add-route）：

```
原子闭包判定
══════════
Plan 级闭包: {业务功能描述}
轮次: {N} 轮

第1轮: {轮次名称} ({文件数} 文件)
  文件边界: {文件列表}
  上轮依赖: 无
  可独立验证: tsc + eslint + checklist [{X} 项]

第2轮: {轮次名称} ({文件数} 文件)
  文件边界: {文件列表}
  上轮依赖: 消费第1轮产出的 {类型/接口/函数}
  可独立验证: tsc + eslint + checklist [{X} 项]
```

**Step 3：选择 handoff 模板**

根据轮次级闭包数量选择对应的 handoff 模板：

| 轮次数 | 模板 | 说明 |
|:--:|------|------|
| 1 | `handoff-single-round-template.md`（9 章节） | Plan 内只有 1 轮，所有文件在一次闭包内完成，无跨轮文件边界问题 |
| ≥2 | `handoff-multi-round-template.md`（每轮 13 子章节 + 全局拓扑 + 收敛规则 + 启动模板） | Plan 内有多个轮次，每轮有独立的文件边界和验证标准 |

> 绝大多数 Plan 都会有 ≥2 轮——因为即使业务功能简单，类型定义和调用方修复通常会自然形成两个独立文件边界。single-round 主要用于纯 Bug 修复或单文件改动。

> **为什么这个卡位是强制性的**：AI 在 Plan→Code 转换时两种错误——"把所有轮合成一轮"（把 Plan 级闭包当轮次级用）和"按代码依赖机械拆分"（同一个文件被多轮反复修改）。缺少文件边界检查，handoff 的轮次就失去了"可独立恢复"的基础——后续 Session 无法确定某一轮到底改了哪些文件。

**判定失败的处理**：

- 若 Plan 级闭包判定不通过（"缺 A 则 B 不可用"）→ 回退 Plan，合并为同一个 Plan
- 若某轮次文件归属冲突（同一文件被多轮同时修改）→ 回退 Plan，重新划分轮次边界
- 若某轮次"独立验证"不通过（tsc 这轮过不了）→ 检查是否漏了该轮的前置文件改动
- 若判定为多轮但 plan 未提供轮次拆分 → 回退 Plan 阶段补充轮次拆分

#### 0.7.1 Plan 活跃判定标准（裁决逻辑）

> **裁决定位**："某个 Plan 是否活跃"不是文档约定问题，而是需要从 add-route 的 Step 勾选状态中做确定性判定的裁决逻辑。在 add-coder 项目的 hook 脚本中以 shell 函数实现（`detect_active_add`），暂不依赖 caijuehub 裁决层分发（`npx add-coder init` 不产出 caijuehub）。

**活跃判定规则**：

1. **判定输入**：指定 magicDir 下的 `plans/` 目录（按当前端优先回退——以 Claude IDE 宿主环境为例：`.claude/plans/` → `.qoder/plans/` → `.add/plans/`，其他 IDE 同理取各自的 magicDir）
2. **索引优先**：先读 `plans/index.md` 匹配 planKeyword → 无匹配才 glob `*-plan-v*.md`
3. **活跃定义**：读 add-route 文件 → 存在 `[ ]` 未勾选的 Step 产出项 = 活跃（进行中）；全部 `[x]` = 已收敛（不活跃）
4. **多 Plan 冲突**：多个 Plan 均有 `[ ]` → 取 add-route 文件最近修改时间（`mtime`）最大的 Plan
5. **无 add-route**：Plan 文件存在但无 add-route → 判定为"Plan 初始态"，视为活跃但需要先生成 add-route

**应用场景**：
- SessionStart hook：恢复上下文时定位当前活跃 Plan
- UserPromptSubmit hook：决定注入"进行中"还是"新启动"的 ADD 状态
- PreToolUse hook：文件写入前置守卫——写入 plans/specs 时检查是否有活跃 Plan

### 第一阶段产出检查

- [ ] 已调用 `find_related_docs` 搜索相关文档
- [ ] 已阅读并理解所有相关项目文档
- [ ] 项目文档已更新（或已说明无需更新）
- [ ] add-route 执行路线图已生成（命名符合规范，Task 映射表与 tasks.md 一致）
- [ ] 文档合约一致性已确认
- [ ] **[0.6.5] Review 结论已回流至 Plan 与 Specs**——Review 中每个 P0/P1 问题在 Plan/Specs 中有对应的修正后文字
- [ ] 原子闭包判定已执行（Plan 级：确认单一业务功能；轮次级：确认文件边界独立、无跨轮修改、每轮可独立验证），轮次拆分方案已写入 add-route
- [ ] **DPS 上游文档质量闸门已通过**——调用 `check_dps({ planKeyword: "<Plan 核心关键词>" })`，DPS ≥ 85 方可进入 Step 1。未通过时回退补齐短板（Plan 粒度不足 / Review 覆盖维度缺失 / Specs Requirements 遗漏）。详见 [ADD 协同规范 §八]({{projectRoot}}/{{docsDir}}/knowledge/01-架构/《ADD开发工作路径与文档协同规范》.md#八双质量闸门dps-与-rahs)

---

### 第二阶段：验收后架构文档复核（在 Step 8 收敛判断后执行）

> **注意**：本阶段在 Step 8 收敛判断通过后执行，不在代码实现之前执行。

代码实现完成并通过所有验证后，重新回到架构文档做最终校准：

1. **重新阅读** 第一阶段中已更新的架构文档章节
2. **逐项对照**：文档中的接口/合约/数据流与实际实现是否一致
3. **标记偏差点**：如有不一致，输出偏差报告（差异位置 + 文档描述 vs 实际实现）
4. **通知开发者决策**：AI **禁止自动修改**代码或文档来消除偏差。差异信息提交给开发者，由开发者决定是修正代码还是修正文档
5. **审计记录**：偏差标记和开发者决策结果调用 `record_dev_operation` 记录（`targetType: "DOC"`，`action: "DOC_POST_IMPLEMENTATION_REVIEW"`）

### 第二阶段产出检查

- [ ] 架构文档已重新阅读
- [ ] 文档与实现的逐项对照已完成
- [ ] 如有偏差，偏差报告已生成并提交开发者
- [ ] 开发者决策已记录（修正代码 / 修正文档 / 接受差异）

---

## 附录 A：协作文档规范（命名、格式与交互规则）

> **目标**：确保 `.qoder/specs/`、`.qoder/reviews/` 下的 spec/review/handoff 文件遵循统一的命名和格式约定，使后续 AI Session 能快速定位和恢复上下文。

**在编写任何代码之前，必须先确认本附录中的文件结构已就位。**

### A.1 文件命名规范

| 文档类型 | 命名规则 | 示例 | 存放位置 |
|---------|---------|------|---------|
| 开发任务（specs 三元组） | `项目名-任务名/` | `add-coder-response-strategy/` | `.qoder/specs/` |
| review 文件 | `项目名-任务名-round{N}-review.md` | `add-coder-response-strategy-round2-review.md` | `.qoder/reviews/` |
| handoff 文件 | `项目名-需求名-handoff.md` | `add-coder-co-agent-handoff.md` | `.qoder/plans/{YYYY-MM}/{DD}/`（与 Plan 同目录） |

**命名规则说明**：

- **项目名**：当前仓库的项目标识，本项目为 `add-coder`
- **任务名**：用小写中划线描述该原子事务的核心功能，如 `response-strategy`、`expert-registry`、`semantic-cache`
- **需求名**：如果某个需求需要拆分成多个任务（多轮），handoff 文件用需求名命名（如 `co-agent`），每个任务作为 handoff 中的独立章节（如 `<第2轮>`）
- **如果需求与任务是一对一**：handoff 可以省略轮次编号，直接描述任务内容
- **handoff 只维护一个文件**：一个需求对应一个 handoff 文件，不按轮次拆分

### A.2 specs 三元组结构

每个 spec 目录 MUST 包含三个文件，形成"需求→执行→验收"闭环：

```
.qoder/specs/{任务名}/
  ├── spec.md       # 需求定义：Why / What Changes / Impact / Boundaries / Requirements
  ├── tasks.md      # 执行拆分：Preconditions / Forbidden / Tasks / Dependencies / Verification
  └── checklist.md  # 验收清单：编号验证项，每条可追溯到 tasks.md 的 Task
```

**spec.md 格式规范**（MUST 按以下章节顺序）：

```markdown
# {功能名称} Spec

## Why
一句话说明为什么要做这个改动。

## What Changes
列出本次会修改/新建哪些文件和内容。

## Impact
- Affected specs: 受影响的已有 spec（无则写无）
- Affected code: 受影响的代码文件列表
- 父 Plan: 链接到父计划文档
- 依赖: 上游轮次 / 模块
- 后续依赖: 下游轮次 / 模块

## Boundaries
本次只允许实现...，本次禁止实现...

## Requirements
### Requirement: {需求名}
系统 SHALL...（含 Scenario: WHEN...THEN... 格式）
```

**tasks.md 格式规范**（MUST 按以下章节顺序）：

```markdown
# Tasks: {功能名称}

## Preconditions
- [ ] 上游依赖检查项

## Forbidden
- 禁止修改...
- 禁止引入...

- [ ] Task 1: {任务名}
  - [ ] 子步骤
  - [ ] 验证标准

- [ ] Task N: ...

## Task Dependencies
- Task 2 依赖 Task 1

## Verification
- [ ] npx tsc --noEmit
- [ ] npm run lint
- [ ] npm run test
```

**checklist.md 格式规范**：

- 每一项是一个独立的验收条件，可追溯到 tasks.md 的具体 Task
- 勾选状态 MUST 可验证，禁止空勾选或推测通过
- 未执行的验收项 MUST 显式标注"未验证"并保留

### A.3 review 文件格式

review 文件用于在代码执行前审查 spec/tasks/checklist/handoff 的一致性和完整性。

**MUST 包含以下章节**（按顺序）：

```markdown
# 项目名-任务名-round{N}-review

## Review 元信息
- Review 对象: 列出被审查的文件路径
- Review 范围: 一句话描述
- Review 时间: ISO 日期
- 结论级别: 可接受 / 需修正后执行 / 方向错误需重做

## 1. 总体结论
一段话概述：方向是否正确、是否具备执行基础、存在哪些需修正的问题。

## 2. 正向评价
逐项肯定正确的设计决策和架构约束。

## 3. 问题清单
编号列表，每条含：严重程度 + 问题描述 + 修正建议。

## 4. 影响评估
修正前后对比，说明越界风险和协议破坏面。

## 5. 建议修正优先级
高优先级 / 中优先级 / 低优先级 分级。

## 6. 最终建议
推荐的执行顺序和完成判定标准。
```

### A.4 handoff 文件格式

handoff 文件的每个轮次章节 MUST 包含以下小节：

```markdown
## <第N轮> {轮次名称}

### 你当前的位置
你是第 N 轮。上游第 X 轮完成...，本轮只做...。

### 上游已完成
列出上游轮次的交付物。

### 你的 spec 文件
链接到对应的 specs 三元组目录。

### 你要改的文件
| 文件 | 操作 | 改什么 |

### 核心设计
关键架构约束、接口定义、策略注册表等。

### 关键契约细化
逐条列出不可妥协的契约约束。

### 高风险误区
列出禁止跨越的边界和常见错误方向。

### 恢复上下文审计查询（新 AI Session 首次启动必读）
- 第一步：按 targetId 搜索代码文件改动
- 第二步：搜索文档变更记录
- 第三步：按行动词搜索快速定位
- 每条 query_audit_logs 调用 MUST 附带返回条数和 beforeState/afterState 说明
- 必须给出 "一键恢复" 的 keyword 搜索方式

### 验证标准
分为 "已完成验证" 和 "未执行的端到端验证" 两部分，未执行项不得勾选。

### 完成后记录 ADD-7 审计
列出本轮的 ADD-7 action 清单（含文件路径）。
```

### A.4.1 轮次边界的设计原则：双层对接

handoff 的轮次边界不是按代码依赖划分的，而是受两层对接约束：

**第一层：产品需求 → 原子实现单元**

一个原子闭包 = 一个完整的产品需求落成。handoff 的一轮必须对应一个自洽的业务语义——用户说"per-expert 独立 RAG 检索"，从 Collection 创建到检索切换到证据归属，缺任何一个环节这个需求就没有落地。按代码依赖拆轮会把同一个需求切成"先建 Collection"和"再切检索"两个半成品——从产品需求视角看，任何一轮单独交付都没有完成用户要求的功能。

**第二层：LLM 的注意力集中**

handoff 的消费者是 LLM。如果一轮 handoff 描述的是"三个空 Collection 已建好但不能用"，LLM 需要同时加载这个不完整状态 + 下一轮的完整语义，才能在脑子里拼出全貌——注意力被跨轮碎片分散。如果一轮 handoff 描述的是"per-expert RAG 检索已完整可用"，LLM 得到的是一个自洽的闭合故事，注意力集中在一个完整的业务语义上，不需要跨轮补偿理解。

**边界来源**：不是代码拓扑，是语义完整性。产品需求层要求语义完整才叫"交付了一个功能"；LLM 注意力层要求语义完整才叫"可独立理解"。代码依赖拆轮同时破坏这两层——拆出来的轮次既不对应产品需求，也无法被 LLM 独立消费。

### A.5 三种文档的交互规则

```
                    ┌─────────────────┐
                    │  spec + tasks +  │
                    │  checklist       │ ←── 被 review 引用
                    │  (三元组)         │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        review 文件     handoff 章节    代码实现
        (执行前审查)    (入口索引)      (消费 spec)
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                    checklist 逐项勾选
                             │
                             ▼
                    handoff 验证标准更新
                             │
                             ▼
                    ADD-7 审计落库 + query 回查
```

**关键规则**：

1. **handoff 是入口索引**：指向 specs 三元组，不重复 spec 的所有细节
2. **handoff 摘要与 spec 冲突时，以 spec 为准**：不允许按 handoff 的简写自行简化实现
3. **review 覆盖 handoff + specs 全部**：不是只审 spec 不审 handoff
4. **代码完成后 checklist ← 逐项勾选 → handoff 验证标准**：两者必须同步更新
5. **每轮完成后 handoff 对应章节 MUST 更新**：文件清单、合同细节、ADD-7 审计查询语句
6. **ADD-7 不只写入 record_dev_operation**：还必须用 query_audit_logs 按 action/targetId/keyword 回查确认落库

---

## Step 1：功能分析与审计阶段定义

**在编写任何业务代码之前，必须先完成本步骤。**

### 1.1 分析功能的业务阶段

列出本次变更涉及的所有业务阶段，确定需要新增哪些审计阶段名。

### 1.2 扩展 AgentAuditPhase 联合类型

在 `src/lib/agent-audit-logger.ts` 的 `AgentAuditPhase` 联合类型中新增本次需要的阶段字面量：

```typescript
type AgentAuditPhase =
  | "CHAT_REQUEST"        // 已有
  | "RETRIEVAL_RESULT"    // 已有
  // ... 已有阶段 ...
  | "NEW_PHASE"           // ← 本次新增
```

### 1.3 确认审计数据通道

项目统一使用 `agentAudit(phase, detail, extra?)`，三通道输出（console + file + AuditLog 表），无需定义独立数据结构或 Prisma 字段。

### Step 1 产出检查

- [ ] AgentAuditPhase 联合类型已扩展，含本次需要的所有新阶段
- [ ] 确认无需新建 logger 文件（复用中央 agent-audit-logger.ts）

---

## Step 2：审计基础设施实现

项目已有中央审计基础设施 `agent-audit-logger.ts`，提供 `agentAudit(phase, detail, extra?)` 统一入口。本步骤确认基础设施可用，无需新建任何文件。

### 2.1 确认 agentAudit 通道

```typescript
// src/lib/agent-audit-logger.ts — 已就绪
export function agentAudit(phase: AgentAuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)       // 通道1: console
  writeToFile(message)       // 通道2: file
  // 通道3: AuditLog 表（Layer 2 运行时审计）
}
```

### 2.2 确认辅助审计函数

项目提供语义化封装函数，直接调用：

| 函数 | 用途 |
|------|------|
| `agentAudit(phase, detail, extra?)` | 通用审计打点 |
| `agentAuditNodeStart(nodeName, detail?)` | 节点进入 |
| `agentAuditNodeEnd(nodeName, durationMs, detail?, extra?)` | 节点退出 |
| `agentAuditNodeError(nodeName, error, extra?)` | 节点异常 |
| `agentAuditRetrieval(query, resultCount, evidenceCount)` | 检索结果 |

### Step 2 产出检查

- [ ] `agentAudit()` 通道已确认可用（三通道输出：console + file + AuditLog 表）
- [ ] Step 1 新增的 `AgentAuditPhase` 字面量可被 `agentAudit()` 接受

---

## Step 3：业务逻辑实现与审计植入

**功能实现与审计点同步进行，不分离。**

### 3.0 前置守卫：add-route 存在性交叉校验（强制执行）

> **Step 3 准入条件**：add-route 文件必须已存在且通过交叉校验，否则禁止进入代码实现阶段。

在编写任何代码之前，调用 MCP 工具进行 add-route 存在性交叉校验：

```text
check_add_route_status({ planKeyword: "<Plan 核心关键词>" })
```

**三种返回状态及其处理**：

| 状态 | 含义 | 操作 |
|------|------|------|
| `normal` | 审计日志有记录 + 文件存在 + Step 全部闭环 | ✅ 通过守卫，进入 3.1 |
| `warn_step_incomplete` | 文件存在但存在未勾选的 Step 产出项 | ⚠️ 可继续，但应在 Step 3 完成后调用 `check_add_route_completeness` 自检 |
| `file_missing` | 审计有记录 + 文件丢失 | ❌ 中断执行，询问用户原因 |
| `never_generated` | 审计无记录 + 文件不存在 | ❌ 禁止进入 Step 3，强制回退至 Step 0.5 生成 add-route |

> **升级说明（2026-06-11）**：v2 `check_add_route_status` 新增文件内容扫描，自动统计 add-route 中 `[ ]` vs `[x]` 的 Step 完成度。未闭环时返回 `warn_step_incomplete` 而非阻断——因为 Step 3 刚开始时 Step 3.5/4/5/8 自然是未勾选状态。完整闭环检查由 Step 3.6 的 `check_add_route_completeness` 完成。
> **为什么这个守卫是必须的**：add-route 是 Plan（抽象 Task）与代码实现之间的唯一映射表。没有 add-route，AI 不知道每个 Task 对应哪些文件、植入哪些审计点、依赖拓扑如何——实现必然偏离设计。各家 IDE 可能用自己的编程流程，但一旦选择 ADD 范式，add-route 就是不可跳过的必经之路。跳过 add-route = 效果大幅下降。

**守卫产出检查**：
- [ ] `check_add_route_status` 已调用，返回 `normal` 或 `warn`
- [ ] 如返回 `never_generated`：已回退至 Step 0.5，add-route 生成完毕并重新校验通过
- [ ] 如返回 `file_missing`：已询问用户并确认处理方案

### 3.1 服务层审计植入模板

使用 `agentAudit()` 在关键节点打点：

```typescript
import { agentAudit } from "@/lib/agent-audit-logger"

export async function executeFeature(params: FeatureParams): Promise<FeatureResult> {
  const startTime = Date.now()

  try {
    // 阶段一
    agentAudit("PHASE_ONE", "开始处理", { paramCount: params.items.length })
    const result = await processPhaseOne(params)
    agentAudit("PHASE_ONE", "处理完成", {
      durationMs: Date.now() - startTime,
      itemsProcessed: result.items.length,
    })

    return result
  } catch (error) {
    // 失败路径等价审计（ADD-6）
    agentAudit("FEATURE_FAIL", `处理失败: ${error instanceof Error ? error.message : String(error)}`, {
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? "").split("\n").slice(0, 4).join("\n") : undefined,
    })
    throw error
  }
}
```

### 3.2 API Route 审计植入模板

```typescript
import { agentAudit, setAuditContext } from "@/lib/agent-audit-logger"

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const traceId = crypto.randomUUID()
  setAuditContext(userId, traceId)

  try {
    agentAudit("FEATURE_REQUEST", "请求进入", { traceId })
    const result = await executeFeature(await request.json())
    agentAudit("FEATURE_REQUEST", "请求完成", { traceId, durationMs: Date.now() - startTime })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    agentAudit("FEATURE_FAIL", "请求失败", {
      traceId,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
```

### Step 3 产出检查

- [ ] **add-route 前置守卫已通过**（`check_add_route_status` 返回 `normal` 或 `warn`；若 `never_generated` 则已回退 Step 0.5 并重新校验通过）
- [ ] 每个关键节点有 `agentAudit("PHASE", ...)` 调用
- [ ] 循环体内每个迭代有独立审计记录
- [ ] catch 块有等价信息密度的审计（含 durationMs + error + stack 前 4 帧）
- [ ] API Route 有完整的审计包裹（含 traceId）

### 3.6 add-route Step 自检闭环（强制执行）

> **Step 3 代码实现全部完成后，MUST 调用 `check_add_route_completeness` 自检 add-route 的 Step 完成度，防止执行遗漏。这是 ADD v2 新增的守卫步骤。**

调用 MCP 工具扫描 add-route 的 Step 勾选状态：

```text
check_add_route_completeness({ planKeyword: "<Plan 核心关键词>" })
```

**四种返回状态及处理**：

| 状态 | 含义 | 操作 |
|------|------|------|
| `complete` | 所有 Step 产出项全部 [x] | ✅ 通过自检，进入 Step 3.5 |
| `incomplete` | 存在未勾选的 Step 产出项 | ⚠️ 逐 Step 完成未闭环项，完成后重新调用本工具 |
| `file_missing` | 未找到 add-route 文件 | ❌ 回退至 Step 0.5 生成 |
| `errors` | 文件存在但解析出错 | ❌ 检查 add-route 格式 |

**自检产出**：
- [ ] `check_add_route_completeness` 已调用，返回 `complete`
- [ ] 逐 Step 完成度报告已生成（无未勾选项）
- [ ] 如返回 `incomplete`：已完成未闭环 Step 并重新校验通过

> **为什么这个自检是必须的**：Step 3 产出检查只验证代码级别的审计植入（agentAudit 调用、Phase 扩展等），不验证 add-route 文档本身的 Step 执行完整度。AI 可能在完成 Step 3 代码后标记 Task 为 ✅ 但跳过 Step 3.5/4/5/8 的文档闭环。本自检扫描 add-route 文件内容，统计所有 `[ ]` vs `[x]`，确保没有任何 Step 被遗漏。

---

## Step 3.5：实现审查（ADD-10 意图与实现的语义鸿沟）

**代码实现完成后，在进入审计数据验证之前，必须先通过实现审查。**

### 3.5.1 运行 spec checklist

检查 `.qoder/specs/{task}/checklist.md` 中的所有检查项：

- `[T]` 编译期验证项：逐项执行并勾选
- `[R]` 运行时验证项：保持 `[ ]`，将自动流转到 review-runtime.md

### 3.5.2 执行跨项目联调检查

按 `checklist-template.md` 的"跨项目联调检查"章节逐项验证：

- [T] 格式契约（参数类型对齐、Content-Type 匹配）
- [T] 框架版本（`package.json` 主版本号、breaking changes）
- [R] 编译产物 mtime
- [R] Prisma 外键记录存在
- [T] userId 等字段是真实 ID
- [T] 环境变量加载链
- [T] 多 API 场景匹配
- [R] E2E curl

### 3.5.3 生成实现审查文档

按 HITL temporary.md 流程执行：读取 `review-implementation-template.md` → 先写 `{name}-review-implementation.temporary.md`（只含 HITL 发现总览表）→ 人类一次性拍板 → 逐条展开详细分析 → 写入 `.qoder/reviews/`（guard 放行）→ 删除 temporary。详见上方模板生成规则处的 Review HITL 磋商说明。

### 3.5.4 生成运行时审查文档（所有 [T] 项通过后）

当所有 `[T]` 项均通过后：

1. 读取 `review-runtime-template.md`
2. 复制为 `.qoder/reviews/{project}-review-runtime.md`
3. 替换占位符（标题、关联文档路径）
4. §1 发现列表初始化为"尚无运行时发现"
5. §1 末尾自动插入所有 `[R]` 项的"待运行时验证"清单
6. 提示用户："review-runtime.md 已就绪，部署后异常会自动填充。"

### Step 3.5 产出检查

- [ ] spec checklist 所有 `[T]` 项已通过
- [ ] 实现审查文档已生成
- [ ] review-runtime.md 已生成（含 [R] 待验证清单）

---

## Step 4：审计数据验证

**运行功能，收集审计数据，验证完整性。**

### 4.1 运行功能

触发功能执行，产生审计日志。

### 4.2 检查阶段标记对称性

使用 MCP 工具验证审计阶段完整性：

```
check_phase_symmetry  — 验证每个 PHASE 的进入/退出是否成对
check_failure_path    — 验证失败路径审计信息密度 ≥ 成功路径（ADD-6）
```

也可通过查询审计日志手动验证：

```bash
grep "RETRIEVAL_DECISION" logs/agent/agent-audit.log | head -5
```

### 4.3 检查最小可观测单元

验证循环内的审计记录是否完整：
- 每个项目/块/消息都有独立审计记录
- 每条记录包含结构化 extra 数据

### 4.4 检查三通道输出

1. 控制台：运行时有 `[PREFIX]` 开头的输出
2. 文件日志：`logs/{feature-dir}/{feature}.log` 有内容
3. 数据库：业务表的 metadata/审计字段有结构化数据

### 4.5 检查失败路径

模拟错误场景，验证 catch 块的审计信息密度与 try 块等价。

### Step 4 产出检查

- [ ] 阶段标记对称（Start/End 数量匹配）
- [ ] 最小可观测单元数据完整
- [ ] 三通道输出正常
- [ ] 失败路径审计等价
- [ ] 数据库审计字段有数据
- [ ] **RAHS 下游执行健康度已检查**——调用 `check_rahs({ planKeyword: "<Plan 核心关键词>" })`，RAHS ≥ 90 方可进入 Step 5。若 < 70 注意力漂移严重，强制返工 Step 3。详见 [ADD 协同规范 §八]({{projectRoot}}/{{docsDir}}/knowledge/01-架构/《ADD开发工作路径与文档协同规范》.md#八双质量闸门dps-与-rahs)

---

## Step 5：AI 自动合规检查

**AI 助手作为审计数据的第一消费者，自动检查 ADD 原则的合规性。**

### 5.1 读取审计日志

调用审计日志器的 `readRecentLogs()` 函数获取最近的审计记录：

```typescript
import { read{Feature}Logs } from "@/lib/{feature}-logger"

const logs = await read{Feature}Logs(200)
```

### 5.2 执行合规检查

AI 助手必须逐项检查以下合规条件，并向程序员报告结果：

**检查 1：阶段标记对称性（ADD-2）**

- 统计所有 `═══ [PHASE] 开始` 的出现次数
- 统计所有 `═══ [PHASE] 结束` 的出现次数
- 两个数字必须相等
- 不对称 = 有阶段异常中断，需要定位具体阶段

**检查 2：最小可观测单元完整性（ADD-3）**

- 统计 `_CHUNK` 阶段的审计记录数
- 与预期的循环次数对比
- 记录数 < 预期 = 循环中有迭代未完成

**检查 3：失败路径信息密度（ADD-6）**

- 检查 `_FAIL` 阶段的 extra 字段
- 对比成功路径的 extra 字段
- 失败路径 extra 字段数 ≥ 成功路径 = 合规
- 失败路径 extra 字段数 < 成功路径 = 不合规，需要补充

**检查 4：三通道输出一致性（ADD-4）**

- 控制台输出：有 `[PREFIX]` 开头的日志
- 文件日志：`logs/{feature-dir}/{feature}.log` 有内容
- 数据库：业务表 metadata/审计字段有结构化 JSON 数据

**检查 5：审计数据回写（ADD-5）**

- 查询数据库确认审计字段有数据
- 审计数据结构符合 Step 1 定义的 AuditData 类型

### 5.3 生成合规报告

AI 助手必须生成以下格式的合规报告：

```
ADD 合规检查报告
═════════════════
功能：{feature name}
检查时间：{ISO timestamp}
日志条数：{N}

合规项：
  ✅ 阶段标记对称（Start=5, End=5）
  ✅ 最小可观测单元完整（CHUNK=9, 预期=9）
  ✅ 审计数据回写数据库

不合规项：
  ❌ 失败路径信息密度不足
     - VECTORIZE_FAIL extra 字段数=2, 成功路径=3
     - 缺少字段: tokens_processed
     - 修复建议: 在 catch 块中添加 tokens_processed 变量记录

  ⚠️ 阶段标记不对称
     - CHAIN_TRACE_SAVE 有 Start 无 End
     - 可能原因: 链路追踪保存异常中断
     - 修复建议: 检查 saveChainTrace 方法是否抛出未捕获异常
```

### 5.4 AI 根据合规报告调整行为

- 如果有不合规项，AI 自动生成修复代码并提示程序员
- 如果合规报告显示功能收敛，AI 确认开发完成
- 如果发现审计数据中的异常模式（如某阶段从未触发），AI 主动提示

### Step 5 产出检查

- [ ] AI 已读取审计日志（调用 readRecentLogs）
- [ ] 阶段标记对称性已检查
- [ ] 最小可观测单元完整性已检查
- [ ] 失败路径信息密度已检查
- [ ] 合规报告已生成并展示给程序员
- [ ] 不合规项已有修复建议或修复代码

---

## Step 6：从审计数据定位问题

**如果 Step 4 发现异常，从审计数据中定位根因。**

### 6.1 分析日志文件

```bash
# 查看最近的审计日志
cat logs/{feature-dir}/{feature}.log | tail -50

# 过滤特定阶段
grep "{PHASE_ONE}_CHUNK" logs/{feature-dir}/{feature}.log

# 查找失败记录
grep "FAIL\|ERROR" logs/{feature-dir}/{feature}.log
```

### 6.2 分析数据库审计字段

```sql
SELECT id, metadata->>'last{Feature}Audit'
FROM "{BusinessEntity}"
ORDER BY "updatedAt" DESC
LIMIT 10;
```

### 6.3 从数据推断根因

审计数据的优势：
- 只有 Start 没有 End = 该阶段异常中断
- CHUNK 审计中某条缺失 = 该迭代失败
- 耗时异常长 = 性能瓶颈
- 数据库审计字段为空 = 写入失败

---

## Step 7：修复并验证

### 7.1 修复问题

根据 Step 6 定位的根因进行修复。

### 7.2 重新运行验证

修复后重新执行 Step 4 的验证流程。

### 7.3 审计数据验证修复效果

对比修复前后的审计数据，确认：
- 异常消失
- 阶段标记恢复对称
- 数据库审计字段正常

---

## Step 8：收敛判断

### 收敛条件

所有以下条件满足时，功能开发收敛：

- [ ] 审计日志无 FAIL/ERROR 记录
- [ ] 阶段标记完全对称
- [ ] 最小可观测单元数据完整且合理
- [ ] 数据库审计字段有正确的结构化数据
- [ ] TypeScript 编译通过
- [ ] 三通道输出格式统一
- [ ] **checklist.md 全部项已勾选，且有可验证证据**（不得空勾选、不得"推测通过"）
- [ ] **tasks.md 全部任务已完成，且每个任务有对应的 checklist 验证记录**
- [ ] **review-runtime.md 中的 [R] 运行时验证项已全部确认**（部署后逐项验证并勾选）
- [ ] **`check_add_route_completeness` 返回 `complete`**（ADD v2 新增：add-route 所有 Step 产出项全部 [x]，无遗漏）
- [ ] **RAHS 最终核定 ≥ 90**——调用 `check_rahs({ planKeyword: "<Plan 核心关键词>" })`，RAHS < 90 不回退修复不得收敛。`check_dps` 和 `check_rahs` 的声明交集构成了 ADD 收敛的双轨裁决

### 收敛后：执行验收闭环（ADD-12）

收敛条件全部满足后，**必须回到 Step 0 第二阶段**执行验收后架构文档复核（ADD-12 双源头漂移的必然性）：重新阅读架构文档 → 逐项对照实现 → 标记偏差点 → 通知开发者决策。这是 ADD-0.1 广义文档先行的闭合步骤。

### 收敛后：生成交接手册（handoff）

> **MUST NOT 跳过此步骤。** 收敛条件全部满足后，必须按模板生成交接手册，使后续 AI Session 能恢复上下文。
>
> **例外**：如果本 Plan 使用的是 `simple-plan-template.md`，**跳过本步骤**——Handoff 已融合在 Plan §四，无需独立文件。

1. **判断是否精简版**：检查 Plan 文件是否基于 `simple-plan-template.md` → 是则跳过，Handoff 信息已在 Plan §四 中
2. **读取对应模板**：单轮变更读 `handoff-single-round-template.md`（9 章节），多轮变更读 `handoff-multi-round-template.md`（13 子章节/轮）
2. **填满所有章节**：模板中每个 `{占位符}` 都必须替换为实际内容，不得留空。特别注意：
   - **§8 恢复上下文审计查询**：MUST 包含基于真实 `query_audit_logs` 结果的逐文件审计查询语句，不得编造
   - **§9 后置确认**：逐项确认 tsc/ADD 合规/审计落库
3. **审计查询语句必须可执行**：`query_audit_logs({ targetId: "..." })` 调用参数来自 `record_dev_operation` 落库的 targetId
4. **双向链接**：handoff 文件内必须包含指向对应 plan + review 的链接；review 文件内必须包含指向 handoff 的链接
5. **写入位置**：`{项目名}-{需求名}-handoff.md` → `.qoder/plans/`

### 未收敛

如果仍有异常，回到 Step 6 继续定位和修复。

### 收敛后：条件进入 Step 9

若本 Plan 为 runtime-fix plan（修复 gateway.md 运行时发现），收敛后必须进入 Step 9 Report Closure。

---

## Step 9：Report Closure（运行时发现关闭）

> **条件性步骤**：仅 runtime-fix plan（修复 gateway.md 运行时发现）执行。
> 非 runtime plan 跳过本步骤，直接进入架构文档回看。

### 9.1 读取 report-handoff 模板

读取 `.qoder/templates/report-handoff-template.md`，按模板格式在 handoff 中追加 Report Closure 章节。

### 9.2 在 handoff 中追加 Report Closure 章节

按模板填充：
- 关闭格式说明：`- [x] Triage 结果: ...`
- 本次需关闭的发现列表（错误签名 + 出现次数 + 标记位置）
- 关闭后验证命令

### 9.3 在 gateway.md 中追加 `- [x]` 标记

对每个被修复的发现条目体末尾追加：

```markdown
- [x] Triage 结果: ✅ 已修复 — commit {hash}（{原因}）。关闭时间: {日期}
```

### 9.4 验证关闭

```bash
npx tsx scripts/check-boundary-report.ts
# 预期：已修复类型不再出现在"未关闭"列表中
```

### Step 9 产出检查

- [ ] handoff 文件已追加 Report Closure 章节（按 `report-handoff-template.md`）
- [ ] gateway.md 被修复的发现均已追加 `- [x]` 标记
- [ ] `check-boundary-report.ts` 已关闭类型无残留

---

## 现有审计日志器参考

项目已有以下审计日志器，新日志器必须遵循相同模式：

| 日志器 | 文件 | 前缀 | 日志目录 |
|--------|------|------|----------|
| 知识库审计 | `src/lib/audit-logger.ts` | `[KB-AUDIT]` | `logs/knowledge-base/` |
| Agent审计 | `src/lib/agent-audit-logger.ts` | `[AGENT-AUDIT]` | `logs/agent/` |

新日志器命名规范：
- 文件：`src/lib/{feature}-logger.ts`
- 前缀：`[{FEATURE}-AUDIT]`
- 日志目录：`logs/{feature-dir}/`
- 日志文件：`{feature}.log`
