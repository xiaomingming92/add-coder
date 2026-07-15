# ADD 治理词汇表 (ADD Governance Vocabulary)

> **目的**：LLM 听到以下触发词时零额外 prompt 执行正确操作（L1 预埋）。

## 优先级说明

| 优先级 | 含义 | 触发行为 |
|--------|------|---------|
| 🔴 P0 | 必须预埋 | 听到即执行，不可跳过 |
| 🟡 P1 | 应该预埋 | 听到即执行，少数场景可确认 |
| 🟢 P2 | 可选预埋 | 听到时优先执行，不确定可查文档 |

---

## 类别 A: 文档类型（13 个）

| 触发词 | LLM 默认操作 | 优先级 |
|--------|-------------|--------|
| `PRD` / `prd` / `需求文档` / `产品需求` | ①新建：读 `prd-standard-template.md` → 写 `docs/*/knowledge/00-需求/`；②增量：读 `prd-incremental-template.md` → 在已有PRD基础上追加/修改 | 🟡 P1 |
| `Plan` / `plan` | **二段式**: ①先读 `.add/plans/index.md` 按 planName 匹配路径（P0 优先）；②无匹配才全局 glob 搜索 `*-plan-v*.md`。**禁止跳过 index.md 直接 glob** | 🔴 P0 |
| `Spec` / `spec` | 查 `.add/specs/{name}/spec.md` | 🔴 P0 |
| `Tasks` / `tasks` | 查 `.add/specs/{name}/tasks.md` | 🟡 P1 |
| `Checklist` / `checklist` | 查 `.add/specs/{name}/checklist.md` | 🟡 P1 |
| `Review` / `review` | **二段式**: ①先读 `.add/plans/index.md` 定位 plan → 查其关联 Review；②无匹配才全局 glob `*-review*.md` | 🔴 P0 |
| `review-implementation` | 查 `.add/reviews/` 下 `*-review-implementation*.md` | 🟡 P1 |
| `review-runtime` | 查 `.add/reviews/` 下 `*-review-runtime*.md` | 🟡 P1 |
| `Handoff` / `handoff` / `交接` | **二段式**: ①先读 `.add/plans/index.md` 按 planName 匹配路径 → 定位 handoff；②无匹配才全局 glob `*-handoff*.md` | 🔴 P0 |
| `add-route` / `执行路线图` | **二段式**: ①先读 `.add/plans/index.md` 定位 plan → 查其 add-route；②调 `check_add_route_status`；③无匹配才全局 glob | 🔴 P0 |
| `devlog` / `开发日志` | **双触发**: ①用户说"devlog 记录下"→ 立即写；②Step 8 收敛通过 → 自动写（无需提醒）| 🔴 P0 |
| `index.md` / `Plan索引` | 读 `.add/plans/index.md`（匹配依赖优先）。**当用户问及任何 doc 类型（Plan/Review/Handoff/add-route）但未给明确路径时，此条优先于上述所有 doc 类型触发词执行** | 🔴 P0 |
| `gateway.md` / `gateway报告` / `运行时报告` | 读 `.add/reports/add-coder-runtime-report/gateway.md` | 🟡 P1 |
| `report-handoff` / `report交接` | 读 `.add/templates/report-handoff-template.md` | 🟡 P1 |

---

## 类别 B: ADD 阶段（12 个）

| 触发词 | LLM 默认操作 | 优先级 |
|--------|-------------|--------|
| `Step 0` / `文档先行` | 分析变更 → 更新文档 → 生成 add-route → DPS 门禁 | 🔴 P0 |
| `Step 1` / `功能分析` | 确定 Phase → 扩展 AgentAuditPhase | 🟡 P1 |
| `Step 2` / `审计基础设施` | 确认 agentAudit 通道 | 🟡 P1 |
| `Step 3` / `业务逻辑实现` | add-route 前置守卫 → 代码实现 + 审计植入 | 🟡 P1 |
| `Step 3.5` / `实现审查` | 跑 checklist [T] 项 → 生成 review-implementation + review-runtime | 🟡 P1 |
| `Step 4` / `审计验证` | check_phase_symmetry + check_failure_path + RAHS 门禁 | 🟡 P1 |
| `Step 5` / `合规检查` | AI 自动检查 ADD 原则合规性 | 🟢 P2 |
| `Step 6` / `定位问题` | 从审计数据推断根因 | 🟢 P2 |
| `Step 7` / `修复验证` | 修复 → 重新验证 | 🟢 P2 |
| `Step 8` / `收敛判断` / `验收` | 五步闭环：0: 写 devlog日志(走mcp) ①按对应的specs检查checklist未勾选选项\task未勾选选项 → ②更新 handoff → ③进入 Step 9 Report Closure（如为 runtime-fix）→ ④架构文档回看。**不可只做 handoff 不写 devlog日志(走mcp)** | 🔴 P0 |
| `Step 9` / `Report Closure` / `关闭发现` / `标记修复` | **条件性步骤**：仅 runtime-fix plan 执行。按 `report-handoff-template.md` 在 gateway.md 追加 `- [x]` 标记，运行 `npx tsx scripts/check-boundary-report.ts` 验证关闭 | 🔴 P0 |
| `原子闭包` / `三可性` | 执行原子闭包判定：可独立提交/验证/审计/恢复 | 🟡 P1 |

---

## 类别 C: 门禁/闸门（6 个）

| 触发词 | LLM 默认操作 | 优先级 |
|--------|-------------|--------|
| `DPS` / `DPS闸门` | 调 `check_dps({ planKeyword: "..." })`，DPS ≥ 85 通过 | 🔴 P0 |
| `RAHS` / `RAHS闸门` | 调 `check_rahs({ planKeyword: "..." })`，RAHS ≥ 90 通过 | 🔴 P0 |
| `Guardian` / `门禁` / `add-flow-guardian` | 调 `add-flow-guardian` Subagent（入口或出口模式） | 🔴 P0 |
| `add-route 闭环` / `闭环自检` | 调 `check_add_route_completeness({ planKeyword: "..." })` | 🟡 P1 |
| `BLOCKED` / `阻断` | Guardian 返回 BLOCKED → 回退修复，不得继续 | 🔴 P0 |
| `boundary-report` / `边界报告检查` | 运行 `npx tsx scripts/check-boundary-report.ts` | 🟡 P1 |
| `Review 回流` / `0.6.5` | Review P0/P1 问题必须写回 Plan + Specs | 🔴 P0 |

---

## 类别 D: MCP 工具（高频 10 个）

| 触发词 | LLM 默认操作 | 优先级 |
|--------|-------------|--------|
| `get_project_context` | 调 `get_project_context({ scope: "add-state" })` 获取 ADD 状态 | 🔴 P0 |
| `check_dps` | DPS 闸门（Step 0 末尾） | 🔴 P0 |
| `check_rahs` | RAHS 闸门（Step 4/8） | 🔴 P0 |
| `check_add_route_status` | add-route 存在性校验（Step 3 前） | 🔴 P0 |
| `check_add_route_completeness` | add-route Step 完成度扫描（Step 3 后） | 🟡 P1 |
| `check_phase_symmetry` | 阶段标记对称性验证 | 🟡 P1 |
| `check_failure_path` | 失败路径等价审计验证 | 🟡 P1 |
| `query_audit_logs` | 按 keyword/targetId/targetType 查询审计日志 | 🟡 P1 |
| `check_add_compliance` | ADD 原则合规性扫描 | 🟢 P2 |
| `check_spec_sync` | 文档-代码交叉校验 | 🟢 P2 |

---

## 类别 E: Skills / Subagents（5 个）

| 触发词 | LLM 默认操作 | 优先级 |
|--------|-------------|--------|
| `session-init` / `会话初始化` | 执行 session-init SKILL（新对话第一步，不可跳过） | 🔴 P0 |
| `add-paradigm` / `ADD范式` | 执行 add-paradigm SKILL（开发任务入口，不可跳过） | 🔴 P0 |
| `add-flow-guardian` / `Guardian` | 调起门禁 Subagent | 🔴 P0 |
| `create-skill` | 引导创建新 Skill | 🟢 P2 |
| `create-subagent` | 引导创建新 Subagent | 🟢 P2 |

---

## 类别 F: 核心概念（13 个）

| 触发词 | LLM 含义 | 优先级 |
|--------|---------|--------|
| `裁决层` / `caijue` / `caijue.toml` | 读 `src/caijuehub/caijue.toml` | 🟡 P1 |
| `agentAudit` / `审计打点` | ADD-7：业务代码中调用 `agentAudit(phase, detail, extra)` 植入运行时审计点（区别于 `record_dev_operation` MCP 工具） | 🟡 P1 |
| `agentAuditNodeStart` / `agentAuditNodeEnd` | ADD-2：节点进入/退出阶段标记，用于验证阶段对称性 | 🟡 P1 |
| `Phase` / `AgentAuditPhase` | `src/lib/agent-audit-logger.ts` 中的阶段联合类型 | 🟡 P1 |
| `ADD-3` / `最小可观测单元` | 循环内每个迭代独立审计、每个关键操作独立记录，不可合并 | 🟢 P2 |
| `ADD-4` / `三通道` | 审计输出：console + file + DB，三者信息等价 | 🟢 P2 |
| `ADD-5` / `审计数据即业务数据` | 审计指标回写业务表字段（如 `Document.metadata.lastSyncAudit`） | 🟢 P2 |
| `traceId` | 全链路追踪 ID，贯穿单次请求所有审计记录 | 🟡 P1 |
| `收敛` / `收敛判断` | Step 8 全条件满足（tsc + checklist + RAHS + add-route 闭环） | 🔴 P0 |
| `阶段对称` | ADD-2：每个 Phase Start/End 成对，通过 `check_phase_symmetry` 验证 | 🟡 P1 |
| `失败路径` | ADD-6：catch 块审计信息密度 ≥ try 块，通过 `check_failure_path` 验证 | 🟡 P1 |
| `稀疏推理` | ADD-7 + MCP-5：通过 `query_audit_logs` 稀疏恢复开发上下文 | 🟡 P1 |
| `planKeyword` | add-route / check_dps / check_rahs 的定位关键词，取自 Plan 核心功能名 | 🟡 P1 |

---

## Few-Shot 示例

> 以下为 LLM 最容易误解的高频场景，每个场景给出标准输入 → 标准输出映射。

### 场景 1: 验收后缺 devlog（最高频遗漏）

**输入**：
```
用户: "验收通过"
LLM: "所有 checklist 项 [x]，RAHS ≥ 90，add-route 闭环。验收通过！"
[对话结束]
```

**正确输出**（四步闭环，含 Step 9，缺一不可）：
```
LLM: "所有 checklist 项 [x]，RAHS ≥ 90，add-route 闭环。验收通过！"

① 写 devlog日志(走mcp) → Edit handoff 写入验收记录（本轮改了什么 + 验收结果 + 遗留项）
② 更新 handoff → Write(".add/plans/{date}/xxx-handoff-v1.md", "handoff 模板内容")
③ 架构文档回看 → Read 相关 specs，确认文档不落后于代码

[LLM 执行完以上三步后才算真正结束]
```

### 场景 2: "看依赖"不先查 index.md

**错误输出**：
```
LLM: "让我搜索所有 plan 文件..." [全局 Grep 所有 *.md，慢且可能不完整]
```

**正确输出**：
```
LLM: "先查索引 → Read('.add/plans/index.md') 查找相关 Plan 条目"
[如有匹配 → 直接定位文件；无匹配 → 再用 Grep 全局搜索]
```

### 场景 2b: 用户说"review plan 的直属文件"——Plan 触发词跳过 index.md（高频 token 浪费）

**错误输出**：
```
用户: "review add-coder-three-tier-reasoning-graph-handoff-v3.md 和这个 plan 的直属相关文件"
LLM 词汇匹配: "plan" 命中 → 第 19 行 → Glob("**/*-plan-v*.md") / find 全盘搜索
           ↓ 浪费大量 token，且 index.md（第 29 行）被短路
```

**正确输出**：
```
LLM 词汇匹配: "plan" 命中 → 第 19 行二段式:
  ① Read('.add/plans/index.md') — 搜索 "three-tier-reasoning-graph"
     → 命中 06/29/add-coder-three-tier-reasoning-graph-plan-v3.md
     → 命中 06/29/add-coder-three-tier-reasoning-graph-handoff-v3.md
     → 命中 06/29/add-coder-three-tier-reasoning-graph-add-route-v3.md
  ② 按匹配路径直接 Read 上述文件（无需 glob）
[仅当 index.md 无匹配时才 fallback 到全局 glob]
```

### 场景 3: add-route 不存在时直接开始 Step 3

**错误输出**：
```
用户: "开始实施 Step 3"
LLM: "好的，开始写业务逻辑..." [跳过 add-route 检查]
```

**正确输出**：
```
LLM: "Step 3 前置守卫：我先检查 add-route 是否存在"
→ 调 check_add_route_status → 存在？继续 Step 3 : 回 Step 0.5（生成 add-route）
```

### 场景 4: Guardian BLOCKED 后仍继续

**错误输出**：
```
Guardian 返回: "⛔ BLOCKED: DPS 评分 72/100（< 85）"
LLM: "DPS 偏低，但不影响代码，继续 Step 1..." [忽略阻断]
```

**正确输出**：
```
LLM: "⛔ BLOCKED → 不得继续。修正 P0 阻断项后重新跑 DPS 门禁。"
[回退到 Step 0，修复问题，重新 DPS，直到 ≥ 85]
```

### 场景 6: "继续" 被误解为跳到代码

**错误输出**：
```
AI: "继续 Step 0.5 生成 add-route？"
用户: "继续"
AI: "好的，开始写代码..." [误解为开发任务触发词]
```

**正确输出**：
```
AI: "继续 Step 0.5 生成 add-route？"
用户: "继续"
AI: [执行 Step 0.5] — 沿用上一条消息中明确提出的操作，不跳到 Step 3
```

### 场景 5: devlog 双触发混淆

**输入 1**：
```
用户: "devlog 记录下今天的改动"
```

**正确输出**：
```
LLM: "收到。写 devlog日志(走mcp) 到 handoff 的验收记录。"
[立即执行]
```

**输入 2**：
```
LLM: "Step 8 验收通过，tsc 无错，checklist 全 [x]"
[用户没说"写 devlog日志(走mcp)"]
```

**正确输出**：
```
LLM: "验收通过 → 自动写 devlog日志(走mcp)（无需用户提醒）→ 更新 handoff → 架构文档回看"
[三个步骤自动执行]
```
# ADD 治理词汇 — 触发词→操作映射

> **消费者**: IDE 侧 LLM + 未来治理 AI
> **设计意图**: 将 ADD 范式专有词汇和操作惯例预埋到 always-on 上下文中，使 LLM 听到触发词时零额外 prompt 执行正确操作。
> **优先级**: P0 = 日常高频，LLM 必须本能响应；P1 = 开发流程频繁涉及，应预埋；P2 = 低频但易误解，可选预埋。
> **维护**: 单一真值源，被 `.add/rules/project_rules.md` 和 `AGENTS.md` 引用。

---

## 类别 A: 文档类型

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `PRD` / `prd` / `需求文档` / `产品需求` | ①新建：读 `prd-standard-template.md` → 写 `docs/*/knowledge/00-需求/`；②增量：读 `prd-incremental-template.md` → 在已有PRD基础上追加/修改 |
| P1 | `增量更新 PRD` / `修改PRD` / `PRD变更` | 读 `prd-incremental-template.md` → 在原 PRD 上追加/修改/删除 |
| P0 | `Plan` / `plan` | **二段式**: ①先读 `.add/plans/index.md` 按 planName 匹配路径；②无匹配才全局 glob。**index.md 优先** |
| P0 | `Spec` / `spec` | 查 `.add/specs/{name}/spec.md` |
| P1 | `Tasks` / `tasks` | 查 `.add/specs/{name}/tasks.md` |
| P1 | `Checklist` / `checklist` | 查 `.add/specs/{name}/checklist.md` |
| P0 | `Review` / `review` | **二段式**: ①先读 `.add/plans/index.md` 定位 plan → 读关联 Review；②无匹配才全局 glob |
| P0 | `Handoff` / `handoff` / `交接` | **二段式**: ①先读 `.add/plans/index.md` 定位 plan → 读 handoff；②无匹配才全局 glob |
| P0 | `add-route` / `执行路线图` | **二段式**: ①先读 `.add/plans/index.md` 定位 plan → 读 add-route；②调 `check_add_route_status`；③无匹配才全局 glob |
| P0 | `devlog` / `开发日志` / `devlog记录` | **两种触发**: ①用户说即写 → 调用 `record_dev_operation` 落库审计 + 更新 handoff 的验收记录（本轮改了什么/验收结果/devlog查询语句/遗留项）；②Step 8 收敛通过后 → **必须自动写**（无需用户提醒） |
| P0 | `增量更新` / `增量` / `incremental` / `修改文档` / `调整文档` | 修改已有 Plan/Spec/Review/handoff/task/checklist 文档时，**必须在原有内容基础上插入或扩展**，禁止删除已有内容后全量重写。具体：保留原文结构 → 插入新段落 → 更新修订时间 → 变更对照表标注增量范围 |
| P1 | `review-implementation` | 查 `.add/reviews/` 下 `*-review-implementation*.md` |
| P1 | `review-runtime` | 查 `.add/reviews/` 下 `*-review-runtime*.md` |
| P1 | `计划` / `规划` | 同 `Plan`——二段式查 index.md → Plan 文件 |
| P1 | `规格书` / `spec文档` | 同 `Spec`——查 specs/{name}/spec.md |
| P1 | `任务清单` / `task列表` | 同 `Tasks`——查 specs/{name}/tasks.md |
| P1 | `验收单` / `checklist文档` | 同 `Checklist`——查 specs/{name}/checklist.md |
| P1 | `评审文档` / `review文档` | 同 `Review`——二段式查 review 文件 |
| P1 | `交接书` / `交接文档` | 同 `Handoff`——二段式查 handoff 文件 |
| P1 | `路线图` / `执行计划` | 同 `add-route`——二段式查 add-route 文件 |

## 类别 B: ADD 阶段

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `开发` / `改功能` / `修.?bug` / `fix.?bug` / `加需求` / `新增` / `重构` / `实现` / `接入` / `改造` / `升级` / `加个` / `添加功能` / `新建` / `改一下` / `修改.*逻辑` / `优化.*代码` / `对接` / `迁移` / `重写` / `implement` / `refactor` / `feature` | 开发任务检测——无活跃 ADD 时强制退出并提示启动 add-paradigm SKILL；有活跃 Plan 时注入当前 Step/轮次/handoff 上下文 |
| P0 | `实施` / `开始实施` / `进入实施` | Plan 就绪后 → 进入 add-paradigm SKILL → 从当前 Step 开始执行代码实现。如无活跃 add-route 先回 Step 0.5 生成 |
| P0 | `继续` | **上下文锁定**：沿用上一条 AI 消息中明确提出的 Step/操作（如 "继续 Step 0.5 生成 add-route？" → "继续" = 执行 Step 0.5）。**禁止**将 "继续" 理解为"跳到代码编写（Step 3）"。**禁止**在 AI 刚提出 Step N 但用户说"继续"时跳过 Step N 做别的事 |
| P1 | `Step 0` / `文档先行` | 进入 add-paradigm Step 0：分析变更 → 更新文档 → 生成 add-route → DPS 门禁 |
| P1 | `Step 1` / `功能分析` | 确定 Phase → 扩展 AgentAuditPhase |
| P1 | `Step 2` / `审计基础设施` | 确认 agentAudit 通道可用 |
| P1 | `Step 3` / `业务逻辑实现` | add-route 前置守卫（`check_add_route_status`）→ 代码 + 审计植入 |
| P1 | `Step 3.5` / `实现审查` | checklist [T] 项 → review-implementation + review-runtime |
| P1 | `Step 4` / `审计验证` | `check_phase_symmetry` + `check_failure_path` + RAHS 门禁 |
| P1 | `Step 5` / `合规检查` | AI 自动检查 ADD 原则合规性 |
| P1 | `Step 6` / `定位问题` | 从审计数据推断根因 |
| P1 | `Step 7` / `修复验证` | 修复 → 重新验证 |
| P0 | `Step 8` / `收敛判断` / `验收` | **多轮策略**: 首次→四步闭环（devlog + handoff + Step 9 Report Closure（如为 runtime-fix）+ 架构回看）；非首次→Review 模式（检查 checklist/audit，增量更新不覆盖已有结论） |
| P1 | `原子闭包` / `三可性` | 原子闭包判定：可独立提交/验证/审计/恢复 |
| P1 | `生成plan` / `写plan` / `创建plan` | 同 Step 0——读 plan-template.md → 生成 Plan → check_dps |
| P1 | `开始写代码` / `进入编码` / `执行step3` | 同 Step 3——add-route 前置守卫 → 代码实现 + 审计植入 |
| P1 | `跑单测` / `跑测试` / `运行测试` | 同 Step 4——tsc --noEmit + check_phase_symmetry + RAHS 门禁 |
| P1 | `打审计` / `记录审计` / `审计落库` | ADD-7：调用 record_dev_operation 逐文件记录 + query_audit_logs 回查 |
| P1 | `记录devlog` / `写开发日志` / `写 devlog日志(走mcp)` | devlog 双触发——更新 handoff 的验收记录（本轮改了什么 + 验收结果 + 遗留项），不写独立文件 |
| P1 | `勾选checklist` / `更新checklist` / `checklist打勾` | 按 checklist.md 逐项验证并勾选 [x]，禁止空勾选 |
| P1 | `更新handoff` / `写handoff` / `handoff更新` | 更新 handoff §验证标准 + 审计 ID + query_audit_logs 回查命令 |
| P1 | `写交接` / `生成交接` / `产出handoff` | 同 `更新handoff`——按模板填满所有章节 |
| P1 | `生成route` / `写add-route` / `创建路线图` | 同 add-route——从 add-route-template 生成，填充 Task 映射表 + ADD-7 策略 + 依赖拓扑 |

## 类别 C: 门禁/闸门

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `DPS` / `DPS闸门` | 调 `check_dps({ planKeyword: "..." })`，DPS ≥ 85 通过 |
| P0 | `RAHS` / `RAHS闸门` | 调 `check_rahs({ planKeyword: "..." })`，RAHS ≥ 90 通过 |
| P0 | `Guardian` / `门禁` / `add-flow-guardian` | 调 `add-flow-guardian` Subagent（入口或出口模式） |
| P1 | `add-route 闭环` / `闭环自检` | 调 `check_add_route_completeness({ planKeyword: "..." })` |
| P1 | `BLOCKED` / `阻断` | Guardian 返回 BLOCKED → 回退修复对应 Step，不得继续 |
| P0 | `Review 回流` / `0.6.5` | Review P0/P1 问题必须写回 Plan + Specs |
| P1 | `门禁检查` / `门禁扫描` / `跑门禁` | 调 add-flow-guardian Subagent 执行入口/出口门禁 |
| P1 | `通过门禁` / `门禁过关` | 门禁 PASSED → 记录审计 → 进入下一步 |
| P1 | `门禁没过` / `门禁失败` / `DPS没过` | 门禁 BLOCKED → 回退修复 → 重新跑门禁 |
| P2 | `RAHS没过` / `RAHS偏低` | RAHS < 90 → 自检范围扩散/审计漏记/类型错误 → 修复后重新 check_rahs |

## 类别 D: MCP 工具（高频）

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `get_project_context` | 调 `get_project_context({ scope: "add-state" })` 获取 ADD 状态快照 |
| P0 | `query_audit_logs` | 按 keyword/targetId/targetType 查询审计日志。runtime 审计日志 ← AuditLog 表；devlog 开发操作记录 ← DevOperation 表（通过 `planKeyword` 定位） |
| P0 | `record_dev_operation` | 记录开发操作到 AuditLog |
| P1 | `check_dps` | DPS 闸门（Step 0 末尾） |
| P1 | `check_rahs` | RAHS 闸门（Step 4/8） |
| P1 | `check_add_route_status` | add-route 存在性校验（Step 3 前） |
| P1 | `check_add_route_completeness` | add-route Step 完成度扫描（Step 3 后） |
| P1 | `check_phase_symmetry` | 阶段标记对称性验证 |
| P2 | `check_failure_path` / `check_add_compliance` / `check_spec_sync` / `find_related_docs` / `get_add_template` / `get_spec_context` / `get_db_schema` / `get_audit_logger_pattern` / `generate_audit_logger` | P2 低频工具：按需查阅 MCP 工具列表 |
| P1 | `查审计` / `查日志` / `查记录` | 同 `query_audit_logs`——按 keyword/targetId 查询开发操作记录 |
| P1 | `记录操作` / `记操作` / `写操作日志` | 同 `record_dev_operation`——记录开发操作到 AuditLog/DevOperation 表 |
| P1 | `落库审计` / `审计入库` / `ADD7审计` | 同 ADD-7——逐文件调用 record_dev_operation + query_audit_logs 回查 |
| P1 | `文档同步` / `spec同步检查` | 同 `check_spec_sync`——文档-代码交叉校验 |
| P1 | `获取项目状态` / `查看ADD状态` | 同 `get_project_context({ scope: "add-state" })`——获取 ADD 工作流状态快照 |

## 类别 E: Skills / Subagents

| 优先级 | 触发词 | LLM 默认操作 |
|:--:|------|-------------|
| P0 | `session-init` / `会话初始化` | 执行 session-init SKILL（新对话第一步，不可跳过） |
| P0 | `add-paradigm` / `ADD范式` | 执行 add-paradigm SKILL（开发任务入口，不可跳过） |
| P0 | `add-flow-guardian` / `Guardian` | 调起门禁 Subagent（入口或出口模式） |
| P2 | `create-skill` / `create-subagent` | 引导创建新 Skill 或 Subagent |
| P1 | `恢复会话` / `恢复上下文` / `重新开始` | 同 `session-init`——新对话第一步，执行 session-init SKILL 恢复上下文 |
| P1 | `启动ADD` / `开始ADD流程` / `用ADD做` | 同 `add-paradigm`——开发任务入口，执行 add-paradigm SKILL 进入工作流 |
| P1 | `走ADD` / `按ADD来` / `ADD开发` | 同 `add-paradigm`——严格按 10 阶段（Step 0-9）执行，不得跳过任何子步骤 |

## 类别 F: 核心概念

| 优先级 | 触发词 | LLM 含义 |
|:--:|------|---------|
| P1 | `裁决层` / `caijue` / `caijue.toml` | 读 `src/caijuehub/caijue.toml`，含所有裁决条目 |
| P1 | `agentAudit` / `审计打点` | ADD-7：在业务代码中调用 `agentAudit(phase, detail, extra)` 植入运行时审计点（与 `record_dev_operation` 不同：前者是代码内审计函数，后者是 MCP 工具写 AuditLog 表） |
| P2 | `agentAuditNodeStart/End` | ADD-2：节点进入/退出阶段标记，用于阶段对称性验证 |
| P1 | `Phase` / `AgentAuditPhase` | `src/lib/agent-audit-logger.ts` 中的阶段联合类型 |
| P2 | `ADD-3` / `最小可观测单元` | 审计粒度：循环内每个迭代独立审计，不可合并 |
| P2 | `ADD-4` / `三通道` | 审计输出：console + file + DB 三者信息等价 |
| P2 | `ADD-5` / `审计数据即业务数据` / `业务日志metadata` | 审计指标回写业务表字段（如 `ChatThread.auditData`），不是独立 AuditLog 表 |
| P0 | `收敛` / `收敛判断` | Step 8：全条件满足 → 条件进入 Step 9 Report Closure（runtime-fix plan）→ devlog→handoff→架构回看 闭环 |
| P1 | `阶段对称` | ADD-2：每个 Phase Start/End 成对，调 `check_phase_symmetry` |
| P1 | `失败路径` | ADD-6：catch 块审计密度 ≥ try 块，调 `check_failure_path` |
| P1 | `稀疏推理` | 通过 `query_audit_logs` 稀疏恢复开发上下文 |
| P1 | `traceId` | 全链路追踪 ID，贯穿单次请求所有审计记录 |
| P1 | `planKeyword` | add-route / check_dps / check_rahs 的定位关键词 |
| P1 | `审计日志` / `audit日志` | 开发操作审计日志，存于 AuditLog/DevOperation 表，通过 query_audit_logs 查询 |
| P1 | `清单勾选` / `checklist打勾` / `逐项验证` | 按 checklist.md 逐项验证并勾选 [x]，禁止空勾选或推测通过 |
| P1 | `交接手册` / `handoff手册` | 多轮/单轮 handoff 文件，每轮含验证标准 + 审计 ID + 恢复命令 |
| P1 | `审计完整性` / `ADD7完整性` | 每个修改文件必须有 record_dev_operation 记录，每轮完成后 query_audit_logs 回查 |
| P1 | `收敛条件` / `验收条件` | Step 8 全条件：tsc + checklist 全部 [x] + RAHS ≥ 90 + add-route 闭环 |
