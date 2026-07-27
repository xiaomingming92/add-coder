# add-coder-dps-algorithm-redesign-plan-v1

> 精简版 Plan：单文件 MCP 工具算法改造，无新模块/外部 API 变更。
> Handoff 融合于 §四，无需独立 handoff 文件。

**创建时间**: 2026-07-27
**主导 AI**: Qoder
**参考案例**: farm-agent 同构改造

---

## HITL 计划总览

| 维度 | 内容 | 决策 |
|------|------|:---:|
| 涉及文件 | `templates/core/scripts/mcp-server/tools/gateway.ts` | ✅ |
| 改动类型 | 重构（算法替换，MCP工具签名不变） | ✅ |
| 设计方案 | TF-IDF/Jaccard语义 + 香农熵/Deng熵 + CPM路径 + FFT自适应权重 | ✅ |
| 风险等级 | 🟡 中 | ✅ |

---

## 一、Plan 概述

- **现状**: `check_dps` 四维均为存在性检查（占位符二分法、关键词匹配、文件存在、回流计数），区分度低，权重硬编码各25%。
- **目标**: ~~TF-IDF/Jaccard 语义相关性 + 香农熵/Deng熵信息聚焦度 + add-route CPM关键路径 + FFT频谱能量比自适应权重~~ → 实施中算法决策：[回流: Review #1 实施修正, 2026-07-27]
  - **语义维度**：Intl.Segmenter 中文分词 + Jaccard 集合相似度 + TF-IDF Cosine（平滑 IDF：`log((N+1)/(df+1))+1`，避免 2 文档场景共有词归零）。引入 `vector-cosine-similarity`（0 deps, 14KB）作为 Cosine 计算库。权重：Jaccard 35% + Cosine 45% + Review 侧 20%。
  - **熵维度**：香农熵衡量词频聚焦度 + Deng 熵惩罚不确定性语法（"可能"/"TBD"/"待定"等）。熵差距一致性分。
  - **CPM 维度**：业务原子化（Task 间 Jaccard 语义重叠越低保独立性越高）+ 注意力匹配（文件耦合度 ≤3files/Task + 描述熵 ≤6bits）+ 依赖图完整性（正则匹配内联 `Task N 依赖: M` + 表格式 `| N | ... | M |`）。支持 `Task N.N` 格式。
  - **FFT 权重**：从 PlanRecord 历史构建 N×4 评分矩阵 → DFT 频谱能量比（高频/(DC+高频)）→ 归一化。N≤5 降级均权 25%。
  - **过滤**：Plan 搜索排除 `.hitl.md` 文件，add-route 匹配统一小写。
- **原则**: MCP签名不变，~~零外部依赖~~ → 仅 `vector-cosine-similarity`（0 deps, 14KB, ISC license）[回流: Review #1 实施修正]，不需要 LLM 调用。

## 二、变更范围

| 文件 | 操作 |
|------|------|
| `templates/core/scripts/mcp-server/tools/gateway.ts` | 修改 |

## 三、Tasks

- [x] Task 1: TF-IDF + Jaccard + Cosine 语义相关性 [回流: 实施完成, Jaccard 35% + Cosine 45% + Review 20%, 平滑IDF]
- [x] Task 2: 香农熵 + Deng 熵信息聚焦度 [回流: 实施完成, Deng 惩罚不确定性语法标记]
- [x] Task 3: CPM 任务拆分质量（原子性+注意力+依赖+隔离）[回流: 实施完成, 支持 Task N.N + 表格式依赖]
- [x] Task 4: FFT 自适应权重引擎 [回流: 实施完成, N≤5 均权降级, PlanRecord 历史矩阵]
- [x] Task 5: DPS 复合输出重组 [回流: 实施完成, 四维 + FFT权重 + 阈值不变]

## 四、Handoff

### 4.1 当前
`gateway.ts` L82-112：四维各25%存在性检查。

### 4.2 目标
语义+熵+CPM+FFT权重，`check_dps` 签名不变。

### 4.3 回滚
```bash
git checkout -- templates/core/scripts/mcp-server/tools/gateway.ts
npx add-coder sync --adapter qoder --patch
```

## 五、验收

- [ ] Task 1-4 各自算法单元验证通过
- [ ] Task 5: DPS新格式 + FFT权重 + 阈值不变
- [ ] `npx tsc --noEmit` 通过

## 六、关联

| 类型 | 路径 |
|------|------|
| Handoff | 见本文 §四 |
| 参考 | farm-agent DPS算法改造 |