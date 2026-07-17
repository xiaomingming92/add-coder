# ADD 范式在 Trae 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Trae 的 Hook 机制在 agent 生命周期中确定性运行。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md)
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

Trae 的注入通道为 **stdout**（与 Claude Code 兼容）。Trae 支持导入 Claude Code Hook 配置，因此 `prompt-submit.sh` 和 `session-start.sh` 的 stdout 输出方式与 Claude Code 端一致。

| 注入场景 | 触发事件 | 注入内容 | 通道 |
|---|---|---|---|
| 会话启动 | SessionStart | 模板索引 + ADD 状态 | stdout |
| 开发触发 | UserPromptSubmit | 13 个模板全文 | stdout |

---

## 端差异汇总

| 维度 | Trae | Claude Code |
|---|---|---|
| 事件数 | 0 (原生) / 14 (导入 Claude) | 17 |
| 配置格式 | `hooks.json` | `.claude/settings.json` |
| Claude Hook 导入 | ✅ 原生支持 | — |
| SessionEnd | ❌ | ✅ |
| PreCompact | ❌ | ✅ |
| 权限系统 | 无 hookpoint | PermissionRequest/Denied |
