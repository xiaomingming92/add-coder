# ADD 范式在 Trae 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Trae 的 Hook 机制在 agent 生命周期中确定性运行。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md)
> **Hook 参考**: https://docs.trae.cn/ide_automate-actions-with-hooks | https://docs.trae.cn/ide_hook-configuration-reference

---

## Trae Hook 事件模型

Trae v3.3.66（2026-06-12）支持 6 种 Hook 事件：

| 频率 | 事件 |
|---|---|
| 每会话一次 | SessionStart |
| 每轮一次 | UserPromptSubmit、Stop |
| 每次工具调用 | PreToolUse、PostToolUse |
| 异步 | Notification |

配置位置：项目级 `hooks.json`（通过 设置 > Hooks 管理，或直接编辑 JSON 文件）

**关键差异**：Trae 不支持 SessionEnd / PreCompact / SubagentStart / SubagentStop / PostToolUseFailure / StopFailure。但 **支持导入 Claude Code Hook 配置**（`.claude/settings.json`），可通过 Claude 通道获得完整 14 事件体系。`npx add-coder init --adapter=trae` 同步产出 `.claude/` 目录。

---

## ADD 治理卡位映射

```
Trae Agent 生命周期                ADD 治理卡位
─────────────────────────────      ─────────────────────
SessionStart ─────────────────→ ① 模板索引注入 + ADD 状态恢复
UserPromptSubmit ────────────→ ③ 触发词路由 + 模板全文注入
PreToolUse   ─────────────────→ ④ 危险命令/模板路径兜底/写入前置守卫
PostToolUse  ─────────────────→ ⑤ 格式化 + 文档守卫 + 审计落库
Stop         ─────────────────→ ⑦ 验收检查 + devlog + 阻断
Notification ─────────────────→ ⑫ 开发提醒/Token 预警
```

> **Trae 端不支持的卡位**：②（SessionEnd）→ 无 hookpoint；⑥（PostToolUseFailure）→ 无 hookpoint；⑧⑨⑩⑪⑬⑭⑮ → 无 hookpoint。

---

## 注入通道

Trae 的注入通道为 **stdout**（与 Claude Code 兼容）。Trae 支持导入 Claude Code Hook 配置，因此 `prompt-submit.mjs` 和 `session-start.mjs` 的 stdout 输出方式与 Claude Code 端一致（2026-08-14 node 化实态，bash 待退役）。

| 注入场景 | 触发事件 | 注入内容 | 通道 |
|---|---|---|---|
| 会话启动 | SessionStart | 模板索引 + ADD 状态 | stdout |
| 开发触发 | UserPromptSubmit | 13 个模板全文 | stdout |

---

## 端差异汇总

| 维度 | Trae | Claude Code |
|---|---|---|
| 事件数 | 6 (原生) / 11 (导入 Claude) | 17 |
| 配置格式 | `hooks.json` | `.claude/settings.json` |
| Claude Hook 导入 | ✅ 原生支持 | — |
| SessionEnd | ❌ | ✅ |
| PreCompact | ❌ | ✅ |
| 权限系统 | 无 hookpoint | PermissionRequest/Denied |

---

## 工具预算与 HITL 降级（宿主能力适配）

> **时效声明**：以下为 **2026-09-21** 官方文档口径。来源：[Troubleshoot general issues](https://docs.trae.ai/ide/troubleshoot-general-issues)。

### 工具预算：输入长度包含「全部 MCP 工具」

官方排障文档「Chat functionality exceptions caused by excessively long input」明确：输入长度包含下列全部内容——

1. 输入框内容
2. 自定义 agent 的 prompt
3. **该 agent 所用 MCP server 的全部工具定义**
4. 用户规则 + 项目规则

| 现象 | 后果 |
|---|---|
| 总长度超限 | **聊天功能异常（问题发不出去）**、问答质量下降 |
| 官方建议 | 精简提问 / agent prompt / MCP 工具 / 规则；或切换模型 |

> **口径提醒**：add-coder 工具族 40+ 个，但**没有**"工具数 > N 即中断"的公开阈值——约束对象是**总长度**，不要写成固定工具数。

**裁剪指引（按需选）**：

| 手段 | 做法 | 代价 |
|---|---|---|
| 按 server 取舍 | 业务任务只挂业务 server，治理任务只挂 add-coder | 单会话内无法混用两类工具 |
| 精简描述 | 工具描述只留「做什么 + 何时用」，长示例移到文档 | 需要维护描述预算 |
| 拆分挂载 | 建两个 agent（治理 / 业务），各自挂载所需工具 | 需要在 agent 间切换 |
| 缩短规则 | 临时折叠与本次任务无关的项目规则段落 | 规则可发现性下降 |

### HITL 降级

Trae 不渲染 MCP Apps widget ⇒ 与 Claude Code 同一条降级链：

```
render_hitl_approval → fallback.markdownPath（{magicDir}/plans/**/*.hitl.md）
                     → 人工逐维确认 → update_hitl（写哨兵 + 落库）
```

> 审批链依赖**工具调用**，不依赖 Hook：Trae 原生 6 事件里缺的卡位（SessionEnd / PostToolUseFailure 等）不影响 HITL 落库与 ADD-7 审计。
