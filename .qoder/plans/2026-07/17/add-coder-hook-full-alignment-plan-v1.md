# add-coder-hook-full-alignment-plan-v1

> **一句话**：实现 ADD 范式在四家主流 IDE（Claude Code / Qoder CN / VS Code Copilot / Trae）上的确定性运行。

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。

## PLAN 元信息

- **Plan 名称**: add-coder-hook-full-alignment-v1
- **启动时间**: 2026-07-17
- **主导 AI**: Qoder (Claude 4)
- **来源**: GitHub Issue [#6](https://github.com/xiaomingming92/add-coder/issues/6) triage → RPT-20260717-05
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/17/add-coder-hook-full-alignment-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-07/17/add-coder-hook-full-alignment-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-hook-full-alignment-review-v1.md`
  - Report（触发源）: `.qoder/reports/issue-6-tool-call-throttling-report.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| templates/adapters/claude/hooks/session-start.sh | SCRIPT | MODIFY | ADD状态恢复，无模板预读 | 模板索引注入 + ADD状态恢复 | 待实施 |
| templates/adapters/claude/hooks/prompt-submit.sh | SCRIPT | MODIFY | ADD触发词检测+路由，无模板全文注入 | 触发词路由 + 模板全文注入 + 契约确认卡位 | 待实施 |
| templates/adapters/claude/hooks/pre-tool-use.sh | SCRIPT | MODIFY | 仅危险命令拦截 | 危险命令 + 模板路径兜底 + 文件写入前置守卫 + 敏感文件保护 | 待实施 |
| templates/adapters/claude/hooks/post-tool-use.sh | SCRIPT | MODIFY | 代码格式化 | 格式化 + ADD文档结构守卫 + 审计落库 + 结果增强 | 待实施 |
| templates/adapters/claude/hooks/stop-check.sh | SCRIPT | MODIFY | 基础验收 | 验收检查(checklist+TSC+RAHS≥90)+devlog自动补写+阻断 | 待实施 |
| templates/adapters/claude/hooks/pre-compact.sh | SCRIPT | MODIFY | 基础状态保存 | ADD状态保存 + 恢复清单导出 | 待实施 |
| templates/adapters/claude/hooks/session-end.sh | SCRIPT | CREATED | 不存在 | 清理标记 + 会话审计结算 + Stop未触发兜底 | 待实施 |
| templates/adapters/claude/hooks/subagent-stop.sh | SCRIPT | CREATED | 不存在 | 子agent结果边界校验 + 审计聚合 + 阻断 | 待实施 |
| templates/adapters/claude/hooks/stop-failure.sh | SCRIPT | CREATED | 不存在 | 紧急审计转储 + 异常标记 | 待实施 |
| templates/adapters/qoder/hooks/*（对应8脚本） | SCRIPT | MODIFY | 同claude对应脚本 | 注入通道适配stderr，跳过不支持事件 | 待实施 |
| templates/adapters/vscode/.github/hooks/*（8个JSON） | CONFIG | CREATED | 不存在 | VS Code Copilot端8事件全注册 | 待实施 |
| `templates/adapters/trae/*` | CONFIG | CREATED | 整个adapter不存在 | trae adapter新建（hooks.json + settings.json） | 待实施 |
| `templates/core/hooks/lib/*` | SCRIPT | CREATED | 不存在 | 四端共享脚本库 | 待实施 |
| `src/adapters/vscode/renderer.ts` | RENDERER | MODIFY | .github/hooks 未特殊处理 | .github/ 子目录输出到项目根而非 .vscode/ 前缀 + 行走 core/hooks/lib/ | 待实施 |
| `src/adapters/trae/renderer.ts` | RENDERER | CREATED | 整个 adapter renderer 不存在 | 新建 Trae adapter renderer，TARGET_MAGIC_PATH 待确认 | 待实施 |
| `src/adapters/claude/renderer.ts` | RENDERER | MODIFY | 仅行走 claude adapter 目录 | 增加 core/hooks/lib/ 行走，输出到 hooks/lib/ | 待实施 |
| `src/adapters/qoder/renderer.ts` | RENDERER | MODIFY | 仅行走 qoder adapter 目录 | 增加 core/hooks/lib/ 行走，输出到 hooks/lib/ | 待实施 |
| `src/core/renderer.ts` | RENDERER | MODIFY | SKIP_DIRS 缺 shared | SKIP_DIRS 无需改动（shared 已并入 core/hooks/lib/）[回流: Review P1 #11] | 待实施 |
| `templates/adapters/claude/hooks/` 下 12 脚本 | SCRIPT | MODIFY | source 路径 `../../shared/hooks-lib/` | source 路径改为 `lib/common.sh`（依赖 renderer 行走 core/hooks/lib/ → .claude/hooks/lib/） | 待实施 |
| `templates/adapters/qoder/hooks/` 下 8 脚本 | SCRIPT | MODIFY | source 路径 `lib/state-detect.sh` 等 | 无需改动（lib/ 已为相对路径），但新增对 `lib/common.sh` 的 source | 待实施 |
| `templates/shared/hooks-lib/common.sh` | SCRIPT | DELETED | 存在 | ★ 删除（已并入 core/hooks/lib/common.sh） | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

ADD 范式当前的治理逻辑仅通过 Claude Code 单端的 Hook 机制确定性运行——在 VS Code Copilot、Trae 端，用户"裸奔"在没有触发词路由、没有模板预读、没有文档结构守卫、没有验收阻断的状态下。本次 Plan 将 ADD 范式的 17 个治理卡位落地到四家 IDE 的 agent 生命周期中。

**各 adapter 差距**:

| adapter | hooks 状态 | 差距 |
|---|---|---|
| `claude` | 12 脚本齐全 | 脚本内容为旧版（无模板预读、验收检查不完整、缺少 session-end/subagent-stop/stop-failure） |
| `qoder` | 12 脚本齐全 | 同上，注入通道为 Claude Code 的 stdout 格式，未适配 Qoder 的 stderr 注入机制 |
| `vscode` | **无 hooks 目录**（仅 4 个 .json） | VS Code Copilot hooks（`.github/hooks/*.json`）已于 2026-05-28 公开，adapter 未跟进 |
| `trae` | **整个 adapter 目录不存在** | Trae hooks 于 2026-06-12 发布（v3.3.66），adapter 未跟进 |

**四家 IDE Hook 事件已完整到需要系统性适配**（而非 issue-by-issue 修补）:

| IDE | Hook 文档 | 事件数 | 与 add-coder 当前覆盖差距 |
|---|---|---|---|
| Claude Code | https://code.claude.com/docs/zh-CN/hooks | ~17 | 有 12 脚本框架，缺 session-end/subagent-stop/stop-failure，且 6 个核心脚本内容需扩展 |
| Qoder CN | https://help.aliyun.com/zh/lingma/qoder-cn-update-log | 10 | v1.7.0（2026-07-15）新增 SessionStart/SessionEnd/SubagentStart/SubagentStop/Notification + asyncRewake |
| VS Code Copilot | https://docs.github.com/zh/copilot/concepts/agents/hooks + https://vscode.js.cn/docs/agent-customization/hooks | 9 | add-coder 在该端 hooks 完全缺席 |
| Trae | https://docs.trae.cn/ide_automate-actions-with-hooks | 7 | add-coder 在该端 hooks 完全缺席，adapter 目录不存在 |

**本次 Plan 的直接触发源**：GitHub Issue #6 —— 用户在 VS Code Copilot 端执行多文件 Plan 时，Step 0 的并行工具调用触发 429 导致会话瘫痪。根因分析发现：① SKILL.md 的批量模板读取指令（L105）结构性制造调用风暴；② SessionStart/UserPromptSubmit Hook 预读可以消灭这场风暴——但只有 Claude Code/Qoder 端有 hooks 框架，VS Code/Trae 端完全缺席。

### 1.2 目标

将 ADD 范式的治理逻辑从"依赖 Claude Code 单一端的 Hook 机制"升级为"在四家主流 IDE（Claude Code / Qoder CN / VS Code Copilot / Trae）的 agent 生命周期中确定性运行"。hooks 是执行面，ADD 治理是载荷——本 Plan 交付的不是"hook 适配"，而是 ADD 范式在每端 agent 生命周期中的 17 个治理卡位的物理落地。

---

## 二、方案选型

### 2.1 候选方案对比

| 维度 | A: 按端修补 Hook 脚本 | B: ADD 范式四端确定性运行（选型） |
|------|------------------------|---------------------------|
| 覆盖面 | 每次 issue 补一个事件/一个端，碎片化 | 四端 17 事件一次性对齐，后续 issue 直接继承 |
| 维护成本 | 四个 adapter 各有缺口，问题反复出现 | 统一映射表 + 共享脚本库，修改一处四端生效 |
| 对 Issue #6 的解决 | 只补 SessionStart/UserPromptSubmit，其他事件缺口留给后续 issue | Issue #6 是此次对齐的一个子集，五事件基座全覆盖 |
| 架构一致性 | 各端脚本各自演化，接口/函数名/审计格式分歧 | 共享 common.sh 约束四端遵循同一接口契约 |
| 风险 | 低（单次改动小），但累积债务大 | 中（单次改动大），但一次清债 |

### 2.2 选型理由

选 **B: ADD 范式四端确定性运行**。理由：

1. **Hook 适配没有护城河**：给 VS Code Copilot 写 JSON、给 Trae 写 hooks.json，任何一个开发者花一个下午都能做。真正的壁垒是每个 hookpoint 上跑的治理逻辑——那些来自 1800+ 下载量、200+ Plan 文档、Claude Code 12 脚本先行验证出的 ADD 治理实践
2. **时间窗口唯一**：四家 IDE 的 agent 生命周期事件在 2026-05~07 集中开放完毕，add-coder 此时落地不是"适配四家"，是"ADD 范式成为四家 agent 运行时的治理标准"
3. **Issue #6 的本质不是 hook 缺失**：如果当初 Claude Code 端的 session-start.sh 已经有模板预读、UserPromptSubmit 已经有触发词路由——VS Code 端用户不会遇到 429。问题不是"那端缺 hook"，是"ADD 治理在那端没有运行"

---

## 三、架构设计

### 3.1 ADD 范式在 IDE agent 生命周期中的 17 个治理卡位

add-coder 交付的不是"hook 脚本"，而是 ADD 范式的治理逻辑在 IDE agent 生命周期关键节点上的**确定性执行点**。每个 hook 事件是一个治理卡位：

| # | 事件 | 频率 | 在 ADD 范式中的治理职能 | 脚本核心逻辑 | 覆盖端 |
|---|------|------|---|---|---|
| 1 | **SessionStart** | 每会话一次 | ① 模板索引注入：13 个模板文件名+用途注入上下文，消弭并行读取风暴（issue #6 核心）；② ADD 状态恢复：检测活跃 Plan/Step/轮次/handoff，构建上下文摘要注入模型；③ 会话级标记初始化：准备 `tpl-injected` 标记文件路径 | `session-start.sh`：detect_active_add → 注入状态摘要 + 模板索引列表 | 四端 |
| 2 | **SessionEnd** | 每会话一次 | ① 清理标记文件：删除 `tpl-injected-{session}` 防泄漏到下个会话；② 会话审计结算：汇总本轮 session 的 tool 调用次数/时长/失败数落 AuditLog；③ 异常兜底：若 Stop 未触发验收检查（agent 异常退出），此处补执行 checklist 快照 | `session-end.sh`：清理标记 + query_audit_logs 汇总 + checklist 快照兜底 | Claude / Qoder / VS Code |
| 3 | **UserPromptSubmit** | 每轮一次 | ① 触发词路由：检测 ADD P0 触发词（开发/实施/验收/Review 回流…）→ 路由到对应 Step；② 模板全文注入：命中开发关键词且本会话未注入 → 注入 13 个模板全文（issue #6 核心）；③ 输入安全审计：记录用户 prompt 摘要到 AuditLog；④ 契约确认卡位（Issue #7 场景）：涉及外部 API 协议时，检查 `[UNCONFIRMED]` 残留 → 阻断并引导逐项确认 | `prompt-submit.sh`：match_trigger → 路由/注入/阻断 | 四端 |
| 4 | **PreToolUse** | 每次工具调用 | ① 危险命令拦截：rm -rf / DROP TABLE / git push --force 等；② 模板路径兜底：若模型未吸收 hook 注入仍批量 Read `.qoder/templates/`，stderr 提示"模板已预读，跳过重复读取"；③ 文件写入前置守卫：Write/Edit 目标为 `.qoder/plans/` 或 `.qoder/specs/` → 检查是否有活跃 ADD Plan（无则引导创建）；④ 敏感文件保护：`.env`/`.env.production` 等读取拦截 | `pre-tool-use.sh`：按 matcher（Bash/Edit/Write/Read）分发到对应守卫逻辑 | 四端 |
| 5 | **PostToolUse** | 每次工具调用 | ① 代码格式化：文件编辑后运行 prettier/eslint；② ADD 文档结构守卫：Write 到 plans/specs/reviews 后执行 doc-format-guard（模板章节完整性、双向链接、增量修订格式）；③ 审计记录：tool 调用成功 → record_dev_operation（ADD-7）；④ 结果增强：工具输出超长时截断关键部分注入上下文 | `post-tool-use.sh`：按工具类型分发（Edit→format+guard, Bash→结果增强）→ 审计落库 | 四端 |
| 6 | PostToolUseFailure | 工具失败时 | ① 失败路径等价审计（ADD-6）：记录与成功路径等密度的审计信息（durationMs/error/stack/已处理量）；② 429 特别处理：检测到 429 → 记录次数，连续 3 次 → 建议模型切换为串行模式 | `post-tool-failure.sh`：提取 error → 构建等价审计 → 429 计数与降级建议 | Claude / Qoder |
| 7 | **Stop** | 每轮结束时 | ① 验收检查（ADD-12）：checklist [T]/[R] 项验证 + tsc --noEmit + RAHS 门禁（≥90）；② devlog 写盘：若本轮有代码变更 MCP 记录未写入 → 自动补写；③ 阻断能力：验收不通过 → exit 2 阻止 agent 结束，要求继续修复 | `stop-check.sh`：运行 checklist 验证 → tsc → RAHS → 阻断/放行 | 四端 |
| 8 | StopFailure | 异常停止时 | ① 紧急审计转储：agent 异常退出前 dump 当前 State 快照；② 标记会话为异常终止，供 SessionEnd 兜底识别 | `stop-failure.sh`：dump State + 标记异常标志 | Claude 特有 |
| 9 | PreCompact | 上下文压缩前 | ① ADD 状态保存：压缩前保存当前 Plan/Step/轮次/handoff 到标记文件，压缩后 SessionStart 可恢复；② 关键上下文导出：将活跃 spec/tasks/checklist 路径写入恢复清单 | `pre-compact.sh`：detect_active_add → 写恢复标记文件 + 上下文路径清单 | Claude / VS Code |
| 10 | SubagentStart | 子 agent 启动时 | ① ADD 上下文传递：将当前 Plan/Step/轮次/handoff 注入子 agent 的 system prompt 或环境变量；② 子 agent 审计初始化：为子 agent 分配 sub-traceId 并记录启动审计 | `subagent-guard.sh`：注入 ADD 状态 + 分配 sub-traceId | Claude / Qoder / VS Code |
| 11 | SubagentStop | 子 agent 完成时 | ① 子 agent 结果校验：检查子 agent 交付物是否符合 spec 边界（不越界、不遗漏）；② 审计聚合：将子 agent 的 sub-traceId 审计记录合并回主 traceId；③ 阻断能力：子 agent 结果不符合 spec → exit 2 要求重做 | `subagent-stop.sh`：边界校验 + 审计聚合 + 阻断 | Claude / Qoder / VS Code |
| 12 | Notification | 异步通知时 | ① 开发提醒：Review 待处理 / devlog 未写 / 长任务完成 → 桌面通知或 Slack/钉钉推送；② Token 预警：剩余 context 不足 20% → 提醒 compact | `notification.sh`：按 notification_type 分发 → 对应通知渠道 | Claude / Qoder / Trae |
| 13 | PermissionRequest | 权限请求时（Claude 特有） | ① 自动放行安全工具：Read/Grep/Glob 等只读工具自动 allow；② 高危工具拦截：Bash(rm -rf)/Write(.env) 强制 deny；③ 可配置白名单：项目级配置允许的 Bash 命令前缀 | `permission-gate.sh`：分级决策（allow/deny/ask） | Claude 特有 |
| 14 | PermissionDenied | 权限被拒后（Claude 特有） | ① 记录拒绝原因；② 建议替代方案注入上下文（如"rm 被拒，建议用 trash 命令"） | `permission-denied.sh`：原因记录 + 替代方案注入 | Claude 特有 |
| 15 | errorOccurred | 错误发生时（VS Code 特有） | ① 错误分类：区分 429/网络/超时/工具异常；② 429 应对：连续 429 → 建议模型降级为串行模式；③ 审计记录：错误等价审计（ADD-6） | `error-occurred.sh`：错误分类 + 降级建议 + 审计 | VS Code 特有 |
| 16 | ConfigChange | 配置变更时（Claude 特有） | ① 热重载响应：settings.json 变更后重新加载 Hook 配置；② 变更审计：记录谁在什么时候改了什么配置 | `config-change.sh`：热重载 + 变更审计 | Claude 特有 |
| 17 | WorktreeCreate/Remove | git worktree 操作时（Claude 特有） | ① 环境初始化/清理：worktree 创建时注入 ADD 上下文，删除时清理临时标记文件 | `worktree-create.sh` / `worktree-remove.sh` | Claude 特有 |

> **五事件基座**（粗体行 #1~#5 + #7）：SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop ——四家全部支持，add-coder 已有脚本对应但内容需扩展。这是 add-coder Hook 体系的**最低完备线**。

### 3.2 四端 adapter 改动量与注入通道差异

| adapter | 覆盖事件数 | 脚本总数 | 新建 | 扩展 | 保持 | 注入通道 |
|---|---|---|---|---|---|---|
| `claude` | 14/17 | 16（12 现有 + 3 新增 + 1 共享引用） | 3 | 6 | 7 | stdout → additionalContext（Claude Code 标准） |
| `qoder` | 10/17 | 11（8 现有扩展 + 2 新增 + 1 共享引用） | 2 | 6 | 3 | stderr → 下一轮 system prompt 注入（Qoder 既定机制） |
| `vscode` | 9/17 | 8 JSON + 共享脚本引用 | 8 | 0 | 0 | JSON `command` stdout（VS Code Copilot 标准） |
| `trae` | 7/17 | 2（hooks.json + settings.json）+ Claude 脚本复用 | 2 | 0 | 0 | stdout（与 Claude Code 导入兼容） |

> **共享脚本库**（`core/hooks/lib/`）：`preload-templates.sh`（四端共用）、`session-end.sh`（三端共用）、`subagent-stop.sh`（三端共用）、`common.sh`（detect_active_add/match_trigger/parse_input/build_audit_json，从 qoder/lib 抽象）。

### 3.3 数据流转（模板预读路径，Issue #6 核心场景）

```
用户提交开发 prompt
        │
        ▼
┌─────────────────────────────────────────┐
│  UserPromptSubmit (prompt-submit.sh)     │  ← 每轮触发
│  ├─ match_trigger → 命中 "开发" 关键词  │
│  ├─ 检查 tpl-injected 标记文件          │
│  │   ├─ 未注入 → cat 13 模板全文注入   │
│  │   │          → 落标记文件            │
│  │   └─ 已注入 → 短路跳过               │
│  └─ 审计记录                            │
└──────────────┬──────────────────────────┘
               │ 上下文含 13 模板全文
               ▼
┌─────────────────────────────────────────┐
│  模型生成响应                            │
│  ├─ 不再需要 read_file() 模板          │  ← 零并行读取调用
│  ├─ 直接引用模板内容填充 Plan/Spec      │
│  └─ SKILL.md L105 提示：hook已预读→跳过 │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  PreToolUse (pre-tool-use.sh)            │  ← 兜底
│  ├─ Write/Edit → plans/specs/ 路径？    │
│  │   └─ 检查活跃 ADD Plan（无则引导）  │
│  ├─ Read → .qoder/templates/ 路径？     │
│  │   └─ stderr："模板已预读，勿重复读取"│
│  └─ Bash → rm -rf / DROP TABLE 拦截    │
└─────────────────────────────────────────┘


标记文件生命周期：

SessionStart
  │  ┌─ 准备 tpl-injected 路径（不落盘）
  ▼  │
UserPromptSubmit (首次命中 ADD 关键词)
  │  ┌─ cat 模板 → stdout/stderr 注入
  │  ├─ touch tpl-injected-{session}  ← 落标记
  ▼  │
UserPromptSubmit (同会话后续轮次)
  │  ┌─ 检测标记文件存在 → 短路跳过
  ▼  │
PreCompact
  │  ┌─ 保存 ADD 状态（Plan/Step/轮次/handoff）
  │  ├─ rm tpl-injected-{session}     ← 清除标记（compact 后上下文丢失，需重注）
  ▼  │
SessionEnd
     └─ rm tpl-injected-{session}     ← 清理标记（防泄漏到下个会话）
```

---

## 四、实施 Task + 依赖图

```
轮次 1: shared 共享脚本库 + VS Code 基础 hooks（★ Issue #6 发生在 VS Code 端，优先消灭其 429 风暴）[回流: Review P1 #6 实施顺序调整]
  ├── Task 1.1: common.sh（从 qoder/lib 抽象公共函数）
  ├── Task 1.2: preload-templates.sh（模板预读，四端共用）
  ├── Task 1.3: session-end.sh + subagent-stop.sh
  ├── Task 1.4: VS Code session-start.json + user-prompt-submit.json（★ 仅 2 个 JSON，先让模板预读在 VS Code 端跑起来）
  └── Task 1.5: VS Code 端基础实测（SessionStart 索引注入 + UserPromptSubmit 全文注入 → 模板读取调用数 = 0）
        │
        ▼  (轮次 2/3/4 全部依赖 core/hooks/lib/*.sh)
        │
轮次 2: Claude Code 端（首个完整端，14/17 事件闭环）
  ├── Task 2.1: 6 核心脚本扩展（session-start / prompt-submit / pre-tool-use / post-tool-use / stop-check / pre-compact）
  ├── Task 2.2: 3 新脚本（session-end / subagent-stop / stop-failure）+ 1 新脚本（permission-denied）
  └── Task 2.3: Claude Code 端实测（五基座全触发 + 验收阻断 + 模板预读 0 并行读取）
        │
        ▼
轮次 3: Qoder CN 端
  ├── Task 3.1: 8 脚本注入通道适配 stderr（五基座 + session-end + subagent-stop + notification）
  └── Task 3.2: Qoder CN 端实测
        │
        ▼
轮次 4: VS Code Copilot 端
  ├── Task 4.1: VS Code Copilot 剩余 6 个 JSON + 全量 8 事件注册
  └── Task 4.2: VS Code Copilot 端实测
        │
        ▼
轮次 5: Trae 端
  ├── Task 5.1: Trae hooks.json + settings.json
  └── Task 5.2: Trae 端实测
        │
        ▼
轮次 6: 收敛验证
  ├── Task 6.1: npx add-coder init 四端全量分发验证
  ├── Task 6.2: 四端五基座全触发回归
  └── Task 6.3: Issue #6 原始复现场景回归（429 不再触发）
```

### 轮次 1: shared 共享脚本库 + VS Code 基础 hooks

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 1.1 | common.sh 工具函数抽象 | `templates/core/hooks/lib/common.sh` | 从 `qoder/hooks/lib/` 提取 `detect_active_add` / `match_trigger` / `parse_input` / `build_audit_json`，使其独立于 qoder 端。四端 adapter 的 hook 脚本统一 source 此文件 | `bash -n` 语法检查通过 |
| 1.2 | preload-templates.sh | `templates/core/hooks/lib/preload-templates.sh` | 读 `templates/core/templates/` 目录，输出模板文件清单（文件名 + 一行用途）。支持 `--full` 参数输出全文。被 SessionStart（索引模式）和 UserPromptSubmit（全文模式）调用。**P2 Spec 展开项**：① 定义具体模板清单（当前提"13 个"但未列出）；② 估算 `--full` 输出 Token 量，提供 `--top N` 降级策略（防上下文溢出） | `bash -n`，cat 输出格式验证 |
| 1.3 | session-end.sh + subagent-stop.sh | `templates/core/hooks/lib/session-end.sh` + `subagent-stop.sh` | session-end：清理 tpl-injected 标记 + query_audit_logs 汇总；subagent-stop：边界校验 + spec 对比 + 审计聚合 | `bash -n`，三端 adapter 可正确引用 |
| 1.4 | VS Code 基础 hooks JSON | `vscode/.github/hooks/session-start.json` + `user-prompt-submit.json` | ★ 优先交付：仅注册 SessionStart 和 UserPromptSubmit 两个事件，`command` 字段指向 core/hooks/lib/preload-templates.sh。**理由**：Issue #6 发生在 VS Code 端，这两个事件覆盖了模板预读（治理卡位 #1 + #3），轮次 1 完成即可消灭 VS Code 端 429 风暴。剩余 6 个 JSON 在轮次 4 补齐 | JSON 语法正确，VS Code Copilot 加载无报错 |
| 1.5 | VS Code 端基础实测 | — | SessionStart 模板索引注入 + UserPromptSubmit 命中开发关键词→全文注入 | VS Code 端 Step 0 模板读取调用数 = 0，429 不再触发 |
| 1.6 | core renderer SKIP_DIRS | `src/core/renderer.ts` | `SKIP_DIRS` 新增 `shared`，防止 `templates/core/hooks/lib/` 由各适配器 renderer 单独行走 [回流: Review P1 #9 renderer 遗漏] | `npx tsc --noEmit` & eslint 通过 |

### 轮次 2: Claude Code 端

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 2.1 | 6 核心脚本扩展 | 见下表 | 每脚本按治理职能映射表扩展逻辑，source core/hooks/lib/common.sh | 见下表 |
| 2.2 | 3+1 新脚本 | 见下表 | session-end.sh / subagent-stop.sh / stop-failure.sh / permission-denied.sh | 见下表 |
| 2.3 | Claude Code 端实测 | — | 五基座全触发 + 验收阻断 + 模板预读验证 | 模板读取调用数 = 0 |
| 2.4 | Claude adapter renderer | `src/adapters/claude/renderer.ts` | 增加 `shared/` 行走——将 `templates/core/hooks/lib/` 下脚本渲染到 `hooks/lib/` | `npx tsc --noEmit`，`npx add-coder init --adapter claude` 后 hooks/lib/ 含共享脚本 |

**轮次 2 脚本改动明细**:

| 脚本 | 改动类型 | 治理职能 | 验收 |
|------|---------|---------|------|
| session-start.sh | 扩展 | #1：ADD状态恢复 + 模板索引注入 [回流: Review P1 #10 detect_active_add 修正] | → detect_active_add 修正：① 多 magicDir 回退（`.claude/plans/` → `.qoder/plans/` → `.add/plans/`）；② index.md 优先匹配 → 无匹配才 glob；③ 活跃判定：读 add-route，存在 `[ ]` 未勾选项 = 活跃，多个活跃取最近修改的 add-route [2026-07-17 修订: Review P1 #10]。新会话启动后模型上下文含模板索引 + 正确 ADD 状态 |
| session-end.sh | ★ 新建 | #2：标记清理 + 审计结算 + Stop兜底 | session 结束后标记已清除 |
| prompt-submit.sh | 扩展 | #3：触发词路由 + 模板全文注入 + 契约卡位 | 首次"开发"关键词命中后 tpl-injected 标记落盘，模型上下文含 13 模板全文 |
| pre-tool-use.sh | 扩展 | #4：危险命令 + 模板路径兜底 + 文件写入前置守卫 + 敏感文件 | rm -rf 被拦截；批量 Read templates/ → stderr 提示 |
| post-tool-use.sh | 扩展 | #5：格式化 + ADD文档守卫 + 审计落库 + 结果增强 | Write plans/specs/ 后 doc-format-guard 触发 |
| stop-check.sh | 扩展 | #7：验收检查(checklist+TSC+RAHS≥90)+devlog+阻断 | checklist 未通过 → exit 2 |
| stop-failure.sh | ★ 新建 | #8：紧急审计转储 + 异常标记 | agent 异常退出时 State 已 dump |
| pre-compact.sh | 扩展 | #9：ADD状态保存 + 恢复清单导出 | compact 前标记文件已更新 |
| subagent-guard.sh | 保持 | #10：子agent上下文传递 + sub-traceId | 不退化 |
| subagent-stop.sh | ★ 新建 | #11：子agent结果边界校验 + 审计聚合 + 阻断 | spec 边界外交付物 → exit 2 |
| permission-gate.sh | 保持 | #13：分级决策(allow/deny/ask) | 不退化 |
| permission-denied.sh | ★ 新建 | #14：拒绝原因记录 + 替代方案 | deny 后有记录 + 替代方案注入 |
| notification.sh | 保持 | #12：Review/devlog/Token通知 | 不退化 |
| post-tool-failure.sh | 保持 | #6：失败等价审计 + 429降级 | 不退化 |
| review-checklist.sh | 保持 | 辅助：checklist 验证 | 不退化 |
| doc-format-guard.sh | 保持 | 辅助：ADD 文档结构校验 | 不退化 |

### 轮次 3: Qoder CN 端

> **P1 约束**[回流: Review P1 #7 保留增强]：Qoder 端 `prompt-submit.sh` 已有 73 行较完善的触发词路由系统（Layer 1 精准 P0 触发词 → Layer 2 开发关键词检测 → Layer 3 活跃 ADD 状态注入 + 验收幂等保护）。模板全文注入逻辑必须以增量方式插入——在现有 Layer 2（命中开发关键词但无活跃 ADD → 强制启动 add-paradigm）之后增加一个分支：检测 tpl-injected 标记 → 未注入则 cat 模板全文，已注入则短路。**禁止覆盖**现有 Layer 1/2/3 分流逻辑和验收幂等保护。

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 3.1 | 8 脚本注入通道适配 stderr | `qoder/hooks/` 下对应 8 脚本 | session-start / prompt-submit（增量插入，保留 Layer 1/2/3）/ pre-tool-use / post-tool-use / stop-check / session-end / subagent-stop / notification。注入通道从 stdout 改为 stderr → 下一轮 system prompt 注入 | Qoder 端 stderr 输出被 IDE 正确捕获 |
| 3.2 | Qoder CN 端实测 | — | 五基座全触发 + 模板预读。**P2 Spec 展开项**：RAHS 跨端降级策略——当 Qoder 端 DPS/RAHS MCP 不可用时（VS Code/Trae 同），stop-check.sh 的验收阻断如何降级为 checklist + tsc 基础检查 | 模板读取调用数 = 0，stderr 注入无误 |
| 3.3 | Qoder adapter renderer | `src/adapters/qoder/renderer.ts` | 增加 `shared/` 行走——将 `templates/core/hooks/lib/` 下脚本渲染到 `hooks/lib/`（与已有 `hooks/lib/vocabulary.sh` 等共存） | `npx tsc --noEmit`，`npx add-coder init --adapter qoder` 后 hooks/lib/ 含共享脚本 |

### 轮次 4: VS Code Copilot 端

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 4.1 | VS Code Copilot 8 个 JSON | `vscode/.github/hooks/` 下 8 个 .json | session-start / user-prompt-submit / pre-tool-use / post-tool-use / stop-check / pre-compact / subagent-stop / error-occurred。每文件注册 1 个事件，`command` 字段指向 core/hooks/lib/ 脚本 | JSON 语法正确，VS Code Copilot 加载无报错 |
| 4.2 | VS Code Copilot 端实测 | — | 五基座全触发 + 模板预读 | 模板读取调用数 = 0 |
| 4.3 | VS Code adapter renderer | `src/adapters/vscode/renderer.ts` | `.github/` 子目录特殊处理——输出到项目根（而非 `.vscode/` 前缀）+ 增加 core/hooks/lib/ 行走 | `npx tsc --noEmit`，`npx add-coder init --adapter vscode` 后 `.github/hooks/` 在项目根 |

### 轮次 5: Trae 端

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 5.1 | Trae hooks.json + settings.json | `trae/hooks.json` + `trae/settings.json` | 注册 7 事件（五基座 + Notification），复用 Claude Code 脚本逻辑（Trae 原生支持导入 Claude Code Hook） | `hooks.json` 语法正确，Trae 加载无报错 |
| 5.2 | Trae 端实测 | — | 五基座全触发 + 模板预读 | 模板读取调用数 = 0 |
| 5.3 | Trae adapter renderer（新建） | `src/adapters/trae/renderer.ts` | ★ 从零创建 Trae adapter renderer。参照 Claude 模式，确认 `TARGET_MAGIC_PATH`（Trae 用 `.trae/` 还是根目录）+ 行走 core/hooks/lib/ | `npx tsc --noEmit`，`npx add-coder init --adapter trae` 后文件正确落位 |

### 轮次 6: 收敛验证

> **P2 Spec 展开项（4 个风险）**：① SessionEnd 兜底递归——Stop 未触发时 SessionEnd 补执行 checklist 快照，需防止快照本身触发新一轮 hook 事件导致递归；② RAHS 跨端降级——Qoder/VS Code/Trae 端 DPS/RAHS MCP 不可用时，验收阻断如何降级为 checklist + tsc 基础检查；③ 共享脚本静默退化——shared/common.sh 中某函数在特定端不可用时（如 qoder 端无 PermissionRequest 事件），调用方如何优雅降级而非报错退出；④ 模板全文注入 Token 预算——13 模板全文可能超出模型上下文限制，需在 preload-templates.sh 中提供 `--top N` 降级策略（如 `--top 5` 仅注入 plan/spec/tasks/checklist/review 五个最常用模板）。以上 4 项均为 Plan→Spec 阶段必须明确的设计决策，Plan 层面仅登记风险。

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 6.1 | 四端全量分发验证 | `npx add-coder init`（四端环境） | 分别以 `--adapter claude/qoder/vscode/trae` 初始化，确认 adapter 文件完整、脚本引用路径正确 | 四端 init 后 hooks 文件齐全，无缺失、无路径错误 |
| 6.2 | 四端五基座全触发回归 | — | SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop 在四端环境下全部触发，无报错 | 五基座触发日志全部可见 |
| 6.3 | Issue #6 回归 | — | 多文件 Plan Step 0 + 并行工具调用场景 | 模板读取调用数 = 0，无 429 |

---

## 五、验收标准

- [ ] `claude` adapter 含 16 脚本（12 现有扩展 + 3 新增 + 1 共享引用），全部 `bash -n` 通过
- [ ] `qoder` adapter 含 11 脚本（8 现有扩展 + 2 新增 + 1 共享引用），stderr 注入通道正确
- [ ] `vscode` adapter 含 `.github/hooks/` 目录（8 个 JSON 文件），JSON 语法正确
- [ ] `trae` adapter 目录存在，含 `hooks.json` + `settings.json`
- [ ] `core/hooks/lib/` 含 4 个共享脚本，`common.sh` 从 qoder/lib 抽象完成
- [ ] 五事件基座（SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop）四端实测全部触发
- [ ] 模板预读生效：Claude Code / Qoder CN / VS Code Copilot / Trae 四端 Step 0 模型侧模板读取调用数 = 0
- [ ] 验收检查生效：checklist 未通过时 stop-check.sh 阻断（exit 2）
- [ ] `npx add-coder init` 四端初始化后 hooks 文件均已正确分发
- [ ] Issue #6 原始复现场景（多文件 Plan Step 0，并行 8+ 工具调用）不再触发 429
- [ ] Plan → Spec 阶段已展开以下 P2 项：① 13 模板清单定义；② --top N Token 降级策略；③ SessionEnd 兜底递归防护；④ RAHS 跨端降级方案；⑤ 共享脚本静默退化策略
- [ ] 已有 12 脚本功能不退化（session-start 状态恢复 / prompt-submit 触发词路由 / pre-tool-use 危险命令拦截 / 等）

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-07/17/add-coder-hook-full-alignment-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-07/17/add-coder-hook-full-alignment-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-hook-full-alignment-review-v1.md` |
| Spec | `.qoder/specs/add-coder-hook-full-alignment/spec.md` |
| Tasks | `.qoder/specs/add-coder-hook-full-alignment/tasks.md` |
| Checklist | `.qoder/specs/add-coder-hook-full-alignment/checklist.md` |
| 触发源 Report | `.qoder/reports/issue-6-tool-call-throttling-report.md` |
| 关联 Issue | [GitHub Issue #6](https://github.com/xiaomingming92/add-coder/issues/6) |
| 四家 Hook 文档 | Claude Code: https://code.claude.com/docs/zh-CN/hooks / Qoder CN: https://help.aliyun.com/zh/lingma/qoder-cn-update-log / VS Code Copilot: https://docs.github.com/zh/copilot/concepts/agents/hooks / Trae: https://docs.trae.cn/ide_automate-actions-with-hooks |
