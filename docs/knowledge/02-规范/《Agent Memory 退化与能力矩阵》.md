# Agent Memory 退化与能力矩阵

> **定位**：记忆子系统在各后端/各能力缺失情况下的**行为契约表**。回答一个问题：某个能力不可用时，系统应该表现成什么样、由谁明示、如何验证。
> **上位文档**：[《Agent Memory 知识治理层架构设计》](../01-架构/《Agent%20Memory%20知识治理层架构设计》.md)
> **维护触发**：新增 embedding provider / 新增向量适配器 / 改动 FTS 对象清单 / 改动降级路径时同步更新本表。

---

## 一、总原则

1. **FTS 是可靠基线，向量是可选增强**：向量链路任一环节不可用都不得阻塞门禁（Gate）与召回，只有一个合法降级方向——`fts-only`。
2. **降级必须明示**：所有召回结果携带 `degradedMode`；`degradedMode = null` 表示全能力，非 null 表示已降级及其原因。
3. **不报错的降级比报错更危险**：任何"静默退化"（例如索引被删、provider 静默变 none）都视为缺陷，必须能在 `get_memory_health` 或 reindex 探测中被观察到。

---

## 二、能力矩阵（后端 × 能力）

| 能力 | Postgres | SQLite | 不可用时的降级 |
|------|----------|--------|----------------|
| 词法检索（CJK/拉丁） | `pg_trgm` + 3 个 GIN 索引 | FTS5 `trigram` 虚拟表 + 3 个同步触发器 | 无降级（基线能力，缺失即缺陷） |
| 短查询（<3 字符） | trigram 直接命中 | adapter 回退 `LIKE` | 自动回退，不改变状态 |
| 向量检索 | `pgvector`（Phase 5，**未交付**） | `sqlite-vec`（Phase 5，**未交付**） | 跳过向量通道 → `fts-only` |
| 嵌入提供者 | `EmbeddingProvider=local-onnx`（Phase 5，**未交付**） | 同左 | provider `none` → 不召向量 |
| 证据链 / 召回审计 | `AddMemoryEvidence(Link)` / `AddMemoryRecall(Item)` | 同左 | 无降级（写入即证据；失败即报错） |
| 指标采证 | `AddMetricSnapshot`（唯一键 `repository+metricType+sourceRef`） | 同左 | 采证失败 → `outcome=bypassed`，**评分照常返回** |

> 当前交付状态（2026-09-13）：FTS 双后端已交付并有真机证据；向量链路与本地嵌入为 Phase 5 范围，尚未交付，故线上恒为 `fts-only(embedding=none)`。

---

## 三、退化矩阵（环节故障 → 表现 → 验证）

| # | 故障注入点 | 期望表现 | 明示字段 / 落点 | 验证方式 |
|---|-----------|---------|----------------|---------|
| D1 | 向量 provider 不可用 | 召回正常，仅词法通道 | `degradedMode="fts-only(embedding=none)"` | `recall_memory` 返回值；`get_memory_health.providers.embedding.status="disabled"` |
| D2 | 向量适配器不可用 | 同上，原因含 adapter 状态 | `degradedMode="fts-only(...,vector=unavailable)"` | 同上 |
| D3 | 嵌入维度与真源不一致 | **拒绝写入**，不产生脏向量 | 错误码 `ERR_DIMENSION_MISMATCH` | 单测（Phase 5） |
| D4 | FTS 索引/表被删 | 探测报出缺失对象清单，退出码非零 | `reindex probe` 的 `missing[]` | `npx tsx scripts/memory/reindex.ts probe` |
| D5 | FTS 对象需要重建 | 幂等补齐，复探为 100% | `reindex rebuild` 的 `rebuilt[]` | `npx tsx scripts/memory/reindex.ts rebuild`（重放为 no-op） |
| D6 | 采证写入失败（DB 抖动/越库） | 门禁评分照常返回，只丢证据 | `outcome="bypassed"` + `degradedReason`（响应摘要行） | 单测 + `buildGateCaptureDetail` 三态同构 |
| D7 | 召回管线抛错 | 阶段召回降级，不阻塞调用方 | `skippedReason="pipeline-error"` | `tests/memory/stage-recall.test.ts` |
| D8 | 阶段不在白名单 / `RECALL_MODE=off` | 不访问 DB、不写审计 | `skippedReason="stage-not-whitelisted"｜"recall-off"` | 同上 |
| D9 | 交接摘要候选生成失败 | 其他 consolidation 步骤照常 | `report.errors[]` 含 `handoff-digest` | `tests/memory/consolidation-digest.test.ts` |

---

## 四、运维命令

| 目的 | 命令 |
|------|------|
| 探测 FTS 完整性（只读） | `PROJECT_ROOT=$PWD MAGIC_DIR=.codex npx tsx scripts/memory/reindex.ts probe` |
| 幂等重建（可重放） | `... reindex.ts rebuild` |
| 后端集成测试（含真实 PG） | `RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/memory` |
| 记忆健康度 | MCP 工具 `get_memory_health({ repositoryRef })` |
| 合规清除 | MCP 工具 `forget_memory({ repositoryRef, memoryId, reason, confirm: true })` |

**退出码约定**：`reindex.ts` 在探测到缺失对象时以 `1` 退出（便于巡检告警），参数错误以 `2` 退出。

---

## 五、已实测证据（2026-09-13，本机 PG 5434）

```
$ npx tsx scripts/memory/reindex.ts probe
{ "backend": "postgres", "missing": [], "present": 4, "total": 4, "progress": 100 }  → exit 0

$ npx tsx scripts/memory/reindex.ts rebuild   # 健康库上重放
{ "backend": "postgres", "missing": [], "rebuilt": [], "progress": 100 }             → exit 0（no-op，可重放）

$ RUN_POSTGRES_INTEGRATION=1 npx vitest run tests/memory
Test Files 11 passed | Tests 137 passed
```

---

## 六、已知缺口（登记，不隐藏）

| # | 缺口 | 影响 | 处理计划 |
|---|------|------|---------|
| G1 | 向量 DDL 会被 `db:ensure` 判为「schema 表达不了的多余对象」并自动 apply DROP | 向量列/索引可能被静默删除 | 轮 3 前置：先落 `db-ensure` 的 DROP 守卫 |
| G2 | v1 兼容门面为「映射 + 弃用声明」，未真正转发执行 | 旧调用方拿到的是迁移指引而非结果 | 需把 `memory.ts` 操作层抽为共享 ops 模块后转发（轮次边界内不做） |
| G3 | v1 工具名清单无历史实证（仓库内零命中） | 若真实旧名单不同，映射会错位 | 表驱动：改 `memory-compat.ts` 的 `SHIM_TABLE` 一行即可 |
