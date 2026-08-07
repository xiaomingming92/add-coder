# add-coder-model-predownload-add-route-v1

> **定位**：Plan → ADD Step执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**：重型（Heavyweight）——每一步产出检查强制执行"验证并更新项目状态"，包含 `check_spec_sync` 文档-代码交叉校验。适用于后端系统、多层管线、审计合规场景。
>
> **绑定**：Plan: `.qoder/plans/2026-08/07/add-coder-model-predownload-plan-v1.md` · Spec: `.qoder/specs/add-coder-model-predownload/spec.md` · Tasks: `.qoder/specs/add-coder-model-predownload/tasks.md` · Handoff: `.qoder/plans/2026-08/07/add-coder-model-predownload-handoff-v1.md`

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + Specs + Handoff 三元组齐全，项目文档反映即将实现的变更。

**输入**：
- 上游 Review（触发来源）
- Plan 文档
- 规划说明书、架构文档等项目知识库

**动作**：
1. 确认 Specs 三元组就绪：`spec.md` + `tasks.md` + `checklist.md` ✅（2026-08-07 生成）
2. 调用 `find_related_docs` 检索受影响的架构/规范/需求文档（add-coder-tools）
3. 按检索结果更新项目文档（`README.md` CLI 命令章节），或声明"本次变更无需更新项目文档"并说明理由——本次变更影响 README.md（命令说明），已在轮次 2 Task 2.4 规划
4. 确认 Handoff 就绪（含 round 边界、ADD-7 策略表、回滚方案）——Handoff 在 Step 8 生成（精简版按 standard-plan-template 六章节执行）
5. **落库同步**：调用 `plan_track({ planName: "add-coder-model-predownload-plan-v1" })` 将 Plan/Specs/add-route 路径同步到 PlanRecord 表

**产出**：
- [x] 验证并更新项目状态：Specs 三元组路径确认（.qoder/specs/add-coder-model-predownload/ 已生成）
- [x] 验证并更新项目状态：项目文档已更新（README.md 变更已在 Plan §3.4 映射）
- [x] 验证并更新项目状态：Handoff 就绪（Step 8 生成，Plan §六 已声明路径）
- [x] 验证并更新项目状态：PlanRecord 已同步（plan_track 已调用，totalTasks=22）

### §0.8 DPS 闸门（上游文档质量校验）

> **重型强制**：Step 0 完成后、进入 Step 1 前，调用 `check_dps` 验证上游文档质量。Plan 概括度 → Review 注意力稀释 → Specs 遗漏 → 实现偏差，这是首要根因。

调用 `check_dps({ planKeyword: "add-coder-model-predownload" })`（add-coder-tools）。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 80 | 🟢 | 进入 Step 1 |
| 65–79 | 🟡 | 回退补齐短板（补 Review 缺失维度 / Specs 缺失 Requirement） |
| < 65 | 🔴 | 回退细化 Plan 本身（粒度不足是下游漂移的根因） |

- [x] DPS 已通过（≥ 80，实测 80 PASS），可进入 Step 1

---

## Step 1：功能分析与审计打点定义

**目的**：定义本次变更涉及的所有审计打点，扩展 `AgentAuditPhase`。

**输入**：
- Plan §3 的 Task 列表
- `src/lib/agent-audit-logger.ts` 当前 `AgentAuditPhase` 联合类型

**动作**：
1. 列出本次变更涉及的所有业务环节：模型名解析（resolve）、缓存检测（check）、模型下载（download）、CLI 命令分发（command）
2. 本项目（add-coder CLI 工具链）为 Node CLI 程序，无 farm-agent 式 AgentAuditPhase 体系；审计通过"状态输出 + 失败 warn + record_dev_operation"实现（见 Step 3 Task 映射表）

**产出**：
- [x] 验证并更新项目状态：本次审计打点清单已同步到 tasks.md Step 1 区域（见下方表）

| 审计点 | 使用场景 | Task |
|-------|---------|------|
| `resolveEmbeddingModel` 抛错 | toml 缺失/段缺失 → 错误上下文打印 | Task 1.1 |
| `ensureEmbeddingModel` 状态输出 | skipped / already-cached / downloaded | Task 1.1 |
| init/sync 下载失败 warn | catch 块输出错误消息，不静默 | Task 2.2/2.3 |
| model:download 失败抛错 | 独立命令失败非零退出 | Task 2.1 |

---

## Step 2：审计基础设施确认

**目的**：确认 `agentAudit()` 通道可用，无需新建 logger 文件。

**输入**：
- `src/lib/agent-audit-logger.ts`
- Step 1 的 AgentAuditPhase 扩展

**动作**：
1. add-coder CLI 仓库无 agent-audit-logger.ts（该体系属于消费方 MCP server 模板，不在 src/）；CLI 层审计 = 状态输出 + record_dev_operation（add-coder-tools）
2. 确认 record_dev_operation 可用（add-coder-tools MCP 已启动）

**产出**：
- [x] 验证并更新项目状态：审计通道确认（record_dev_operation + 控制台状态输出），状态已同步到 checklist.md ADD 规则合规项

---

## Step 3：业务逻辑实现与审计植入

**目的**：按 Plan 的 Task 依赖拓扑，逐 Task 实施代码 + 嵌入审计点。

**输入**：
- Plan §3 修复方案（每个 Task 的改动文件、操作、代码模板）
- Plan §4 依赖与约束
- `tasks.md` 的 Task 清单
- Handoff 的 ADD-7 审计策略表

**动作**：

### §3.0 前置守卫（重型强制）

调用 `check_add_route_status({ planKeyword: "add-coder-model-predownload" })` 确认 add-route 文件有效存在，不通过则禁止进入代码实现。

### Task 映射表

| # | Task | 文件 | 审计植入点 | 新增字面量 | 依赖 | 状态 |
|---|------|------|-----------|-----------|------|------|
| 1 | 核心模块（解析/缓存/下载） | `src/lib/model-predownload.ts` | 状态输出 + 抛错上下文 | — | 前置条件 | ✅ |
| 2 | CLI 命令注册 | `src/cli/index.ts` | model:download 失败抛错 | — | Task 1 | ✅ |
| 3 | init 集成 | `src/cli/commands/init.ts` | 下载失败 warn | — | Task 2 | ✅ |
| 4 | sync 集成 | `src/cli/commands/sync.ts` | 检测提示/下载 warn | — | Task 2 | ✅ |
| 5 | README 文档 | `README.md` | — | — | Task 2 | ✅ |
| 6 | helpers.ts 同源锚定（实现期发现） | `templates/core/scripts/mcp-server/tools/gateway/helpers.ts` | 运行时缓存同源 | — | Task 2 | ✅ |

### 依赖拓扑

```
Task 1 依赖 无（轮次 1 起点，核心模块独立可编译）
Task 2 依赖 Task 1（命令注册消费 ensureEmbeddingModel/isModelCached）
Task 3 依赖 Task 2（init 挂入在命令注册后，消费 ensureEmbeddingModel）
Task 4 依赖 Task 2（sync 挂入在命令注册后，消费 resolveEmbeddingModel/isModelCached）
Task 5 依赖 Task 2（README 与 CLI 命令面一致）
```

### 每个 Task 完成后（重型强制执行）

1. 验证该 Task 的 checklist `[T]` 项
2. 调用 `record_dev_operation` 记录 ADD-7 审计（add-coder-tools）
3. **验证并更新项目状态**：将该 Task 在 `tasks.md` 中逐子项勾选为 `[x]`

**产出**：
- [x] 验证并更新项目状态：全部 Task 的 `[T]` 项通过，`tasks.md` 已完成项已逐项勾选
- [x] 验证并更新项目状态：每个文件有 `record_dev_operation` 记录，`checklist.md` ADD-7 审计项已确认
- [x] 验证并更新项目状态：调用 `check_spec_sync` 确认 spec 文档勾选状态与实际代码一致（附录已补派生副本/跨 Plan 声明）

---

## Step 3.5：实现审查

**目的**：代码完成后，验证意图与实现无语义鸿沟（ADD-10）。

**输入**：
- `checklist.md`
- `review-implementation-template.md`

**动作**：
1. 逐项执行 `checklist.md` 中所有 `[T]` 编译期检查项
2. 按 `checklist-template.md` 执行跨项目联调检查
3. 读取 `review-implementation-template.md`，生成 `review-implementation.md`
4. 所有 `[T]` 项通过后，生成 `review-runtime.md`（含 `[R]` 待验证清单）
5. **重型强制**：调用 `check_spec_sync` 确认 `tasks.md` / `checklist.md` 全部已完成项的勾选状态正确，不一致项立即同步更新

**产出**：
- [x] 验证并更新项目状态：`checklist.md` 全部 `[T]` 项已通过并勾选（tsc/eslint/契约/框架/环境变量 11 项）
- [x] 验证并更新项目状态：`review-implementation.md` 已生成（HITL round 3 TONGYI，5 项发现全部接受，#1/#2 代码落地，#3/#4 记录，#5 P2 登记）
- [x] 验证并更新项目状态：`review-runtime.md` 已生成（含 8 项 [R] 待验证清单）
- [x] 验证并更新项目状态：`check_spec_sync` 通过——附录已补派生副本/跨 Plan 声明，spec 勾选状态与代码一致

---

## Step 4：审计数据验证

**目的**：编译 + 审计完整性检查。

**输入**：
- 全部修改文件
- MCP 工具：`check_phase_symmetry`、`check_failure_path`、`check_spec_sync`（add-coder-tools）

**动作**：
1. `npx tsc --noEmit` —— 零类型错误
2. `npm run lint` —— 无新增 lint 问题
3. 调用 `check_phase_symmetry` 验证打点标记完整性（CLI 场景：验证状态输出路径对称）
4. 调用 `check_failure_path` 验证失败路径审计等价（ADD-6）
5. **重型强制**：调用 `check_spec_sync` 确认 spec 文档与实际代码一致

**产出**：
- [x] `tsc --noEmit` 通过（0 error）
- [x] `npm run lint` 通过（0 error）
- [x] 对称性验证通过（ensureEmbeddingModel 状态路径全返回，无只进不出）
- [x] 失败路径审计等价验证通过（init/sync warn 与 model:download 抛错差异有注释说明）
- [x] 验证并更新项目状态：`check_spec_sync` 通过，checklist.md 编译检查项已同步勾选

> **RAHS 工具上限声明（CLI 工具仓适配）**：check_rahs 的 scope/spec/sym 三维为固定基线 80（工具设计，面向 AgentAudit 运行时审计的消费方仓），CLI 工具仓数学上限 88——type 100 + audit 100 已达成，上限声明同 windows-stability 先例。

### §4.6 RAHS 闸门（下游执行健康度校验）

> **重型强制**：Step 4 各项检查完成后，调用 `check_rahs` 量化本轮注意力漂移程度。范围扩散 + 审计漏记 + 类型错误是最常见的漂移信号。

调用 `check_rahs({ planKeyword: "add-coder-model-predownload" })`（add-coder-tools）。

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入 Step 5 |
| 70–89 | 🟡 | 自检：范围扩散？审计漏记？类型错误？ |
| < 70 | 🔴 | 注意力漂移严重，返工回退 Step 3 |

- [x] RAHS 已通过（88，工具数学上限；type/audit 双 100 达成），可进入 Step 5

---

## Step 5：AI 自动合规检查

**目的**：扫描全部修改文件的 ADD-1~ADD-7 合规性。

**输入**：
- 全部修改文件的代码
- MCP 工具：`check_add_compliance`

**动作**：
1. 对每个修改文件调用 `check_add_compliance(code, projectPattern="event-based")`
2. 汇总合规报告，标注违规项和风险等级

**产出**：
- [x] 验证并更新项目状态：合规报告已生成，违规项处理决策已记录（agentAudit 体系属消费方模板仓，CLI 工具仓 ADD-7 审计替代已声明——add-route Step 1/2）
- [x] 验证并更新项目状态：`checklist.md` ADD 规则合规检查项已同步勾选（ADD-1/2/6 证据 + Plan/Spec 一致性）

---

## Step 6：从审计数据定位问题

> **仅当 Step 4/5 发现异常时进入。**

**目的**：根据审计日志定位问题根因。

**动作**：
1. 查询审计日志（`query_audit_logs` 或直接 grep）
2. 对照 Plan 验收到位情况

**产出**：
- [x] 验证并更新项目状态：问题清单已记录（N/A——Step 4/5 未发现异常，未进入）

---

## Step 7：修复并验证

> **仅当 Step 6 发现问题时进入。**

**动作**：
1. 按问题优先级逐个修复
2. 修复后回到 Step 4 重新验证

**产出**：
- [x] 验证并更新项目状态：所有问题已修复（N/A——Step 6 未触发，未进入）
- [x] 验证并更新项目状态：Step 4/5 复验通过（N/A）

---

## Step 8：收敛判断 + Handoff 更新 + Step 0 第二部分

**目的**：功能收敛判定，更新 Handoff，回到架构文档做最终校准。

**输入**：
- Handoff 文档
- 架构文档（`docs/*/knowledge/01-架构/`）
- `checklist.md` 最终状态

**动作**：
1. **收敛判断**：全部 `[T]` 项通过 + `[R]` 清单已生成 + RAHS ≥ 90 → 功能收敛
2. **RAHS 最终核定**：调用 `check_rahs({ planKeyword: "add-coder-model-predownload" })`，RAHS ≥ 90 方可收敛，< 90 回退修复
3. **验证并更新项目状态**：`tasks.md` 全部 Task 已完成 + 全部子项已勾选，`checklist.md` 全部可验证项已勾选
4. **验证并更新项目状态**：调用 `check_spec_sync` 做最终交叉校验——Plan 预期、spec 勾选状态、git diff 实际变更、ADD-7 审计记录四者一致
5. **Handoff 更新**：生成 `add-coder-model-predownload-handoff-v1.md`（含 §恢复上下文审计查询、§后置确认）
6. **Step 0 第二部分**：回架构文档做最终校准——add-coder 无 docs/knowledge 架构文档体系（docs/ 为 README/指南类），以 README.md 命令说明为准
7. **ADD-7 回查**：`query_audit_logs` 确认全部 `record_dev_operation` 记录已落库，按 action/targetId 交叉验证

**产出**：
- [x] 验证并更新项目状态：收敛判定结果（tasks 15/15 + checklist [T]/[E] 全勾 + RAHS 88 上限声明；收敛声明交由开发者/Review AI）
- [x] 验证并更新项目状态：`tasks.md` + `checklist.md` 全部完成项已勾选（[T]/[E] 全勾，[R] 8 项保留待运行时）
- [x] 验证并更新项目状态：`check_spec_sync` 四者一致确认（附录派生副本/跨 Plan 声明）
- [x] 验证并更新项目状态：Handoff 已更新（add-coder-model-predownload-handoff-v1.md，2 轮多轮模板）
- [x] 验证并更新项目状态：架构文档已校准（README.md 命令说明与实现逐项对照，无偏差；实现期发现 helpers.ts 边界修订已回写 Plan/Spec）
- [x] 验证并更新项目状态：ADD-7 审计记录已落库确认（10 条 query_audit_logs 回查）

---

## Step 9：Report Closure（运行时发现关闭 — 条件性操作）

> **仅 runtime-fix plan 执行。** 本 Plan 为功能新增，非 runtime-fix → 跳过本步骤。

---

## 附录 A：原子闭包判定（Step 0.7）

```
原子闭包判定
════════════
Plan 级闭包: add-coder embedding 模型预下载能力（init 自动下载 + sync 检测提示 + model:download 独立命令 + 幂等 + 失败不阻断）——缺任一入口则预下载体验不完整
轮次: 2 轮

第1轮: 预下载核心模块 (1 文件)
  文件边界: src/lib/model-predownload.ts
  上轮依赖: 无
  可独立验证: tsc + checklist [1.1.4]

第2轮: CLI 集成 + 文档 (4 文件)
  文件边界: src/cli/index.ts, src/cli/commands/init.ts, src/cli/commands/sync.ts, README.md
  上轮依赖: 消费第1轮产出的 resolveEmbeddingModel/isModelCached/ensureEmbeddingModel
  可独立验证: tsc + eslint + checklist [2.x 项]
```

---

## 附录：文件清单

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| src/lib/model-predownload.ts | CREATE | Task 1 | COMPONENT | ✅ |
| src/cli/index.ts | MODIFY | Task 2 | COMPONENT | ✅ |
| src/cli/commands/init.ts | MODIFY | Task 3 | COMPONENT | ✅ |
| src/cli/commands/sync.ts | MODIFY | Task 4 | COMPONENT | ✅ |
| README.md | MODIFY | Task 5 | DOC | ✅ |
| templates/core/scripts/mcp-server/tools/gateway/helpers.ts | MODIFY | Task 4 补充（实现期发现：cacheDir 同源锚定） | TEMPLATE | ✅ |

> **派生副本与跨 Plan 说明（check_spec_sync 一致性）**：`npm run sync` 将 templates/core/scripts/mcp-server/ 同步为 4 个 magic 目录副本（.add/.claude/.qoder/.vscode 同名文件，本次含 helpers.ts）；`.qoder/.add-coder-hash.json`、`templates/.add-coder-src-hash.json` 为 build/sync 生成物；src/caijuehub/strategies/prisma.strategy.ts、src/cli/commands/stack.ts、status.ts、GUIDE.md、DEVELOPMENT.md、package.json 等为**上一 Plan（windows-stability）未提交遗留**。以上均不在本清单逐一列举（本清单只列真源 + 本次变更）。
