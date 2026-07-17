# Checklist: add-coder Hook 体系四端对齐

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> 本 Plan 为纯模板资产（shell + JSON），以 `bash -n` 替代 TSC，以 `python3 -m json.tool` 替代 ESLint。

## 一、语法与格式门禁

- [x] [T] 全部 shell 脚本 `bash -n` 通过 — 证据: `for f in $(find templates/adapters -name '*.sh'); do bash -n "$f" || echo "FAIL: $f"; done` → ✅ ALL PASS (2026-07-17)
- [x] [T] 全部 JSON 文件 `python3 -m json.tool` 通过 — 证据: `for f in $(find templates/adapters -name '*.json'); do python3 -m json.tool "$f" > /dev/null || echo "FAIL: $f"; done` → ✅ ALL PASS (2026-07-17)

## 二、文件完整性

- [x] [E] shared 共享脚本库 4 文件齐全 — 证据: `ls templates/core/hooks/lib/*.sh | wc -l` = 4（common.sh / preload-templates.sh / session-end.sh / subagent-stop.sh）
- [x] [E] Claude Code 端 16 脚本齐全 — 证据: `ls templates/adapters/claude/hooks/*.sh | wc -l` = 16
- [x] [E] Qoder CN 端 14 脚本齐全 — 证据: `ls templates/adapters/qoder/hooks/*.sh | wc -l` = 14（含 permission-gate/review-checklist/doc-format-guard/subagent-guard，不含 lib/）~~→ 11 [2026-07-17 修订: 实际14脚本，checklist原计11缺少session-end/subagent-stop/notification~~
- [x] [E] VS Code Copilot 端 10 JSON 齐全 — 证据: `ls templates/adapters/vscode/.github/hooks/*.json | wc -l` = 10 ~~→ 8 [2026-07-17 修订: 新增 subagent-start.json + session-end.json，VS Code 官方 8 事件 + Cloud Agent 2 事件~~
- [x] [E] Trae 端适配文件齐全 — 证据: `ls templates/adapters/trae/hooks.json templates/adapters/trae/settings.json` → 两文件悉存在

- [x] [E] VS Code 端独立 hook 脚本齐全 — 证据: `ls templates/adapters/vscode/hooks/*.sh | wc -l` = 10 ~~→ 新增 [2026-07-17 修订: VS Code adapter 独立维护完整 hook 脚本，不再依赖 core templates 精简版~~

- [ ] [R] SessionStart 模板索引注入 — 证据: 四端新会话后模型上下文含模板文件名列表
- [ ] [R] UserPromptSubmit 模板全文注入 — 证据: 四端命中开发关键词后模型上下文含全部模板全文
- [ ] [R] UserPromptSubmit 去重 — 证据: 同会话二次命中关键词后不重复注入（tpl-injected 标记短路）
- [ ] [R] PreToolUse 模板路径兜底 — 证据: 模型批量 Read templates/ 时 stderr 提示"模板已预读"
- [ ] [R] PreToolUse 危险命令拦截 — 证据: rm -rf / DROP TABLE 被拦截
- [ ] [R] PostToolUse ADD 文档结构守卫 — 证据: Write plans/specs/ 后 doc-format-guard 触发
- [ ] [R] Stop 验收阻断 — 证据: checklist 未通过时 exit 2 阻止 agent 结束
- [ ] [R] SessionEnd 标记清理 — 证据: 会话结束后 tpl-injected 标记文件已删除
- [x] [R] Qoder prompt-submit.sh Layer 1/2/3 不退化 — 证据: 本会话实测 `~/.qoder-cn/logs/latest/` 确认 additionalContext 注入成功，Layer 1 触发词匹配 + Layer 2/3 分流正常 (2026-07-17)

## 四、跨端验证

- [x] [R] `npx add-coder init --adapter claude` 分发完整 — 证据: coder-test dry-run 产出 22 文件 (2026-07-17)
- [x] [R] `npx add-coder init --adapter qoder` 分发完整 — 证据: coder-test dry-run 产出 24 文件 (2026-07-17)
- [x] [R] `npx add-coder init --adapter vscode` 分发完整 — 证据: coder-test dry-run 产出 28 文件 + 10 JSON 正确落位（含 subagent-start.json + session-end.json）(2026-07-17)
- [x] [R] `npx add-coder init --adapter trae` 分发完整 — 证据: coder-test dry-run 产出 6 文件，hooks.json + settings.json 正确落位 (2026-07-17)

## 五、Issue #6 回归

- [ ] [R] VS Code Copilot 端多文件 Plan Step 0 — 证据: 模板读取调用数 = 0
- [ ] [R] 无 429 — 证据: 并行 8+ 工具调用场景无网关限流
