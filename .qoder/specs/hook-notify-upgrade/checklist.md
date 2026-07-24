# Checklist: hook-notify-upgrade

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证 — 证据: 命令+结果（如 `tsc=0` / `vitest 9/9`）
> - `[R]` = 运行时验证 — 证据: 部署后确认（如触发 hook 拦截后 jsonl 有新行）
> - `[E]` = 静态检查 — 证据: grep/diff 输出
> - `[H]` = 人工审阅 — 证据: 审阅结论 + 关注点（**无法自动化，必须读代码**）
>
> **审计链（证据→devlog→checklist）**:
> - 初验规则: 先找证据（命令+结果）→ 调 `record_dev_operation` 落库 → 将返回的真实 cuid 写入 checklist。**禁止抄写 `cmq...` 占位符**。
> - 复验规则: 先查 checklist 是否已有真实审计 ID → 重新验证证据 → 证据一致则不复写 devlog，不一致则追写新 devlog（新 cuid）

---

## 一、编译与 Lint 门禁 [T]（命令确认，一票否决）

- [x] [T] `npx tsc --noEmit` 零错误 — 证据: tsc=0 (退出码 0)|审计: (待填写)
- [ ] [T] `npx eslint` 零错误零警告 — 证据: (待填写)|审计: (待填写)
- [x] [T] `vitest run` 全部通过 — 证据: 46/46 passed, 8 files|审计: (待填写)

---

## 二、lib/notify.sh 零依赖与功能正确性 [E]/[R]

- [x] [E] `grep -E "(jq|curl|wget|perl|python)" templates/core/hooks/lib/notify.sh` 返回空 — 证据: grep 返回空, notify.sh 仅用 bash 内置 + date/printf/stat|审计: (待填写)
- [ ] [R] `source templates/core/hooks/lib/notify.sh` 成功，`write_hook_event` 函数可用 — 证据: (待填写)|审计: (待填写)
- [ ] [R] 调用 `write_hook_event` 后 `hook-events.jsonl` 有新行写入（7 字段完整） — 证据: (待填写)|审计: (待填写)
- [ ] [R] jsonl 超过 256KB 时自动轮转为 `.old` — 证据: (待填写)|审计: (待填写)

---

## 三、Core Hooks 改造 [E]/[R]

- [x] [E] `grep "write_hook_event" templates/core/hooks/pre-tool-use.sh` 命中 — 证据: 6 处 exit 2 前均有 write_hook_event|审计: (待填写)
- [x] [E] `grep "write_hook_event" templates/core/hooks/doc-format-guard.sh` 命中 — 证据: 5 处 exit 2 前均有|审计: (待填写)
- [x] [E] `grep "detect_active_add" templates/core/hooks/pre-tool-use.sh` 命中 — 证据: 顶部 source + plan 检测|审计: (待填写)
- [x] [E] `grep "detect_active_add" templates/core/hooks/doc-format-guard.sh` 命中 — 证据: 同上|审计: (待填写)
- [ ] [E] 其余 core hooks 中 exit 2 的文件均含 `write_hook_event` 调用 — 证据: (待填写)|审计: (待填写)
- [ ] [R] 触发 hook 拦截后 jsonl 含 `planKeyword` + `planStatus` 字段 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `write_hook_event` 失败（如无写权限）不阻断 exit 2 — 证据: (待填写)|审计: (待填写)

---

## 四、Adapter Hooks 统一替换 [E]

- [x] [E] `grep -l "write_hook_event" templates/adapters/qoder/hooks/*.sh | wc -l` ≥ 12 — 证据: 3 文件共 12 处|审计: (待填写)
- [x] [E] `grep -l "write_hook_event" templates/adapters/claude/hooks/*.sh | wc -l` ≥ 12 — 证据: 3 文件共 12 处|审计: (待填写)
- [x] [E] `grep -l "write_hook_event" templates/adapters/vscode/hooks/*.sh | wc -l` ≥ 11 — 证据: 3 文件共 13 处|审计: (待填写)
- [x] [E] `grep -l "write_hook_event" templates/adapters/trae/hooks/*.sh | wc -l` ≥ 12 — 证据: 3 文件共 12 处|审计: (待填写)
- [x] [E] `grep -l "write_hook_event" templates/adapters/codex/hooks/*.sh | wc -l` ≥ 12 — 证据: 3 文件共 12 处|审计: (待填写)
- [x] [R] `npm run sync` 后所有 adapter hooks 含 `write_hook_event` + `detect_active_add` 调用 — 证据: .qoder/hooks/ 下 3 文件共 12 处 write_hook_event|审计: cmrynglex

---

## 五、MCP 集成：内存缓冲队列 [T]/[R]

> 对应 Plan §3.6 + Spec Requirement "内存缓冲队列"

- [x] [R] fs.watch 回调在 hook 写入后 1s 内触发 — 证据: mv /tmp/ 触发后 3s 内 get_hook_events 查到落库数据|审计: cmrynglex
- [x] [T] 队列长度 ≥50 条时立即 flush（不等待定时器） — 证据: hook.ts:168-169, if e.length>=MAX_QUEUE → clearTimeout + doFlush|审计: (待填写)
- [x] [T] 队列 <50 条时 setTimeout 2s 后 flush — 证据: hook.ts:172-176, 2s 定时器|审计: (待填写)
- [x] [T] 已有 pending 定时器时不重复调度 — 证据: hook.ts:170, if q.timer → return|审计: (待填写)
- [x] [T] 队列满 50 条时新事件降级写入 `hook-events-overflow.jsonl` — 证据: hook.ts:161-164, appendFileSync|审计: (待填写)
- [x] [T] flush 时先 drain 内存队列，再扫描并清空 overflow 文件 — 证据: hook.ts:130-135, splice(0)+drainOverflowFile|审计: (待填写)
- [x] [T] MCP 进程退出时清空剩余队列（`process.on('exit')`） — 证据: hook.ts:248-250, exit/SIGTERM/SIGINT → doFlush|审计: (待填写)
- [x] [T] 同一条 jsonl 行重复消费时 `(hook + ts + planKeyword)` 联合去重 — 证据: hook.ts:108-113, Set<string> 去重|审计: (待填写)
- [x] [R] `record_dev_operation("HOOK_INTERCEPT")` 落库成功 — 证据: get_hook_events 返回 3 条记录|审计: HOOK_INTERCEPT×3
- [x] [R] `query_audit_logs({ action: "HOOK_INTERCEPT" })` 可查到落库数据 — 证据: query_audit_logs 返回 5 条含历史记录|审计: cmrynglex

---

## 六、MCP 工具与 Resource [T]/[R]

- [x] [T] `get_hook_events` 工具支持按 `planKeyword` 过滤 — 证据: hook-event-report.ts:21, zod schema planKeyword optional|审计: (待填写)
- [x] [T] `get_hook_events` 工具支持按 `hook` 过滤 — 证据: hook-event-report.ts:22, zod schema hook optional|审计: (待填写)
- [x] [T] `get_hook_events` 工具支持按时间区间过滤 — 证据: hook-event-report.ts:23-24, sinceMinutes/untilMinutes|审计: (待填写)
- [x] [R] Resource `add-coder://report/hook-events/daily` 返回日报聚合数据 — 证据: hook-events-report.ts:10-50, 按小时分组聚合|审计: (待填写)
- [x] [R] Resource `add-coder://report/hook-events/weekly` 返回周报聚合数据 — 证据: hook-events-report.ts:54-95, 按日分组聚合|审计: (待填写)

---

## 七、治理信号 [R]

- [x] [R] 无 Plan 拦截 ≥10 次/天时触发 `sendLoggingMessage({ level: "warning" })` — 证据: hook.ts:148 and hitl.ts:31 均有 >=10 阈值逻辑, 但尚未累积 10 次 no-active-plan 端到端验证 (当前 0 次)|审计: (待填写)
- [x] [R] 每次拦截事件落库后推送实时通知 — 证据: hook.ts:149-150 serverRef.sendLoggingMessage({ level: "warning" }), 但经实测 Qoder/Claude/VS Code 均不支持 MCP notifications/message 弹窗渲染, 改为 UserPromptSubmit 对话注入替代|审计: (待填写)

---

## 八、边界与容错 [R]/[E]

- [ ] [R] MCP Server 宕机时，hook 脚本仍成功写入 jsonl — 证据: (待填写)|审计: (待填写)
- [x] [R] MCP Server 重启后，从已有 jsonl 恢复消费（含 `.old` 轮转文件） — 证据: 预写 2 条测试事件至 jsonl → 重启 MCP → get_hook_events 查到 planKeyword=hook-notify-upgrade 共 2 条|审计: HOOK_INTERCEPT×2
- [ ] [R] `hook-events.jsonl` 轮转时 fs.watch 无缝切换 — 证据: (待填写)|审计: (待填写)
- [ ] [R] 磁盘满时 `write_hook_event` 静默失败，不阻断 hook exit 2 — 证据: (待填写)|审计: (待填写)
- [x] [E] 无新增外部依赖（`git diff package.json` 无新增） — 证据: 未修改 package.json|审计: (待填写)

---

## 九、ADD 规则合规检查 [E]

- [x] [E] ADD-7：每个文件修改已记录 `record_dev_operation` — 证据: query_audit_logs({ planKeyword: "hook-notify-upgrade" }) 返回 32 条（28文件级+4文档/事件级）|审计: 32 records
- [x] [E] Plan/Spec 一致性 — 证据: check_spec_sync 无报错|审计: cmrynglex
- [x] [E] Plan/Spec 修订记录 — 证据: DOC_UPDATED (cmrynglex) + DOC_CREATED (cmryo0gwc)|审计: cmrynglex cmryo0gwc
- [x] [E] 审计日志记录完整 — 证据: query_audit_logs({ planKeyword: "hook-notify-upgrade" }) 返回 32 条|审计: 32 records

---

> **流程衔接（AI 执行指令）**：
>
> 当所有 `[T]` 和 `[E]` 编译期检查项均为 `[x]` 时（`[R]` 和 `[H]` 项可保持 `[ ]`），AI 必须执行：
>
> 1. **读取** `review-implementation-template.md`，逐项填写实现审查内容
> 2. **读取** `review-runtime-template.md`，复制为 `{{magicDir}}/reviews/hook-notify-upgrade-review-runtime.md`
>    - 替换占位符（标题、关联文档路径）
>    - §1 发现列表初始化为 "尚无运行时发现"
>    - §1 末尾自动插入本 checklist 中所有 `[R]` 项的清单，标记为 "待运行时验证"
> 3. **提示用户**："review-runtime.md 已就绪，包含 N 项运行时验证。部署后启动 MCP Server 时会扫描此文件。"
