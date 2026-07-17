# add-coder Hook 体系四端对齐 — 6 轮原子事务交接手册

> **父 Plan**: [add-coder-hook-full-alignment-plan-v1.md](./add-coder-hook-full-alignment-plan-v1.md)
> **原子事务拓扑**: [add-coder-hook-full-alignment-add-route-v1.md](./add-coder-hook-full-alignment-add-route-v1.md)
> **仓库**: add-coder npm 包源码 | **总文件数**: 约 60 个 | **轮次数**: 6 轮 | **DPS**: 100 🟢

## 全局元信息

```text
第1轮 shared ── 4 共享脚本 + VS Code 基础 JSON
            │
            ▼
第2轮 Claude ── 14 脚本全事件闭环
            │
       ┌────┴────┐
       ▼         ▼
第3轮 Qoder   第4轮 VS Code
  8 脚本      10 脚本 + 10 JSON
       │         │
       └────┬────┘
            ▼
第5轮 Trae ── renderer + hooks.json
            │
            ▼
第6轮 收敛 ── Qoder 泄漏修复 + 治理文档分发 + DPS=100
```

---

## 原子事务边界说明

每轮以 IDE 端为单位划分，轮次级闭包——该轮文件不被其他轮回头修改。第 6 轮不是前 5 轮的补丁，而是 Qoder 专属文件泄漏修复 + 治理文档分发 + DPS 收敛。

### 交接手册与 spec 的优先级

本 handoff 是新对话入口索引；具体实现以 .qoder/specs/add-coder-hook-full-alignment/ 下 spec.md、tasks.md、checklist.md 为准。

---

## <第N轮> 第 1 轮 shared：共享脚本库

上游: 无 | 产出: templates/core/hooks/lib/ 下 4 脚本 + VS Code 基础 2 JSON

| 文件 | 操作 | 关键 |
|------|------|------|
| templates/core/hooks/lib/common.sh | 新建 | detect_active_add(含magicDir回退)+parse_input+json_get+dev_action+stop_context+check_completeness |
| templates/core/hooks/lib/preload-templates.sh | 新建 | --index/--full/--top N/--mark |
| templates/core/hooks/lib/session-end.sh | 新建 | 标记清理+审计汇总+Stop兜底 |
| templates/core/hooks/lib/subagent-stop.sh | 新建 | 边界校验+审计聚合+exit2 |
| templates/adapters/vscode/.github/hooks/session-start.json | 新建 | VS Code SessionStart |
| templates/adapters/vscode/.github/hooks/user-prompt-submit.json | 新建 | VS Code UserPromptSubmit |
| src/core/renderer.ts | 修改 | SKIP_DIRS新增shared [回流:P1#9] |

✅ bash -n / json.tool / tsc 全通过

---

## <第N轮> 第 2 轮 Claude Code：14 脚本

上游: 第1轮 | 产出: 6扩展+4新建+renderer行走=16脚本

| 文件 | 操作 |
|------|------|
| templates/adapters/claude/hooks/session-start.sh | 改: detect_active_add+preload-templates --index |
| templates/adapters/claude/hooks/prompt-submit.sh | 改: 触发词+模板注入+去重 |
| templates/adapters/claude/hooks/pre-tool-use.sh | 改: 四路守卫(Bash/Write/Read)+exit2 |
| templates/adapters/claude/hooks/post-tool-use.sh | 改: 文档守卫+审计 |
| templates/adapters/claude/hooks/stop-check.sh | 改: 四象限验收+exit2阻断 |
| templates/adapters/claude/hooks/pre-compact.sh | 改: 状态保存+tpl清理 |
| templates/adapters/claude/hooks/session-end.sh | 新: 薄包装→lib |
| templates/adapters/claude/hooks/subagent-stop.sh | 新: 薄包装→lib |
| templates/adapters/claude/hooks/stop-failure.sh | 新: 紧急dump |
| templates/adapters/claude/hooks/permission-denied.sh | 新: 拒绝+替代 |
| src/adapters/claude/renderer.ts | 改: core/hooks/lib行走[回流:P1#9] |

✅ bash -n 16脚本全通过 / tsc

---

## <第N轮> 第 3 轮 Qoder CN：8 脚本

上游: 第1,2轮 | 产出: stdout JSON additionalContext注入（实测通过）

| 文件 | 操作 |
|------|------|
| templates/adapters/qoder/hooks/session-start.sh | 改: stdout JSON additionalContext |
| templates/adapters/qoder/hooks/prompt-submit.sh | ★改: 增量插入(保留Layer1/2/3)+stdout JSON |
| templates/adapters/qoder/hooks/pre-tool-use.sh | 改: 四路守卫+exit2 |
| templates/adapters/qoder/hooks/post-tool-use.sh | 改: 文档守卫+审计 |
| templates/adapters/qoder/hooks/stop-check.sh | 改: 四象限验收 |
| templates/adapters/qoder/hooks/session-end.sh | 新: 薄包装 |
| templates/adapters/qoder/hooks/subagent-stop.sh | 新: 薄包装 |
| templates/adapters/qoder/hooks/notification.sh | 改: source路径更新 |
| src/adapters/qoder/renderer.ts | 改: core/hooks/lib行走[回流:P1#9] |

✅ ~/.qoder-cn/logs/latest/ 确认 additionalContext注入成功

---

## <第N轮> 第 4 轮 VS Code Copilot：10 脚本 + 10 JSON

上游: 第1,2轮 | 产出: 10JSON+10独立完整脚本(363行)+renderer统一重构

| 文件 | 操作 |
|------|------|
| templates/adapters/vscode/.github/hooks/ 10个.json | 新/改: 含session-end+subagent-start, → .vscode/hooks/ |
| templates/adapters/vscode/hooks/ 10个.sh | ★新: VS Code独立完整hook脚本 |
| templates/adapters/vscode/settings.json | 改: npx→tsx, 路径fix |
| src/core/renderer.ts | 改: 新增renderAdapterBase统一行走器[回流:P1#9] |
| src/adapters/vscode/claude/qoder/renderer.ts | 重构: 薄包装 |
| src/cli/commands/init.ts | 改: VS Code同步产.claude/(Agent Host双通道) |
| ADD-governance-vscode-copilot.md | 改: 10事件+双通道+切源指南 |

✅ bash -n / json.tool / tsc / dry-run 28文件

---

## <第N轮> 第 5 轮 Trae：renderer + hooks.json

上游: 第1-4轮 | 产出: 薄包装renderer+hooks.json+init.ts注册

| 文件 | 操作 |
|------|------|
| src/adapters/trae/renderer.ts | ★新: renderAdapterBase(.trae) |
| templates/adapters/trae/hooks.json | 新: 注册6事件(五基座+Notification) |
| templates/adapters/trae/settings.json | 新: 空占位 |
| src/cli/commands/init.ts | 改: ADAPTER_RENDERERS/MAGIC_DIR_MAP注册trae+magicDir透传 |

✅ tsc / dry-run 6文件

---

## <第N轮> 第 6 轮 收敛：泄漏修复+治理文档+DPS=100

上游: 五轮全部完成 | 产出: Qoder文件清理+五magicDir guard+治理文档分发项目根

| 文件 | 操作 |
|------|------|
| templates/core/hooks/lib/state-detect.sh | 删: Qoder专属硬编码. qoder |
| templates/core/hooks/lib/vocabulary.sh | 删: 同上 |
| templates/core/hooks/lib/context-inject.sh | 删: 同上 |
| templates/core/hooks/doc-format-guard.sh | 改: .qoder→.(qoder|claude|add|vscode|trae) |
| templates/core/docs/ADD-governance-*.md | 新: 四端治理文档模板 |
| src/core/renderer.ts | 改: docs/→项目根 |
| README.md | 改: 表更新(VS Code 9→10,Trae 7→6) |
| checklist.md | 验收: [T][E]全[x],[R]四端分发[x],Qoder注入[x] |
| tasks.md | 验收: 15/19 [x],4 IDE实测保留未勾选 |
| add-route | 验收: Step8 handoff更新 |

✅ DPS=100 🟢 四维满分

---

## 每轮收敛判定补充规则

checklist全部项已勾选且每项有可验证证据。收敛声明只能由开发者或Review AI做出。

---

## 附录：每轮启动模板

```text
你在执行 add-coder Hook 四端对齐 [第N轮]/6。
上游第1~N-1轮已完成。
读 .qoder/plans/2026-07/17/add-coder-hook-full-alignment-handoff-v1.md <第N轮>。

启动: session-init → add-paradigm → spec.md → tasks.md → checklist.md
验证: bash -n / json.tool / tsc --noEmit
禁止: 改自身 .qoder/ / 删 Qoder Layer1/2/3 / 空勾选
每文件修改后: record_dev_operation → query_audit_logs 回查
```

---

### 脱敏要求

本 handoff 不包含数据库密码、API Key、JWT 密钥等凭据值。
