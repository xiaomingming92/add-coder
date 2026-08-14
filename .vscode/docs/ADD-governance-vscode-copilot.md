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
