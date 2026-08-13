# 多 IDE 进程并发契约（进程层 v2）

> **定位**：add-coder 并发契约体系的**进程层**契约——定义 MCP Server 在多 IDE 并行连接下的行为承诺。与协作层 v1（[collab-contract](../templates/core/templates/collab-contract-template.md)，v0.3.18「并发协作契约」）构成双层体系：协作层管"谁做什么"，进程层管"MCP Server 进程如何正确并发"。
>
> **关联**：issue #12（多 IDE 并行稳定性）· add-coder-codex-native-adapter-plan-v1 §1.3
> **版本**：~~v2 · 2026-08-10~~ → v2.1 · 2026-08-13（Runtime Review 架构回流；v2 历史声明保留删除线）
>
> **实施状态**：本文是目标契约，不是完成证明。凡涉及 scoped schema、DB unique/upsert、legacy migration、Plan lifecycle resolver 的条款，在 migration + 竞争测试落地前统一视为“未实现 / Gate fail closed”。[回流: Runtime Review P0 #9-#13/#17]

---

## 1. 双层体系总览

| 层 | 契约 | 版本 | 职责 | 消费方 |
|----|------|------|------|--------|
| 协作层 | collab-contract（并发协作契约） | v1（v0.3.18，v2.1 修订持久化绑定） | 多智能体协作秩序：文件边界 / 仲裁链路 / 审计分桶；Plan 绑定必须带项目 + Adapter scope | 总控 scoped Plan + N 个 scoped 子 Plan |
| **进程层** | **本文档** | **v2.1** | MCP Server 并发行为承诺：连接模型 / 幂等键 / PROJECT_ID 校验 / 断开隔离 / 生命周期拆分 / client 差异矩阵 | 多 IDE 并行连接同一项目 |

**衔接点**：协作层的"文件边界 + 审计分桶"能成立，依赖进程层的"幂等写入 + 防串线"保证——多智能体并行实施（协作层）与多 IDE 并行连接（进程层）互为支撑。

~~共享同一个 PostgreSQL 即可把治理状态视为项目共享真源。~~ → 共享数据库只是存储拓扑，不决定数据所有权；系统同时存在两个数据平面：[回流: Runtime Review P0 #12]

| 数据平面 | 身份/边界 | 内容 | 跨 Adapter 规则 |
|---------|-----------|------|----------------|
| Adapter-local governance | `RuntimeContextKey(projectKey, adapterKey)` | Plan / Spec / Route / Review / HITL / DPS / Plan Gate | 默认完全隔离；`.add` 也是独立 Adapter scope，不是中立共享目录 |
| Project-shared explicit collaboration | `projectKey + contractId`，header 带 ownerAdapter | CollabContract header、带 producerAdapter/contextId 的 AuditLog / DevOperation | 仅通过已批准 binding 关联 scoped Plan；禁止同名/模糊 keyword 自动互认 |

CollabContract 不再用裸 `masterPlanName` / `boundPlans: string[]` 表示成员；目标模型为 project-scoped header + `(contractId, projectKey, adapterKey, planName, role)` binding。协议语义仍可 IDE 无关，但持久化身份必须感知 Adapter。

---

## 2. 连接模型

- **进程边界**：1 IDE = 1 mcp-server 子进程（stdio 传输，独占 stdin/stdout）；多 IDE = 多独立子进程，进程间无共享内存。
- **PG 连接**：每进程 1 个 PrismaClient 单例；`connection_limit = max(1, floor(100 / N_IDE))`（PG 默认 max_connections=100，预留 20 给 IDE 外连接）。N_IDE ≤ 3 时 limit=10。
- **启动时序**：`db-ensure.sh` 完成 → mcp-server 启动（串行依赖，不并行启动）。
- **MCP 协议**：JSON-RPC 2.0，`id` 关联请求/响应，响应允许乱序——协议支持并发，但"是否并发发起"由 client 编排层决定（见 §8），server 只保证"正确响应并发"。

---

## 3. 幂等键

- ~~**工具调用层**：`key = sha256(toolName + sorted_json(args))` → DB upsert 去重；写工具 `record_dev_operation` 用 planKeyword+targetType+targetId+action 组合唯一约束。~~ → 该声明与现有 schema/handler 不符，且仅按参数哈希会错误合并“参数相同但意图不同”的操作。v2.1 要求写调用携带或生成稳定 `operationKey`，数据库建立 `UNIQUE(projectKey, adapterKey, toolName, operationKey)`，并在单 transaction 内 atomic upsert。[回流: Runtime Review P0 #10]
- **连接层**：Claude Code 既有机制（command+URL 签名），add-coder 不重复实现。
- ~~**存储**：DB 唯一索引，不依赖内存缓存（进程重启不丢失去重状态）。~~ → 这是目标状态而非现状；schema/migration/并发重复请求测试三者完成前，不得宣称已具备幂等。[回流: Runtime Review P0 #10]

**并发写规则**：Plan/Review/Contract 禁止无版本保护的 find-then-write；HITL next round 必须用 scoped unique `(projectKey, adapterKey, planName, type, round)` 配合锁定/原子重试。冲突返回明确 retryable conflict，禁止 lost update。[回流: Runtime Review P0 #11]

---

## 4. RuntimeContextKey 与路径边界

- ~~**PROJECT_ID = PROJECT_ROOT** 足以作为项目与治理状态身份。~~ → `PROJECT_ROOT` 只用于推导 `projectKey`；治理身份必须是不可变 `RuntimeContextKey(projectKey, adapterKey)`，其中 adapterKey 由启动 adapter/magic dir 一一映射，不从“现存哪个目录”猜测。[回流: Runtime Review P0 #9]
- **校验时机**：mcp-server 启动时 canonicalize `PROJECT_ROOT`，验证 cwd、adapterKey、magicDir 一致后冻结 context；缺失或冲突即 exit 1，不回退其他 Adapter。
- **数据身份**：Plan 使用 `(projectKey, adapterKey, planName)` compound identity；Review/HITL/Spec/Route 以 scoped foreign key 关联，工具禁止只按裸 planName/keyword 查询。
- **路径 containment**：从 DB 读取的路径在使用前 canonicalize，并验证位于 `<projectRoot>/<magicDir>`；越界、软链逃逸或环境冲突一律 fail closed。

### 4.1 Plan lifecycle 的数据库权威性

~~各 IDE Hook 可通过 Plan/Handoff/add-route 文件存在性、未勾选项或 mtime 推断当前 active Plan。~~ → Plan lifecycle 必须持久化在 scoped PlanRecord，并由 core 的机器可读 status resolver 统一查询；MCP `plan_status` 与所有 adapter Hook 只是同一 resolver 的不同协议投影。[回流: Runtime Review P0 #17]

- 最小 lifecycle：`DRAFT / ACTIVE / BLOCKED / REJECTED / CLOSED / ABANDONED`；只有 `ACTIVE/BLOCKED` 表示存在活跃治理上下文。
- PLAN HITL `TONGYI/BOHUI`、显式 block/unblock、Step 8 `ROUND_CLOSED` 必须通过 scoped transaction 迁移状态；tasks/checklist 计数仅表达进度。
- Handoff 是 Step 8 交接产物，Plan/Spec/add-route/Review/HITL 是内容与证据，不得覆盖 DB lifecycle。
- DB ACTIVE + 无 Handoff 必须保持 active；DB CLOSED + 残留文件必须保持 inactive。
- DB 或 RuntimeContextKey 不可用时返回 `STATUS_UNAVAILABLE` 并 fail closed，禁止回退文件扫描或其他 Adapter。

### 4.2 Linux 风格的 lifecycle 发布/订阅拉取

~~每个进程自行轮询 PlanRecord，或由通知直接携带完整 lifecycle 供消费者采用。~~ → 状态改动者在更新 scoped lifecycle 的同一个 Prisma transaction 内调用 PostgreSQL `pg_notify('add_plan_lifecycle_changed_v1', envelope)`；各长驻 Adapter MCP 通过专用 session LISTEN，收到“已变化”信号后以自己的 RuntimeContextKey 主动调用 shared resolver 查库。[回流: Runtime Review P0 #18]

- NOTIFY 是变化信号，不是状态载体。payload 仅含 `schemaVersion/eventId/projectKey/adapterKey/planId/revision`，禁止携带权威 lifecycle、approval、progress 或敏感数据。
- PostgreSQL 在 commit 后投递；transaction rollback 不得产生状态变化或通知。
- 订阅者先校验当前 scope，再主动查询数据库；通知中的任何业务状态字段都必须忽略。
- 初始化/重连顺序为 `connect → LISTEN → scoped full query`；重复、合并、丢失通知只影响刷新次数，不能改变最终状态。
- 短生命周期 Hook 不常驻 LISTEN；它通过本 Adapter 机器查询桥直接调用同一 resolver。
- 本契约不引入 Kafka 的 topic、consumer group、offset、重放日志或事件溯源语义。

---

## 5. 断开隔离四态

| 场景 | mcp-server 行为 | PG 连接 | Advisory Lock |
|------|----------------|---------|:---:|
| 正常退出 (SIGTERM) | `$disconnect()` → process.exit(0) | 主动释放 | 随事务释放 |
| stdio 断开 (SIGPIPE) | 监听 stdin end → 同正常退出 | 主动释放 | 随事务释放 |
| PG 连接断开 | PrismaClient 内置重连（无额外机制） | 自动重连 | ⚠️ 锁已随旧 session 释放 |
| 进程崩溃 (SIGKILL) | 无机会清理 | PG 检测心跳超时释放 | 自动释放 |

**承诺**：任一 IDE 的断开/重启不影响其他 IDE 的 MCP 连接（进程级隔离，无共享内存/端口）。

---

## 6. 数据库生命周期拆分

| 阶段 | 操作 | 执行者 | 并发保护 |
|------|------|--------|---------|
| 安装/升级 | 迁移（prisma/Atlas）、Schema Patch、初始化数据 | `db-ensure.sh`（安装时执行一次） | `pg_try_advisory_lock(0xADD001)` 非阻塞拿锁，失败 exit 1 |
| 每次启动 | 只读检查（连接可用性、表存在性） | mcp-server 启动路径 | 无写操作，无需锁 |
| 运行期 | 业务写入（Plan/Contract/Audit/DevOperation） | MCP 工具 | ~~幂等键 + 唯一索引（§3，视为已实现）~~ → scoped unique + atomic transaction；落地前 fail closed [回流: Runtime Review P0 #10/#11] |

**原则**：迁移只执行一次（锁 + 幂等）；启动只做只读检查；迁移失败必须真实非零退出，不得显示"已就绪"假成功。

---

## 7. Legacy scope、Gate 与审计证据

### 7.1 旧数据迁移

- 迁移先 dry-run：仅当 canonical `planPath/specPath/reviewPath` 一致落入一个已知 magic dir 时，才从路径推导 adapterKey。
- 路径缺失、多目录冲突、未知目录、软链越界均标记 `legacy-unknown`；不得默认归入 `.add`、当前 Adapter 或主导 AI。
- `legacy-unknown` 只提供诊断，不得被 active Plan、HITL approved、Route/RAHS Gate 使用；正式迁移必须与 dry-run 分桶计数对账。[回流: Runtime Review P0 #13]

### 7.2 Gate 与 Audit

- Route/RAHS/Plan Gate 默认精确限定当前 RuntimeContextKey；scope 内可模糊搜 keyword，scope 外证据必须匹配已批准 collaboration binding。
- AuditLog/DevOperation 每行保存 `projectKey + producerAdapterKey + contextId`；可验证 receipt 同时展示 `beforeState/afterState`。
- 文件审计输出归调用方 Adapter；共享 DB 审计不赋予任何 Adapter 修改另一个 magic dir 的权限。
- 典型负向要求：Codex route 缺失、Qoder 同名 route/audit 存在时，Codex Gate 必须失败，并可报告被排除的跨 scope 证据。[回流: Runtime Review P1 #14]

---

## 8. client 编排行为差异矩阵

> 并发发起方均为 **client 编排层**（MCP 协议/server 不发起并发）。新 IDE client 接入时先查本矩阵确定其并发策略，再对齐 server 契约面（§2-§7 无需改动）。

| Client | 并发策略 | 对 add-coder server 的要求 |
|--------|---------|--------------------------|
| Codex | Parallel MCP 真并行（声明支持即自动并行） | 必须支持并发请求（节流兜底：读 8 / 写 4） |
| TAgent 类 | Flow DAG：跨 server 并行、同 server 复用连接时主动串行 | 并发压力低，但幂等仍需保证 |
| Claude Code | isConcurrencySafe 批次：只读并发、写串行 | 只读并发下仍需读一致性保证 |
| Qoder CN | 待调研（hooks 模式下的 MCP 工具调用并发行为） | Spec 阶段调研后填入 |
| 预留 | — | — |

---

## 9. 验收标准

- [ ] 两个 IDE 同时执行只读 MCP 工具互不影响（issue #12 验收 6）
- [ ] 两个 IDE 同时写入审计/协作记录无重复写入、无串项目（issue #12 验收 7）
- [ ] 多个 MCP Server 同时启动不重复执行迁移（Advisory Lock，issue #12 验收 8）
- [ ] 关闭/重启一个 IDE 不中断其他 IDE 的 MCP 连接（issue #12 验收 9）
- [ ] `sync --adapter=codex --patch` 不覆盖其他 adapter 文件（issue #12 验收 10，见附录所有权矩阵）
- [ ] 日志不泄露 DATABASE_URL/密码（issue #12 验收 12）
- [ ] 同项目、同 planName、不同 Adapter 的 Plan/Review/HITL/Route/Gate 全链路互不可见；不得回退现存 Qoder 状态 [回流: Runtime Review P0 #9]
- [ ] 相同 operationKey 的跨进程竞争只产生一个业务结果/副作用；HITL next round 唯一且单调 [回流: Runtime Review P0 #10/#11]
- [ ] 无 approved binding 时跨 Adapter 审计不满足 Gate；有 binding 时只共享绑定的 scoped Plan [回流: Runtime Review P0 #12 / P1 #14]
- [ ] legacy 路径唯一/歧义/越界分别得到 scoped / legacy-unknown / fail closed，且无任何记录默认 `.add` [回流: Runtime Review P0 #13]
- [ ] `sync --adapter=codex --patch` 只改变 `.codex` 与 Codex 官方 repo discovery 的 `.agents/skills`；其余 Adapter 目录 hash 不变 [回流: Runtime Review P1 #15]

---

## 附录：Adapter 所有权矩阵

| 目录 | 归属 | 例外 |
|------|------|------|
| `.codex` | Codex Adapter 独占 | — |
| `.agents/skills` | Codex 官方 repo discovery 镜像 | 只同步 skills；不承载 Plan/Spec/Route/Review/HITL，不是共享状态目录 |
| `.claude` | Claude Code Adapter 独占 | ~~codex 双通道例外：`init/sync --adapter=codex` 同步产出 `.claude/`~~ → 无例外；格式导入能力不授予 Codex 写入权，必须显式执行 `--adapter=claude` [回流: Runtime Review P1 #15] |
| `.add` | ADD Adapter 独占 | 不是中立共享目录；必须显式执行 `--adapter=add` |
| `.qoder` | Qoder Adapter 独占 | — |
| `.trae` | Trae Adapter 独占 | — |
| `.vscode` | VS Code Adapter 独占 | `.github/hooks/` 输出到项目根 |
| 公共规则 | add-coder Core 管理（`templates/core/`） | 各目标 Adapter 独立渲染/分发；共享模板不等于共享状态目录 |
| 用户修改文件 | 用户所有 | `sync --patch` hash 全量基线保护，用户修改不覆盖 |

**所有权不变量**：任一 `init/sync --adapter=X` 只能改变 X 的 magic dir；Codex 额外允许生成明确声明的 `.agents/skills` discovery 镜像。跨 Adapter 的协作通过数据库 contract binding 发生，不通过复制对方真源发生。[回流: Runtime Review P1 #15]
