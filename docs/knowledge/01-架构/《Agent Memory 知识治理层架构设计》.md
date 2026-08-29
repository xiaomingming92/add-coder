# 《Agent Memory 知识治理层架构设计》

> 对应 Plan：`.codex/plans/2026-08/19/add-coder-agent-memory-plan-v2.md`
> 版本：v1 · 日期：2026-08-19 · 状态：实施前基线（ADD-0.1 文档先行）

---

## 1. 定位

ADD Memory 是 add-coder 治理层的**跨 Plan 项目知识子系统**：从治理 Evidence 提炼知识，用状态机维护可信度，用 scope-aware Hybrid Recall 服务开发流程，用 Recall 与 Gate 结果持续校正。不是附带向量检索的聊天记录库。

核心闭环：

```text
治理事件 → 不可变 Evidence/MetricSnapshot → Memory Candidate → 去重/冲突/审核
→ Active Memory → Hybrid Recall 与上下文注入 → Recall Audit/Gate Outcome
→ 修订、失效、替代或 Pattern 晋升
```

## 2. 模块边界（落地到本仓库实际结构）

| 模块 | 路径 | 职责 |
|------|------|------|
| 数据模型 | `prisma/add.prisma` + `templates/core/prisma/add.prisma`（双份同步） | 6 枚举 + 6 模型（AddMemory/Evidence/EvidenceLink/MetricSnapshot/Recall/RecallItem） |
| Migration | `prisma/migrations/`（prisma migrate）+ `prisma/atlas-migrations/` | 基础表 + PG pg_trgm FTS 索引 + SQLite FTS5 bigram 虚表的原生 SQL |
| 领域层 | `templates/core/scripts/mcp-server/shared/memory/domain/` | 状态机、scope 规则、去重、冲突检测、密钥扫描 |
| 检索层 | `templates/core/scripts/mcp-server/shared/memory/retrieval/` | FTS adapter（PG/SQLite）、RRF 融合、治理重排、token-budget context builder、Recall 审计写入 |
| Embedding | `templates/core/scripts/mcp-server/shared/memory/embedding/` | Provider 抽象；首版 `none`，pgvector/sqlite-vec 留接口（Phase 5） |
| 异步任务 | `templates/core/scripts/mcp-server/shared/memory/jobs/` | consolidation（去重/冲突队列）、embedding、reindex；DB 表驱动可重试 |
| MCP 工具面 | `templates/core/scripts/mcp-server/tools/memory.ts` | 8 个 MVP 工具（propose/recall/get/list/review/resolve/feedback/health） |
| Hook 集成 | `templates/core/governance/`（session-start-guard、prompt-router、post-tool-router 等） | 确定性召回注入 + Evidence 自动采集（同步预算 ≤200ms） |
| 评测 | `tests/memory/fixtures/` + `scripts/memory/recall-eval.ts` | 50+ 人工标注查询（含 CJK）、Recall@5/MRR 指标脚本 |

> Plan §14 中的 `src/mcp/`、`src/memory/` 为逻辑路径，实际落位以本表为准（MCP server 在模板层交付）。

## 3. 关键架构决策（§17 定案摘要）

1. **repositoryRef = projectKey**（`sha256("add-project\0" + canonicalRoot)`），与 AuditLog/DevOperation 同口径；所有查询先鉴权（repository 边界校验）再检索。
2. **双后端共用一份 Prisma schema**；向量列与 FTS 索引由原生 migration 分发，schema 不表达向量列。
3. **CJK FTS**：PG 用 `pg_trgm`；SQLite FTS5 用 bigram 外部内容表。
4. **可信度先于相似度**：lifecycle 过滤（默认只召回 ACTIVE）→ repository/scope 过滤 → FTS 候选 → RRF → 治理重排。
5. **FTS 是可靠基线，Vector 是可选增强**：任何 embedding/pgvector/sqlite-vec 故障降级 FTS-only，不阻塞 ADD Gate（`degradedMode` 明示）。
6. **自动采证、受控成忆**：Hook 只写 Evidence/MetricSnapshot/Candidate，不得直接创建 ACTIVE。
7. **ORGANIZATION scope 首版禁用**（枚举保留，写入拒绝）。
8. **EmbeddingProvider 首版 = none**；local-onnx 推迟到 Phase 5 评审。

## 4. 数据流

**写入流**：Hook/工具 → 密钥扫描 → Evidence（幂等：repositoryRef+sourceType+sourceRef+contentHash 唯一）→ Candidate（幂等：repositoryRef+contentHash+scope 唯一）→ review → approve（强制 Evidence ≥1 + approvedBy/approvedAt）→ ACTIVE。

**召回流**：`recall_memory(intent, stage, scopeContext, maxTokens)` → repository 校验 → lifecycle 过滤 → scope 过滤 → FTS 候选 →（Vector 候选，能力可用时）→ RRF → 治理重排（scopeBoost/kindBoost/importance/confidence/强约束 − stale/conflict/冗余罚分）→ token 预算裁剪 → 写 AddMemoryRecall + RecallItem → 返回 items + whySelected + degradedMode。

**反馈流**：`feedback_memory(recallId, memoryId, outcome)` → RecallItem.outcome；Gate 结果经 consumerRef 关联 → 驱动 mark_stale / supersede / 趋势 Candidate。

## 5. 降级矩阵（首版承诺）

| 故障 | 行为 | 阻塞 Gate |
|------|------|----------|
| Embedding Provider 不可用 | FTS-only；新项标记 FAILED/PENDING | 否 |
| pgvector / sqlite-vec 不可用 | FTS-only | 否 |
| FTS 索引损坏 | 受限结构化查询 + 告警 + 触发重建 | 仅强制 Memory Gate 时 |
| DB 不可用 | 明确错误，不注入未验证缓存 | 按现有 DB 故障策略 |

## 6. 发布开关

```text
ADD_MEMORY_ENABLED            # 总开关
ADD_MEMORY_RECALL_MODE        # off | shadow | inject
ADD_MEMORY_VECTOR_MODE        # off | auto | required（required 仅测试）
ADD_MEMORY_AUTO_PROPOSE       # 默认 false
ADD_MEMORY_MAX_TOKENS         # 召回注入预算
```

发布顺序：schema-only dark launch → shadow recall → opt-in FTS injection →（Phase 5 后）vector canary → GA。

### 6.1 运维手册（实现落点，轮次 4 校准）

| 开关 | 默认 | 消费者 | 实现 |
|------|------|--------|------|
| `ADD_MEMORY_RECALL_MODE` | `shadow` | session-start-guard（L1 注入三态）、prompt-router（回忆提示）、post-tool-router（采证总闸之一） | `shared/memory/switches.ts` |
| `ADD_MEMORY_MAX_TOKENS` | `600` | session-start-guard L1 截断；snapshot job L1 预算 | 同上 |
| `ADD_MEMORY_EVIDENCE` | `on` | post-tool-router 白名单采证入队 | 同上 |
| `ADD_MEMORY_VECTOR_MODE` | `off`（等价 embedding=none） | recall_memory degradedMode 标注 | `shared/memory/embedding/index.ts` |

快照契约：`${MAGIC_DIR}/memory/l1-context.md`（L1，TTL 7 天）/ `l2-context.md`（L2）；
采证队列：`${MAGIC_DIR}/memory/evidence-queue.jsonl` + `evidence-queue.offset`（字节偏移，重放幂等）。
异步任务入口：`scripts/memory/memory-jobs.ts <refresh-l1 | drain-evidence | consolidate>`。
Hook 侧约束：同步路径只读快照/写队列（无 DB），任何记忆故障 fail-open 不阻断主流程。

## 7. 与既有治理面的关系

- **不替代** Git、ADR、AuditLog、DevOperation、Handoff——Memory 是它们的治理投影；
- AuditLog/DevOperation 是事实源；所有 Memory 状态迁移写 AuditLog（actor、reason、前后状态）；
- Handoff 保持 Plan 级交接语义，可关联本 Plan 使用/产生的 Memory；
- 会话注入分层：session-init 只注入小型 L1，任务相关 L2 由 `recall_memory` 按需获得。
