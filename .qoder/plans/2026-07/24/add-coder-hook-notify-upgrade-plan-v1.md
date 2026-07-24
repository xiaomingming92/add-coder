# add-coder-hook-notify-upgrade-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度。

## PLAN 元信息

- **Plan 名称**: add-coder-hook-notify-upgrade-v1
- **启动时间**: 2026-07-24T14:00:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-hook-notify-upgrade-review-v1.md`
  - Spec: `.qoder/specs/hook-notify-upgrade/`

---

## HITL 计划总览（一次性提交人类审核）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | `templates/core/hooks/`（14 文件）、`templates/adapters/{claude,qoder,vscode,trae,codex}/hooks/`（5组）、`mcp-server/notifications/`（修改）、`mcp-server/tools/`（新增 2 工具）、`mcp-server/resources/`（新增 1 端点） | |
| 预估文件数 | 修改 ~28（hooks）+ 修改 3（notifications/tools）+ 新增 5（lib + 2 工具 + test + resource）= ~36 文件 | |
| 架构变更 | jsonl 中间层（bash 原生）→ fs.watch → ① planKeyword 关联落库 ② Notification 推送 ③ 日报/周报 Resource | |
| 新增依赖 | 无（复用 hook-lib 已有 `detect_active_add`） | |
| 风险等级 | 🟡中 | |
| 预计轮次 | 3 轮 | |

---

## 一、背景与目标

### 现状

Hook 拦截后仅 `echo >&2` 到 stderr。三个缺口：

1. **无结构化记录** — 散落文本，无时间戳/类型/关联 Plan
2. **无跨会话审计** — "哪些 hook 在何时拦截了什么"无法回溯
3. **无治理信号** — 不知道"这几天有多少次无 Plan 的违规"

### 目标

hook 协议零改动，新增旁路：拦截时写 jsonl → MCP fs.watch 回调解析 → 落库关联 Plan → 通知 + 日报/周报 + 阈值告警。

---

## 二、方案选型

| 方案 | 描述 | 判定 |
|------|------|:---:|
| A: hook 直接调 MCP | bash curl JSON-RPC | ❌ MCP 宕机事件丢失 |
| B: 写文件 + 轮询 | jsonl + setInterval 扫描 | ❌ 30s 延迟 + CPU 空转 |
| **C: jsonl + fs.watch + 落库** | bash 写文件（永远成功）→ MCP watch → Plan 关联落库 → 通知/报表 | ✅ 容纳 + 实时 + 可审计 |

---

## 三、架构设计

### 3.1 数据流转

```
hook 拦截
  ├── exit 2 + stderr（不变）
  └── write_hook_event → {magicDir}/reports/hook-events.jsonl（bash 原生，MCP 宕机不丢）
                              │
         MCP Server fs.watch 回调（inotify，零延迟）
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   record_dev_operation  sendLoggingMessage  add-coder://report/
   (Prisma DB 持久化)   (IDE 实时通知)      hook-events/daily
                                            (Resource 订阅)
```

### 3.2 jsonl 格式（6 字段）

```jsonl
{"ts":"2026-07-24T14:00:01Z","hook":"pre-tool-use","decision":"deny","cmd":"mv /tmp/x","reason":"禁止通过 mv 绕过","planKeyword":"mcp-restructure","planStatus":"active"}
{"ts":"2026-07-24T14:05:00Z","hook":"doc-format-guard","decision":"deny","cmd":"...","reason":"Plan 缺 HITL 表","planKeyword":"no-active-plan","planStatus":"none"}
```

| 字段 | 说明 |
|------|------|
| `planKeyword` | `"mcp-restructure"` / `"no-active-plan"` / `"plan-converged"` |
| `planStatus` | `"active"` / `"none"` / `"converged"` |

### 3.3 lib/notify.sh

```bash
write_hook_event() {
  local hook="$1" decision="$2" cmd="$3" reason="$4" plan="${5:-unknown}" status="${6:-none}"
  local dir="${MAGIC_DIR:-.qoder}/reports"; mkdir -p "$dir" 2>/dev/null
  local file="$dir/hook-events.jsonl"
  [ -f "$file" ] && [ $(stat -c%s "$file" 2>/dev/null || echo 0) -gt 262144 ] && mv "$file" "${file}.old" 2>/dev/null
  printf '{"ts":"%s","hook":"%s","decision":"%s","cmd":"%s","reason":"%s","planKeyword":"%s","planStatus":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$hook" "$decision" "$cmd" "$reason" "$plan" "$status" >> "$file"
}
```

### 3.4 hook 调用模式

```bash
source "${HOOK_LIB_DIR}/notify.sh" 2>/dev/null || true
ACTIVE=$(detect_active_add "$MAGIC_DIR" 2>/dev/null)
PLAN_KEYWORD="${ACTIVE:-no-active-plan}"
PLAN_STATUS="${ACTIVE:+active}"; PLAN_STATUS="${PLAN_STATUS:-none}"
write_hook_event "pre-tool-use" "deny" "$cmd" "禁止通过 mv 绕过" "$PLAN_KEYWORD" "$PLAN_STATUS" 2>/dev/null || true
exit 2
```

### 3.5 治理信号（日报 / 周报 / 阈值告警）

所有信号从 `DevOperation` 表实时查询聚合，不额外落库：

```
DevOperation 表（action=HOOK_INTERCEPT）
       │
       ├── 日报: query_audit_logs({ action:"HOOK_INTERCEPT", since:"24h" })
       │     → group by planKeyword → 对话注入 + sendLoggingMessage
       │
       ├── 周报: Resource add-coder://report/hook-events/weekly
       │     → 订阅后每周推送聚合摘要
       │
       └── 阈值告警: no-active-plan ≥ 10次/天
             → sendLoggingMessage({ level:"warning" })
             → "今日 12 次无 Plan 违规，建议创建 Plan 或检查 hooks 误报"
```

**用户触达方式**（MCP 原生，无需插件）：
- 对话注入：UserPromptSubmit hook 将日报摘要写入 AI 上下文
- 实时通知：`sendLoggingMessage` 推送到 IDE
- 订阅查询：Resource `add-coder://report/hook-events/{daily,weekly}` 可被 IDE Subscribe

### 3.6 内存缓冲队列（解决 DB 写入积压）[回流: Review P1 #1 性能积压]

fs.watch 回调中不直接 `await record_dev_operation`——每次回调同步等 DB 会导致事件积压。改为内存缓冲队列：

```
fs.watch 回调 → 解析 jsonl 行 → push 到内存队列 → 返回（< 1ms）
                                    │
                    队列长度 ≥50 条 → 立即 flush
                    否则调度 setTimeout 2s 后 flush（已有定时则跳过）
                                    │
                    批量 record_dev_operation（createMany）
```

- 阈值触发优先：满 50 条立即刷，保证高频不积压
- 兜底定时：2s 无新事件时刷剩余，保证低频不丢失
- 队列上限 50 条，超出时降级写入 `reports/hook-events-overflow.jsonl`（二级磁盘缓冲）
- 消费逻辑：先 drain 内存队列 → 再扫描 overflow 文件逐行消费 + 清空
- 不丢事件——内存不够走磁盘，DB 恢复后自动追上
- MCP 退出时 `process.on('exit')` 清空剩余队列

---

## 四、实施 Task + 依赖图

```
轮次 1: core hooks 改造 + lib 工具函数（4 文件）
├── Task 1.1: 新建 lib/notify.sh — 6 字段 jsonl + rotate
├── Task 1.2: 修改 pre-tool-use.sh — detect_active_add + write_hook_event
├── Task 1.3: 修改 doc-format-guard.sh — 同上
└── Task 1.4: 修改 core hooks 其余 exit 2 文件 — 同上
        │
        ▼
轮次 2: 5 个 adapter hooks 统一替换（~28 文件）
├── Task 2.1-2.5: qoder/claude/vscode/trae/codex — 统一追加 source + write_hook_event
        │
        ▼
轮次 3: MCP 集成 + 治理信号 + 测试（5 文件）
├── Task 3.1: 新建 tools/hook-event-report.ts — get_hook_events（按 planKeyword/hook/时间过滤）
├── Task 3.2: 修改 notifications/hook.ts — fs.watch 回调 + 内存缓冲队列（批量 record_dev_operation 写入，避免每次回调同步等 DB）+ sendLoggingMessage
├── Task 3.3: 新建 resources/hook-events-report.ts — add-coder://report/hook-events/{daily,weekly}
├── Task 3.4: 修改 notifications/hitl.ts — 阈值告警（no-active-plan ≥10 次/天）
└── Task 3.5: 新建 tests/hook-notify.test.ts
```

---

## 五、验收标准

- [ ] `npm run sync` 后所有 adapter hooks 含 `write_hook_event` + `detect_active_add` 调用
- [ ] `lib/notify.sh` 零依赖可独立 source
- [ ] 触发 hook 拦截后 jsonl 有新行写入（含 planKeyword/planStatus）
- [ ] `record_dev_operation("HOOK_INTERCEPT")` 落库，`query_audit_logs({ action:"HOOK_INTERCEPT" })` 可查
- [ ] `get_hook_events` 工具支持按 planKeyword/hook/时间区间过滤
- [ ] Resource `add-coder://report/hook-events/daily` 返回日报聚合数据
- [ ] fs.watch 回调在 hook 写入后 1s 内触发
- [ ] 阈值告警：无 Plan 拦截 ≥10 次时触发 sendLoggingMessage(warning)
- [ ] ESLint 0 errors, 0 warnings
- [ ] 单元测试全部通过

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-hook-notify-upgrade-review-v1.md` |
| Specs | `.qoder/specs/hook-notify-upgrade/` |
