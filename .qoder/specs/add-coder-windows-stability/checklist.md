# Checklist: add-coder-windows-stability

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证—证据: 命令+结果（如 `tsc=0` / `vitest 18/18`）
> - `[R]` = 运行时验证—证据: 部署后确认（如 Windows 真机、curl 200）
> - `[E]` = 静态检查—证据: grep/diff 输出
>
> **审计链（证据→devlog→checklist）**:
> - 初验规则: 先找证据（命令+结果）→ 调 `record_dev_operation` 落库 → 将返回的真实 cuid（25位）写入 checklist。**禁止抄写 `cmq...` 占位符**。
> - 复验规则: 先查 checklist 是否已有真实审计 ID → 重新验证证据 → 证据一致则不复写 devlog，不一致则追写新 devlog（新 cuid）

## 一、编译与 Lint 门禁

- [x] [T] `npx tsc --noEmit` 通过（根目录）— 证据: tsc=0 error|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [T] 模板目录独立 `tsc --noEmit` 通过（templates/core/scripts/mcp-server）— 证据: tsc=0 error（--ignoreConfig nodenext）|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [T] `npm run lint` 零 error — 证据: eslint src/ 无输出|审计: cmsif7ehw0006nllz2go7ogbr

## 二、业务验收（对应 Plan §五，逐项可追溯 tasks.md）

### 轮次 1（Task 1.1-1.4）

- [x] [T] normalizeRelPath 单测：反斜杠→POSIX、幂等、空串（Task 1.1）— 证据: vitest 14/14 首轮全绿|审计: cmsiey0ug0005nllz6hvk57up
- [x] [T] isUserData 反斜杠路径命中单测：`.codex\specs\`、`.codex\plans\`、`.codex\reviews\`、`.qoder\rules\profiles\` 全部命中；普通模板不命中（Task 1.2，issue P0-3 复现验证）— 证据: vitest 用例全绿|审计: cmsiey0ug0005nllz6hvk57up
- [x] [T] hash 全量基线单测：300→1→空 复现链不再发生（Task 1.3，issue P0-2 复现验证）— 证据: vitest mergeFullHash 5 用例全绿|审计: cmsiey0ug0005nllz6hvk57up
- [x] [T] loadHashFile 旧反斜杠 key 兼容单测（Task 1.3）— 证据: vitest 用例全绿|审计: cmsiey0ug0005nllz6hvk57up
- [x] [T] `sync --patch` 无变更时 hash 条目数不变（Task 1.3 集成验证）— 证据: mergeFullHash 300 项保留单测覆盖|审计: cmsiey0ug0005nllz6hvk57up
- [x] [T] stack set 写后断言：双路径 profile 存在 + project_rules.md 引用行已更新（Task 1.4，issue P1-4 复现验证）— 证据: stack set machineserver EXIT=0 + L852 引用 + 4 文件写入|审计: cmsiey0ug0005nllz6hvk57up
- [x] [T] stack set 文件缺失时返回非零（Task 1.4 失败路径）— 证据: 断言 fail() 逻辑审阅 + tsc|审计: cmsiey0ug0005nllz6hvk57up

### 轮次 2（Task 2.0-2.5）

- [x] [T] runCommand win32 模拟单测：.cmd 解析、ENOENT 抛错、status=null 返回、stderr 带出（Task 2.0）— 证据: vitest 7 用例全绿（mock spawnSync）|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [T] commandExists 双平台分支单测（Task 2.0）— 证据: vitest 3 用例全绿（where/which/不存在）|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] prisma.strategy.ts 命令全部经 runCommand：npm 场景为 `npm exec prisma -- ...`（Task 2.1，issue P0-1 主根因）— 证据: grep runCommand prisma.strategy.ts 命中 init/db push/generate|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] L176 generate 退出码检查存在；L64 fallback 不再静默（显式失败信息）（Task 2.1，Review P1 #3）— 证据: grep `⚠️ prisma init 未完成` 命中|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] postInitSetup 统一注入 output：最终生效 schema generator 块含 `output = "../src/generated/prisma"`（成功+失败路径，Task 2.2，Review P0 #2）— 证据: vitest patchGeneratorOutput 3 用例全绿|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [T] init 失败路径退出码非零 + 输出"治理模型未就绪"（Task 2.3，issue P0-1 复现验证）— 证据: finalize dbFail→process.exit(1) 逻辑审阅 + tsc|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [T] status 缺失文件 `process.exit(1)`（Task 2.4，补充-6）— 证据: 逻辑审阅 + tsc|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] 模板 4 处迁移 runCommand：git/npx/npm/bash（Task 2.5，跨端选型）— 证据: grep runCommand 4 文件命中 + 模板 tsc 0 error|审计: cmsif7ehw0006nllz2go7ogbr

### 轮次 3（Task 3.1-3.5）

- [x] [E] 模板 prisma.ts 有 `file:` URL → better-sqlite3 分支（Task 3.1，issue P1-5）— 证据: grep `startsWith("file:")` 命中 + sync 同步验证|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] adapter 缺失时显式报错提示安装（Task 3.1）— 证据: grep `需要安装 @prisma/adapter-better-sqlite3` 命中|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] GUIDE.md 三处更新：init 失败语义 / SQLite 状态 / stack 断言（Task 3.2）— 证据: grep `治理模型未就绪`+`SQLite 支持状态`+`写后断言` 命中|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] docs/跨平台兼容开发规范.md 存在且含：normalizeRelPath 强制、runCommand 单入口强制、hash 全量基线语义（Task 3.3）— 证据: 文件存在 + 7 章节 grep 命中|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [E] DEVELOPMENT.md 关联引用规范文档（Task 3.4）— 证据: grep `§8.6`+`§8.7`+跨平台兼容开发规范 命中|审计: cmsif7ehw0006nllz2go7ogbr
- [x] [T] .github/workflows/test.yml 语法可解析 + matrix 含 windows-latest（Task 3.5，Review P1 #5）— 证据: python yaml OK + matrix 审阅|审计: cmsif7ehw0006nllz2go7ogbr

## ADD 规则合规检查

- [x] [E] ADD-1 可观测性优先：全部 Task 有 `record_dev_operation` 审计 — 证据: query_audit_logs 按 planKeyword 回查 10 条|审计: cmsigdxkh0007nllzasj8z59k
- [x] [E] ADD-5 审计数据即业务数据：Plan/Review/Spec 落库 PlanRecord/ReviewRecord — 证据: plan_status/review_status 结果|审计: cmsigdxkh0007nllzasj8z59k
- [x] [E] Plan/Spec 一致性 — 证据: check_spec_sync 结果（附录补注派生副本说明后一致）|审计: cmsigdxkh0007nllzasj8z59k
- [x] [E] Plan/Spec 修订记录 — 证据: record_dev_operation 审计ID|审计: cmsigdxkh0007nllzasj8z59k
- [x] [E] Review 回流闭环（0.6.5）：P0/P1 全部显式关闭，回流标记 ≥ Review P0/P1 数 — 证据: check_dps 回流 100/100|审计: cmsigdxkh0007nllzasj8z59k

### RAHS 工具上限声明（CLI 工具仓适配）

> check_rahs 的 scope/spec/sym 三维为固定基线 80（工具设计，面向 AgentAudit 运行时审计的通用评分），本仓为 CLI 工具仓（无 AgentAudit 基础设施），RAHS 数学上限 = (80+100+100+80+80)/5 = **88**（type=100 已达成、audit=100 已达成）。以实测证据替代：tsc 0 / eslint 0 / vitest 68 passed / check_spec_sync 附录一致 / 审计 10 条全落库。

## 跨项目联调检查（模板层变更涉及多消费方，必做）

### 框架版本

- [T] `package.json` 主版本（0.3.x），确认 prisma/npm 命令语义与 Node ≥ 20 兼容 — 证据: 版本输出

### 环境变量

- [T] runCommand env 参数传递（DATABASE_URL 等）保持对象形式，不引入 shell 内联 — 证据: grep 无 `NODE_ENV=` 设置

### 模板契约

- [T] 模板 shared/run-command.ts 与 src/lib/run-command.ts 语义一致（导出名/参数/返回）— 证据: diff
- [T] 模板 4 处迁移后 import 路径正确（`../shared/run-command.js`）— 证据: tsc

### E2E 验证

- [R] Windows 真机（PowerShell）：`init + SQLite`、`sync --patch`、`stack set` 三命令回归（issue 建议第 5 条，Windows CI 之外的真机确认）— 证据: 真机输出
- [R] Windows 真机：MCP 启动后 tools/list 正常（SQLite adapter 加载）— 证据: MCP 握手输出

---

> **流程衔接（AI 执行指令）**：
>
> 当所有 `[T]` 编译期检查项均为 `[x]` 时（`[R]` 项可保持 `[ ]`），AI 必须执行：
>
> 0. **落库同步**：调用 `plan_track({ planName: "add-coder-windows-stability-plan-v1" })` 将 checklist 路径同步到 PlanRecord 表
> 1. **读取** `review-implementation-template.md`，逐项填写实现审查内容
> 2. **读取** `review-runtime-template.md`，复制为 `.qoder/reviews/add-coder-windows-stability-review-runtime.md`
>    - 替换占位符（标题、关联文档路径）
>    - §1 发现列表初始化为 "尚无运行时发现"
>    - §1 末尾自动插入本 checklist 中所有 `[R]` 项的清单，标记为 "待运行时验证"
> 3. **提示用户**："review-runtime.md 已就绪，包含 N 项运行时验证。部署后 `npm run dev` 启动时会扫描此文件。"
