# Checklist: add-coder-stack-profile

> **证据规范**: 每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证—证据: 命令+结果(如 `tsc=0` / `vitest 18/18`)
> - `[R]` = 运行时验证—证据: 部署后确认(如 `curl 200`)
> - `[E]` = 静态检查—证据: grep/diff 输出
>
> **审计链(证据→devlog→checklist)**: 先找证据 → `record_dev_operation` 落库 → 将返回的真实 cuid 写入 checklist。

## 一、编译与 Lint 门禁

- [x] [T] `npx tsc --noEmit` 零类型错误 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] `npx eslint src/` 零 error — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] `npm run test` 既有测试通过(如存在) — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)

## 二、功能验收(对应 Plan §五 验收标准)

- [x] [E] 验收①: project_rules.md 模板无 LangGraph/Next.js/Prisma/TypeScript 硬编码强制句 — 证据: `grep -n "LangGraph\|Prisma schema\|TypeScript 编译必须" templates/core/rules/project_rules.md` 无强制句命中|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] 验收②: `stack set machineserver` 生成 machineserver-profile.md 且 project_rules.md 引用正确 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] 验收③: `init --dry-run --stack machineserver` 全流程可跑 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [E] 验收④: 无 stack 渲染零技术栈假设(project_rules.md 中性引用) — 证据: grep 断言|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] 验收⑤: tsc/eslint/既有测试通过 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] 验收⑥: `sync --patch` 后用户自建自定义 profile 保留(白名单生效,不覆盖不删除) — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile) [回流: Review P1 #1]
- [x] [T] 验收⑦: 多 MCP 工具 description 带 `[项目: add-coder]` 前缀,record_dev_operation 响应声明落库项目 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] `add-coder stack list` 输出内置(webapp/machineserver)+ 自定义 + 当前标记 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] `add-coder stack show` 输出当前栈(空则提示未设置) — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] `stack set webapp` 生成的 profile 与旧版硬编码语义等价(Prisma/LangGraph/TS/LangChain 约束不丢失) — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [T] stack.json 缺失/损坏时 init/sync 不崩溃,按中性处理 — 证据: tsc=0(non-audit)/eslint=0/e2e 通过|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)

## ADD 规则合规检查

- [x] [E] Plan/Spec 一致性 — 证据: check_spec_sync 结果|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [E] ADD-7 开发操作审计 — 证据: query_audit_logs 回查(每个改动文件有 record_dev_operation)|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [E] ADD-1 可观测性优先 — 证据: 本 Plan 为 CLI/模板变更,审计基础设施无需变更(agent-audit-logger 不动),在 Plan 中已声明理由|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [E] ADD-2 打点标记对称 — 证据: 本 Plan 无运行时打点变更,check_phase_symmetry 无需执行|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [E] ADD-9 方向验证 — 证据: Plan 已过 HITL TONGYI(方案 B 对比 A/C)|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)
- [x] [E] ADD-12 文档同步 — 证据: sync 后自身 .add/.qoder 产物与模板一致|审计: 15 条 devlog(planKeyword=add-coder-stack-profile)

## 跨项目联调检查(模板分发到用户项目场景)

### 格式契约

- [T] profile 引用行中的路径格式与 renderer 输出路径一致(`.add/rules/profiles/` + `{magicDir}/rules/profiles/`)
- [T] stack.json 格式(JSON)被 init/sync/stack set/context.ts 四方一致解析

### 兼容性

- [T] 已初始化项目(旧版 project_rules.md): sync --patch 后无技术栈强制句残留,不破坏既有 hash 链路
- [T] 旧版硬编码约束可迁移: `stack set webapp` 恢复等效约束(语义等价断言)
- [T] 用户自建自定义 profile(非注册表): stack list 识别、stack set 允许、sync 不删除

### E2E

- [R] 在真实用户项目中 `npx add-coder init --stack machineserver` 全流程(含 MCP context 返回 profile 内容)
- [R] `add-coder stack set` 切换后,IDE 新会话 AI 上下文包含新 profile 约束

---

> **流程衔接(AI 执行指令)**: 所有 `[T]` 项为 `[x]` 时(`[R]` 可保持 `[ ]`):
> 1. 调用 `plan_track({ planName: "add-coder-stack-profile-plan-v1" })` 同步 checklist 路径
> 2. 读取 `review-implementation-template.md`,生成实现审查
> 3. 读取 `review-runtime-template.md`,生成 review-runtime.md(含 [R] 待验证清单)
