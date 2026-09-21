# ADD 范式在 Claude Code 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Claude Code 的 Hook 机制在 agent 生命周期中确定性运行。面向 add-coder 用户和贡献者，说明每个 hook 事件的治理职能和注入通道。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md) | [issue-6-report](../reports/issue-6-tool-call-throttling-report.md)
> **Hook 参考**: https://code.claude.com/docs/zh-CN/hooks

---

## Claude Code Hook 事件模型

Claude Code 支持 17 种事件，按频率分三档：

| 频率 | 事件 |
|---|---|
| 每会话一次 | SessionStart、SessionEnd |
| 每轮一次 | UserPromptSubmit、Stop、StopFailure |
| 每次工具调用 | PreToolUse、PostToolUse、PostToolUseFailure、PermissionRequest、PermissionDenied |
| 其他 | PreCompact、SubagentStart、SubagentStop、Notification、ConfigChange、WorktreeCreate/Remove |

配置位置：`.claude/hooks/*.mjs`（TS 源码 esbuild 烘焙零依赖产物）+ `.claude/settings.json`（command 直调 node）——2026-08-14 hook node 化实态，bash 待退役

---

## ADD 治理卡位映射

```
Claude Code Agent 生命周期          ADD 治理卡位
─────────────────────────────      ─────────────────────
SessionStart ─────────────────→ ① 模板索引注入 + ADD 状态恢复
SessionEnd   ─────────────────→ ② 标记清理 + 审计结算 + Stop 兜底
UserPromptSubmit ────────────→ ③ 触发词路由 + 模板全文注入 + 契约卡位
PreToolUse   ─────────────────→ ④ 危险命令/模板路径兜底/写入前置守卫
PostToolUse  ─────────────────→ ⑤ 格式化 + 文档守卫 + 审计落库
PostToolUseFailure ───────────→ ⑥ 失败等价审计(ADD-6) + 429 降级
Stop         ─────────────────→ ⑦ 验收检查 + devlog + 阻断
StopFailure  ─────────────────→ ⑧ 紧急审计转储 + 异常标记
PreCompact   ─────────────────→ ⑨ ADD 状态保存 + 恢复清单导出
SubagentStart ────────────────→ ⑩ 子 agent 上下文传递 + 审计初始化
SubagentStop ─────────────────→ ⑪ 子 agent 结果校验 + 审计聚合
Notification ─────────────────→ ⑫ 开发提醒/Token 预警
PermissionRequest ────────────→ ⑬ 分级决策(allow/deny/ask)
PermissionDenied ─────────────→ ⑭ 拒绝原因记录 + 替代方案
```

---

## 注入通道

Claude Code 的注入通道为 **stdout → additionalContext**——hook 脚本的 stdout 输出会自动作为额外上下文注入模型。

| 注入场景 | 触发事件 | 注入内容 | Token 成本 |
|---|---|---|---|
| 会话启动 | SessionStart | 模板索引（13 个文件名 + 一行用途） | ~500 token |
| 开发触发 | UserPromptSubmit（首次命中 ADD 关键词） | 13 个模板全文 | 依模板总量 |
| 去重 | UserPromptSubmit（同会话后续命中） | 短路跳过（tpl-injected 标记文件） | 0 |

---

## 完整生命周期数据流

```
┌──────────────────────────────────────────────────────┐
│                   Claude Code 会话                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  SessionStart                                        │
│  ├─ detect_active_add() 扫描 plans/ 恢复 ADD 状态    │
│  ├─ preload-templates.mjs --index                     │
│  └─ stdout → additionalContext 注入                  │
│        │                                             │
│        ▼                                             │
│  UserPromptSubmit                                    │
│  ├─ match_trigger() 检测 ADD 触发词                  │
│  ├─ 首次命中 → preload-templates.mjs --full            │
│  ├─ touch tpl-injected 标记                          │
│  └─ 同会话二次命中 → 短路                             │
│        │                                             │
│        ▼                                             │
│  ┌──── 工具调用循环 ────┐                            │
│  │ PreToolUse            │                            │
│  │ ├─ Bash → 危险命令拦截│                            │
│  │ ├─ Write → 写入前置守卫│                           │
│  │ └─ Read → 模板路径兜底 │                           │
│  │       │               │                            │
│  │   [工具执行]           │                            │
│  │       │               │                            │
│  │ PostToolUse            │                            │
│  │ ├─ Edit → 格式化+文档守卫│                         │
│  │ └─ record_dev_operation│                           │
│  └────────────────────────┘                           │
│        │                                             │
│        ▼                                             │
│  Stop（可阻断）                                       │
│  ├─ checklist 验证 + tsc + RAHS                      │
│  ├─ 不通过 → exit 2 阻断                             │
│  └─ 通过 → devlog + exit 0                           │
│        │                                             │
│        ▼                                             │
│  PreCompact                                          │
│  ├─ 保存 ADD 状态到标记文件                           │
│  └─ rm tpl-injected（允许重注）                       │
│        │                                             │
│        ▼                                             │
│  SessionEnd                                          │
│  ├─ rm tpl-injected 清理                              │
│  ├─ query_audit_logs 汇总                             │
│  └─ Stop 未触发兜底                                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Claude Code 独有治理能力

| 事件 | 能力 |
|---|---|
| PermissionRequest | 自动放行 Read/Grep/Glob，拦截 rm -rf/DROP TABLE |
| PermissionDenied | 记录拒绝原因 + 建议替代方案 |
| StopFailure | 异常退出前紧急 dump State |
| ConfigChange | settings.json 热重载 + 变更审计 |

---

## HITL 面板与工具预算（宿主能力适配）

> **时效声明**：以下为 **2026-09-21** 的实测与官方文档口径。宿主行为会变——升级 Claude Code 后请按来源链接重新核对。

### 面板能力：不渲染 MCP Apps

| 项 | 结论 |
|---|---|
| MCP Apps（SEP-1865 `ui://` 资源） | **不渲染**：工具用 `_meta.ui.resourceUri` 绑定 UI 时，仍只返回文本结果，UI 被丢弃 |
| 来源 | 官方 issue [anthropics/claude-code#95149](https://github.com/anthropics/claude-code/issues/95149)（2026-09-17，label `area:mcp`）；[MCP Apps 客户端矩阵](https://modelcontextprotocol.io/extensions/client-matrix) 未列 Claude Code |

**降级链（审批走这条）**：

```
render_hitl_approval({ planName, type })
   ├─ ui.resourceUri  → 本端丢弃（不渲染）
   └─ fallback
        ├─ markdownPath  → {magicDir}/plans/**/*.hitl.md   ← 打开逐维确认
        └─ htmlPath      → {magicDir}/hitl/*-round<N>.html ← 浏览器/文件面板打开
                ▼ 人工裁决
        update_hitl({ planName, type, status: "TONGYI|BOHUI" })  ← 写哨兵 + 落库
```

> 面板缺失**不等于**审批链断裂：`update_hitl` 是工具调用，与 widget 是否渲染无关。

### 工具预算：延迟加载，不是禁用

| 项 | 口径 |
|---|---|
| 机制 | **MCP tool search 默认开启**：工具定义按需加载，会话启动只加载工具名与 server instructions |
| 固定上限 | **无固定 per-server 工具上限**；实际约束是上下文预算 |
| 配置 | `ENABLE_TOOL_SEARCH`：未设（全部延迟）/ `true` / `auto`（定义总量 < 10% 上下文时前载）/ `auto:N` / `false`（全部前载） |
| 治理工具常驻 | `.mcp.json` 中该 server 设 `"alwaysLoad": true`；或按工具粒度在 `_meta` 设 `"anthropic/alwaysLoad": true` |

**硬限制（直接影响治理工具可用性）**：

| 限制 | 值 | 后果 |
|---|---|---|
| 工具描述截断 | 2KB | 描述过长时关键 WHEN 被截掉，工具更难被检索到 |
| server instructions 截断 | 2KB | 同上，关键信息必须前置 |
| MCP 输出上限 | 默认 25k token | 超出落盘为文件，模型按需读取（审计大结果会走这条） |

### 排错

| 现象 | 根因 | 处置 |
|---|---|---|
| 治理工具"找不到" | 工具定义被延迟加载 | 让模型用 ToolSearch 按名检索；高频工具改 `alwaysLoad` |
| 审批只看得到文本 | 本端不渲染 MCP Apps | 打开 `fallback.markdownPath` 确认后 `update_hitl` |
| 工具描述/约束被吞 | 2KB 截断 | 把 WHEN 前移或精简描述 |
