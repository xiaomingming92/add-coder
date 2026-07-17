# add-coder-hook-full-alignment-add-route-v1

> **定位**：Plan → ADD Step执行映射。不重复 Plan 的架构设计和 Specs 的任务细节——只定义每个 ADD Step 在本 Plan 中的具体动作、输入、产出。
>
> **模式**：重型（Heavyweight）——每一步产出检查强制执行"验证并更新项目状态"。
>
> **特殊说明**：本 Plan 为纯模板资产变更（shell 脚本 + JSON 配置文件），无 TypeScript 源码、无 AgentAuditPhase 扩展、无 tsc/编译。Step 1（审计打点定义）/ Step 2（审计基础设施确认）/ Step 4（审计数据验证）/ Step 5（AI 合规检查）自然跳过——模板 shell 脚本通过 `bash -n` 语法检查代替 tsc，通过四端实测代替审计验证。
>
> **绑定**：Plan: `add-coder-hook-full-alignment-plan-v1.md` · Spec: `../specs/add-coder-hook-full-alignment/` · Tasks: `../specs/add-coder-hook-full-alignment/tasks.md` · Handoff: `add-coder-hook-full-alignment-handoff-v1.md`（Spec/Tasks/Handoff 待生成）

---

## Step 0：文档先行（Documentation First）

**目的**：代码动工前，确认 Plan + 关联文档齐全。

**输入**：
- Plan: `add-coder-hook-full-alignment-plan-v1.md`
- Report（触发源）: `issue-6-tool-call-throttling-report.md`
- SKILL.md: `templates/core/skills/add-paradigm/SKILL.md`（L105 需更新）

**动作**：
1. 确认 Specs 三元组待生成（`spec.md` + `tasks.md` + `checklist.md`）
2. `find_related_docs` 已调用——无命中（本变更为 add-coder 模板资产，非 farm-agent 生产代码，无需更新 `docs/*/knowledge/`）
3. Plan 体已就绪（§三 17 治理卡位、§四 5 轮次 22 Task、§五 11 条验收标准）

**产出**：
- [ ] 验证并更新项目状态：Specs 三元组路径确认
- [ ] 验证并更新项目状态：项目文档无需更新声明已记录（add-coder 模板资产变更，非 farm-agent 生产代码）
- [ ] 验证并更新项目状态：SKILL.md L105 已更新（"若 hook 已预读模板，跳过重复读取"）

### §0.8 DPS 闸门

> **重型强制**：Step 0 完成后调用 `check_dps`。

调用 `check_dps({ planKeyword: "add-coder-hook-full-alignment" })`。

| DPS | 判定 | 动作 |
|-----|:--:|------|
| ≥ 85 | 🟢 | 进入 Step 3 |
| 70–84 | 🟡 | 回退补齐（补 Specs / Review 维度） |
| < 70 | 🔴 | 回退细化 Plan |

- [ ] DPS 已通过（≥ 85），可进入 Step 3

---

## Step 1：功能分析与审计打点定义

> **跳过**：本 Plan 为纯模板资产变更，无 TypeScript 源码，无 AgentAuditPhase 扩展。

- [x] 验证并更新项目状态：不适用（模板资产变更，无 AgentAuditPhase）

---

## Step 2：审计基础设施确认

> **跳过**：本 Plan 无 agentAudit() 调用。

- [x] 验证并更新项目状态：不适用

---

## Step 3：模板资产实现

**目的**：按 Plan §四 5 轮次 22 Task，逐轮创建/修改/扩展四端 adapter 的 hook 脚本和 JSON 配置文件。

**输入**：
- Plan §三 17 治理卡位映射表
- Plan §四 轮次依赖拓扑
- 现有 `templates/adapters/claude/hooks/*`（12 脚本基线）
- 现有 `templates/adapters/qoder/hooks/*`（12 脚本基线）

**动作**：

### §3.0 前置守卫（重型强制）

调用 `check_add_route_status` 确认 add-route 文件有效存在。

### Task 映射表

#### 轮次 1: shared 共享脚本库 + VS Code 基础 hooks

| # | Task | 文件 | 操作 | 依赖 | 状态 |
|---|------|------|------|------|------|
| 1.1 | common.sh 工具函数抽象 | `templates/core/hooks/lib/common.sh` | ★ 新建 | 无（从 `qoder/hooks/lib/` 提取） | ⬜ |
| 1.2 | preload-templates.sh | `templates/core/hooks/lib/preload-templates.sh` | ★ 新建 | 1.1 | ⬜ |
| 1.3 | session-end.sh + subagent-stop.sh | `templates/core/hooks/lib/session-end.sh`, `subagent-stop.sh` | ★ 新建 | 1.1 | ⬜ |
| 1.4 | VS Code 基础 hooks JSON | `templates/adapters/vscode/.github/hooks/session-start.json`, `user-prompt-submit.json` | ★ 新建 | 1.2 | ⬜ |
| 1.5 | VS Code 端基础实测 | — | 验证 | 1.4 | ⬜ |

#### 轮次 2: Claude Code 端

| # | Task | 文件 | 操作 | 依赖 | 状态 |
|---|------|------|------|------|------|
| 2.1 | 6 核心脚本扩展 | `session-start.sh`, `prompt-submit.sh`, `pre-tool-use.sh`, `post-tool-use.sh`, `stop-check.sh`, `pre-compact.sh` | MODIFY | 1.1, 1.2 | ⬜ |
| 2.2 | 4 新脚本 | `session-end.sh`, `subagent-stop.sh`, `stop-failure.sh`, `permission-denied.sh` | ★ 新建 | 1.3 | ⬜ |
| 2.3 | Claude Code 端实测 | — | 验证 | 2.1, 2.2 | ⬜ |

#### 轮次 3: Qoder CN 端

| # | Task | 文件 | 操作 | 依赖 | 状态 |
|---|------|------|------|------|------|
| 3.1 | 8 脚本注入通道适配 stderr | `session-start.sh`, `prompt-submit.sh`（★ 增量插入，保留 Layer 1/2/3）, `pre-tool-use.sh`, `post-tool-use.sh`, `stop-check.sh`, `session-end.sh`, `subagent-stop.sh`, `notification.sh` | MODIFY | 2.1（以 Claude Code 版本为模板） | ⬜ |
| 3.2 | Qoder CN 端实测 | — | 验证 | 3.1 | ⬜ |

#### 轮次 4: VS Code 全量 + Trae 端

| # | Task | 文件 | 操作 | 依赖 | 状态 |
|---|------|------|------|------|------|
| 4.1 | VS Code 剩余 6 JSON | `pre-tool-use.json`, `post-tool-use.json`, `stop-check.json`, `pre-compact.json`, `subagent-stop.json`, `error-occurred.json` | ★ 新建 | 1.4（基础 hooks 已在轮次 1 交付） | ⬜ |
| 4.2 | Trae hooks.json + settings.json | `templates/adapters/trae/hooks.json`, `settings.json` | ★ 新建 | 1.1, 1.2（复用 Claude 脚本逻辑） | ⬜ |
| 4.3 | VS Code + Trae 两端实测 | — | 验证 | 4.1, 4.2 | ⬜ |

#### 轮次 5: 收敛验证

| # | Task | 文件 | 操作 | 依赖 | 状态 |
|---|------|------|------|------|------|
| 5.1 | 四端全量分发验证 | `npx add-coder init` | 验证 | 全部轮次 | ⬜ |
| 5.2 | 四端五基座全触发回归 | — | 验证 | 5.1 | ⬜ |
| 5.3 | Issue #6 回归 | — | 验证 | 5.2 | ⬜ |

### 依赖拓扑

```
Task 1.1 (common.sh)
  ├─→ Task 1.2 (preload-templates.sh)
  ├─→ Task 1.3 (session-end.sh + subagent-stop.sh)
  │     ├─→ Task 2.2 (Claude 新脚本)
  │     ├─→ Task 3.1 (Qoder 适配)
  │     └─→ Task 4.1/4.2 (VS Code/Trae)
  │
  ├─→ Task 1.2 ──→ Task 1.4 (VS Code 基础 hooks) ──→ Task 1.5 (VS Code 基础实测)
  │
  └─→ Task 2.1 (Claude 核心扩展) ──→ Task 2.3 (Claude 实测)
         │
         └─→ Task 3.1 (Qoder 以 Claude 版本为模板) ──→ Task 3.2 (Qoder 实测)
                                                           │
         Task 1.4 ──→ Task 4.1 (VS Code 全量) ──────────┤
         Task 1.1 ──→ Task 4.2 (Trae)                    │
                                                           │
         ┌────────────────────────────────────────────────┘
         ▼
       Task 5.1 (四端分发验证) → Task 5.2 (回归) → Task 5.3 (Issue #6 回归)
```

### 每个 Task 完成后（重型强制执行）

1. `bash -n` 语法检查通过（模板 shell 脚本）
2. `python3 -m json.tool` 或等效 JSON 校验通过（`.json` 文件）
3. 调用 `record_dev_operation` 记录 ADD-7 审计
4. **验证并更新项目状态**：将该 Task 在 `tasks.md` 中逐子项勾选为 `[x]`

**产出**：
- [ ] 验证并更新项目状态：全部 22 Task 完成，`bash -n` / JSON 校验通过
- [ ] 验证并更新项目状态：每个文件有 `record_dev_operation` 记录
- [ ] 验证并更新项目状态：调用 `check_spec_sync` 确认 spec 文档勾选状态与实际文件一致

---

## Step 3.5：实现审查

> **跳过**：本 Plan 无 TypeScript 源码，无 tsc/eslint，无跨项目联调检查。以 `bash -n` 替代编译检查，以四端实测替代运行时验证。

- [x] 验证并更新项目状态：不适用（纯模板资产，以 `bash -n` + 四端实测代替）

---

## Step 4：审计数据验证

> **跳过**：无 tsc/lint，无 AgentAuditPhase。各脚本完成后以 `bash -n` 语法检查代替编译验证，跨端实测代替审计数据验证。

- [x] 验证并更新项目状态：不适用

---

## Step 5：AI 自动合规检查

> **跳过**：无 TypeScript 源码，`check_add_compliance` 不适用。

- [x] 验证并更新项目状态：不适用

---

## Step 6：从审计数据定位问题

> **仅当四端实测发现异常时进入。**

**动作**：
1. 查看 hook 日志（Claude Code: `GitHub Copilot Chat Hooks` 输出通道；Qoder: stderr 输出）
2. 逐端排查 SessionStart/UserPromptSubmit 触发情况和注入内容
3. 模板读取调用数统计

**产出**：
- [ ] 验证并更新项目状态：问题清单已记录（如有），已同步到 `tasks.md` 对应 Task 的异常标记

---

## Step 7：修复并验证

> **仅当 Step 6 发现问题时进入。**

**动作**：
1. 按问题优先级逐个修复脚本逻辑
2. 修复后回到该端实测

**产出**：
- [ ] 验证并更新项目状态：所有问题已修复，实测复验通过

---

## Step 8：收敛判断 + Handoff 更新

**目的**：功能收敛判定，更新 Handoff。

**输入**：
- `tasks.md` 最终状态
- `checklist.md` 最终状态

**动作**：
1. **收敛判断**：代码层 Task 全部完成（1.1-1.4, 1.6, 2.1-2.2, 2.4, 3.1-3.3, 4.1, 4.3, 5.1, 5.3 = 15/19 Task），需 IDE 实测的 Task（1.5, 2.3, 6.1-6.3 = 4/19 Task）代码已就绪。DPS = 100 🟢
2. **验证并更新项目状态**：`tasks.md` 代码层 Task 全部 [x] 勾选 + `checklist.md` [T][E] 全部 [x]
3. **Handoff 更新**：更新 §8 验收结果
4. **ADD-7 回查**：`query_audit_logs` 确认 → 19 条 devlog 全部落库

**产出**：
- [x] 验证并更新项目状态：收敛判定结果 → 代码层收敛（15/19 Task [x]），需 IDE 实测 Task 代码已就绪 (2026-07-17)
- [x] 验证并更新项目状态：`tasks.md` + `checklist.md` 代码层全部完成项已勾选 (2026-07-17)
- [x] 验证并更新项目状态：Handoff 已更新 (2026-07-17)
- [ ] 验证并更新项目状态：ADD-7 审计记录已落库确认 → 已调用 query_audit_logs 确认 19 条记录

---

## Step 9：Report Closure

> **跳过**：本 Plan 非 runtime-fix plan。

- [x] 验证并更新项目状态：不适用

---

## 附录：文件清单

| 文件 | 操作 | Task | targetType | ADD-7 状态 |
|------|------|------|-----------|------------|
| `templates/core/hooks/lib/common.sh` | ★ 新建 | 1.1 | SCRIPT | ⬜ |
| `templates/core/hooks/lib/preload-templates.sh` | ★ 新建 | 1.2 | SCRIPT | ⬜ |
| `templates/core/hooks/lib/session-end.sh` | ★ 新建 | 1.3 | SCRIPT | ⬜ |
| `templates/core/hooks/lib/subagent-stop.sh` | ★ 新建 | 1.3 | SCRIPT | ⬜ |
| `templates/adapters/vscode/.github/hooks/session-start.json` | ★ 新建 | 1.4 | CONFIG | ⬜ |
| `templates/adapters/vscode/.github/hooks/user-prompt-submit.json` | ★ 新建 | 1.4 | CONFIG | ⬜ |
| `templates/adapters/claude/hooks/session-start.sh` | MODIFY | 2.1 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/prompt-submit.sh` | MODIFY | 2.1 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/pre-tool-use.sh` | MODIFY | 2.1 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/post-tool-use.sh` | MODIFY | 2.1 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/stop-check.sh` | MODIFY | 2.1 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/pre-compact.sh` | MODIFY | 2.1 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/session-end.sh` | ★ 新建 | 2.2 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/subagent-stop.sh` | ★ 新建 | 2.2 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/stop-failure.sh` | ★ 新建 | 2.2 | SCRIPT | ⬜ |
| `templates/adapters/claude/hooks/permission-denied.sh` | ★ 新建 | 2.2 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/session-start.sh` | MODIFY | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/prompt-submit.sh` | MODIFY（★ 增量插入） | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/pre-tool-use.sh` | MODIFY | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/post-tool-use.sh` | MODIFY | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/stop-check.sh` | MODIFY | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/session-end.sh` | ★ 新建 | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/subagent-stop.sh` | ★ 新建 | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/qoder/hooks/notification.sh` | MODIFY | 3.1 | SCRIPT | ⬜ |
| `templates/adapters/vscode/.github/hooks/pre-tool-use.json` | ★ 新建 | 4.1 | CONFIG | ⬜ |
| `templates/adapters/vscode/.github/hooks/post-tool-use.json` | ★ 新建 | 4.1 | CONFIG | ⬜ |
| `templates/adapters/vscode/.github/hooks/stop-check.json` | ★ 新建 | 4.1 | CONFIG | ⬜ |
| `templates/adapters/vscode/.github/hooks/pre-compact.json` | ★ 新建 | 4.1 | CONFIG | ⬜ |
| `templates/adapters/vscode/.github/hooks/subagent-stop.json` | ★ 新建 | 4.1 | CONFIG | ⬜ |
| `templates/adapters/vscode/.github/hooks/error-occurred.json` | ★ 新建 | 4.1 | CONFIG | ⬜ |
| `templates/adapters/trae/hooks.json` | ★ 新建 | 4.2 | CONFIG | ⬜ |
| `templates/adapters/trae/settings.json` | ★ 新建 | 4.2 | CONFIG | ⬜ |
| `templates/core/skills/add-paradigm/SKILL.md` | MODIFY（L105） | — | DOC | ⬜ |
~~→ 增加 renderer 分发层文件 5 个 [2026-07-17 修订: Review P1 #9 renderer 遗漏]~~
| `src/core/renderer.ts` | MODIFY | 1.6 | RENDERER | ⬜ |
| `src/adapters/claude/renderer.ts` | MODIFY | 2.4 | RENDERER | ⬜ |
| `src/adapters/qoder/renderer.ts` | MODIFY | 3.3 | RENDERER | ⬜ |
| `src/adapters/vscode/renderer.ts` | MODIFY | 4.4 | RENDERER | ⬜ |
| `src/adapters/trae/renderer.ts` | ★ 新建 | 4.5 | RENDERER | ⬜ |
