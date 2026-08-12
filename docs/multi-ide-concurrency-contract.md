# 多 IDE 进程并发契约（进程层 v2）

> **定位**：add-coder 并发契约体系的**进程层**契约——定义 MCP Server 在多 IDE 并行连接下的行为承诺。与协作层 v1（[collab-contract](../templates/core/templates/collab-contract-template.md)，v0.3.18「并发协作契约」）构成双层体系：协作层管"谁做什么"，进程层管"MCP Server 进程如何正确并发"。
>
> **关联**：issue #12（多 IDE 并行稳定性）· add-coder-codex-native-adapter-plan-v1 §1.3
> **版本**：v2 · 2026-08-10

---

## 1. 双层体系总览

| 层 | 契约 | 版本 | 职责 | 消费方 |
|----|------|------|------|--------|
| 协作层 | collab-contract（并发协作契约） | v1（v0.3.18） | 多智能体协作秩序：文件边界 / 仲裁链路 / 审计分桶 | 总控 Plan + N 个子 Plan |
| **进程层** | **本文档** | **v2** | MCP Server 并发行为承诺：连接模型 / 幂等键 / PROJECT_ID 校验 / 断开隔离 / 生命周期拆分 / client 差异矩阵 | 多 IDE 并行连接同一项目 |

**衔接点**：协作层的"文件边界 + 审计分桶"能成立，依赖进程层的"幂等写入 + 防串线"保证——多智能体并行实施（协作层）与多 IDE 并行连接（进程层）互为支撑。

---

## 2. 连接模型

- **进程边界**：1 IDE = 1 mcp-server 子进程（stdio 传输，独占 stdin/stdout）；多 IDE = 多独立子进程，进程间无共享内存。
- **PG 连接**：每进程 1 个 PrismaClient 单例；`connection_limit = max(1, floor(100 / N_IDE))`（PG 默认 max_connections=100，预留 20 给 IDE 外连接）。N_IDE ≤ 3 时 limit=10。
- **启动时序**：`db-ensure.sh` 完成 → mcp-server 启动（串行依赖，不并行启动）。
- **MCP 协议**：JSON-RPC 2.0，`id` 关联请求/响应，响应允许乱序——协议支持并发，但"是否并发发起"由 client 编排层决定（见 §7），server 只保证"正确响应并发"。

---

## 3. 幂等键

- **工具调用层**：`key = sha256(toolName + sorted_json(args))` → DB upsert 去重；写工具 `record_dev_operation` 用 planKeyword+targetType+targetId+action 组合唯一约束。
- **连接层**：Claude Code 既有机制（command+URL 签名），add-coder 不重复实现。
- **存储**：DB 唯一索引，不依赖内存缓存（进程重启不丢失去重状态）。

---

## 4. PROJECT_ID 校验

- **PROJECT_ID = PROJECT_ROOT**，由 config.toml `env` 字段传入（Codex 机制；Claude Code 侧对应 CLAUDE_PROJECT_DIR 环境变量注入，IDE 差异由 config.toml 模板消解）。
- **校验时机**：mcp-server 启动时，比较 `process.env.PROJECT_ROOT` 与 `process.cwd()`。
- **失败行为**：打印 "PROJECT_ID mismatch: expected <env_val>, got <cwd>" → exit(1)。
- **目的**：防止用户误把 A 项目的 config.toml 粘贴到 B 项目的 Codex 配置中（项目串线防线）。

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
| 运行期 | 业务写入（Plan/Contract/Audit/DevOperation） | MCP 工具 | 幂等键 + 唯一索引（§3） |

**原则**：迁移只执行一次（锁 + 幂等）；启动只做只读检查；迁移失败必须真实非零退出，不得显示"已就绪"假成功。

---

## 7. client 编排行为差异矩阵

> 并发发起方均为 **client 编排层**（MCP 协议/server 不发起并发）。新 IDE client 接入时先查本矩阵确定其并发策略，再对齐 server 契约面（§2-§6 无需改动）。

| Client | 并发策略 | 对 add-coder server 的要求 |
|--------|---------|--------------------------|
| Codex | Parallel MCP 真并行（声明支持即自动并行） | 必须支持并发请求（节流兜底：读 8 / 写 4） |
| TAgent 类 | Flow DAG：跨 server 并行、同 server 复用连接时主动串行 | 并发压力低，但幂等仍需保证 |
| Claude Code | isConcurrencySafe 批次：只读并发、写串行 | 只读并发下仍需读一致性保证 |
| Qoder CN | 待调研（hooks 模式下的 MCP 工具调用并发行为） | Spec 阶段调研后填入 |
| 预留 | — | — |

---

## 8. 验收标准

- [ ] 两个 IDE 同时执行只读 MCP 工具互不影响（issue #12 验收 6）
- [ ] 两个 IDE 同时写入审计/协作记录无重复写入、无串项目（issue #12 验收 7）
- [ ] 多个 MCP Server 同时启动不重复执行迁移（Advisory Lock，issue #12 验收 8）
- [ ] 关闭/重启一个 IDE 不中断其他 IDE 的 MCP 连接（issue #12 验收 9）
- [ ] `sync --adapter=codex --patch` 不覆盖其他 adapter 文件（issue #12 验收 10，见附录所有权矩阵）
- [ ] 日志不泄露 DATABASE_URL/密码（issue #12 验收 12）

---

## 附录：Adapter 所有权矩阵

| 目录 | 归属 | 例外 |
|------|------|------|
| `.codex` | Codex Adapter 独占 | — |
| `.claude` | Claude Code Adapter 独占 | codex 双通道例外：`init/sync --adapter=codex` 同步产出 `.claude/`（Claude Code 导入通道，同一套 hook 脚本，幂等保护） |
| `.qoder` | Qoder Adapter 独占 | — |
| `.trae` | Trae Adapter 独占 | — |
| `.vscode` | VS Code Adapter 独占 | `.github/hooks/` 输出到项目根 |
| 公共规则 | add-coder Core 管理（`templates/core/`） | 5 端共享，`npm run sync` 分发 |
| 用户修改文件 | 用户所有 | `sync --patch` hash 全量基线保护，用户修改不覆盖 |
