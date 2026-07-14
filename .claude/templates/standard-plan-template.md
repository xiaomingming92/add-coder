# {需求域名}-{核心内容}-plan-v{版本号}

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。详见 [《ADD开发工作路径与文档协同规范》§8.1.1](/home/xmm/ai/add-coder/docs/knowledge/01-架构/《ADD开发工作路径与文档协同规范》.md)。

## PLAN 元信息

- **Plan 名称**: {英文名}-{序号}
- **启动时间**: {ISO 时间戳}
- **主导 AI**: {AI 助手标识}
- **关联文档**:
  - ADD Route: `.qoder/plans/{YYYY-MM}/{DD}/{需求域名}-{核心内容}-add-route-v{版本}.md`
  - Handoff: `.qoder/plans/{YYYY-MM}/{DD}/{需求域名}-{核心内容}-handoff-v{版本}.md`
  - Review: `.qoder/reviews/{需求域名}-review-v{版本}.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| path/to/file.ts | COMPONENT | COMPONENT_CREATED | 描述改前状态 | 描述改后状态 | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

### 1.2 目标

---

## 二、方案选型（如有多个候选方案）

### 2.1 候选方案对比

| 方案 | 因素1 | 因素2 | 因素3 | 结论 |
|------|-------|-------|-------|------|
| A: xxx | | | | |
| B: xxx | | | | |

### 2.2 选型理由

---

## 三、架构设计

### 3.1 数据流转（文件级，标注关键行号与回退路径）

```
{自上而下的数据流转 ASCII 图，│ ├ ▼ 表达流向，标注文件路径与行号}
{必须包含完整的回退链：每一步失败后的降级路径}
```

### 3.2 {架构图表 / 拓扑 / 组件关系（可选）}

### 3.3 {数据模型变更（如有）}

---

## 四、实施 Task + 依赖图

```
Task 1 ──┐
          │ 可并行
Task 2 ──┘
          │
          ▼
Task 3 ──┐
Task 4 ──┤ 可并行
Task 5 ──┘
          │
          ▼
Task 6 (编译/测试)
```

### Step 0: 文档先行

### Step N: ...

---

## 五、验收标准

- [ ] 标准1
- [ ] 标准2

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/...` |
| Handoff | `.qoder/plans/...` |
| Review | `.qoder/reviews/...` |
| Spec | `.qoder/specs/{name}/spec.md` |
| Tasks | `.qoder/specs/{name}/tasks.md` |
| Checklist | `.qoder/specs/{name}/checklist.md` |
