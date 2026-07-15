# add-coder-add-coder-npm-package-add-route-v1

> **定位**：Plan → ADD Step 执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**：重型（Heavyweight）——每一步产出检查强制执行"验证并更新项目状态"。本项目为 npm 包工程化，代码产物在 `packages/add-coder/`，不修改 add-coder 业务代码。
>
> **绑定**：Plan: `.claude/plans/2026-07/08/add-coder-add-coder-npm-package-plan-v1.md` · Spec: `.claude/specs/add-coder-add-coder-npm-package/spec.md` ✅ · Tasks: `.claude/specs/add-coder-add-coder-npm-package/tasks.md` ✅ · Handoff: `.claude/plans/2026-07/08/add-coder-add-coder-npm-package-handoff-v1.md` ✅

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + Specs + Handoff 三元组齐全，项目文档反映即将实现的变更。

**输入**：
- 上游 Review：`.claude/reviews/add-coder-add-coder-npm-package-review-v1.md` ✅
- 上游 Review v2：`.claude/reviews/add-coder-add-coder-npm-package-review-v2.md` ✅ — 代码实现评审
- Plan 文档：`.claude/plans/2026-07/08/add-coder-add-coder-npm-package-plan-v1.md` ✅

**动作**：
1. 确认 Specs 三元组就绪：`spec.md` + `tasks.md` + `checklist.md` ✅
2. 调用 `find_related_docs` 检索受影响的架构/规范/需求文档 → 已完成，4 篇相关文档已审阅
3. 按检索结果更新项目文档 → 本次变更无需更新项目文档（变更对象为 `packages/add-coder/` 工具链，非大田耕播业务功能）
4. 确认 Handoff 就绪 ✅

**产出**：
- [x] 验证并更新项目状态：Specs 三元组路径确认
- [x] 验证并更新项目状态：项目文档已更新（或无需更新声明已记录）
- [x] 验证并更新项目状态：Handoff 就绪

### §0.8 DPS 闸门（上游文档质量校验）

调用 `check_dps({ planKeyword: "add-coder-npm-package" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 85 | 🟢 | 进入 Step 1 |
| 70–84 | 🟡 | 回退补齐短板（补 Review 缺失维度 / Specs 缺失 Requirement） |
| < 70 | 🔴 | 回退细化 Plan 本身（粒度不足是下游漂移的根因） |

- [ ] DPS 已通过（≥ 85），可进入 Step 1

---

## Step 1：功能分析与审计打点定义

**目的**：本 Plan 为 npm 包工程化，不修改 add-coder 业务代码。无需新增 `AgentAuditPhase` 字面量。审计通过 `record_dev_operation`（ADD-7）落库 DevOperation 表。

**输入**：
- Plan §3 的 Task 列表（6 轮 11 个 Task）
- Plan 元信息 ADD-7 审计策略表（3 条记录）

**动作**：
1. 确认本 Plan 无需新增 AgentAuditPhase（npm 包工程化，无业务逻辑审计点）
2. 确认 ADD-7 审计策略表覆盖所有文件变更（package.json / src/ / templates/）

**产出**：
- [ ] 验证并更新项目状态：审计策略确认完成，ADD-7 策略表已同步到 tasks.md Step 1 区域

| 审计方式 | 适用场景 | 工具 |
|---------|---------|------|
| `record_dev_operation` | 文件变更（CREATE/MODIFY/DELETE） | MCP 工具 |
| 无 AgentAuditPhase | 本 Plan 不修改 add-coder 业务代码 | — |

---

## Step 2：审计基础设施确认

**目的**：确认 npm 包所需的数据库基础设施（DevOperation + AuditLog 表）在第1轮 Task 0 中创建。

**输入**：
- `templates/core/prisma/add.prisma`（第1轮 Task 0 产出）
- `src/cli/prisma-injector.ts`（第1轮 Task 0 产出）

**动作**：
1. 确认 `add.prisma` 包含 DevOperation 和 AuditLog 模型定义
2. 确认 `prisma-injector.ts` 实现检测 → 复制 → 迁移 → generate 全流程
3. 确认 Prisma 迁移幂等（重复执行不报错）

**产出**：
- [ ] 验证并更新项目状态：DevOperation + AuditLog 表创建成功，状态已同步到 checklist.md ADD 规则合规项

---

## Step 3：业务逻辑实现与审计植入

**目的**：按 Plan 的 6 轮 11 个 Task 依赖拓扑，逐 Task 实施代码 + 嵌入 ADD-7 审计。

**输入**：
- Plan §3 架构设计（数据流转、目录结构、适配器矩阵）
- Plan §4 实施 Task + 依赖图
- `tasks.md` 的 Task 清单 ✅
- Handoff 的 ADD-7 审计策略表 ✅

**动作**：

### §3.0 前置守卫（重型强制）

调用 `check_add_route_status` 确认 add-route 文件有效存在，不通过则禁止进入代码实现。

### Task 映射表

| # | 轮次 | Task | 文件 | 审计植入点 | 新增字面量 | 依赖 | 状态 |
|---|:--:|------|------|-----------|-----------|------|------|
| 1 | 1 | Prisma 模型准备 | `templates/core/prisma/add.prisma`、`src/cli/prisma-injector.ts` | `record_dev_operation` (CREATE) | — | 无 | ⬜ |
| 2 | 1 | 清理硬编码 + 参数化 core 模板 | `templates/` 下 ~70 个文件 | `record_dev_operation` (MODIFY) | — | 无（可并行 Task 1） | ⬜ |
| 3 | 2 | 模板目录重组 + 适配器架构搭建 | `templates/core/`、`src/adapters/`、`src/core/` | `record_dev_operation` (CREATE/MODIFY) | — | 第1轮 Task 1 | ⬜ |
| 4 | 3 | Claude 适配器实现 | `templates/adapters/claude/`、`src/adapters/claude/renderer.ts` | `record_dev_operation` (CREATE) | — | 第2轮 Task 0 | ⬜ |
| 5 | 3 | Qoder 适配器实现 | `templates/adapters/qoder/`、`src/adapters/qoder/renderer.ts` | `record_dev_operation` (CREATE/MODIFY) | — | 第3轮 Task 0 | ⬜ |
| 6 | 3 | VS Code 适配器实现 | `templates/adapters/vscode/`、`src/adapters/vscode/renderer.ts` | `record_dev_operation` (CREATE/MODIFY) | — | 第3轮 Task 1 | ⬜ |
| 6b | 3 | 三目录部署（core→.add/.claude/.claude） | `src/core/renderer.ts`、`src/cli/commands/init.ts`、adapter renderers | `record_dev_operation` (MODIFY) | — | 第3轮 Task 2 | ⬜ |
| 7 | 4 | 配置系统（Zod schema） | `src/config/schema.ts`、`src/config/defaults.ts` | `record_dev_operation` (CREATE) | — | 无 | ⬜ |
| 8 | 4 | CLI 重写 | `src/cli/`、`bin/add-coder.js`、`tsup.config.ts` | `record_dev_operation` (CREATE/MODIFY) | — | 第1轮 Task 0 + 第4轮 Task 0 | ⬜ |
| 9 | 5 | 集成测试 + 文档 + devlog | 测试文件、`README.md`、`package.json` | `record_dev_operation` (CREATE/MODIFY) | — | 全部前序 Task | ⬜ |
| 10 | 6 | CaijueHub 核心 | `src/caijuehub/caijue.toml`、`src/caijuehub/caijue.ts`、`src/caijuehub/transcribe.ts`、`src/caijuehub/*-rules.toml` (4) | `record_dev_operation` (CREATE) | — | 第4轮 Task 1 | ⬜ |
| 11 | 6 | 策略文件 + cli 重构 | `src/caijuehub/strategies/*.strategy.ts` (4)、`src/cli/detect.ts`、`src/cli/prisma-injector.ts`、`src/cli/writer.ts` | `record_dev_operation` (CREATE/MODIFY) | — | 第6轮 Task 0 | ⬜ |

### 依赖拓扑

```
第1轮: 基础准备
  Task 0: Prisma 模型准备 ──┐
  Task 1: 清理硬编码 ────────┘ 可并行，互不依赖
           │
           ▼
第2轮: 架构搭建
  Task 0: 适配器架构搭建
           │
           ▼
第3轮: 适配器实现
  Task 0: Claude → Task 1: Qoder → Task 2: VS Code（串行）
           │
           ▼  增量：core 内容三目录部署
  Task 3.3: renderCore() 改造 → adapter renderers 不再重复部署 core
           │
           ▼
第4轮: 配置 + CLI
  Task 0: 配置系统 → Task 1: CLI 重写
           │
           ▼
第5轮: 测试 + 发布
  Task 0: 集成测试 + 文档 + devlog
           │
           ▼
第6轮: 裁决层
  Task 0: CaijueHub 核心 → Task 1: 重构模块读 caijue
```

### 每个 Task 完成后（重型强制执行）

1. 验证该 Task 的 checklist `[T]` 项
2. 调用 `record_dev_operation` 记录 ADD-7 审计
3. **验证并更新项目状态**：将该 Task 在 `tasks.md` 中逐子项勾选为 `[x]`

**产出**：
- [ ] 验证并更新项目状态：全部 Task 的 `[T]` 项通过，`tasks.md` 已完成项已逐项勾选
- [ ] 验证并更新项目状态：每个文件有 `record_dev_operation` 记录，`checklist.md` ADD-7 审计项已确认
- [ ] 验证并更新项目状态：调用 `check_spec_sync` 确认 spec 文档勾选状态与实际代码一致

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
5. **重型强制**：调用 `check_spec_sync` 确认 `tasks.md` / `checklist.md` 全部已完成项的勾选状态正确

**产出**：
- [ ] 验证并更新项目状态：`checklist.md` 全部 `[T]` 项已通过并勾选
- [ ] 验证并更新项目状态：`review-implementation.md` 已生成
- [ ] 验证并更新项目状态：`review-runtime.md` 已生成（含 `[R]` 待验证清单）
- [ ] 验证并更新项目状态：`check_spec_sync` 通过——spec 文档勾选状态与代码一致

---

## Step 4：审计数据验证

**目的**：编译 + 审计完整性检查。

**输入**：
- 全部修改文件（`packages/add-coder/`）
- MCP 工具：`check_phase_symmetry`、`check_failure_path`、`check_spec_sync`

**动作**：
1. `npx tsc --noEmit` —— 零类型错误（`packages/add-coder/` 目录）
2. 调用 `check_phase_symmetry` → 不适用（本 Plan 无 AgentAuditPhase 打点）
3. 调用 `check_failure_path` → 不适用
4. 验证 ADD-7 审计记录完整性：`query_audit_logs` 按 planKeyword 检索
5. **重型强制**：调用 `check_spec_sync` 确认 spec 文档与实际代码一致

**产出**：
- [ ] `tsc --noEmit` 通过
- [ ] 验证并更新项目状态：`check_spec_sync` 通过，checklist.md 编译检查项已同步勾选

### §4.6 RAHS 闸门（下游执行健康度校验）

调用 `check_rahs({ planKeyword: "add-coder-npm-package" })`。

| RAHS | 判定 | 动作 |
|------|:--:|------|
| ≥ 90 | 🟢 | 进入 Step 5 |
| 70–89 | 🟡 | 自检：范围扩散？审计漏记？类型错误？ |
| < 70 | 🔴 | 注意力漂移严重，返工回退 Step 3 |

- [ ] RAHS 已通过（≥ 90），可进入 Step 5

---

## Step 5：AI 自动合规检查

**目的**：扫描全部修改文件的 ADD-1~ADD-7 合规性。

**输入**：
- 全部修改文件的代码（`packages/add-coder/`）
- MCP 工具：`check_add_compliance`

**动作**：
1. 对每个修改文件调用 `check_add_compliance(code, projectPattern="event-based")`
2. 汇总合规报告，标注违规项和风险等级

**产出**：
- [ ] 验证并更新项目状态：合规报告已生成，违规项处理决策已记录
- [ ] 验证并更新项目状态：`checklist.md` ADD 规则合规检查项已同步勾选

---

## Step 6：从审计数据定位问题

> **仅当 Step 4/5 发现异常时进入。**

**动作**：
1. 查询审计日志（`query_audit_logs` 或直接 grep）
2. 对照 Plan 验收到位情况

**产出**：
- [ ] 验证并更新项目状态：问题清单已记录（含文件路径和根因分析），已同步到 `tasks.md`

---

## Step 7：修复并验证

> **仅当 Step 6 发现问题时进入。**

**动作**：
1. 按问题优先级逐个修复
2. 修复后回到 Step 4 重新验证

**产出**：
- [ ] 验证并更新项目状态：所有问题已修复，`checklist.md` 回归验证项已重新勾选
- [ ] 验证并更新项目状态：Step 4/5 复验通过

---

## Step 8：收敛判断 + Handoff 更新 + Step 0 第二部分

**目的**：功能收敛判定，更新 Handoff，回到架构文档做最终校准。

**输入**：
- Handoff 文档
- `checklist.md` 最终状态

**动作**：
1. **收敛判断**：全部 `[T]` 项通过 + `[R]` 清单已生成 + RAHS ≥ 90 + `grep -r "farm.agent\|大田" dist/` 返回空 + `tsc --noEmit` 通过 + 集成测试全部通过 + Prisma 迁移幂等 → 功能收敛
2. **RAHS 最终核定**：调用 `check_rahs({ planKeyword: "add-coder-npm-package" })`，RAHS ≥ 90 方可收敛
3. **验证并更新项目状态**：`tasks.md` 全部 Task 已完成 + 全部子项已勾选，`checklist.md` 全部可验证项已勾选
4. **验证并更新项目状态**：调用 `check_spec_sync` 做最终交叉校验
5. **Handoff 更新**：更新 Handoff 的 §7（实际产出与偏离）、§8（验证结果）、§9（后置确认）
6. **Step 0 第二部分**：回架构文档做最终校准——确认 `packages/add-coder/templates/docs/` 下 grounding 文档已反映变更
7. **ADD-7 回查**：`query_audit_logs` 确认全部 `record_dev_operation` 记录已落库
8. **devlog**：调用 `record_dev_operation` 落库开发日志到 DevOperation 表（planKeyword: "add-coder-npm-package"）

**产出**：
- [ ] 验证并更新项目状态：收敛判定结果
- [ ] 验证并更新项目状态：`tasks.md` + `checklist.md` 全部完成项已勾选
- [ ] 验证并更新项目状态：`check_spec_sync` 四者一致确认
- [ ] 验证并更新项目状态：Handoff 已更新
- [ ] 验证并更新项目状态：架构文档已校准
- [ ] 验证并更新项目状态：ADD-7 审计记录已落库确认
- [ ] 验证并更新项目状态：devlog 已落库

---

## Step 9：Report Closure（运行时发现关闭 — 条件性操作）

> **本 Plan 非 runtime-fix plan，跳过 Step 9。**

---

## 附录：文件清单

| 文件 | 操作 | 轮次/Task | targetType | ADD-7 状态 |
|------|------|-----------|-----------|------------|
| `packages/add-coder/package.json` | MODIFY | 5/0 | PACKAGE | ⬜ |
| `packages/add-coder/tsconfig.json` | CREATE | 4/1 | BUILD_CONFIG | ⬜ |
| `packages/add-coder/tsup.config.ts` | CREATE | 4/1 | BUILD_CONFIG | ⬜ |
| `packages/add-coder/bin/add-coder.js` | MODIFY | 4/1 | CLI_ENTRY | ⬜ |
| `packages/add-coder/src/cli/index.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/cli/commands/init.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/cli/commands/sync.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/cli/commands/status.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/cli/detect.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/cli/config-loader.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/cli/prisma-injector.ts` | CREATE | 1/0 | CLI | ⬜ |
| `packages/add-coder/src/cli/writer.ts` | CREATE | 4/1 | CLI | ⬜ |
| `packages/add-coder/src/config/schema.ts` | CREATE | 4/0 | CONFIG | ⬜ |
| `packages/add-coder/src/config/defaults.ts` | CREATE | 4/0 | CONFIG | ⬜ |
| `packages/add-coder/src/core/renderer.ts` | CREATE | 1/1 | RENDERER | ⬜ |
| `packages/add-coder/src/adapters/claude/renderer.ts` | CREATE | 3/0 | ADAPTER | ⬜ |
| `packages/add-coder/src/adapters/qoder/renderer.ts` | CREATE | 3/1 | ADAPTER | ⬜ |
| `packages/add-coder/src/adapters/vscode/renderer.ts` | CREATE | 3/2 | ADAPTER | ⬜ |
| `packages/add-coder/templates/core/prisma/add.prisma` | CREATE | 1/0 | PRISMA_SCHEMA | ⬜ |
| `packages/add-coder/templates/core/` (全部模板文件) | MOVE | 2/0 | TEMPLATE | ⬜ |
| `packages/add-coder/templates/adapters/claude/` | CREATE | 3/0 | TEMPLATE | ⬜ |
| `packages/add-coder/templates/adapters/qoder/` | MOVE | 3/1 | TEMPLATE | ⬜ |
| `packages/add-coder/templates/adapters/vscode/` | MOVE | 3/2 | TEMPLATE | ⬜ |
| `packages/add-coder/templates/docs/` (grounding 文档) | CREATE | 1/1 | DOC | ⬜ |
| `packages/add-coder/src/caijuehub/caijue.toml` | CREATE | 6/0 | CAIJUE_CONFIG | ⬜ |
| `packages/add-coder/src/caijuehub/caijue.ts` | CREATE | 6/0 | CAIJUE_CONFIG | ⬜ |
| `packages/add-coder/src/caijuehub/transcribe.ts` | CREATE | 6/0 | CAIJUE_CONFIG | ⬜ |
| `packages/add-coder/src/caijuehub/*-rules.toml` (4) | CREATE | 6/0 | CAIJUE_CONFIG | ⬜ |
| `packages/add-coder/src/caijuehub/strategies/*.strategy.ts` (4) | CREATE | 6/1 | STRATEGY | ⬜ |
| `packages/add-coder/README.md` | MODIFY | 5/0 | DOC | ⬜ |