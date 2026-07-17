# add-coder 代码审查报告 — GitHub Issue #6 工具调用并发节流

> 生成时间：2026-07-17
> 来源：人工 review（[GitHub Issue #6](https://github.com/xiaomingming92/add-coder/issues/6) triage）
> 关联文档：[边界划分](./boundary-runtime-report.md) | [工作流](./REPORT-WORKFLOW.md)
> 关联 Issue 环境：VS Code + GitHub Copilot / Codex（GPT），多文件 Plan 执行、工具调用密集阶段（Step 0 / Step 3）

---

## Issue 总览

| ID | 分类 | 严重度 | 文件 | 状态 | 运行时验证 |
|----|------|--------|------|:----:|:----------:|
| RPT-20260717-01 | 健壮性 / 边界 | P1 | [`templates/core/scripts/mcp-server.ts`](file:///home/xmm/ai/add-coder/templates/core/scripts/mcp-server.ts#L143) | ❌ | — |
| RPT-20260717-02 | 健壮性 / 边界 | P2 | [`templates/core/skills/add-paradigm/SKILL.md`](file:///home/xmm/ai/add-coder/templates/core/skills/add-paradigm/SKILL.md#L105) | ❌ | — |
| RPT-20260717-03 | 基础设施 / 运维 | P2 | [`templates/core/rules/project_rules.md`](file:///home/xmm/ai/add-coder/templates/core/rules/project_rules.md) | ❌ | — |
| RPT-20260717-04 | 基础设施 / 运维 | P1（边界外） | harness（VS Code Copilot / Codex） | ❌ | — |
| RPT-20260717-05 | 基础设施 / 运维 | P1 | [`templates/adapters/vscode/`](file:///home/xmm/ai/add-coder/templates/adapters/vscode) + `templates/adapters/trae/`（缺失） | ❌ | — |

> 状态：✅ 已修复 / ⚠️ 部分修复 / ❌ 仍存在
> 运行时验证：✅ 已验证 / ❌ 回退 / — 未关联运行时
> RPT-20260717-04 为**边界外条目**：责任在 harness，add-coder 无修复面，仅登记与转报（见边界判定）。

---

## 分类统计

| 分类 | P0 | P1 | P2 | P3 | 合计 |
|------|:--:|:--:|:--:|:--:|:----:|
| 安全风险 | 0 | 0 | 0 | 0 | 0 |
| 代码重复 / 架构 | 0 | 0 | 0 | 0 | 0 |
| 健壮性 / 边界 | 0 | 1 | 1 | 0 | 2 |
| 代码整洁 | 0 | 0 | 0 | 0 | 0 |
| 基础设施 / 运维 | 0 | 2 | 1 | 0 | 3 |
| **合计** | **0** | **3** | **2** | **0** | **5** |

---

## 责任分层判定（triage 依据）

Issue #6 报告的现象（并行 8+ 工具调用 → 429 → 会话瘫痪 → 反复重开对话）横跨三层，责任必须先拆开：

| 层 | 事实 | 责任归属 | 本报告条目 |
|---|---|---|---|
| 模型行为层 | 模型倾向并行调用；SKILL.md L105「必须读取全部 13 个模板」结构性制造调用风暴 | add-coder 文本可缓解 | RPT-02 / RPT-03 |
| Harness 执行层 | 429 后会话瘫痪无恢复 | Copilot / Codex harness（边界外） | RPT-04 |
| add-coder 可控执行路径 | ① **MCP server**（RPT-01，确定性格的节流）；② **四端 Hook 预读**（RPT-02 + RPT-05，在模型发起调用前从源头消灭风暴——四端全部支持 SessionStart + UserPromptSubmit，不存在"弱端"） | **add-coder** | RPT-01 / RPT-02 / RPT-05 |

核心结论已从首次 triage 的"MCP 节流兜底"升级为**双层确定性**：Hook 预读消灭模板读取风暴（RPT-02 + RPT-05）+ MCP 节流兜底其他并行调用（RPT-01）。四端全量适配 Hook——Claude Code / Qoder CN / VS Code Copilot / Trae 均支持 SessionStart 与 UserPromptSubmit，不存在需要降级到"文本分批声明"的弱端。

---

## 一、安全风险

无。

---

## 二、代码重复 / 架构问题

无。

---

## 三、健壮性 / 边界条件

### RPT-20260717-01: mcp-server.ts 无并发节流与退避重试，无法对客户端并行调用形成反压

- **文件**: [`templates/core/scripts/mcp-server.ts:143`](file:///home/xmm/ai/add-coder/templates/core/scripts/mcp-server.ts#L143)
- **严重度**: P1
- **分类**: 健壮性 / 边界
- **状态**: ❌ 仍存在
- **运行时网关关联**: 无（来源为 GitHub Issue #6，非 gateway 自动捕获）

**现象**:

客户端（IDE agent）在单次响应中并行发起 8+ 个 MCP 工具调用时，`mcp-server.ts` 对所有请求即到即处理，无并发上限、无排队、无失败退避。上游依赖（DB / 文件系统 / 网关）被限流时（如 429），错误直接透传，无重试。

**根因**:

```
// templates/core/scripts/mcp-server.ts:143（全文 3548 行）
const server = new McpServer(
  { name: "add-dev-tools", ... }
)
// grep 验证：全文 0 处 semaphore / p-limit / concurren / backoff / 429
```

**影响**:

1. 密集阶段（Step 0 模板读取、Step 3 多文件实现）的并行 MCP 调用全量直达上游，成为 429 的直接诱因之一
2. 429/瞬时失败直接透传给 harness，弱 harness（无重试恢复）随即会话瘫痪，用户被迫重开对话、重复消耗 token

**建议**:

在 `mcp-server.ts` 进程内加入信号量节流（如 `maxConcurrent = 4`，超限请求排队串行执行）。MCP 协议允许 server 延迟响应，排队即天然反压——client 并行发 10 个调用，server 慢慢答，物理上把并发压回上限。对上游依赖调用增加指数退避重试（如 3 次，250ms 起步）。零 LLM、零额外算力，且三端（Claude Code / Qoder / VS Code Copilot）同等生效。

**验证方式**:

- [ ] 单测：并行发起 10 个工具调用，观察 server 内同时在跑的 ≤ 4，其余排队完成且无失败
- [ ] 模拟上游 429/瞬时错误，确认退避重试后成功，错误不直接透传
- [ ] 三端实测：VS Code Copilot 端执行多文件 Plan Step 0，不再触发网关 429

---

### RPT-20260717-02: Step 0「必须读取全部 13 个模板」可在模型发起读取前通过四端统一 Hook 预读消灭风暴

- **严重度**: P2
- **分类**: 健壮性 / 边界
- **状态**: ❌ 仍存在
- **运行时网关关联**: 无

**现象**:

Issue 复现步骤中"Step 0 阶段并行调用 8+ 个工具"并非模型异常，而是范式文本的必然产物。

**根因**:

```
<!-- templates/core/skills/add-paradigm/SKILL.md:105 -->
> **AI 首次学习 ADD 范式时，必须读取上述全部 13 个模板文件。遗漏模板 = 遗漏范式全貌。**

<!-- SKILL.md:123 — 0.3 阅读并理解相关文档 -->
逐篇阅读命中的文档……
```

批量读取指令 + harness 系统指令普遍鼓励"最大化并行工具调用"，二者叠加 = 单响应 8~13 个并行读取是确定性结果。

**影响**:

1. Step 0 成为 429 高发段，重型模式项目每次开新 Plan 必踩
2. `find_related_docs` 命中文档的"逐篇阅读"同样缺分批约束，放大风暴

**建议**:

采用 **四端统一 SessionStart + UserPromptSubmit 双事件 Hook 预读**，在模型发起工具调用之前将模板内容直接注入上下文，消灭并行读取风暴。**不再有"文本层分批声明"降级路径**——四端全部支持所需 Hook 事件。

**四端 Hook 能力确认（2026-07-17 复审）**:

| IDE | Hook 机制 | SessionStart | UserPromptSubmit | 注入通道 | 适配文件 |
|---|------|:---:|:---:|---|---|
| Claude Code | `.claude/hooks/*.sh`（9 事件） | ✅ | ✅ | stdout → additionalContext | `prompt-submit.sh`（已有，扩展） |
| Qoder CN | `.qoder/hooks/*.sh`（v1.7.0 升级至 30+ 事件，含 SessionStart + asyncRewake） | ✅ | ✅ | stderr → 下一轮 system prompt 注入 | `prompt-submit.sh`（已有，扩展） |
| VS Code Copilot | `.github/hooks/*.json`（8 事件，官方文档已查证） | ✅ | ✅ | JSON command stdout | `preload-templates.json`（**新增分发**，见 RPT-05） |
| Trae | `hooks.json`（v3.3.66，6 事件，支持导入 Claude Code Hook） | ✅ | ✅ | stdout（与 Claude 导入兼容） | `hooks.json`（**新增分发**，见 RPT-05） |

**双事件分工**:

| 事件 | 频率 | 注入内容 | Token 成本 | 去重 |
|---|---|---|---|---|
| **SessionStart** | 每会话一次（四端均支持） | 模板索引（13 个文件名 + 一行用途描述，约 500 token） | 固定小成本，非开发会话也可接受 | 无需去重（事件本身每会话一次） |
| **UserPromptSubmit** | 每轮一次 | 命中 ADD 开发触发词时 → 注入全部 13 个模板全文 | 仅开发会话触发 | 会话级标记文件 `.qoder/.cache/tpl-injected-{session}`，注入后本会话后续轮次短路；`pre-compact.sh` 清除标记以允许重注 |

UserPromptSubmit 的触发词检测复用现有 `prompt-submit.sh` 的 ADD 关键词匹配逻辑（`开发|实施|修 bug|验收|…`），命中后直接 `cat` 模板文件注入上下文。**零 LLM、零额外算力**，风暴在模型发起任何工具调用之前就从源头消失。SKILL.md L105 增加一行提示："若 hook 已预读模板，跳过重复读取"以避免双重注入。确定性保证由 RPT-01（MCP 节流）承担兜底。

**验证方式**:

- [ ] 四端实测：SessionStart 后模板索引已注入上下文，UserPromptSubmit 命中 ADD 关键词后模板全文注入
- [ ] 实测 Step 0 模型侧并行读取调用数 = 0
- [ ] 非开发会话实测：SessionStart 轻量索引注入后无额外开销，UserPromptSubmit 不命中则短路
- [ ] 标记文件去重验证：同会话二次命中 ADD 关键词时 UserPromptSubmit 不重复注入

---

## 四、代码整洁

无。

---

## 五、基础设施 / 运维

### RPT-20260717-03: project_rules.md 缺「执行节流」规则，词汇表无对应触发词

- **文件**: [`templates/core/rules/project_rules.md`](file:///home/xmm/ai/add-coder/templates/core/rules/project_rules.md)
- **严重度**: P2
- **分类**: 基础设施 / 运维
- **状态**: ❌ 仍存在
- **运行时网关关联**: 无

**现象**:

`project_rules.md` 与 `add-governance-vocabulary.md` 全文无任何工具调用并发/节流约束（grep 验证：`并行|并发|parallel|节流|throttl` 仅命中 3 处无关条目）。

**根因**:

ADD 规则体系（ADD-0 ~ ADD-16）覆盖文档链、审计、闸门，但没有"执行期资源约束"类规则——范式假设 harness 执行永远成功。

**影响**:

1. AI 无任何文本依据自我约束并发，全靠 harness 默认行为
2. Issue 提交者建议的「执行节流」类规则在现行规则体系中无处挂靠

**建议**:

新增 **执行节流（Execution Throttling）** 规则：单次响应并行工具调用 ≤ 4；批量读取分批执行；MCP server 为确定性执行面（引用 RPT-01）。同步：优先级表（P2）、理论→实践映射表、词汇表触发词（`节流` / `并发上限` / `429`）。规则编号在实施落地时按 project_rules.md 现行序列顺延分配，本报告不预占编号。

**验证方式**:

- [ ] project_rules.md 含执行节流规则条目 + 优先级表行 + 映射表行
- [ ] 词汇表新增触发词并标注优先级
- [ ] 三端 adapters（`.claude` / `.vscode` / `.qoder`）分发件同步

---

### RPT-20260717-04: 429 后会话瘫痪、无重试恢复 —— harness 缺陷（边界外，转报）

- **文件**: harness（VS Code + GitHub Copilot / Codex），非 add-coder 代码
- **严重度**: P1（边界外）
- **分类**: 基础设施 / 运维
- **状态**: ❌ 仍存在（add-coder 无修复面）
- **运行时网关关联**: 无

**现象**:

429 是网关正常反压信号，工具调用失败后的指数退避重试是执行器本职。"会话直接瘫痪、需要反复重新发起对话"说明该 harness 对 429 无任何恢复策略——模型和 SKILL 文本都够不着这个位置。

**边界判定**:

依据 [boundary-runtime-report.md](./boundary-runtime-report.md) 的边界原则：add-coder 的强制力边界 = 分发的文本资产 + 自有 MCP server + 有 hookpoint 端的 hooks。harness 内置工具的执行调度与失败恢复在边界外。

**建议**:

1. Issue 回复中引导提交者确认 429 的具体来源（模型 API 网关 / 工具执行代理 / MCP 上游），并将"瘫痪无恢复"部分转报 Copilot / Codex 方
2. 在 add-coder 文档中沉淀「harness 能力矩阵与强制力边界」说明（弱 harness 端缺执行层控制点），后续同环境 issue 直接引用

**验证方式**:

- [ ] Issue #6 回复已说明责任分层与转报路径
- [ ] harness 能力矩阵文档已建立并被 Issue #6 链接

---

### RPT-20260717-05: add-coder Hook 体系需从 issue #6 的两个事件扩展为四家 IDE 全量事件矩阵对齐

- **文件**: [`templates/adapters/`](file:///home/xmm/ai/add-coder/templates/adapters)（`claude` + `qoder` 现有 12 脚本框架，`vscode` 缺 hooks，`trae` 整个 adapter 缺失）
- **严重度**: P1
- **分类**: 基础设施 / 运维
- **状态**: ❌ 仍存在
- **运行时网关关联**: 无

**现象**:

Issue #6 初诊时视角局限于 429 并发问题所需的两个事件（SessionStart / UserPromptSubmit 用于模板预读）。复审拉齐四家 IDE Hook 文档后，发现 add-coder 的 Hook 适配应提升到**全局视角**：add-coder 作为四家 IDE 都在关注的 Hook 参考实现（下载量 1800+，发布节奏与各家 hook 开放几乎同步），其 adapter 体系不应只是"补两个事件解决 issue #6"，而应成为**四端 Hook 事件的完整映射层**。

**四家 IDE Hook 事件全集（2026-07-17 websearch 交叉验证）**:

| # | 事件 | Claude Code | Qoder CN | VS Code Copilot | Trae | add-coder 脚本 | 建议 |
|---|------|:---:|:---:|:---:|:---:|---|---|
| 1 | **SessionStart** | ✅ | ✅ v1.7.0 | ✅ | ✅ | `session-start.sh` ✅ | 扩展：模板索引注入 |
| 2 | **SessionEnd** | ✅ | ✅ v1.7.0 | ✅ | ❌ | ❌ | **新增**：清理标记文件、审计记录 |
| 3 | **UserPromptSubmit** | ✅ | ✅ | ✅（`userPromptSubmitted`） | ✅ | `prompt-submit.sh` ✅ | 扩展：模板全文注入 |
| 4 | **PreToolUse** | ✅ | ✅ | ✅ | ✅ | `pre-tool-use.sh` ✅ | 扩展：危险命令拦截 |
| 5 | **PostToolUse** | ✅ | ✅ | ✅ | ✅ | `post-tool-use.sh` ✅ | 扩展：代码格式化 |
| 6 | PostToolUseFailure | ✅ | ✅ | ❌（合入 errorOccurred） | ❌ | `post-tool-failure.sh` ✅ | 保持 |
| 7 | **Stop** | ✅ | ✅ | ✅（`agentStop`） | ✅ | `stop-check.sh` ✅ | 扩展：验收检查 |
| 8 | StopFailure | ✅ | ❌ | ❌（合入 errorOccurred） | ❌ | ❌ | Claude 特有，P2 |
| 9 | PreCompact | ✅ | ❌ | ✅ | ❌ | `pre-compact.sh` ✅ | 保持：compact 前保存状态 |
| 10 | SubagentStart | ✅ | ✅ v1.7.0 | ✅ | ❌ | `subagent-guard.sh` ✅ | 保持 |
| 11 | SubagentStop | ✅ | ✅ v1.7.0 | ✅（`subagentStop`） | ❌ | ❌ | **新增** |
| 12 | Notification | ✅ | ✅ v1.7.0 | ❌ | ✅ | `notification.sh` ✅ | 保持 |
| 13 | PermissionRequest | ✅ | ❌ | ❌ | ❌ | `permission-gate.sh` ✅ | Claude 特有，保持 |
| 14 | PermissionDenied | ✅ | ❌ | ❌ | ❌ | ❌ | Claude 特有，P3 |
| 15 | errorOccurred | ❌ | ❌ | ✅ | ❌ | ❌ | VS Code 独有，P2 |
| 16 | ConfigChange | ✅ | ❌ | ❌ | ❌ | ❌ | Claude 特有，P3 |
| 17 | WorktreeCreate/Remove | ✅ | ❌ | ❌ | ❌ | ❌ | Claude 特有，P3 |

> **五事件基座**（粗体行）：SessionStart + UserPromptSubmit + PreToolUse + PostToolUse + Stop ——四家全部支持，add-coder 已有脚本对应但内容需扩展。这是 add-coder Hook 体系的**最低完备线**。

**四家 Hook 文档地址**:

| IDE | 文档 URL |
|---|---|
| Claude Code | https://code.claude.com/docs/zh-CN/hooks |
| Qoder CN | https://help.aliyun.com/zh/lingma/qoder-cn-update-log + https://help.aliyun.com/zh/lingma/qoderwork-cn/user-guide/hooks |
| VS Code Copilot | https://docs.github.com/zh/copilot/concepts/agents/hooks + https://vscode.js.cn/docs/agent-customization/hooks |
| Trae | https://docs.trae.cn/ide_automate-actions-with-hooks + https://docs.trae.cn/ide_hook-configuration-reference |

**根因**:

add-coder 的 Hook 体系建立在"Claude Code 协议为主、Qoder 兼容为辅"的早期假设上（12 脚本，session-start / prompt-submit / pre-tool-use / post-tool-use / stop-check / pre-compact / subagent-guard / permission-gate / notification / post-tool-failure / review-checklist / doc-format-guard）。VS Code Copilot hooks 于 2026-05-28 公开，Trae hooks 于 2026-06-12 发布，Qoder CN v1.7.0（2026-07-15）大幅扩展——三家 IDE 的 hook 事件集已经完整到需要 add-coder 做系统性适配，而非 issue-by-issue 修补。

**影响**:

1. 以 issue #6 的两个事件视角去补 adapter，会遗漏 SessionEnd、SubagentStop 等四家交集事件——这些事件同样需要 adapter 分发才能触发
2. `.vscode` adapter 缺 `.github/hooks/`、`trae` adapter 不存在——这两个 gap 不只是"预读脚本无法分发"，而是"add-coder 的整个 Hook 体系在这两端完全缺席"
3. 如果不在这次 issue 里建立全局视角，下一次有新事件需求时又会回到"补丁式修补"

**建议**:

分两期实施——第一期覆盖五事件基座 + adapter 补全（P1），第二期覆盖单端特有事件（P2/P3）。以下先给出**每个 hook 事件在 ADD 范式中的治理职能**，再据此推导各 adapter 的具体改动。

**Hook 事件 → ADD 治理职能完整映射**:

| # | 事件 | 频率 | 在 ADD 范式中的治理职能 | 脚本核心逻辑 | 覆盖端 |
|---|------|------|---|---|---|
| 1 | **SessionStart** | 每会话一次 | ① 模板索引注入：13 个模板文件名+用途注入上下文，消弭并行读取风暴（issue #6 核心）；② ADD 状态恢复：检测活跃 Plan/Step/轮次/handoff，构建上下文摘要注入模型；③ 会话级标记初始化：准备 `tpl-injected` 标记文件路径 | `session-start.sh`：detect_active_add → 注入状态摘要 + 模板索引列表 | 四端 |
| 2 | **SessionEnd** | 每会话一次 | ① 清理标记文件：删除 `tpl-injected-{session}` 防泄漏到下个会话；② 会话审计结算：汇总本轮 session 的 tool 调用次数/时长/失败数落 AuditLog；③ 异常兜底：若 Stop 未触发验收检查（agent 异常退出），此处补执行 checklist 快照 | `session-end.sh`：清理标记 + query_audit_logs 汇总 + checklist 快照兜底 | Claude / Qoder / VS Code |
| 3 | **UserPromptSubmit** | 每轮一次 | ① 触发词路由：检测 ADD P0 触发词（开发/实施/验收/Review 回流…）→ 路由到对应 Step；② 模板全文注入：命中开发关键词且本会话未注入 → 注入 13 个模板全文（issue #6 核心）；③ 输入安全审计：记录用户 prompt 摘要到 AuditLog；④ 契约确认卡位（未来）：涉及外部 API 协议时，检查 `[UNCONFIRMED]` 残留 → 阻断并引导逐项确认 | `prompt-submit.sh`：match_trigger → 路由/注入/阻断 | 四端 |
| 4 | **PreToolUse** | 每次工具调用 | ① 危险命令拦截：rm -rf / DROP TABLE / git push --force 等；② 模板路径兜底：若模型未吸收 hook 注入仍批量 Read `.qoder/templates/`，stderr 提示"模板已预读，跳过重复读取"；③ 文件写入前置守卫：Write/Edit 目标为 `.qoder/plans/` 或 `.qoder/specs/` → 检查是否有活跃 ADD Plan（无则引导创建）；④ 敏感文件保护：`.env`/`.env.production` 等读取拦截 | `pre-tool-use.sh`：按 matcher（Bash/Edit/Write/Read）分发到对应守卫逻辑 | 四端 |
| 5 | **PostToolUse** | 每次工具调用 | ① 代码格式化：文件编辑后运行 prettier/eslint；② ADD 文档结构守卫：Write 到 plans/specs/reviews 后执行 doc-format-guard（模板章节完整性、双向链接、增量修订格式）；③ 审计记录：tool 调用成功 → record_dev_operation（ADD-7）；④ 结果增强：工具输出超长时截断关键部分注入上下文 | `post-tool-use.sh`：按工具类型分发（Edit→format+guard, Bash→结果增强）→ 审计落库 | 四端 |
| 6 | PostToolUseFailure | 工具失败时 | ① 失败路径等价审计（ADD-6）：记录与成功路径等密度的审计信息（durationMs/error/stack/已处理量）；② 429 特别处理：检测到 429 → 记录次数，连续 3 次 → 建议模型切换为串行模式 | `post-tool-failure.sh`：提取 error → 构建等价审计 → 429 计数与降级建议 | Claude / Qoder |
| 7 | **Stop** | 每轮结束时 | ① 验收检查（ADD-12）：checklist [T]/[R] 项验证 + tsc --noEmit + RAHS 门禁（≥90）；② devlog 写盘：若本轮有代码变更 MCP 记录未写入 → 自动补写；③ 阻断能力：验收不通过 → exit 2 阻止 agent 结束，要求继续修复 | `stop-check.sh`：运行 checklist 验证 → tsc → RAHS → 阻断/放行 | 四端 |
| 8 | StopFailure | 异常停止时 | ① 紧急审计转储：agent 异常退出前 dump 当前 State 快照；② 标记会话为异常终止，供 SessionEnd 兜底识别 | `stop-failure.sh`：dump State + 标记异常标志 | Claude 特有 |
| 9 | PreCompact | 上下文压缩前 | ① ADD 状态保存：压缩前保存当前 Plan/Step/轮次/handoff 到标记文件，压缩后 SessionStart 可恢复；② 关键上下文导出：将活跃 spec/tasks/checklist 路径写入恢复清单 | `pre-compact.sh`：detect_active_add → 写恢复标记文件 + 上下文路径清单 | Claude / VS Code |
| 10 | SubagentStart | 子 agent 启动时 | ① ADD 上下文传递：将当前 Plan/Step/轮次/handoff 注入子 agent 的 system prompt 或环境变量；② 子 agent 审计初始化：为子 agent 分配 sub-traceId 并记录启动审计 | `subagent-guard.sh`：注入 ADD 状态 + 分配 sub-traceId | Claude / Qoder / VS Code |
| 11 | SubagentStop | 子 agent 完成时 | ① 子 agent 结果校验：检查子 agent 交付物是否符合 spec 边界（不越界、不遗漏）；② 审计聚合：将子 agent 的 sub-traceId 审计记录合并回主 traceId；③ 阻断能力：子 agent 结果不符合 spec → exit 2 要求重做 | `subagent-stop.sh`：边界校验 + 审计聚合 + 阻断 | Claude / Qoder / VS Code |
| 12 | Notification | 异步通知时 | ① 开发提醒：Review 待处理 / devlog 未写 / 长任务完成 → 桌面通知或 Slack/钉钉推送；② Token 预警：剩余 context 不足 20% → 提醒 compact | `notification.sh`：按 notification_type 分发 → 对应通知渠道 | Claude / Qoder / Trae |
| 13 | PermissionRequest | 权限请求时（Claude 特有） | ① 自动放行安全工具：Read/Grep/Glob 等只读工具自动 allow，减少手动审批打断；② 高危工具拦截：Bash(rm -rf)/Write(.env) 强制 deny；③ 可配置白名单：项目级配置允许的 Bash 命令前缀 | `permission-gate.sh`：分级决策（allow/deny/ask） | Claude 特有 |
| 14 | PermissionDenied | 权限被拒后（Claude 特有） | ① 记录拒绝原因；② 建议替代方案注入上下文（如"rm 被拒，建议用 trash 命令"） | `permission-denied.sh`：原因记录 + 替代方案注入 | Claude 特有 |
| 15 | errorOccurred | 错误发生时（VS Code 特有） | ① 错误分类：区分 429/网络/超时/工具异常；② 429 应对：连续 429 → 建议模型降级为串行模式；③ 审计记录：错误等价审计（ADD-6） | `error-occurred.sh`：错误分类 + 降级建议 + 审计 | VS Code 特有 |
| 16 | ConfigChange | 配置变更时（Claude 特有） | ① 热重载响应：settings.json 变更后重新加载 Hook 配置；② 变更审计：记录谁在什么时候改了什么配置 | `config-change.sh`：热重载 + 变更审计 | Claude 特有 |
| 17 | WorktreeCreate/Remove | git worktree 操作时（Claude 特有） | ① 环境初始化/清理：worktree 创建时注入 ADD 上下文，删除时清理临时标记文件 | `worktree-create.sh` / `worktree-remove.sh` | Claude 特有 |

> **核心原则**：add-coder 的 Hook 体系不是"IDE 事件的被动响应"，而是**ADD 范式的治理逻辑在 IDE agent 生命周期中的主动插入**。每个 hook 事件是一个治理卡位——SessionStart 是"入口上下文恢复"卡位，UserPromptSubmit 是"入站触发词路由"卡位，PreToolUse 是"出站前安全守卫"卡位，Stop 是"收敛判断"卡位。

基于此映射，本项改动量大（四端 adapter × 17 事件 × 共享脚本库），已按 `standard-plan-template.md` 生成独立 Plan：

> **[add-coder-hook-full-alignment-plan-v1.md](file:///home/xmm/ai/add-coder/.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md)**
>
> 以 5 轮次承载全部实施：轮次 1（shared 共享脚本库）→ 轮次 2（Claude Code 端，14/17 事件闭环）→ 轮次 3（Qoder CN 端，stderr 适配）→ 轮次 4（VS Code Copilot + Trae 端，新建 adapter）→ 轮次 5（收敛验证 + Issue #6 回归）。
>
> 上表 17 治理卡位为该 Plan 的 §3 架构设计输入，adapter 文件清单与轮次拆分详见 Plan §4。本 Plan 交付的不是"hook 适配"，而是 ADD 范式在四家 IDE agent 生命周期中的确定性运行。

**验证方式**（验证对象为上述 Plan 的验收标准，本 Report 不重复定义）:

- [ ] Plan 已生成并通过 Review（ADD-9 方向验证）
- [ ] Plan 关联的 Spec / Tasks / Checklist / Handoff 已按 ADD 流程闭环
- [ ] Issue #6 原始复现场景（多文件 Plan Step 0，并行 8+ 工具调用）不再触发 429

---

## 修复优先级

---

## 修复优先级

| 优先级 | Issue | 说明 |
|--------|-------|------|
| P0 立即 | — | 无 |
| P1 尽快 | RPT-20260717-01, RPT-20260717-05 | MCP server 节流 + **ADD 范式四端确定性运行**（标准 Plan: [add-coder-hook-full-alignment-plan-v1](file:///home/xmm/ai/add-coder/.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md)，5 轮次实施） |
| P2 计划 | RPT-20260717-02, RPT-20260717-03 | Hook 预读逻辑扩展 + 执行节流规则：与 RPT-05 同批发布 |
| P3 债务 | — | 无（所有事件已纳入上述 Plan 的 5 轮次，不拆分） |
| 边界外 | RPT-20260717-04 | 转报 harness 方，add-coder 侧仅文档沉淀 |

**建议执行顺序**：RPT-01（MCP 节流）→ RPT-05（通过上述 Plan 承载，5 轮次实施）→ RPT-03（规则挂靠）+ RPT-02（Hook 预读逻辑扩展，与 RPT-03/05 同批发布）→ RPT-04（issue 回复与转报，可并行）。

> **RPT-05 全局视角说明**：本次复审将 RPT-05 从"补两个事件解决 issue #6"升级为**ADD 范式在四家主流 IDE 上的确定性运行**，并以 `standard-plan-template.md` 生成独立 Plan 承载全部实施细节（§3 17 个治理卡位、§4 5 轮次拆分与依赖、§5 验收标准）。issue #6 的模板预读需求只是治理卡位 #1（SessionStart）和 #3（UserPromptSubmit）的应用场景之一。

---

## 修复趋势

| 维度 | 上次 | 本次 | 变化 |
|------|:----:|:----:|:----:|
| 安全 | — | 0 | — |
| 架构 | — | 0 | — |
| 健壮性 | — | 2 | +2 |
| 整洁 | — | 0 | — |
| 运维 | — | 3 | +3 |
| **合计** | **—** | **5** | **+5** |

> 本报告为 Issue #6 专项首次生成，无历史基线。

---

## 运行时反馈

> 以下 Issue 来自外部渠道（GitHub Issue），非 Gateway 运行时自动捕获，已进行人工 triage。

| Issue | 运行时来源 | 首次发生 | 次数 | Triage 结果 |
|-------|-----------|---------|:----:|------------|
| RPT-20260717-01 | GitHub Issue #6（复现：多文件 Plan + 并行 8+ 工具调用） | 2026-07（reporter 报告） | 复现稳定 | 确认为缺陷 → P1 |
| RPT-20260717-02 | GitHub Issue #6 根因推测第 1 条 | 同上 | — | 确认为范式文本缺口 → P2 |
| RPT-20260717-03 | GitHub Issue #6 建议方案第 1 条（执行节流规则） | 同上 | — | 接受为 enhancement → P2 |
| RPT-20260717-04 | GitHub Issue #6"会话卡死"描述 | 同上 | — | harness 缺陷 → 边界外，转报 |
| RPT-20260717-05 | 四端 adapter 审计发现（`.vscode` 缺 `.github/hooks/`，`trae` 缺失） | 2026-07-17（复审） | — | 确认为脚手架分发缺口 → P1 |
