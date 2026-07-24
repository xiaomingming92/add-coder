# Tasks: hook-notify-upgrade

## Preconditions

- [x] Plan 已生成: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-plan-v1.md`
- [x] ADD Route 已生成: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-add-route-v1.md`
- [ ] Review 已生成
- [x] Handoff 已创建

## Forbidden

- 禁止修改 hook 协议（exit 2 + stderr 行为不变）
- 禁止在 bash 脚本中引入 jq/curl/wget 等外部依赖
- 禁止在 MCP 中引入第三方消息队列（Redis/Kafka 等）

---

## 第1轮：Core Hooks 改造 + lib/notify.sh

- [x] Task 1.1: 新建 `templates/core/hooks/lib/notify.sh` — 验证: `source` 后 `write_hook_event` 可用
  - [x] `write_hook_event()` 函数：7 字段 jsonl（`ts`、`hook`、`decision`、`cmd`、`reason`、`planKeyword`、`planStatus`）
  - [x] 自动创建 reports 目录（`mkdir -p`）
  - [x] jsonl 超过 256KB 自动轮转为 `.old`
  - [x] 零外部依赖（仅 bash 内置 + date + printf + stat）

- [x] Task 1.2: 修改 `templates/core/hooks/pre-tool-use.sh` — 验证: write_hook_event 调用存在
  - [x] exit 2 前追加 source lib/notify.sh
  - [x] 调用 detect_active_add 获取 PLAN_KEYWORD + PLAN_STATUS
  - [x] 调用 write_hook_event 写入拦截事件
  - [x] write_hook_event 失败不阻断 exit 2

- [x] Task 1.3: 修改 `templates/core/hooks/doc-format-guard.sh` — 验证: 同 Task 1.2
  - [ ] 同上改造

- [x] Task 1.4: 修改 core hooks 其余 exit 2 文件 — 验证: 所有含 exit 2 的文件均已改造
  - [ ] 遍历所有含 exit 2 的 .sh 文件
  - [ ] 统一追加 source + write_hook_event 调用

---

## 第2轮：5 个 Adapter Hooks 统一替换

- [x] Task 2.1: qoder adapter hooks — 验证: write_hook_event 在 qoder/hooks/ 命中 >=12
  - [ ] 每个含 exit 2 的 .sh 文件末尾追加 source + write_hook_event + detect_active_add

- [x] Task 2.2: claude adapter hooks — 验证: 同 Task 2.1
  - [ ] 同上改造

- [x] Task 2.3: vscode adapter hooks — 验证: write_hook_event 在 vscode/hooks/ 命中 >=11
  - [ ] 同上改造

- [x] Task 2.4: trae adapter hooks — 验证: 同 Task 2.1
  - [ ] 同上改造

- [x] Task 2.5: codex adapter hooks — 验证: 同 Task 2.1
  - [ ] 同上改造

---

## 第3轮：MCP 集成 + 内存缓冲队列 + 治理信号 + 测试

- [x] Task 3.1: 新建 `mcp-server/tools/hook-event-report.ts` — 验证: get_hook_events 工具可调用
  - [x] get_hook_events Tool 定义（Zod schema）
  - [x] 支持过滤参数：planKeyword、hook、since、until
  - [x] 从 DevOperation 表查询 action=HOOK_INTERCEPT 记录
  - [x] 按 planKeyword 分组聚合

- [x] Task 3.2: 修改 `mcp-server/notifications/hook.ts` — 验证: fs.watch 回调 1s 内触发 + record_dev_operation 落库
  - [x] **内存缓冲队列实现**（对应 Plan §3.6）：
    - [x] 内存队列 hookEventQueue（上限 50 条）
    - [x] flushHookEvents：drain 内存队列 -> 批量 record_dev_operation（createMany）-> 再扫描 + 清空 hook-events-overflow.jsonl
    - [x] 入队逻辑：push 到队列 -> 满 50 条立即 flush -> 否则 setTimeout 2s（已有定时器则跳过）
    - [x] 溢出逻辑：队列满时降级写入 reports/hook-events-overflow.jsonl
    - [x] process.on('exit') + SIGTERM 处理：清空剩余队列
    - [x] 去重保护：(hook + ts + planKeyword) 联合去重
  - [x] **fs.watch 回调**：
    - [x] 启动时全量扫描已有 hook-events.jsonl + .old 文件
    - [x] 持久化消费位点（inode + 已读字节数）
    - [x] fs.watch 监听文件变化，仅读取新增行
    - [x] 文件轮转时自动切换监听
  - [x] **Notification 推送**：每次拦截落库后 sendLoggingMessage

- [x] Task 3.3: 新建 `mcp-server/resources/hook-events-report.ts` — 验证: Resource 可被订阅
  - [x] add-coder://report/hook-events/daily Resource：过去 24h 聚合（按小时分组）
  - [x] add-coder://report/hook-events/weekly Resource：过去 7d 聚合（按日分组）

- [x] Task 3.4: 修改 `mcp-server/notifications/hitl.ts` — 验证: 无 Plan >=10 次触发 warning
  - [x] 阈值检查：定时（每 5 分钟或每次落库后）查询过去 24h 内 planKeyword="no-active-plan" 的 HOOK_INTERCEPT 次数
  - [x] >=10 次时 sendLoggingMessage({ level: "warning" }) 推送告警

- [x] Task 3.5: 新建 `tests/hook-notify.test.ts` — 验证: vitest 全部通过
  - [x] 内存缓冲队列单元测试：阈值触发 / 定时刷新 / 溢出降级 / 退出清空 / 去重
  - [x] jsonl 解析单元测试：7 字段正确提取
  - [x] fs.watch 回调单元测试（mock fs）
  - [x] get_hook_events 工具单元测试
  - [x] Resource 聚合逻辑单元测试

---

## Task Dependencies

```
第1轮: Core Hooks + lib
  Task 1.1: lib/notify.sh ---┐
  Task 1.2: pre-tool-use.sh -┤
  Task 1.3: doc-format-guard -┤ 可并行（均依赖 Task 1.1）
  Task 1.4: 其余 core hooks ---┘
           │
           ▼
第2轮: Adapter Hooks
  Task 2.1-2.5: qoder/claude/vscode/trae/codex（可并行）
           │
           ▼
第3轮: MCP 集成 + 治理信号
  Task 3.1: hook-event-report.ts ---┐
  Task 3.2: notifications/hook.ts --┤ 可并行（3.1/3.3 互不依赖）
  Task 3.3: hook-events-report.ts --┤
  Task 3.4: notifications/hitl.ts ---┤（依赖 Task 3.2 的落库逻辑）
  Task 3.5: tests/hook-notify.test.ts ┘（依赖 Task 3.1-3.4 全部）
```

## Verification

- [x] npx tsc --noEmit 通过
- [ ] npx eslint 零错误零警告
- [x] vitest run 全部通过
- [x] npm run sync 后所有 adapter hooks 含 write_hook_event + detect_active_add
- [x] 触发 hook 拦截后 hook-events.jsonl 有新行写入（含 7 字段）
- [x] record_dev_operation("HOOK_INTERCEPT") 落库成功
- [x] query_audit_logs({ action: "HOOK_INTERCEPT" }) 可查
- [ ] Resource 日报/周报返回正确聚合数据
- [ ] 阈值告警：no-active-plan >=10 次触发 sendLoggingMessage(warning)
