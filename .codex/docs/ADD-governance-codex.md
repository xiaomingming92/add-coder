# ADD 范式在 Codex 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Codex 的 Hook 机制在 agent 生命周期中确定性运行。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md)
> **Hook 参考**: https://www.runoob.com/codex/codex-hooks.html | Codex 设置 → 导入其他 agent 配置

---

## Codex Hook 事件模型

Codex 支持 6 种 Hook 事件：

| 频率 | 事件 |
|---|---|
| 每会话一次 | SessionStart |
| 每轮一次 | UserPromptSubmit、Stop |
| 每次工具调用 | PreToolUse、PostToolUse |
| 异步 | Notification |

配置位置：项目级 `.codex/hooks.json`（或 `~/.codex/hooks.json` 全局）

**关键差异**：Codex 不支持 SessionEnd / PreCompact / SubagentStart / SubagentStop / PostToolUseFailure / StopFailure。但 **支持导入 Claude Code Hook 配置**（设置 → 导入其他 agent 配置 → 选择 Claude Code），可通过 Claude 通道获得完整 14 事件体系。`npx add-coder init --adapter=codex` 同步产出 `.claude/` 目录。

---

## ADD 治理卡位映射

```
Codex Agent 生命周期                ADD 治理卡位
─────────────────────────────      ─────────────────────
SessionStart ─────────────────→ ① 模板索引注入 + ADD 状态恢复
UserPromptSubmit ────────────→ ③ 触发词路由 + 模板全文注入
PreToolUse   ─────────────────→ ④ 危险命令/模板路径兜底/写入前置守卫
PostToolUse  ─────────────────→ ⑤ 格式化 + 文档守卫 + 审计落库
Stop         ─────────────────→ ⑦ 验收检查 + devlog + 阻断
Notification ─────────────────→ ⑫ 开发提醒/Token 预警
```

> **Codex 端不支持的卡位**：②（SessionEnd）→ 无 hookpoint；⑥（PostToolUseFailure）→ 无 hookpoint；⑧⑨⑩⑪⑬⑭⑮ → 无 hookpoint。

---

## 注入通道

Codex 的注入通道为 **stdout**（与 Claude Code 兼容）。Codex 支持导入 Claude Code Hook 配置，可通过双通道架构获得完整治理：

- **Codex 原生**（5 事件，`.codex/hooks.json` → `.codex/hooks/*.mjs` node 直调——2026-08-14 node 化实态，bash 待退役）
- **Claude Code 导入**（11 事件，`.claude/settings.json` → `.claude/hooks/*.mjs`）——Codex 设置中开启「导入其他 agent 配置」即可。同一套产物，两通道共享，脚本内置幂等保护。

```
npx add-coder init --adapter=codex
        │
        ├──→ .codex/hooks.json （5 事件 → .codex/hooks/*.mjs）
        ├──→ .codex/settings.json
        └──→ .claude/ ★ （含完整 11 事件 hooks + settings.json + mcp.json）
```

| 注入场景 | 触发事件 | 注入内容 | 通道 |
|---|---|---|---|
| 会话启动 | SessionStart | 模板索引 + ADD 状态 | stdout |
| 开发触发 | UserPromptSubmit | 13 个模板全文 | stdout |

---

## 端差异汇总

| 维度 | Codex | Claude Code |
|---|---|---|
| 事件数 | 5 (原生) / 11 (导入 Claude) | 17 |
| 配置格式 | `.codex/hooks.json` | `.claude/settings.json` |
| Claude Hook 导入 | ✅ 原生支持（导入其他 agent 配置） | — |
| 全局 Hook | `~/.codex/hooks.json` | `~/.claude/settings.json` |
| SessionEnd | ❌ | ✅ |
| PreCompact | ❌ | ✅ |
| 权限系统 | PreToolUse 可阻断 | PermissionRequest/Denied |

---

## HITL 审批面板：三前提与降级路径

> **定位**：ADD 的 HITL 审批在 Codex 上走 **MCP Apps core widget**（`render_hitl_approval` 打开审批面板，面板回调 `update_hitl(_use_widget=true)` 落库）。面板打不开是本端最高频的卡点，原因**只有三种**——按顺序排查即可。
> **触发来源**：`render_hitl_approval` 的返回中已固化这三条排查项（返回文本 + `structuredContent.ui.requiresHostFlag` + `structuredContent.stale`）。

### 前提 ①：宿主实验开关 `enable_mcp_apps`

Codex 对 MCP Apps 的渲染能力挂在实验开关后面。**未开启时面板必然报 `This app couldn't be loaded`**，且与是哪个 MCP server 无关（任何 MCP Apps widget 都打不开）。

- 开关路径：Codex 的 `/experimental` → `enable_mcp_apps`；
- 也可写在 `~/.codex/config.toml` 的 `[features]` 段：`enable_mcp_apps = true`；
- 开启后**需重启 Codex 客户端**才生效；
- 工具侧标识：`render_hitl_approval` 返回 `ui.requiresHostFlag: "experimental.enable_mcp_apps"`。

> **不为该开关增加看门狗（反向约束）**：它是宿主的**实验旗标**，同族还有 `mcp_2026_07_28` / `codex_apps_mcp_2026_07_28` 等处于演进期的名字，随时可能改名或摘除；且开关可由 GUI 切换、持久化位置不稳定，做文件检测极易在"用户其实已开启"时误报。**运行时如实上报（`requiresHostFlag`）+ 本节文档**已覆盖同等职责——不要把它做成常驻检查项。

### 前提 ②：改过工具元数据 / 资源 URI 后必须重连 MCP server

MCP Apps 的组件绑定发生在 `tools/list` 解析工具定义 `_meta.ui.resourceUri` 时。因此**只要改过工具元数据或 widget 资源 URI，就必须重连（重启）MCP server**，否则宿主仍按旧元数据取件。

- 工具侧标识：`render_hitl_approval` 返回 `stale.stale: true` 时，说明**当前 server 进程启动早于产物更新**，返回文本会明确提示"需重启"；
- 典型场景：改过 `hitl-approval-widget.html`、改过 `_meta.ui.resourceUri` 的生成逻辑、或升级 add-coder 模板后未重启 server；
- 处置：重启 Codex（或让 Codex 重连该 MCP server），然后重新调用 `render_hitl_approval`。

> 资源 URI 本身是**内容哈希**（基名 `ui://add-coder/hitl-approval` + widget 内容 sha256 前 8 位，见 `shared/hitl-ui.ts::getHitlApprovalWidgetUri()`）：改 HTML/JS/CSS 会自动换 URI，避免宿主命中旧组件缓存。若 URI 已变而面板仍打不开，回到前提 ①。

### 前提 ③：降级路径（面板不可用时的唯一正解）

面板打不开**不代表 HITL 流程阻断**——提案与裁决都有非 UI 通道：

| 环节 | 降级通道 |
|---|---|
| 提案审阅 | `render_hitl_approval` 返回的 `fallback.markdownPath`（`{magicDir}/plans/{YYYY-MM}/{DD}/*.hitl.md` 提案文件）与 `fallback.htmlPath`（`{magicDir}/hitl/*.html` 静态审批页） |
| 人类拍板 | 人类在对话中给出裁决后，以 `update_hitl({ planName, type, status: "TONGYI"｜"BOHUI", reason?, _fallback: true })` 落库（写哨兵 + 更新 HitlRecord）；`_fallback` 跳过弹框，**裁决语义仍由人类决定**，不得由 AI 自行替代 |
| 状态查询 | `status_hitl({ planName, type })` 返回最新 round 状态，与 `.hitl-tongyi-*` 哨兵构成双通道校验 |

> **红线**：降级不等于"绕过审批"。仍然必须由人类给出同意/驳回，AI 只负责把该裁决如实落库；`BOHUI` 后需 `create_hitl` 新建 round 重新发起，不得复用上一轮结论。
