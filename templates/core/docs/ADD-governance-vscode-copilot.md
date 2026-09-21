# ADD 范式在 VS Code Copilot 上的确定性运行

> **定位**：描述 ADD 范式如何通过 VS Code Copilot 的 Agent Hook 机制在 agent 生命周期中确定性运行。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md) | [issue-6-report](../reports/issue-6-tool-call-throttling-report.md)
> **Hook 参考**: https://docs.github.com/zh/copilot/concepts/agents/hooks | https://vscode.js.cn/docs/agent-customization/hooks
> **VS Code 版本要求**: 1.127+（Agent Hook 预览），1.129+（Agent Host 架构，支持 `.claude/settings.json`）

---

## VS Code Copilot Hook 事件模型

VS Code Copilot 支持 10 种 Agent Hook 事件（官方 8 + Cloud Agent 2）：

| 频率 | 事件 |
|---|---|
| 每会话一次 | **SessionStart**、**SessionEnd** |
| 每轮一次 | **UserPromptSubmit**、**Stop** |
| 每次工具调用 | **PreToolUse**、**PostToolUse** |
| 子 agent | **SubagentStart**、**SubagentStop** |
| 其他 | **PreCompact**、errorOccurred（Cloud Agent 专属） |

配置位置：`.vscode/hooks/*.mjs`（TS 源码 esbuild 烘焙零依赖产物，node 直调——2026-08-14 node 化实态，bash 待退役）

**关键差异 vs Claude Code**：不支持 PostToolUseFailure / StopFailure / Notification / PermissionRequest。但 **VS Code 1.129+ Agent Host 同时读取 `.claude/settings.json`**，`npx add-coder init --adapter=vscode` 会同步产出 `.claude/` 目录，双通道共享同一套 `.mjs` 产物（node 直调）。

---

## ADD 治理卡位映射

```
VS Code Copilot Agent 生命周期       ADD 治理卡位
─────────────────────────────      ─────────────────────
SessionStart ─────────────────→ ① 模板索引注入 + ADD 状态恢复
SessionEnd   ─────────────────→ ② 标记清理 + 审计结算 + Stop 兜底
UserPromptSubmit ────────────→ ③ 触发词路由 + 模板全文注入
PreToolUse   ─────────────────→ ④ 危险命令/模板路径兜底/写入前置守卫
PostToolUse  ─────────────────→ ⑤ 格式化 + 文档守卫 + 审计落库
Stop         ─────────────────→ ⑦ 验收检查 + devlog + 阻断
PreCompact   ─────────────────→ ⑨ ADD 状态保存 + 恢复清单导出
SubagentStart─────────────────→ ⑩ ADD 上下文注入子 agent + 审计初始化
SubagentStop ─────────────────→ ⑪ 子 agent 结果校验 + 审计聚合
errorOccurred ────────────────→ ⑮ 错误分类 + 429 降级 + 审计（Cloud Agent 独有）
```

> **VS Code Copilot 端不支持的卡位**：⑥→ 合入 errorOccurred；⑧ → 无 hookpoint；⑫ → 无 hookpoint；⑬⑭ → IDE 内置处理。

---

## 注入通道

VS Code Copilot 的注入通道为 **hook 配置的 `command` stdout**（node 直调 `.mjs` 产物）。

VS Code 1.129+ 的 Agent Host 架构让同一项目支持多 Agent 并行运行——Copilot、Claude Code 各走各的通道：

| 通道 | 配置位置 | 产物路径 | 说明 |
|---|---|---|---|
| **VS Code 原生** | `.vscode/hooks/` | `.vscode/hooks/*.mjs` | 14 入口 node 产物，command 直调 |
| **Agent Host (Claude)** | `.claude/settings.json` | `.claude/hooks/*.mjs` | 同一套产物，Claude Code agent 直接读取 |

```
npx add-coder init --adapter=vscode
        │
        ├──→ .vscode/hooks/*.mjs （14 入口，node 直调）
        ├──→ .vscode/settings.json （MCP 配置）
        └──→ .claude/ ★ （Agent Host 双通道，含完整 hooks + settings.json + mcp.json）
```

| 注入场景 | 触发事件 | 注入内容 | 配置 |
|---|---|---|---|
| 会话启动 | SessionStart | 模板索引 | `.vscode/hooks/session-start.mjs --index` |
| 开发触发 | UserPromptSubmit | 13 个模板全文 | `.vscode/hooks/preload-templates.mjs --full --top 5 --mark` |

---

## 路径约定

VS Code Copilot hooks 产物位于 **项目根目录** 的 `.vscode/hooks/`（14 入口 node 产物）。`npx add-coder init --adapter vscode` 会将 TS 源码烘焙分发到此路径；Agent Host（1.129+）同时读取 `.claude/` 双通道。

**Issue #6 背景**：本端的 429 并发问题是最初触发源。轮次 1 优先交付 `session-start` + `user-prompt-submit` 两个入口，仅这两个即可消灭模板读取风暴（429 不再触发）。

---

## 端差异汇总

| 维度 | VS Code Copilot | Claude Code |
|---|---|---|
| 配置格式 | `.vscode/hooks/*.mjs`（command 直调） | `.claude/settings.json` |
| 注入通道 | command stdout | stdout → additionalContext |
| 产物路径 | `.vscode/hooks/*.mjs`（与 Claude 共享治理层） | `.claude/hooks/*.mjs` |
| 独有事件 | errorOccurred | PermissionRequest/Denied / StopFailure / Notification / PostToolUseFailure |
| 子 agent 启动 | ✅ SubagentStart | ✅ SubagentStart |
| Agent Host 双通道 | ✅ `.claude/` 同步产出 | — |

---

## 工具可见性：VirtualTools 折叠（VS Code 用户必配项）

> **一句话**：Copilot Chat 会在**所有 MCP 服务器的工具总数**越过阈值时把部分工具"折叠"成代理，未激活就调用会稳定误报 `currently disabled by the user`。必配项一劳永逸关掉折叠；降级流程用于尚未改设置的存量会话。
> **证据来源**：[GitHub Issue #21](https://github.com/xiaomingming92/add-coder/issues/21)（含源码级根因定位与请求级工具快照对比）。

### VS Code 用户必配项：关闭虚拟工具折叠

把下面这行加进 **用户级 `settings.json`** 或 **工作区级 `.vscode/settings.json`**（二选一即可）：

```json
"github.copilot.chat.virtualTools.threshold": 0
```

已有 `settings.json` 的话，直接粘这一行进大括号内即可；从零建文件的完整形态：

```json
{
  "github.copilot.chat.virtualTools.threshold": 0
}
```

**设置语义**：

| 项 | 值 |
|---|---|
| 归属 | GitHub Copilot Chat 扩展注册的实验设置（不在 VS Code core 设置里） |
| 类型 / 取值域 | `number`，`0`–`128` |
| 默认值 | `128` |
| 设为 `0` 的含义 | 阈值 = ∞ ⇒ **虚拟工具折叠整体禁用** ⇒ 全部工具始终直连 |

**触发条件（务必看清口径）**：折叠的判定基准是 **所有 MCP 服务器的工具总数 ≥ `threshold/2`**，默认即 **≥ 64 个工具**——**不是**单个服务器的工具数。

- add-coder 自身注册 **47** 个工具；
- 叠加常见扩展（Pylance 19 个、Java Debug、Python 等）后**必然越线**；
- 因此任何 VS Code + Copilot Chat 用户都会遇到，与是否只装了 add-coder 无关。

**生效方式**：改完设置后 **需重载 VS Code 窗口**（`Ctrl/Cmd+Shift+P` → `Developer: Reload Window`，或关闭重开）。只重开会话、或 reload 扩展都不会生效。

**自查**：在 VS Code 项目下执行

```bash
npx add-coder status
```

未配置时会输出缺键告警与修复指引（只报告，不写你的设置文件）。

### 工具假禁用的降级流程

**症状**（未配置必配项时）：

```
ERROR: Tool mcp_<server>_<name> is currently disabled by the user, and cannot be called.
```

> ⚠️ **这是误报**：你从未在 UI 里禁用任何工具。真实原因是该工具被折叠进虚拟工具代理，而代理尚未被激活。

**处置三步**：

1. 在**当前会话的工具列表**里找描述含 `Contains the tools:` 字样的 `activate_fallback_*` 代理（形如 `activate_fallback_mcp_add-dev-tools_get_memory_1`）；
2. 调用该代理 —— 返回文本会以 `Tools activated: ...` 列出它携带的成员工具；
3. 重试原先失败的目标工具（本会话内有效）。

> ⚠️ **代理名会变，勿缓存**：代理名由「折叠段首个工具名 + 树编号」拼成，会随会话槽位重算而**重构**（实测同一环境从 `get_memory` 组变为 `get_hook_events` 组，旧名字随即失效）。**每次都以当前工具列表为准**，不要把代理名写进脚本、提示词或笔记里复用。

**受影响的治理工具族**（折叠按字母序裁掉后 N-1 个，治理工具恰好集中在字母序后半段）：

| 工具族 | 具体工具 | 断链后果 |
|---|---|---|
| Plan 追踪 | `plan_track` / `plan_status` / `plan_sync` | 进度不落库、`tasks.md` 勾选无法同步 |
| Review 追踪 | `review_track` / `review_status` / `review_sync` | P0/P1 缺陷无法入库与回写 |
| 状态与人机审核 | `status_hitl` / `update_hitl` / `render_hitl_approval` | **审批无法落库** → TONGYI 哨兵不生成 → Plan/Review 写入被 PreToolUse 阻断 |
| 审计链 | `record_dev_operation` / `query_audit_logs` | **ADD-7 开发操作审计断链**、稀疏推理恢复失效 |
| 上下文与记忆 | `get_project_context` / `get_memory` | 会话恢复与记忆召回不可用 |
| 关键字面 | `plan_*` / `review_*` / `status_*` / `update_*` | 上述族名的共同前缀，可用于快速判断"是不是折叠误伤" |

**降级流程与必配项的关系**：降级流程是**临时手段**（仅本会话有效，下次开窗又要重新激活）；必配项是**根治**（一次配置，全部工具始终直连）。生产/日常使用请配置必配项。

### 附录：为什么这是宿主问题（可据此向上游反馈）

本问题**不是 add-coder 的实现缺陷**：折叠由 Copilot Chat 扩展自身的虚拟工具分组机制（源码内 `VirtualToolGrouper`，可通过 bundle 中 `Contains the tools:` 字样定位）触发；同为受害者的还有 **Pylance**（19 个工具中 14 个被折叠）、**Java Debug**、**Python** 等官方或知名扩展 —— 属宿主通用行为。

可向上游反馈两点：

1. **错误文案具误导性**：`disabled by the user` 会让用户去 UI 里找一个根本不存在的"禁用开关"，而真实原因是虚拟工具折叠未激活；建议文案区分"用户禁用"与"折叠未激活"两种状态。
2. **折叠机制会命中 MCP 服务器的治理关键工具**：折叠按字母序裁剪，审批 / 审计类工具（`update_hitl` / `record_dev_operation` / `query_audit_logs` 等）恰好落在被裁区间，对大工具集 MCP 服务器造成可用性影响；建议折叠策略至少保证关键工具直连，或提供显式开关。

---

## 自定义 Hook 源切换

VS Code Copilot 的 `.vscode/hooks/*.mjs` 为 VS Code 原生 node 产物（14 入口）。项目同时产出 `.claude/` 目录（含 Claude Code 完整 hook 体系 + settings.json），两套体系可切换。

### 两套体系对比

| 维度 | `.vscode/hooks/`（默认） | `.claude/hooks/`（备选） |
|---|---|---|
| 适配 IDE | VS Code Copilot | Claude Code（Agent Host / CLI） |
| 事件覆盖 | 10 个（VS Code 全事件） | 14 个（Claude 全事件，含 Notification/PermissionRequest/StopFailure） |
| 环境变量 | `$PWD`（VS Code cwd=项目根） | `$CLAUDE_PROJECT_DIR` |
| 退出码阻断 | ✅ exit 2（与 Claude 相同） | ✅ exit 2 |
| 上下文注入 | stdout 纯文本（VS Code 格式） | stdout → additionalContext（Claude 格式） |
| 共享治理层 | ✅ core governance 内联（0 复制） | ✅ core governance 内联（0 复制） |
| 治理能力 | 完整四路守卫 + 验收阻断 + 审计 | 完整四路守卫 + 验收阻断 + 审计（与 VS Code 版同等） |

> **两套实现质量同等，能力完整，差异仅在于环境变量和输出格式。**

### 切换方式

编辑 hook 配置（settings.json / Agent Host 通道），将 `command` 中的路径从 `.vscode/hooks/` 改为 `.claude/hooks/` 即可：

```json
// 默认（VS Code 原生，推荐）
"command": "node .vscode/hooks/pre-tool-use.mjs"

// 切换为 Claude Code 体系（如果同时使用 Claude Code 并希望统一产物）
"command": "node .claude/hooks/pre-tool-use.mjs"
```

**切换场景建议**：
- 只用 VS Code Copilot → 保持默认 `.vscode/hooks/`
- VS Code + Claude Code 混用 → 切到 `.claude/hooks/` 统一脚本（Copilot 会同时加载两套来源，但脚本幂等）
- 只用 Claude Code CLI → 不需要改 JSON，直接走 `.claude/settings.json`

---
