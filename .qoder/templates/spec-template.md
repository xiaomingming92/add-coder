# {功能名称} Spec

> 对应 Plan: `{{magicDir}}/plans/{YYYY-MM}/{DD}/{需求域名}-{核心内容}-plan-v{版本}.md`

---

## Plan→Spec 映射

> 与 Plan §3.4 表格一一对应。DPS 检测此表判断映射覆盖度。

| # | Plan 决策 | 文件 | 关键变更 |
|---|------|------|------|
| 1 | {复制 Plan §3.4 第1行的 "Plan 设计决策" 列} | `path/to/file.ts` | {复制 "关键变更" 列} |
| 2 | {复制第2行} | `path/to/file.ts` | {复制第2行} |

---

## 1. {标题}

> **Plan 决策**:（见上方映射表第 1 行）
> **文件**: `path/to/file.ts`

### 类型/接口定义

```typescript
// 精确类型定义
```

### WHEN-THEN

- WHEN {条件} → THEN {结果}

---

## 2. {标题}

> **Plan 决策**:（见映射表第 2 行）
> **文件**: `path/to/file.ts`

### 类型/接口定义

```typescript
```

### WHEN-THEN

- WHEN {条件} → THEN {结果}

---

## {N}. {标题}

> **Plan 决策**:（见映射表第 N 行）
> **文件**: `path/to/file.ts`

### 类型/接口定义

```typescript
```

### WHEN-THEN

- WHEN {条件} → THEN {结果}

> **生成后**：调用 `plan_track({ planName: "{planName}" })` 将 Spec 路径同步到 PlanRecord 表。
