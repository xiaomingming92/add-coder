# Checklist

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证—证据: 命令+结果（如 `tsc=0` / `vitest 18/18`）
> - `[R]` = 运行时验证—证据: 部署后确认（如 `curl 200`）
> - `[E]` = 静态检查—证据: grep/diff 输出
> - `[W]` = **接线验证（Wiring）**—证据: 生产调用点存在的 grep / 端到端一次真实产出（**实现存在 ≠ 生产可达**）
>
> **审计链（证据→devlog→checklist）**:
> - 初验规则: 先找证据（命令+结果）→ 调 `record_dev_operation` 落库 → 将返回的真实 cuid（25位）写入 checklist。**禁止抄写 `cmq...` 占位符**。
> - 复验规则: 先查 checklist 是否已有真实审计 ID → 重新验证证据 → 证据一致则不复写 devlog日志(走mcp)，不一致则追写新 devlog（新 cuid）

## 一、编译与 Lint 门禁

- [ ] [T] 检查项1 — 证据: (待填写)|审计: (初验从 record_dev_operation 返回值写入真实 cuid，**禁止写 `cmq...` 占位符**)
- [ ] [T] 检查项2 — 证据: (待填写)|审计: (初验从 record_dev_operation 返回值写入真实 cuid，**禁止写 `cmq...` 占位符**)
- [ ] [T] schema 变更后运行实例 client 新鲜度（`db:generate` + 重启校验）— 证据: (待填写)|审计: (待填写) [来源: farm-agent 9737ab4 回灌；Prisma+Atlas 项目通用]
- [ ] [W] 新增的"被调用方"（策略/服务/工具/证据产生者）存在**生产调用点** — 证据: `grep -rn "<symbol>" src/ --include=*.ts` 有**非测试**命中且位于真实执行路径（非仅导出）| 审计: (待填写) [来源: farm-agent 2026-09-18 回流 P0 #R9；同类三例均为「纯函数+单测齐全、生产不可达」]

## ADD 规则合规检查

- [ ] [T] ESLint 零 error — 证据: `npx eslint src/ 2>&1 | tail -5` 结果包含 `✖ 0 problems` 或无 error 行
- [ ] [E] ADD-1 可观测性优先 — 证据: `grep -c 'agentAudit' src/agents/nodes/`
- [ ] [E] ADD-2 打点标记对称 — 证据: check_phase_symmetry 结果
- [ ] [E] ADD-4 三通道输出 — 证据: console + file + DB 三通道确认
- [ ] [E] ADD-5 审计数据即业务数据 — 证据: query_audit_logs 回查
- [ ] [E] Plan/Spec 一致性 — 证据: check_spec_sync 结果
- [ ] [E] Plan/Spec 修订记录 — 证据: record_dev_operation 审计ID

## 跨项目联调检查（涉及多仓库时必做）

> `[T]` = 编译期可验证（AI 可在代码环节直接检查）
> `[R]` = 运行时验证（需部署运行后才能确认，自动流转到 review-runtime.md）

### 三通道验收（涉及图/节点/流式呈现时必做）

> [来源: farm-agent 9737ab4 回灌；与 review/review-implementation 的「三通道矩阵」配套，缺一即失败]

- [T] 逐节点三通道矩阵闭环：①生命周期 ②内容 ③结构化，缺一即失败 — 证据: 对照 Plan 三通道矩阵
- [T] 服务端未写死用户文案（文案在前端 i18n；服务端只发结构化字段/内容片段）— 证据: diff + grep
- [T] 终态渲染不覆盖运行期累计内容 — 证据: 实机/单测
- [T] 空态可渲染（0 条数据仍显示同构 DOM 或明确降级文案）— 证据: 实机截图/DOM 断言
- [T] 耗时刷新有事件源（服务端心跳或前端 ticker，二者已定稿其一）— 证据: 契约/实现 diff
- [R] 实机逐节点核对：运行中可见内容/结构化数据，终态内容不消失 — 证据: (待填写)

### 格式契约

- [T] 所有跨系统 API：发送方参数类型 = 接收方解析类型，字段名一致
- [T] 响应 Content-Type 匹配客户端解析器（JSON vs `text/event-stream` vs NDJSON）
- [T] 外部契约版本漂移：外部契约（如 API collection）更新后 diff 契约并对齐 client（详见 review-implementation §6.1）

### 框架版本

- [T] 确认 `package.json` 主版本号，查 breaking changes
- [R] 编译产物 mtime 晚于源码（如 `.next/server/middleware.js` ≥ `src/proxy.ts`）

### 数据模型

- [R] Prisma 外键字段对应的表中有记录存在
- [T] `create()` 的 `userId` 等字段是真实存在的 ID，不是硬编码字符串

### 环境变量

- [T] `npm run` 命令 → `--mode` → `.env.*` → 每个变量的值逐项验证
- [T] 三套环境（dev/local/prod）指向正确后端地址

### API 选择

- [T] 模块导出多个相似函数时，确认选的是场景匹配的（同步版 vs 流式版 vs 批处理版）

### E2E curl

- [R] 用有效凭证对每个端点 curl，检查 HTTP 状态码 + 响应格式
- [R] OPTIONS 预检 CORS 头正确

---

> **流程衔接（AI 执行指令）**：
>
> 当所有 `[T]` 编译期检查项均为 `[x]` 时（`[R]` 项可保持 `[ ]`），AI 必须执行：
>
> 0. **落库同步**：调用 `plan_track({ planName: "{planName}" })` 将 checklist 路径同步到 PlanRecord 表
> 1. **读取** `review-implementation-template.md`，逐项填写实现审查内容
> 2. **读取** `review-runtime-template.md`，复制为 `{{magicDir}}/reviews/{project}-review-runtime.md`
>    - 替换占位符（标题、关联文档路径）
>    - §1 发现列表初始化为 "尚无运行时发现"
>    - §1 末尾自动插入本 checklist 中所有 `[R]` 项的清单，标记为 "待运行时验证"
> 3. **提示用户**："review-runtime.md 已就绪，包含 N 项运行时验证。部署后 `npm run dev` 启动时会扫描此文件。"
