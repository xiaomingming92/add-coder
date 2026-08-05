# add-coder-collab-contract-review-v1

## Review 元信息

- **Review 对象**: `add-coder-collab-contract-plan-v1.md`（并发协作契约能力统筹 Plan）
- **对比方案**: 方案 A（htc 验证版反向移植） vs 方案 B（重新设计） vs 方案 C（仅模板不落代码）
- **Review 时间**: 2026-08-05
- **Review 类型**: 方案选型 / 架构决策 / 现状校准（PLAN_REVIEW，HITL round 2）
- **前置阅读**: `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md`、htc 验证实例 `htc-g13-extra-time-quest-collab-contract-v1.md`、commit 977e976/362685d

---

## HITL 发现总览（一次性提交人类审核）

> **规则**: AI 必须先在此表中列出 **所有发现**，等待人类一次性审核通过后再逐项推进。

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | P1 | 状态脱节 | ADD-7 表 8 项全部标「待实施」，但 commit 977e976（08-05 14:30）已落地约 75%：模板 §3.6、add.prisma 真源、contract.ts（182 行）、hitl.ts COLLAB_CONTRACT、caijuehub 注册、4 IDE 分发。照 Plan 原样执行将重复劳动 | 回写 ADD-7 状态列（5 项已实施标注 commit），修正 beforeState，仅保留真实缺口为待实施 | ✅ 同意 |
| 2 | P1 | 环境可用性 | 根 `prisma/add.prisma` 与模板真源不同步（无契约模型），`src/generated/prisma/client` 无 collabContract，根 migrations 无 `add_collab_contract` 迁移（htc 侧已有）——add-coder 自身 contract_track 必然报错，验收标准无法达成 | 同步根 schema → `prisma migrate dev --name add_collab_contract`（禁 db push）→ `prisma generate` → 实证 contract_track | ✅ 同意 |
| 3 | P2 | 验收可执行性 | 验收第 3 条「contract_track 扫描 htc 契约→落库」跨仓库不可执行（工具只扫自身 plans/） | 验收改为：add-coder 本地放契约样例文档（或临时拷贝 htc 契约）扫描验证 | ✅ 同意 |
| 4 | P2 | 模板完整性 | 模板缺 §7 持久化设计章节（htc 版有 §7.1/7.2/7.3）；schema.json `fileBoundaries` 缺 `isolationMode` 字段（Plan afterState 承诺含 participants.description/isolationMode） | 模板补 §7；schema 补 isolationMode（Task 1.1/1.2 收尾） | ✅ 同意 |
| 5 | P3 | 工具残留 | `plan.ts` 无 contractRole/contractName 支持（Task 2.3 未做，plan_status 不展示契约角色）；`docs/caijuehub.md` 未同步契约裁决入口（Task 3.1 部分未做，代码已注册） | plan_status 补契约角色展示；docs/caijuehub.md 补 CONTRACT 裁决说明 | ✅ 同意 |
| 6 | P3 | 健壮性 | contract.ts 解析硬编码正则依赖模板精确表头（`\| 阶段 \| 专家 \| 触发条件 \| 并行度 \|` 等），表头微调即静默解析失败；`.hitl.md` 提案文件仍显示 DRAFT 与哨兵 TONGYI 不一致 | parseContractDoc 对空解析结果告警；核对 update_hitl 是否回写提案文件状态 | ✅ 同意 |

> **人类确认后**: AI 在下方逐条展开详细分析。每一条展开时必须引用上方编号。

---

## 1. 问题复现

为什么需要这次评审？

1. **能力收敛未闭环**（#1）：Plan 声明「add-coder 真源模板仍是雏形、无 MCP 工具」，但仓库实际已处于 `feature/collab-contract-v1` 分支，commit 977e976 已将契约能力完整落地（模板补 §3.6、`CollabContract` 模型、`contract.ts` 双工具、`hitl.ts` 类型扩展、Caijuehub 注册、四 IDE sync 分发）。Plan 的 ADD-7 表与实施状态完全脱节——若按 Plan 原样执行，已落地部分会被重复实施。
2. **真源与运行环境分裂**（#2）：模板真源 `templates/core/prisma/add.prisma` 已含契约模型，但 add-coder 自身运行链路未跟进：根 `prisma/add.prisma` 无契约模型、`src/generated/prisma/client` 无 `collabContract`（grep 0 匹配）、根 migrations 无 `add_collab_contract` 迁移。MCP server 实际加载 `src/generated/prisma` 客户端，`contract_track` 在本仓库必然报错——「验收：contract_track 落库成功」无法达成。
3. **验收标准不可执行**（#3）：`contract_track` 只扫描自身 `plans/*-collab-contract-*.md`，无法跨仓库读取 htc 契约文档，验收第 3 条物理上不可执行。
4. **模板与 schema 未对齐 htc 验证版**（#4）：模板缺 §7 持久化设计（htc 版 §7.1/7.2/7.3 齐全）；schema.json 的 `fileBoundaries` items 缺 `isolationMode`（模板 §3.2 已描述 file/worktree 两种隔离模式，schema 未承载）。
5. **残留缺口**（#5）：`plan.ts` 的 `plan_status` 不展示 `contractRole/contractName`（Plan Task 2.3 未实施）；`docs/caijuehub.md` 无契约裁决入口（`src/caijuehub/caijue.toml` 已注册 `collab-contract` 裁决，文档未同步）。
6. **实现健壮性**（#6）：`parseContractDoc` 硬编码正则匹配精确表头（`| 阶段 | 专家 | 触发条件 | 并行度 |`、`| **Lead Agent** |`），模板表头微调即静默返回空数组；`.hitl.md` 提案文件头仍为 DRAFT，与哨兵 TONGYI 不一致（双通道校验存疑）。

评审输入：Plan（ADD-7 表 8 项 + 3 轮 Task 概要）+ htc 验证实例 + 当前分支实际代码（977e976/362685d/5875fa7）+ HITL round 1 审批（哨兵 TONGYI 已确认）。

---

## 2. 方案对比

### 2.1 方案 A: 从 htc 验证版反向移植（Plan 选定）

- 复用度高：htc 已通过 HITL TONGYI + 迁移成功（`20260805060540_add_collab_contract`）+ 数据写入实证
- 实际落地进度：约 75% 已完成（977e976），剩余为收尾与运行环境打通
- 结论: ✅ 采用（按现状校准后继续）

### 2.2 方案 B: 重新设计

- 重复劳动，与 htc 已验证模型分叉，schema/HITL/工具三处风险
- 结论: ✗ 排除（Plan 原判正确）

### 2.3 方案 C: 仅模板不落代码

- 能力不可用，无法服务其他项目（Plan 原判正确）
- 结论: ✗ 排除

---

## 3. 决策结论

**按方案 A 继续，落实以下评审发现（已获人类同意）**：

- **P1 #1（状态脱节）**: 回写 Plan ADD-7 状态列——5 项标注「已实施(977e976)」，2 项部分实施（模板 §7、caijuehub 文档），保留真实缺口为「待实施」；修正 beforeState 描述与现状一致。
- **P1 #2（环境可用性）**: 根 `prisma/add.prisma` 同步模板真源 → `prisma migrate dev --name add_collab_contract`（**禁止 db push**）→ `prisma generate` → `contract_track` 实证。
- **P2 #3（验收可执行性）**: 验收第 3 条改为「本地契约样例文档（或临时拷贝 htc 契约至本仓库 plans/）扫描落库成功」。
- **P2 #4（模板完整性）**: 模板补 §7 持久化设计（对齐 htc §7.1 模型/7.2 HitlType/7.3 迁移）；schema.json `fileBoundaries` items 补 `isolationMode`（enum: file/worktree）。
- **P3 #5（工具残留）**: `plan.ts` 的 `plan_status` 增补 `contractRole/contractName` 展示；`docs/caijuehub.md` 补契约裁决入口说明。
- **P3 #6（健壮性）**: `parseContractDoc` 解析结果为空时输出告警（提示表头不匹配）；核对 `update_hitl` 是否回写 `.hitl.md` 提案文件状态。

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | 操作 | 评审关注点 |
|------|------|-----------|
| `.qoder/plans/2026-08/05/add-coder-collab-contract-plan-v1.md` | 修改 | ADD-7 状态回写（P1 #1） |
| `prisma/add.prisma`（根） | 修改 | 同步模板真源契约模型（P1 #2） |
| `src/generated/prisma/*` | 重新生成 | 契约模型进入 client（P1 #2） |
| `prisma/migrations/`（根） | 新增 | `add_collab_contract` 迁移（P1 #2） |
| `templates/core/templates/collab-contract-template.md` | 修改 | 补 §7 持久化（P2 #4） |
| `templates/core/templates/collab-contract-template.schema.json` | 修改 | 补 isolationMode（P2 #4） |
| `templates/core/scripts/mcp-server/tools/plan.ts` | 修改 | plan_status 契约角色展示（P3 #5） |
| `docs/caijuehub.md` | 修改 | 契约裁决入口（P3 #5） |
| `templates/core/scripts/mcp-server/tools/contract.ts` | 修改 | 解析空结果告警（P3 #6） |

### 4.2 数据流影响

- 无新增依赖（复用现有 prisma/zod 栈）
- `CollabContract` 表新增后，`contract_track` 首次运行 upsert 契约记录；`masterPlanName` 外键 `onDelete: Restrict` 保证总控 Plan 不被误删
- `src/generated/prisma` 重新生成后，MCP server 启动即加载契约模型，无运行时切换风险

### 4.3 回滚风险

- 模板/工具改动单向可回退（git 管控，当前分支 `feature/collab-contract-v1`）
- 迁移 `add_collab_contract` 为增量新增表/列，不触碰既有表结构；`prisma migrate dev` 失败可 `migrate resolve` 处理（参照 htc 侧同名迁移先例）
- client 重新生成不影响既有工具（plan_track/hitl 回归验证项保留在验收清单）

---

## 5. 建议修正优先级

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | P1 #1 状态回写 | 必须先回写 Plan ADD-7，避免后续实施重复劳动与审计失真 |
| 高 | P1 #2 根环境打通 | 验收「contract_track 落库」的前置条件，阻断性 |
| 中 | P2 #3 验收修正 | 与 #2 一并落地，保证验收可执行 |
| 中 | P2 #4 模板补全 | Task 1.1/1.2 收尾，对齐 htc 验证版 |
| 低 | P3 #5 工具残留 | Task 2.3/3.1 收尾，功能展示与文档一致性 |
| 低 | P3 #6 健壮性 | 解析告警 + hitl 状态回写核对 |

## 6. 最终建议

- **先回写 Plan ADD-7 状态（P1 #1），再按剩余缺口顺序实施**：根环境迁移打通（P1 #2）→ 模板/schema 补全（P2 #4）→ plan.ts + docs 收尾（P3 #5）→ 健壮性（P3 #6）
- 实施完成后按 Plan 验收标准执行：`contract_track` 本地实证、`plan_track/hitl` 回归、lint + tsc 零错误、`npm run sync` 四 IDE 一致
- 全部验证通过后 bump 版本发布（Task 3.3），发布前确认 `dist/` 构建产物包含 contract 能力
