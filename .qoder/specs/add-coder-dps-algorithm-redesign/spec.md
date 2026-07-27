# add-coder DPS Algorithm Redesign Spec

## Why

当前 `check_dps` 四维度均为存在性检查（占位符二分、关键词匹配、文件存在、回流计数），不对文档内容做语义级量化。四维权重硬编码各 25%，无法区分各维度的实际贡献。需升级为语义级复合评分 + FFT 自适应权重，对齐 farm-agent 同构改造。

## What Changes

| 文件 | 操作 | 说明 |
|------|------|------|
| `templates/core/scripts/mcp-server/tools/gateway.ts` | MODIFY | 替换 `check_dps` 内部评分算法 + 新增 FFT 自适应权重引擎 |

MCP 工具签名不变：`check_dps({ planKeyword: "..." })`。

## Impact

- Affected specs: 无（新 Spec）
- Affected code: `gateway.ts` `check_dps` 实现（~30 行替换为 ~100 行）
- 父 Plan: `.qoder/plans/2026-07/27/add-coder-dps-algorithm-redesign-plan-v1.md`
- 参考案例: `farm-agent` DPS 同构改造
- 依赖: `readFileSafe` / `readdirRecursive`（已有）

## Boundaries

本次允许:
- 修改 `gateway.ts` 中 `check_dps` 工具实现
- 新增 TF-IDF/Jaccard、香农熵/Deng熵、CPM、FFT 四个纯函数

本次禁止:
- 修改 `check_dps` 的 MCP 工具签名
- 引入外部 npm 依赖
- 调用 LLM / embedding API
- 修改 DPS ≥ 85 PASS / ≥ 70 WARN / < 70 BLOCKED 阈值

## ADDED Requirements

### Requirement: 语义相关性评分

系统 SHALL 用 TF-IDF + Jaccard 计算 Plan↔Review 和 Plan↔Specs 的术语覆盖率。

- Scenario: 正常计算 — WHEN Plan/Review/Specs 文档均存在 THEN 提取术语集合 → 计算 Jaccard 系数 → 输出 0-100 语义相关性分
- Scenario: 部分文档缺失 — WHEN Review 或 Specs 不存在 THEN 缺失侧计 0，最终分为单侧 Jaccard × 0.5

### Requirement: 信息熵匹配评分

系统 SHALL 用香农熵衡量文档词频聚焦度，Deng 熵惩罚不确定表述。

- Scenario: 正常计算 — WHEN Plan 和 Specs 可读取 THEN 计算词频分布香农熵 → 计算不确定性语法比例作为 Deng 熵惩罚 → 熵差距越小分越高
- Scenario: Specs 缺失 — WHEN 无 Specs 文档 THEN 熵匹配维度计 0

### Requirement: CPM 关键路径评分

系统 SHALL 解析 add-route 文件的 Step checkbox 状态，按 ADD 标准依赖关系计算关键路径完成率。

- Scenario: add-route 存在 — WHEN 找到 add-route 文件 THEN 解析 Step [x]/[ ] → CPM 计算 → 输出 0-100
- Scenario: add-route 缺失 — WHEN 无 add-route 文件 THEN 该维度计 0

### Requirement: FFT 自适应权重

系统 SHALL 从 PlanRecord 历史评分中 DFT 计算每维频谱能量比，自适应分配权重。冷启动降级为均权。

- Scenario: 数据充足 — WHEN PlanRecord 中历史评分 ≥ 5 条 THEN 构建 N×4 矩阵 → DFT → 高频/(总能量) → 归一化权重
- Scenario: 冷启动 — WHEN 历史数据 < 5 条 THEN 降级为均权 25%/25%/25%/25%

### Requirement: DPS 复合输出

系统 SHALL 用 FFT 力权重组四维分，输出不变格式。

- Scenario: 正常输出 — WHEN 四维+权重均计算完毕 THEN DPS = Σ(维度分 × 权重) → 输出 ≥85 PASS / ≥70 WARN / <70 BLOCKED
