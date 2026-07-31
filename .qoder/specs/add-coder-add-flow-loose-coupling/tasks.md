# Tasks: add-coder-add-flow-loose-coupling-v1

> 对应 Plan: `.qoder/plans/2026-07/31/add-coder-add-flow-loose-coupling-plan-v1.md` §四

---

## 轮次依赖

```
Task 1.1 ──→ Task 1.2 ──→ Task 1.3 ──→ Task 1.4
                                              │
Task 1.5 (独立，Guardian 文档)                  │
Task 1.6 (独立，schema regen)                   │
Task 1.7 (独立，check_spec_sync)                │
                                              ▼
                                          npm run sync
```

---

## Plan→Task 映射

| Plan Task | 文件 | 对应 Spec |
|------|------|------|
| 1.1 | `hooks/post-tool-use.sh` | Spec 1 |
| 1.2 | `hooks/pre-tool-use.sh` | Spec 2 |
| 1.3 | `hooks/post-tool-use.sh` | Spec 3 |
| 1.4 | `hooks/post-tool-use.sh` | Spec 4 |
| 1.5 | `agents/add-flow-guardian.md` | Spec 5 |
| 1.6 | `hooks/post-tool-use.sh` | Spec 6 |
| 1.7 | `tools/gateway/check_spec_sync.ts` | Spec 7 |

---

## 轮次 1: 7 项优化并行

- [x] Task 1.1: HITL DPS 自动化 — 对应 Spec 1
  - [x] 1.1.1 post-tool-use 解析 check_dps 返回值中的 DPS 分值
  - [x] 1.1.2 DPS ≥ 80 时自动 touch `.tongyi-{plan}`
  - [x] 1.1.3 DPS < 80 时 stderr 注入 Review 提示

- [x] Task 1.2: 模板格式前置注入 — 对应 Spec 2
  - [x] 1.2.1 pre-tool-use 检测 plans/ 写入事件
  - [x] 1.2.2 按文件名匹配模板类型
  - [x] 1.2.3 stderr 注入模板路径提示

- [x] Task 1.3: plan_track 自动触发 — 对应 Spec 3
  - [x] 1.3.1 post-tool-use 检测 specs/ 或 add-route 写入
  - [x] 1.3.2 从路径提取 planName
  - [x] 1.3.3 调 MCP plan_track 落库

- [x] Task 1.4: devlog 自动提醒 — 对应 Spec 4
  - [x] 1.4.1 post-tool-use 检测 add-route 写入
  - [x] 1.4.2 扫描 Step 8 checkbox 全部 [x]
  - [x] 1.4.3 stderr 注入 devlog 提醒

- [x] Task 1.5: Guardian Phase 0.1 用 plan_status — 对应 Spec 5
  - [x] 1.5.1 修改 Guardian 文档，Phase 0.1 优先 plan_status MCP
  - [x] 1.5.2 失败降级到文件搜索三级策略

- [x] Task 1.6: schema.json 自动 regen — 对应 Spec 6
  - [x] 1.6.1 post-tool-use 检测 templates/*.md 修改
  - [x] 1.6.2 扫描实际模板 `## ` 标题，更新对应 schema.json

- [x] Task 1.7: check_spec_sync 精简 — 对应 Spec 7
  - [x] 1.7.1 去掉 tasks.md/checklist.md 扫描（plan_track 已覆盖）
  - [x] 1.7.2 保留 git diff↔add-route 一致性校验

---

## Verification

- [ ] `npm run sync` 后各项目 hook 正常
- [ ] DPS ≥ 80 测试：自动建哨兵
- [ ] plan_track 自动触发验证
