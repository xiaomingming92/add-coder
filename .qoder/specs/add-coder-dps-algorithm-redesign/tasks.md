# Tasks: add-coder DPS Algorithm Redesign

> **验证规范**：每个 Task 完成时必须附带 `tsc=0` 证据。

## Preconditions

- [x] Plan 已生成（`add-coder-dps-algorithm-redesign-plan-v1.md`）
- [x] Spec 已就绪（`spec.md`）

## Forbidden

- 禁止修改 `check_dps` MCP 工具签名
- 禁止引入新外部依赖
- 禁止调用 LLM / embedding API

## Tasks

- [ ] Task 1: TF-IDF + Jaccard 语义相关性
  - [ ] 1.1: 实现中文分词（标点/换行分段 + 停用词过滤 + 2-gram）
  - [ ] 1.2: 提取 Plan↔Review 和 Plan↔Specs 术语集合
  - [ ] 1.3: 计算 Jaccard 系数，合并为 0-100 分
  - [ ] 验证: `npx tsc --noEmit` 通过

- [ ] Task 2: 香农熵 + Deng 熵信息聚焦度
  - [ ] 2.1: 基于词频分布计算 Plan 和 Specs 香农熵
  - [ ] 2.2: 识别不确定性语法（"可能"、"TBD"、"待定"等）计算 Deng 熵惩罚
  - [ ] 2.3: 熵差距一致性分（差距越小分数越高）
  - [ ] 验证: `npx tsc --noEmit` 通过

- [ ] Task 3: add-route CPM 关键路径
  - [ ] 3.1: 定位并读取 add-route 文件
  - [ ] 3.2: 解析 Step checkbox [x]/[ ] 状态
  - [ ] 3.3: ADD 标准 Step 依赖关系 → CPM → 完成率 0-100
  - [ ] 验证: `npx tsc --noEmit` 通过

- [ ] Task 4: FFT 自适应权重引擎
  - [ ] 4.1: 从 PlanRecord 表读取历史评分构建 N×4 矩阵
  - [ ] 4.2: DFT 计算每维频谱（DC 分量 + 高频能量）
  - [ ] 4.3: 归一化权重（高频/(总能量)），N<5 降级均权
  - [ ] 验证: `npx tsc --noEmit` 通过

- [ ] Task 5: DPS 复合输出重组
  - [ ] 5.1: 保留四维度结构化输出 + 新增 FFT 权重明细
  - [ ] 5.2: DPS = Σ(维度分 × 权重)
  - [ ] 5.3: 确认 ≥85 PASS / ≥70 WARN / <70 BLOCKED 不变
  - [ ] 验证: `npx tsc --noEmit` 通过

## Task Dependencies

```
Task 1 (语义)    Task 2 (熵)    Task 3 (CPM)    Task 4 (FFT)
       │              │              │               │
       └──────────────┼──────────────┼───────────────┘
                      ▼
             Task 5 (重组输出)
```

Task 1-4 可并行，Task 5 串行。

## Verification

- [ ] `npx tsc --noEmit` 通过
- [ ] `check_dps({ planKeyword: "..." })` 返回新格式 + FFT 权重
- [ ] DPS 阈值行为不变