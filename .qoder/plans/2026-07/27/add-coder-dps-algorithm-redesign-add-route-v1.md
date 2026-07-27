# add-coder-dps-algorithm-redesign-add-route-v1

> **定位**：Plan → ADD Step 执行映射。简版——单文件纯算法替换，无审计打点、无新依赖。
>
> **绑定**：Plan: `add-coder-dps-algorithm-redesign-plan-v1.md` · Spec: `add-coder-dps-algorithm-redesign/spec.md` · Tasks: `add-coder-dps-algorithm-redesign/tasks.md`

---

## Step 0：文档先行

- [x] Specs 三元组就绪（spec/tasks/checklist）
- [x] 无需更新项目文档（纯内部算法替换，不影响外部合约）
- [x] Plan Review 已生成并 tongyi

---

## Step 3：业务逻辑实现

### §3.0 前置守卫

- [x] 调用 `check_add_route_status({ planKeyword: "add-coder-dps-algorithm-redesign" })` — 本文件存在

### Task 映射表

| # | Task | 文件 | 依赖 | 状态 |
|---|------|------|------|:---:|
| 1 | TF-IDF + Jaccard 语义相关性 | `gateway.ts` | 无 | ⬜ |
| 2 | 香农熵 + Deng 熵信息聚焦度 | `gateway.ts` | 无 | ⬜ |
| 3 | CPM 任务拆分质量 | `gateway.ts` | 无 | ⬜ |
| 4 | FFT 自适应权重引擎 | `gateway.ts` | 无 | ⬜ |
| 5 | DPS 复合输出重组 | `gateway.ts` | Task 1-4 | ⬜ |

### 依赖拓扑

```
Task 1    Task 2    Task 3    Task 4
   │         │         │         │
   └─────────┼─────────┼─────────┘
             ▼
         Task 5
```

Task 1-4 可并行，Task 5 串行（依赖前四个维度的评分输出）。

---

## Step 4：验证

- [ ] `npx tsc --noEmit` 通过
- [ ] `check_dps({ planKeyword: "add-coder-dps-algorithm-redesign" })` 返回新格式

---

## Step 8：收敛判断

- [ ] Task 1-5 全部完成，`tasks.md` 勾选
- [ ] `checklist.md` 全部 [T] 项通过
- [ ] DPS 阈值 ≥85 PASS / ≥70 WARN / <70 BLOCKED 不变

---

## 附录：文件清单

| 文件 | 操作 | Task |
|------|------|------|
| `templates/core/scripts/mcp-server/tools/gateway.ts` | MODIFY | 1-5 |