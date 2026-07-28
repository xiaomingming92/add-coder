# ADD 范式在 Claude Code 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Claude Code 的 Hook 机制在 agent 生命周期中确定性运行。面向 add-coder 用户和贡献者，说明每个 hook 事件的治理职能和注入通道。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md) | [issue-6-report](../.qoder/reports/issue-6-tool-call-throttling-report.md)
> **Hook 参考**: https://code.claude.com/docs/zh-CN/hooks
> **目录**: Hook 事件模型 · ADD 治理卡位 · 注入通道 · Claude 独有治理 · HITL 人机审核交互

| 章节 | 内容 |
|------|------|
| [Claude Code Hook 事件模型](#claude-code-hook-事件模型) | 17 种事件及频率 |
| [ADD 治理卡位映射](#add-治理卡位映射) | agent 生命周期 → ADD 卡位 |
| [注入通道](#注入通道) | stdout / stderr / exit code |
| [Claude Code 独有治理能力](#claude-code-独有治理能力) | Permission / StopFailure / ConfigChange |
| [HITL 人机审核交互](#hitl-人机审核交互) | caijuehub 配置驱动的 inputRequired 弹框 |

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

---

## HITL 人机审核交互

Claude Code 使用 MCP 标准 **inputRequired.elicit()** 弹框完成 HITL 审批交互。

```
create_hitl / update_hitl
  │
  ▼  hitl.ts 读取 caijuehub 配置
hitl-interaction-rules.toml: [claude] mode = "inputRequired"
  │
  ▼
inputRequired.elicit() 弹框
  ├─ 逐项决策模式（有 dimensions）
  └─ 简单三按钮模式（同意/驳回/取消）
  │
  ▼
用户选择 → 写 DB + 哨兵文件
```

交互模式由 caijuehub 统一管理：`src/caijuehub/hitl-interaction-rules.toml` → `npm run generate` → hitl.ts 薄壳消费。

> Qoder CN 使用 genui widget 聊天内嵌审批面板，详见 [ADD-governance-qoder-cn.md](./ADD-governance-qoder-cn.md)。
