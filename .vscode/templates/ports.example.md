# 端口契约登记表（{{projectName}}）

> **定位**：本项目开发环境端口统一登记表，是项目本地端口分配的唯一事实源。
> **维护**：新增容器/服务端口前必须先查本表；改端口后必须同步更新 `.env.development` 变量、`DATABASE_URL`/`SHADOW_DATABASE_URL`/`ATLAS_DEV_URL` 与本表三处。
> **最后更新**: （登记日期，按实际填写）
> ⚠️ 跨项目共享端口（如本机 5433/5434/5437 等）以跨项目事实源 `docs/ports.md`（如 farm-agent）为准，本项目表只登记本项目端口。

---

## 1. 端口分配总表

> **init 自动登记**：`add-coder init`（分库引导）与 Atlas 同步会自动为「主库 / ADD 库 / Atlas dev 库」三类容器分配端口并登记本表——分配规则见 §4 约定规则。以下为示例行。

| 端口 | 服务 | 用途 | 状态 | 配置位置 |
|:---:|------|------|:---:|---------|
| 5432 | PostgreSQL 宿主库 | 宿主业务库（PG 标准端口，示例） | 🟡 示例 | 宿主自有配置 |
| 5433 | PostgreSQL ADD 配套库 | add-coder 配套容器第一顺位：`{{projectName}}-add-postgres`（宿主 5432 之后从 5433 起，示例） | 🟡 示例 | `.env.development` `ADD_DATABASE_URL` |
| 5434 | PostgreSQL Atlas dev 库 | Atlas 常驻 dev 空库 `{{projectName}}-add-dev`（可随时重置，示例） | 🟡 示例 | `.env.development` `ATLAS_DEV_URL` |
| 3000 | Web dev server | 前端/服务开发端口（示例） | 🟡 示例 | `.env.development` `PORT` |

> 表头为固定规范；行数据为**示例**，按项目实际情况增删改。

## 2. 已知冲突与处置

| # | 端口 | 冲突方 A | 冲突方 B | 处置 |
|:---:|:---:|---------|---------|------|
| 1 | 5433 | 本项目默认值 | 其他项目同默认值 | 🟡 示例：已改用空闲端口并登记 |

## 3. 容器快照

### 运行中

| 容器 | 端口 | 归属 |
|------|------|------|
| `{{projectName}}-add-postgres` | 5433 | 本项目 ADD 治理库（分库引导，示例） |
| `{{projectName}}-add-dev` | 5434 | 本项目 Atlas dev 空库（可随时重置，示例） |

### Created / Exited（历史容器，端口已释放）

`—`（示例：按 `podman ps -a` 实际登记）

## 4. 约定规则

1. **改端口 = 三处同步**：`.env.development` 变量 + `DATABASE_URL`/`ADD_DATABASE_URL`/`SHADOW_DATABASE_URL`/`ATLAS_DEV_URL` + compose 引用，改完更新本表
2. **新增服务**：先查本表 + 跨项目事实源取空闲端口；**PG 配套从 5433 起**（宿主标准 5432 之后第一顺位），按服务类型分段（PG=5433+ / Web=3xxx / MCP=30xx），避免默认值撞车
3. **init 全局登记（统一分配器）**：`add-coder init` 通过统一端口分配器为「主库 / ADD 库 / Atlas dev 库」一次性分配并登记本表——分配前先读本表已有登记（已登记端口复用不重复分配）与跨项目事实源，再**从 5433 起扫描真实空闲**（podman ps + `portInUse` 探测），分配后写入本表；**禁止各模块自行分散扫描端口**（建议起点可在端口规则 `ports-rules.toml` 调整）
4. **Atlas dev 库同表登记**：dev-url 常驻空库与主库同表登记，状态列标注「dev 库」；dev 库**可随时重置，不是数据真源**，重置后无需迁移备份
5. **删除容器前**：确认数据卷是否需要保留（容器删了卷还在）
6. **端口检测**：`podman ps --format '{{.Names}} {{.Ports}}'` 为准，`ss -tlnp` 为辅
