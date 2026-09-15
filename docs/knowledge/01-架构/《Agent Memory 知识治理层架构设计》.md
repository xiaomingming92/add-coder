# 《Agent Memory 知识治理层架构设计》

> 对应 Plan：`.codex/plans/2026-08/19/add-coder-agent-memory-plan-v2.md`
> 关联 Plan（本分支）：`add-coder-agent-memory-closure-plan-v1`（闭包）、`add-coder-memory-rank-calibration-plan-v1`（排序校准）、
> `add-coder-core-validation-lifecycle-plan-v1`（校验层接线）、`add-coder-hitl-widget-runtime-gap-plan-v1`（运行时可见性）
> 版本：v2 · 日期：2026-09-14 · 状态：**实施后回填（as-built）** — v1 为 2026-08-19 实施前基线，§8 起为落地后的现状与新增子系统

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

---

## 8. 实施现状（as-built，2026-09-14 回填）

v1 的 §1–§7 是**设计基线**；下表是落地后与基线的对应关系（差异处已注明实测）。

| 基线条目 | 落地情况 | 证据 / 落点 |
|---------|---------|-----------|
| §2 数据模型 6 枚举 + 6 模型 | ✅ 已建 | `prisma/add.prisma`；主库 15 表 / `vector 0.8.6` / `add_memory_vector` + 2 索引 |
| §3.5 FTS 基线 + Vector 可选 | ✅ 已落地**双通道** | `memory/retrieval/vector/{pgvector,sqlite-vec}.ts` + 能力检测与 `degradedMode`；`memory/embedding/{local-onnx,openai-compatible}.ts` |
| §4 写入流（Evidence→Candidate→ACTIVE） | ✅ 已落地 + **Gate→MetricSnapshot 采证** | `memory/metrics/{gate-writer,stage-words,gate-recall}.ts`（采证幂等：`sourceRef=<gate>:<planKeyword>:<runId>`，runId **内容派生**） |
| §6 发布开关 | ✅ 已落地（含 L1/L2 快照与采证队列） | `shared/memory/switches.ts`、`${MAGIC_DIR}/memory/{l1,l2}-context.md`、`evidence-queue.jsonl` |
| §3.8 Embedding 首版 none | ⬆️ 已推进到 Phase 5（双 provider） | 同上；`ADD_MEMORY_VECTOR_MODE=off|auto|required` |
| Handoff Digest（v1 未列） | ✅ 新增：候选态生成，不进 ACTIVE | `memory/domain/handoff-digest.ts`；`memory-compat.ts` 提供 v1 门面（`deprecated+mappedTo`，**不转发执行**） |
| 排序参数（v1 硬编码） | ⬆️ 改为**由观测校准**（权重快照为单一事实源） | `calibration/*`（反馈统计 / 批量拟合 / 快照 / Kalman / FFT 诊断）+ `scripts/memory/*`；`rankingVersion` → v3（快照哈希） |

**实测指标（门槛不下调，如实登记）**：FTS-only `Recall@5 = 0.9592`（≥ 0.9188 ✅）、`MRR@5 = 0.6551`；
Hybrid 融合把 `MRR@5` 从 0.2612 抬到 **0.4867 后收敛，仍 < 0.75 门槛 ❌** —— 瓶颈是 top-5 内的排序判别力，
由 `memory-rank-calibration` 以数据校准替代手调（该 plan 仍在飞，见 §11）。

## 9. 校验层与生命周期联动（本分支新增子系统）

原设计里"文档是否合规"散落在 hook 内联实现与临时脚手架中（三重真源）。本分支把它收敛为一层：

```text
schema 真源（templates/core/templates/*.schema.json，20 份）
        │
        ▼
core 校验层 templates/core/validation/
  ├─ schema-validator  章节/子章节/轮次/占位符/结构位禁词 + 锚定 + 半角全角等价
  ├─ registry          17 类文档 → schema 工厂（未注册即抛，不回落通用校验）
  ├─ policy            卡位 → advisory|blocking（带依据）+ 规则适用性（Rule × Hook）
  └─ validators/*      各类型专司语义（handoff 需可执行审计查询、checklist 需 [T]/[R]…）
        │
        ├─► 写入守卫（PreToolUse/PostToolUse；SearchReplace 分支只判占位符+禁词）
        ├─► 封口判定（unit-state 的 handoff 因子 = 存在 ∧ 合规）
        └─► 批量命令 scripts/validate-docs.ts（收尾/sync 巡检；默认 advisory，--strict 才非零退出）
```

三条硬约束：**判定只读 schema 真源**（不得自解析模板/硬编码章节名）；**schema 缺失即显式失败**（不静默放行）；
**规则集与适用性分离**（锚定类仅书写卡位算缺陷，避免把历史文档判违规）。分发随 `sync-magic-rules.toml` 的
`validation` 分类到六个 magic 目录；追踪器（`plan_track`/`review_track`）与校验层**同口径**（复用 `checklistStats`）。

## 10. 运行时治理与 HITL 链路（本分支新增）

**产物-进程新鲜度**（`shared/runtime-freshness.ts`）：`npm run sync` 重写产物但不会重启运行中的 MCP server →
按 adapter 扫描进程并与产物 mtime 比对，四态判定（`stale | true | false | unknown`），陈旧者点名告警并写
`{magicDir}/.mcp-restart-required`；server 启动时自愈清除该标记。

**孤儿族治理**：IDE/app 退出只杀直接子进程，`npm exec → sh -c → tsx → node` 被 reparent 到 `systemd --user` 继续存活
（`.qoder`/`.codex` 上反复出现）。判定按**整族**（族根 ppid 落在 init/systemd/conmon 或父进程已消失 → 整链标记），
回收在 sync 末尾两段式 SIGTERM→SIGKILL，只动孤儿；server 侧另有孤儿自退看门狗。做法文书：`docs/knowledge/02-规范/孤儿进程识别与回收.md`。

**HITL 链路**：`create_hitl`（Codex/mcpApps 直接产出 DRAFT，不展开 elicitation）→ `render_hitl_approval`（只读渲染，
返回 `stale` + `ui.rendered="unknown"` **不谎报** + `fallback{markdownPath,htmlPath}`）→ 用户拍板 →
`update_hitl`（写库 + 哨兵 + **回写 `hitl.md` 的「审批结论」表：时间/决策/原因**）。widget 渲染的完整前提 =
客户端 MCP Apps 能力（Codex 各 build 行为不同，26.903 渲染、26.908 对项目级 server 判 fallback）+
工具定义 `_meta.ui.resourceUri` + 资源 mime `text/html;profile=mcp-app` + 资源存在 + `dimensions` 非空。
**widget 不可用时，markdown 提案 + 实例 HTML + 聊天拍板是正式通道**（不依赖客户端能力）。

## 11. 未达标与挂账（如实登记）

| 项 | 状态 | 说明 |
|----|------|------|
| Hybrid `MRR@5 ≥ 0.75` | ❌ 未达标（0.4867） | 校准基座已交付；**门槛不下调**，待足够多单元封口后复跑（`rank-calibration` 仍 in-flight） |
| `rank-calibration` checklist 证据 | ⏳ 38 处待回填 | 依赖上述样本前提；该文档是当前唯一仍报缺陷的产物 |
| widget 在 Codex 26.908 的渲染 | ⏸ 客户端侧 | 服务端逐字节对齐对照机（z2u/26.903）仍为 fallback；结论=客户端 build 回归，已归档待上游修复 |
| 单元封口四要素（memory-closure） | ⏳ 未合取 | `ROUND_CLOSED ✅ / handoff ✅ / 验收证据 ❌（MRR）/ planStatus ❌` → 不得作为跨单元校准样本 |
