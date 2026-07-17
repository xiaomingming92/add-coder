# Tasks: add-coder Hook 体系四端对齐

> **验证规范**：每个 Task 完成时附带验证证据。本 Plan 为纯模板资产（shell + JSON），以 `bash -n` 替代 tsc，以 `python3 -m json.tool` 替代 eslint。

## Preconditions

- [x] Plan 已生成（`add-coder-hook-full-alignment-plan-v1.md`）
- [x] Spec 已就绪（`spec.md`）

## Forbidden

- 禁止修改 add-coder 的 src/ 核心逻辑、CLI 渲染器、npm 包构建流程
- 禁止覆盖 Qoder 端 `prompt-submit.sh` 的 Layer 1/2/3 分流逻辑
- 禁止修改 add-coder 自身的 `.qoder/` `.claude/` `.add/` `.vscode/` magicDir

## Tasks

### 轮次 1: shared 共享脚本库 + VS Code 基础 hooks

- [x] Task 1.1: common.sh 工具函数抽象 — 验证: `bash -n` 语法检查 ✅ (10 function definitions)
  - [x] 从 `templates/adapters/qoder/hooks/lib/` 提取 `detect_active_add` 函数
  - [x] 提取 `match_trigger` 函数
  - [x] 提取 `parse_input` 函数
  ~~提取 `build_audit_json` 函数 [2026-07-17 修订: MCP 调用不在 hook 脚本层实现，移除~~
  - [x] 确保函数签名与 qoder/lib 中一致，可直接替换 source 路径
- [x] Task 1.2: preload-templates.sh — 验证: `bash -n` ✅ + `--index`/`--full`/`--top N`/`--mark` 四参数悉实现（grep 命中 12 处）
  - [x] 实现 `--index` 模式：列出 templates/core/templates/ 下所有 .md 文件 + 一行用途
  - [x] 实现 `--full` 模式：cat 全部模板文件内容
  - [x] 实现 `--top N` 参数：限制输出 N 个最常用模板
  - [x] tpl-injected 标记文件逻辑：`--full` 模式执行后 touch 标记文件，`--index` 不产生标记
- [x] Task 1.3: session-end.sh + subagent-stop.sh — 验证: `bash -n` 两脚本通过 ✅
  - [x] session-end.sh：rm tpl-injected 标记 + query_audit_logs 汇总 + checklist 快照兜底
  - [x] subagent-stop.sh：spec 边界校验 + 审计聚合 + exit 2 阻断
- [x] Task 1.4: VS Code 基础 hooks JSON — 验证: `python3 -m json.tool` ✅ ~~→ 实际产出 10 JSON（含 subagent-start + session-end），超出原定 2 个 [2026-07-17 修订: VS Code 官方 8 事件全注册~~
  - [x] session-start.json：注册 SessionStart 事件，command → shared/preload-templates.sh --index
  - [x] user-prompt-submit.json：注册 UserPromptSubmit 事件，command → shared/preload-templates.sh --full + tpl-injected 标记
- [ ] Task 1.5: VS Code 端基础实测 — 需 VS Code IDE 端验证
  - [ ] SessionStart 测试：新会话启动后模型上下文含模板索引
  - [ ] UserPromptSubmit 测试：命中开发关键词 → 全文注入 + 标记落盘
  - [ ] 二次触发测试：同会话再次命中关键词 → 短路跳过（标记文件已存在）
~~→ 增加 Task 1.6（renderer）[2026-07-17 修订: Review P1 #9 renderer 遗漏回流至 tasks]~~
- [x] Task 1.6: core renderer SKIP_DIRS `[回流: Review P1 #9]` — 验证: `npx tsc --noEmit` ✅
  - [x] `src/core/renderer.ts`：`SKIP_DIRS` 新增 `shared`

### 轮次 2: Claude Code 端

- [x] Task 2.1: 6 核心脚本扩展 — 验证: `bash -n` 每脚本全部通过 ✅
  - [x] session-start.sh：source common.sh → detect_active_add + preload-templates.sh --index
  - [x] prompt-submit.sh：match_trigger → 开发关键词命中 + tpl-injected 检查 → preload-templates.sh --full
  - [x] pre-tool-use.sh：新增模板路径兜底（Read .qoder/templates/ → stderr 提示）、文件写入前置守卫
  - [x] post-tool-use.sh：新增 ADD 文档结构守卫（doc-format-guard 调用）、审计 record_dev_operation
  - [x] stop-check.sh：checklist 验证 + tsc --noEmit + RAHS 门禁 + devlog 自动补写
  - [x] pre-compact.sh：detect_active_add → 保存状态 + 导出恢复清单 → rm tpl-injected 标记
- [x] Task 2.2: 4 新脚本 — 验证: `bash -n` 每脚本全部通过 ✅
  - [x] session-end.sh：source shared/session-end.sh
  - [x] subagent-stop.sh：source shared/subagent-stop.sh
  - [x] stop-failure.sh：紧急 dump State + 异常标记
  - [x] permission-denied.sh：拒绝原因记录 + 替代方案注入
- [ ] Task 2.3: Claude Code 端实测 — 需 Claude Code IDE 端验证
  - [ ] SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop 全部触发
  - [ ] 验收阻断测试：checklist 未通过 → stop-check.sh exit 2
  - [ ] PermissionRequest 自动放行测试
~~→ 增加 Task 2.4（Claude renderer）[2026-07-17 修订: Review P1 #9]~~
- [x] Task 2.4: Claude adapter renderer `[回流: Review P1 #9]` — 验证: `npx tsc --noEmit` ✅，dry-run 确认 22 文件产出
  - [x] `src/adapters/claude/renderer.ts`：增加 `shared/` 行走 → `hooks/lib/`

### 轮次 3: Qoder CN 端

- [x] Task 3.1: 8 脚本适配 — 验证: `bash -n` 每脚本全部通过 ✅
  - [x] session-start.sh：stdout JSON additionalContext 注入 + 模板索引
  - [x] prompt-submit.sh：★ 增量插入（保留 Layer 1/2/3），stdout JSON additionalContext
  - [x] pre-tool-use.sh / post-tool-use.sh / stop-check.sh：治理逻辑扩展
  - [x] session-end.sh / subagent-stop.sh / notification.sh：薄包装适配
- [x] Task 3.2: Qoder CN 端实测 — 验证: additionalContext 注入成功 ✅（`~/.qoder-cn/logs/latest/` 确认 "UserPromptSubmit hook additional context"），Layer 1/2/3 分流不退化
  - [x] Layer 1/2/3 分流逻辑回归：验收幂等保护不退化（`~/.qoder-cn/logs/latest/` 确认注入）
  - [x] 增量插入分支测试：模板注入 + tpl-injected 标记 + 短路
~~→ 增加 Task 3.3（Qoder renderer）[2026-07-17 修订: Review P1 #9]~~
- [x] Task 3.3: Qoder adapter renderer `[回流: Review P1 #9]` — 验证: `npx tsc --noEmit` ✅
  - [x] `src/adapters/qoder/renderer.ts`：增加 core/hooks/lib/ 行走 → hooks/lib/

### 轮次 4: VS Code Copilot 端

- [x] Task 4.1: VS Code 10 JSON + 10 独立 hook 脚本 — 验证: `python3 -m json.tool` ✅ + `bash -n` 全部通过 ✅ ~~→ 原定 6 JSON，实际产出 10（新增 subagent-start + session-end + VS Code 独立 10 脚本）[2026-07-17 修订~~
  - [x] pre-tool-use.json / post-tool-use.json / stop-check.json
  - [x] pre-compact.json / subagent-stop.json / error-occurred.json
  - [x] 10 独立 hook 脚本（session-start / prompt-submit / pre-tool-use / post-tool-use / stop-check / pre-compact / session-end / subagent-guard / subagent-stop / post-tool-failure）
- [x] Task 4.3: VS Code adapter renderer `[回流: Review P1 #9]` — 验证: `npx tsc --noEmit` ✅，dry-run 确认 `.github/hooks/` 10 JSON 在项目根
  - [x] `src/adapters/vscode/renderer.ts`：`.github/` 子目录特殊处理 + `shared/` 行走


- [x] Task 6.1: `npx add-coder init` 四端分发验证 — 验证: coder-test dry-run 四端全部通过（claude 22 / qoder 24 / vscode 28 / trae 6 文件）✅ (2026-07-17)
  - [x] `--adapter claude`：22 文件正确分发
  - [x] `--adapter qoder`：24 文件正确分发
  - [x] `--adapter vscode`：.github/hooks/ 目录 + 10 JSON 正确分发
  - [x] `--adapter trae`：hooks.json + settings.json 正确分发
- [ ] Task 6.2: 四端五基座全触发回归 — 需各 IDE 端实测
- [ ] Task 6.3: Issue #6 回归 — 需各 IDE 端实测

## Task Dependencies

```
Task 1.1 (common.sh)
  ├─→ Task 1.2 (preload-templates.sh)
  ├─→ Task 1.3 (session-end.sh + subagent-stop.sh)
  │     ├─→ Task 2.2 (Claude 新脚本)
  │     ├─→ Task 3.1 (Qoder 适配)
  │     └─→ Task 4.1/4.2 (VS Code/Trae)
  │
  ├─→ Task 1.2 ──→ Task 1.4 (VS Code 基础 hooks) ──→ Task 1.5 (VS Code 基础实测)
  │
  └─→ Task 2.1 (Claude 核心扩展) ──→ Task 2.3 (Claude 实测)
         │
         └─→ Task 3.1 (Qoder 以 Claude 版本为模板) ──→ Task 3.2 (Qoder 实测)
                                                           │
         Task 1.4 ──→ Task 4.1 (VS Code 全量) ──────────┤
         Task 1.1 ──→ Task 4.2 (Trae)                    │
                                                           │
         ┌────────────────────────────────────────────────┘
         ▼
       Task 6.1 (四端分发验证) → Task 6.2 (回归) → Task 6.3 (Issue #6 回归)
```

## Verification

- [ ] 全部 33 文件 `bash -n` 通过（shell 脚本）
- [ ] 全部 JSON 文件 `python3 -m json.tool` 通过
- [ ] `npx add-coder init` 四端分发完整
- [ ] Issue #6 回归通过
