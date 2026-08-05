# Tasks: add-coder-stack-profile-v1

> 对应 Plan: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md` §四

---

## 轮次依赖(复制自 Plan §四)

```
轮次 1: profile 机制核心
  ├── Task 1.1: 模板改造 — project_rules.md 去硬编码 + 引用行(改)
  ├── Task 1.2: 新建 profiles/ — index.toml + webapp-profile.md + machineserver-profile.md(建)
  ├── Task 1.3: schema/defaults — stack 字段(改)
  ├── Task 1.4: renderer — profile 注入 + stack 占位符(改)
  └── Task 1.5: stack 命令 — stack.ts + index.ts 注册(建+改)
        │
        ▼
轮次 2: init 申报 + MCP 上下文
  ├── Task 2.1: init.ts — --stack 选项 + 交互申报 + 写 stack.json(改)
  │     │  { 消费 1.5 的 profile 渲染能力 }
  │     ▼
  └── Task 2.2: context.ts — 规则读取时追加当前 profile(改)
        │
        ▼
轮次 3: 自身同步 + 端到端验证
  ├── Task 3.1: npm run sync 同步自身 .add/.qoder 产物(同步)
  ├── Task 3.2: 端到端验证 — init --stack machineserver dry-run / stack set / 中性场景(验证)
  ├── Task 3.3: 文档闭环 — review/handoff 生成(文档)
  └── Task 3.4: MCP 工具路由安全 — description 注入 [项目: PROJECT_ID] + 写操作落库声明(D9,并入)(实现)
```

---

## Plan→Task 映射(对接 Spec 细节)

| Plan Task | 文件 | 验收 | 对应 Spec |
|------|------|------|------|
| 1.1 | `templates/core/rules/project_rules.md` | grep 无技术栈强制句 | Spec §1 |
| 1.2 | `templates/core/rules/profiles/*`(3 文件) | index.toml 可解析 + 2 profile 齐 | Spec §2 |
| 1.3 | `src/config/schema.ts`、`src/config/defaults.ts` | tsc | Spec §3 |
| 1.4 | `src/core/renderer.ts` | tsc + stack 占位符渲染断言 | Spec §3 |
| 1.5 | `src/cli/commands/stack.ts`、`src/cli/index.ts` | tsc + list/set/show 冒烟 | Spec §4 |
| 2.1 | `src/cli/commands/init.ts` | tsc + dry-run 输出断言 | Spec §5 |
| 2.2 | `templates/core/scripts/mcp-server/tools/context.ts` | tsc + 逻辑审查 | Spec §6 |
| 3.1 | 同步产物 `.add/rules/*`、`.qoder/rules/*` | npm run sync 成功 | — |
| 3.2 | 端到端验证 | 验收标准 ②③④ | — |
| 3.3 | 文档闭环(review-implementation/review-runtime/handoff) | review + handoff 已生成 | — |
| 3.4 | `tools/index.ts` + `tools/audit.ts` + `tools/registrar.ts`(D9) | tsc + description 前缀断言 | Spec §7 |

---

## 轮次 1: profile 机制核心

### Task 1.1: project_rules.md 去硬编码 + 引用行 — 对应 Spec §1

- [x] 1.1.1 移除 §项目技术约束 的 Prisma/LangGraph/TypeScript 强制句,替换为「技术栈约束(profile 引用)」章节(含 {{stackReferenceLine}} 组合占位符)
- [x] 1.1.2 MCP-1 `get_db_schema` 描述改为通用表述(不出现 Prisma 专名强制)
- [x] 1.1.3 附录 A LangChain 实现移至 webapp-profile.md,project_rules.md 保留中性引用
- [x] 1.1.4 验证: `grep -n "LangGraph\|Prisma schema\|TypeScript 编译必须" templates/core/rules/project_rules.md` 仅命中引用/中性表述,无强制句

### Task 1.2: 新建 profiles/ 目录 — 对应 Spec §2

- [x] 1.2.1 新建 `templates/core/rules/profiles/index.toml`(webapp + machineserver 注册)
- [x] 1.2.2 新建 `templates/core/rules/profiles/webapp-profile.md`(迁移旧硬编码: Prisma/LangGraph/TypeScript/LangChain 附录)
- [x] 1.2.3 新建 `templates/core/rules/profiles/machineserver-profile.md`(后端服务链路: Kestra/HTTP API/事件驱动约束)
- [x] 1.2.4 验证: `npx tsx -e "import {parse} from 'smol-toml'; parse(readFileSync(...))"` 注册表可解析

### Task 1.3: schema/defaults 扩展 stack 字段 — 对应 Spec §3

- [x] 1.3.1 schema.ts 新增 `stack: z.string().optional()`
- [x] 1.3.2 defaults.ts 新增 `stack: ""`
- [x] 1.3.3 验证: tsc --noEmit 通过

### Task 1.4: renderer 支持 stack 占位符 + profile 注入 — 对应 Spec §3

- [x] 1.4.1 新增 {{stackName}}/{{stackProfile}}/{{stackReferenceLine}} 占位符(无 stack 时渲染中性文本)
- [x] 1.4.2 renderCore 扩展: config.stack 命中注册表 → 额外输出 profiles/{file} 到 `.add/rules/profiles/` + `{magicDir}/rules/profiles/`; 未设置 → 不输出
- [x] 1.4.3 新增 loadStack/saveStack/loadProfileRegistry(stack.json 读写,容错缺失/损坏)
- [x] 1.4.4 验证: tsc + 单元级渲染断言(渲染含占位符字符串,断言替换结果;e2e 临时目录中性/设置两态)

### Task 1.5: stack CLI 命令 — 对应 Spec §4

- [x] 1.5.1 新建 `src/cli/commands/stack.ts`(list/set/show/--clear)
- [x] 1.5.2 `set <name>`: 校验存在性(注册表或自定义文件) → saveStack → 重渲染 profile 相关文件 → 更新 hash
- [x] 1.5.3 `list`: 内置(注册表)+ 自定义(项目 profiles/ 下非注册表 .md)+ 当前标记
- [x] 1.5.4 `show`: 当前 stack + profile 路径 + 更新时间
- [x] 1.5.5 index.ts 注册 `stack` 命令(--adapter/--clear 选项)
- [x] 1.5.6 验证: tsc + `node dist/index.js stack list/set/show` 冒烟(临时目录)

---

## 轮次 2: init 申报 + MCP 上下文

### Task 2.1: init --stack + 交互申报 — 对应 Spec §5 | 依赖 Task 1.4/1.5

- [x] 2.1.1 InitOptions 新增 `stack?: string`
- [x] 2.1.2 prepare() 解析 stack(选项优先 → 交互提问 → 默认不设置)→ 写 stack.json
- [x] 2.1.3 renderAndWrite 传 config.stack(renderCore 自动完成引用行 + profile 注入)
- [x] 2.1.4 验证: `init --dry-run --stack machineserver` 预览含 profiles/machineserver-profile.md + 实际 init 产物断言

### Task 2.2: context.ts 追加 profile 内容 — 对应 Spec §6 | 依赖 Task 2.1

- [x] 2.2.1 读取 stack.json → 命中且 profile 存在 → 追加 profile 全文到 rules 返回
- [x] 2.2.2 失败路径: stack.json/profile 缺失 → 仅返回 project_rules.md,不报错
- [x] 2.2.3 验证: tsc + 逻辑审查(无 profile 时零技术栈假设)

---

## 轮次 3: 自身同步 + 端到端验证

### Task 3.1: 自身项目同步 | 依赖 Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5, Task 2.1, Task 2.2

- [x] 3.1.1 `npm run sync` 同步 .add/.qoder 产物(project_rules.md 新版本 + profiles/)
- [x] 3.1.2 验证: `.qoder/rules/profiles/` 存在,`.qoder/rules/project_rules.md` 无技术栈强制句
- [x] 3.1.3 `sync --patch` 白名单扩展: 用户自建自定义 profile({magicDir}/rules/profiles/ 非注册表项)不覆盖、不删除(验收 ⑥) [回流: Review P1 #1]

### Task 3.2: 端到端验证 | 依赖 Task 3.1

- [x] 3.2.1 `stack set machineserver` → profiles 生成 + 引用正确(验收 ②)
- [x] 3.2.2 `init --dry-run --stack machineserver` 全流程(验收 ③)
- [x] 3.2.3 中性场景: 无 stack 渲染零技术栈假设(验收 ④)
- [x] 3.2.4 `stack show` / `stack list` 输出正确
- [x] 3.2.5 验收 ⑤: tsc --noEmit(全项目 0)+ eslint + 既有测试(基线 enums 问题除外,已记录)

### Task 3.3: 文档闭环

- [x] 3.3.1 review-implementation 生成(Step 3.5, HITL round 3 TONGYI)
- [x] 3.3.2 review-runtime.md 生成(含 [R] 待验证清单)
- [x] 3.3.3 handoff 生成(Step 8, 多轮模板)
- [x] 3.3.4 验收标准逐条勾选 + ADD-7 审计回查

### Task 3.4: MCP 工具路由安全(D9) — 对应 Spec §7 | 依赖 Task 2.2

- [x] 3.4.1 `tools/registrar.ts` 基类接口(ToolRegistrar = Pick<McpServer,"registerTool">),15 个注册函数签名收敛;`tools/index.ts` 派生装饰 registrar 注入 `[项目: {PROJECT_ID}]` 前缀,无类型逃逸 [实现审查 HITL round 3 决议: 原 as unknown 伪造对象被否]
- [x] 3.4.2 `tools/audit.ts`: record_dev_operation 成功响应追加 `落库项目: {PROJECT_ID} ({PROJECT_ROOT})`;query_audit_logs 响应头部追加 `服务项目: {PROJECT_ID}`
- [x] 3.4.3 基线修复: audit.ts 14 个 TS 错误(args 窄化 s() + 行类型断言)修复,tsc 全项目 0 错误 [实现审查 HITL round 3 决议]
- [x] 3.4.4 验证: tsc=0 + 启动断言(29 工具 description 含 `[项目: add-coder]` 前缀 + 重复注册抛错语义)(验收 ⑦)

---

## Verification

- [x] `npx tsc --noEmit` 通过(全项目 0 错误,含 audit.ts 基线修复)
- [x] `npx eslint src/` 零 error
- [x] `npm run test` 基线 18 failed/35 passed(Prisma 7 prisma-client 生成器无扩展名 import 与 vitest 解析兼容,独立技术债已记录,与本 Plan 代码无关)
- [x] `node dist/index.js stack list/set/show` 冒烟通过(临时目录 e2e 验证)
