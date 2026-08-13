# Tasks: {需求域名}-{核心内容}-v{版本号}

> 对应 Plan: `.codex/plans/{YYYY-MM}/{DD}/{需求域名}-{核心内容}-plan-v{版本}.md` §四

---

## 轮次依赖（复制自 Plan §四）

```
{从 Plan §四 的 ASCII 依赖图复制——定义轮次边界,Task 顺序 & Task依赖关系}
```

---

## Plan→Task 映射（对接 Spec 细节）

> 每行对应 Plan §四 的一个 Task。

| Plan Task | 文件 | 验收 | 对应 Spec |
|------|------|------|------|
| 1.1 | `path/to/file.ts` | `tsc --noEmit` | Spec §1 |
| 1.2 | `path/to/file.ts` | `tsc --noEmit` | Spec §2 |

---

## 轮次 1: {轮次名称}

### Task 1.1: {任务描述} — 对应 Spec §1

- [ ] 1.1.1 {子任务描述}
- [ ] 1.1.2 {子任务描述}

### Task 1.2: {任务描述} — 对应 Spec §2 | 依赖 Task 1.1

- [ ] 1.2.1 {子任务描述}

---

## 轮次 2: {轮次名称}

### Task 2.1: {任务描述} — 对应 Spec §3 | 依赖 Task 1.3

- [ ] 2.1.1 {子任务描述}

### Task 2.2: {任务描述} — 对应 Spec §4 | 依赖 Task 2.1

- [ ] 2.2.1 {子任务描述}

---

## Verification

- [ ] `npx tsc --noEmit` 通过
- [ ] `npx eslint src/` 零 error

> **生成后**：调用 `plan_track({ planName: "{planName}" })` 将 Tasks 路径同步到 PlanRecord 表。
