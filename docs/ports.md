# 端口契约登记表（add-coder）

> **定位**：本项目开发环境端口统一登记表，是项目本地端口分配的唯一事实源。
> **维护**：新增容器/服务端口前必须先查本表；改端口后必须同步更新 `.env.development` 变量、`DATABASE_URL`/`SHADOW_DATABASE_URL`/`ATLAS_DEV_URL` 与本表三处。
> **最后更新**: 2026-09-12（free-thinkpad-a285 开发机落地：主库/shadow/Atlas dev 三容器 + frp 远端访问）
> ⚠️ 跨项目共享端口（如本机 5433/5434/5437 等）以跨项目事实源 `docs/ports.md`（如 farm-agent）为准，本项目表只登记本项目端口。

---

## 1. 端口分配总表

> **init 自动登记**：`add-coder init`（分库引导）与 Atlas 同步会自动为「主库 / ADD 库 / Atlas dev 库」三类容器分配端口并登记本表——分配规则见 §4 约定规则。

| 端口 | 服务 | 用途 | 状态 | 配置位置 |
|:---:|------|------|:---:|---------|
| 5434 | PostgreSQL 主库 `add-coder-postgres` | 本机自持治理库（14 表，Atlas 版本化） | 🟢 使用中 | `.env.development` `DATABASE_URL` |
| 5437 | PostgreSQL 影子库 `add-coder-shadow` | prisma migrate dev 影子库 | 🟢 使用中 | `.env.development` `SHADOW_DATABASE_URL` |
| 5438 | PostgreSQL Atlas dev 空库 `add-coder-dev` | Atlas dev-url（可随时重置，不是数据真源） | 🟢 使用中 | `.env.development` `ATLAS_DEV_URL` |
| 10167 | frp 隧道（VPS 8.153.104.150 → 本机 5434） | 临时备用通道（10169 修复期间承载） | ⚪ 已释放（2026-09-12 撤销 frpc 代理） | — |
| 10169 | frp 隧道（VPS 8.153.104.150 → 本机 5434） | **远端访问主库（主用端口）** | 🟢 使用中 | `~/.config/frp/frpc.toml` `remotePort` |

> 表头为固定规范；行数据按项目实际情况增删改。远端访问链路：客户端 → VPS `8.153.104.150:10169`（frps `bind_port=7000`，通道 TLS 已开）→ 本机 `frpc` → `127.0.0.1:5434`。

## 2. 已知冲突与处置

| # | 端口 | 冲突方 A | 冲突方 B | 处置 |
|:---:|:---:|---------|---------|------|
| 1 | 5433 | 本项目 `DATABASE_PORT` 默认值 | farm-agent `POSTGRES_HOST_PORT` | ✅ **已解决（2026-08-06）**：add-coder 独立实例（主库 5434 / shadow 5437），跨项目事实源见 farm-agent `docs/ports.md` |
| 2 | 10169 | 本项目 frp 远端端口 | VPS ufw 中存在 `DENY 10169` | ✅ **已解决（2026-09-12）**：根因是 ufw 规则**按顺序首条命中即生效**，`DENY 10169`（v4 #21 / v6 #44）排在 `ALLOW 10169/tcp` 之前 → 静默丢包（DROP 特征）。删除 DENY 后放通，全链路实测通过；临时通道 10167 已撤销 |

## 3. 容器快照

### 运行中

| 容器 | 端口 | 归属 |
|------|------|------|
| `add-coder-postgres` | 5434 | 本项目主库（2026-09-12 本机落地） |
| `add-coder-shadow` | 5437 | 本项目影子库 |
| `add-coder-dev` | 5438 | 本项目 Atlas dev 空库（可随时重置） |

### Created / Exited（历史容器，端口已释放）

`—`（按 `podman ps -a` 实际登记）

### 生命周期（非 compose 直接启动）

三容器由 systemd 用户单元 `add-coder-db.service` 托管（`podman-compose up -d`），`linger` 已开启 → 开机/登录前自启。远端隧道 `frpc.service` 同为用户单元。

## 4. 约定规则

1. **改端口 = 三处同步**：`.env.development` 变量 + `DATABASE_URL`/`ADD_DATABASE_URL`/`SHADOW_DATABASE_URL`/`ATLAS_DEV_URL` + compose 引用，改完更新本表
2. **新增服务**：先查本表 + 跨项目事实源取空闲端口；**PG 配套从 5433 起**（宿主标准 5432 之后第一顺位），按服务类型分段（PG=5433+ / Web=3xxx / MCP=30xx），避免默认值撞车
3. **init 全局登记（统一分配器）**：`add-coder init` 通过统一端口分配器为「主库 / ADD 库 / Atlas dev 库」一次性分配并登记本表——分配前先读本表已有登记（已登记端口复用不重复分配）与跨项目事实源，再**从 5433 起扫描真实空闲**（podman ps + `portInUse` 探测），分配后写入本表；**禁止各模块自行分散扫描端口**（建议起点可在端口规则 `ports-rules.toml` 调整）
4. **Atlas dev 库同表登记**：dev-url 常驻空库与主库同表登记，状态列标注「dev 库」；dev 库**可随时重置，不是数据真源**，重置后无需迁移备份
5. **删除容器前**：确认数据卷是否需要保留（容器删了卷还在）
6. **端口检测**：`podman ps --format '{{.Names}} {{.Ports}}'` 为准，`ss -tlnp` 为辅
