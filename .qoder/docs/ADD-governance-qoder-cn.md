# ADD 范式在 Qoder CN 上的确定性运行

> **定位**：描述 ADD 范式如何通过 Qoder CN 的 Hook 机制在 agent 生命周期中确定性运行。
> **关联文档**：[add-coder-hook-full-alignment-plan-v1](../.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md)
> **Hook 参考**: https://help.aliyun.com/zh/lingma/qoder-cn-update-log

---

## Qoder CN Hook 事件模型

Qoder CN v1.7.0（2026-07-15）升级至 30+ 事件。以下为 ADD 治理覆盖的 10 个核心事件：

| 频率 | 事件 |
|---|---|
| 每会话一次 | SessionStart（v1.7.0 新增）、SessionEnd（v1.7.0 新增） |
| 每轮一次 | UserPromptSubmit、Stop |
| 每次工具调用 | PreToolUse、PostToolUse、PostToolUseFailure |
| 其他 | SubagentStart（v1.7.0 新增）、SubagentStop（v1.7.0 新增）、Notification（v1.7.0 新增） |

配置位置：`.qoder/hooks/*.sh` + `.qoder/settings.json`

**关键差异**：Qoder CN 不支持 PreCompact / PermissionRequest / PermissionDenied / StopFailure / ConfigChange / Worktree——这些 Claude Code 独有事件在 Qoder 端无对应 hookpoint，相关脚本不编译到 Qoder adapter。

---

## ADD 治理卡位映射

```
Qoder CN Agent 生命周期             ADD 治理卡位
─────────────────────────────      ─────────────────────
SessionStart ─────────────────→ ① 模板索引注入 + ADD 状态恢复
SessionEnd   ─────────────────→ ② 标记清理 + 审计结算 + Stop 兜底
UserPromptSubmit ────────────→ ③ 触发词路由 + 模板全文注入（增量插入 Layer 1/2/3）
PreToolUse   ─────────────────→ ④ 危险命令/模板路径兜底/写入前置守卫
PostToolUse  ─────────────────→ ⑤ 格式化 + 文档守卫 + 审计落库
PostToolUseFailure ───────────→ ⑥ 失败等价审计(ADD-6) + 429 降级
Stop         ─────────────────→ ⑦ 验收检查 + devlog + 阻断（RAHS 不可用时降级为基础检查）
SubagentStart ────────────────→ ⑩ 子 agent 上下文传递 + 审计初始化
SubagentStop ─────────────────→ ⑪ 子 agent 结果校验 + 审计聚合
Notification ─────────────────→ ⑫ 开发提醒/Token 预警
```

> **Qoder 端不支持的卡位**：⑧（StopFailure）→ 无 hookpoint；⑨（PreCompact）→ 无 hookpoint；⑬⑭（权限）→ 由 Qoder IDE 内置权限系统处理。

---

## 注入通道

Qoder CN 的注入通道为 **stderr → 下一轮 system prompt 注入**。这与 Claude Code 的 stdout 直接注入不同——stderr 内容不会即时进入当前轮上下文，而是在模型下一轮响应前由 Qoder IDE 自动注入 system prompt。

| 注入场景 | 触发事件 | 注入内容 | 通道 |
|---|---|---|---|
| 会话启动 | SessionStart | 模板索引 + ADD 状态 | stderr → 下一轮 system prompt |
| 开发触发 | UserPromptSubmit（首次命中） | 13 个模板全文 | stderr → 下一轮 system prompt |
| 去重 | UserPromptSubmit（同会话后续命中） | 短路跳过 | — |

**重要约束**：Qoder 端 `prompt-submit.sh` 已有 73 行完善的触发词路由系统（Layer 1 精准 P0 触发词 → Layer 2 开发关键词检测 → Layer 3 活跃 ADD 状态注入 + 验收幂等保护）。模板全文注入逻辑以**增量方式**插入 Layer 2 之后，禁止覆盖现有分流逻辑。

---

## 端差异汇总

| 维度 | Claude Code | Qoder CN |
|---|---|---|
| 注入通道 | stdout → additionalContext | stdout → additionalContext（JSON hookSpecificOutput） |
| PreCompact | ✅ | ❌ |
| 权限系统 | PermissionRequest/Denied hook | IDE 内置权限弹窗 |
| StopFailure | ✅ | ❌ |
| 独有特性 | ConfigChange / Worktree | asyncRewake（v1.7.0）+ if 条件匹配 |

---

## 调试与排错

### Hook 日志路径

Qoder CN IDE 的 hook 执行遥测日志位于 `~/.qoder-cn/logs/latest/`。当 hook 脚本通过 stdout 输出 `hookSpecificOutput.additionalContext` JSON 时，IDE 会在日志中记录：

```
UserPromptSubmit hook additional context: ADD workflow active. ...
```

这是验证 additionalContext 是否成功注入的**唯一确定性证据**——日志有这行 = 注入成功。

### 常见排错清单

| 现象 | 根因 | 修复 |
|---|---|---|
| hook 注册了但不执行 | `command` 缺少 `bash` 前缀 | settings.json 所有 command 加 `bash` 前缀 |
| hook 执行但 stdout 未被注入 | 纯文本不被 IDE 解析为 additionalContext | 改用 JSON 格式：`{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}` |
| 脚本 exit 0 但没有输出 | `VOCABULARY_FILE` 用了 `$PWD`，hook 运行时 cwd 不是项目根 | 改为 `${PROJECT_DIR:-$PWD}` |
| `detect_active_add` 返回空 | `PROJECT_DIR` 在 `source lib/vocabulary.sh` 之后才设置 | `export PROJECT_DIR` 移到所有 `source` 语句之前 |
| additionalContext 有时注入有时不注入 | 注入代码在 Layer 1 之后——P0 触发词匹配后 `exit 0` 跳过了注入 | 将 additionalContext 注入移到 Layer 1 之前 |

### 关键设计决策

1. **`PROJECT_DIR` 必须最先设置**：所有 `source lib/*.sh` 之前，因为被 source 的脚本可能依赖 `${PROJECT_DIR}` 定位文件
2. **additionalContext 放在入口最前**：在任何 `exit` 分支之前，确保所有代码路径都能注入上下文
3. **Stop/PreToolUse 不用 JSON**：中断/阻断类输出走 stderr 纯文本，不走 stdout JSON
