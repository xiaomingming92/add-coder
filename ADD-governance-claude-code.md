# ADD 范式在 Claude Code 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Claude Code 的 Hook 机制在 agent 生命周期中确定性运行。面向 add-coder 用户和贡献者，说明每个 hook 事件的治理职能和注入通道。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md) | [issue-6-report](../.qoder/reports/issue-6-tool-call-throttling-report.md)
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

配置位置：`.claude/hooks/*.sh` + `.claude/settings.json`

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
│  ├─ preload-templates.sh --index                     │
│  └─ stdout → additionalContext 注入                  │
│        │                                             │
│        ▼                                             │
│  UserPromptSubmit                                    │
│  ├─ match_trigger() 检测 ADD 触发词                  │
│  ├─ 首次命中 → preload-templates.sh --full            │
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
