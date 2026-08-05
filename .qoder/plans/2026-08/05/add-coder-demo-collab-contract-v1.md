# add-coder-demo-collab-contract-v1

> 契约类型: COLLAB_CONTRACT（add-coder 本地演示样例，用于 contract_track 实证）

## PLAN 元信息

- **契约名称**: add-coder-demo
  - 总控 Plan: `add-coder-demo-master-plan-v1`
- **版本**: 1

## 二、参与者与角色

| 角色 | 平台实体 | 绑定 Plan | 说明 |
|------|---------|----------|------|
| **Lead Agent** | 总控 | add-coder-demo-master-plan-v1 | 契约持有者 |
| **Subagent** | 专家 1 | add-coder-demo-sub-plan-v1 | 实施单元 A |

### 2.1 能力矩阵（每个专家的能力边界）

| 能力 | 专家 1 | Lead |
|------|--------|------|
| 文档 | ✅ | ✅ |
| 代码 | ✅ | — |

## 三、协作规则（契约主体）

### 3.1 触发条件表（谁先谁后）

| 阶段 | 专家 | 触发条件 | 并行度 |
|------|------|---------|--------|
| A | 专家 1 | 文档就绪 | 并行 |
| B | Lead | A 完成 | 串行 |

### 3.1.1 依赖拓扑图（完整）

```text
依赖: A(专家1) → B(Lead)
```

### 3.2 文件边界（防冲突硬约束）

| 专家 | 独占文件域 | 禁区 |
|------|-----------|------|
| 专家 1 | docs/ | src/ |
| Lead | src/ | docs/ |

### 3.3 审计归因（ADD-7）

- 每个专家 Plan 独立 record_dev_operation

### 3.4 完成判定

| 专家 | 完成标志 |
|------|---------|
| 专家 1 | 文档 diff 合并 |
| Lead | 代码编译通过 |

