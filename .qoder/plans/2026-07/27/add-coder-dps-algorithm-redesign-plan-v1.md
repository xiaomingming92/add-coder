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
- **目标**: TF-IDF/Jaccard 语义相关性 + 香农熵/Deng熵信息聚焦度 + add-route CPM关键路径 + FFT频谱能量比自适应权重。
- **原则**: MCP签名不变，零外部依赖，不需要 LLM 调用。

## 二、变更范围

| 文件 | 操作 |
|------|------|
| `templates/core/scripts/mcp-server/tools/gateway.ts` | 修改 |

## 三、Tasks

- [ ] Task 1: TF-IDF + Jaccard 语义相关性
- [ ] Task 2: 香农熵 + Deng 熵信息聚焦度
- [ ] Task 3: add-route CPM 关键路径完成率
- [ ] Task 4: FFT 自适应权重引擎（N<5 均权降级）
- [ ] Task 5: DPS 复合输出重组

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