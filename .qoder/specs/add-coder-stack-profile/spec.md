# add-coder-stack-profile Spec

> 对应 Plan: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md`

---

## Plan→Spec 映射

| # | Plan 决策 | 文件 | 关键变更 |
|---|------|------|------|
| 1 | D1/D2 规则分层 + 引用行 | `templates/core/rules/project_rules.md` | 移除技术栈强制句,改 profile 引用行 |
| 2 | D3 注册表 | `templates/core/rules/profiles/index.toml` + `webapp-profile.md` + `machineserver-profile.md` | 内置 profile 定义 |
| 3 | D4/D5 渲染与状态 | `src/config/schema.ts`、`src/config/defaults.ts`、`src/core/renderer.ts` | stack 字段 + profile 注入 + 占位符 |
| 4 | D6 stack CLI | `src/cli/commands/stack.ts`、`src/cli/index.ts` | list/set/show |
| 5 | D7 init 申报 | `src/cli/commands/init.ts` | --stack + 交互申报 + stack.json |
| 6 | D8 MCP 上下文 | `templates/core/scripts/mcp-server/tools/context.ts` | 追加 profile 内容 |
| 7 | D9 多 MCP 路由安全 | `templates/core/scripts/mcp-server/tools/index.ts` + `tools/audit.ts` + `tools/registrar.ts` | description 项目前缀 + 落库声明 |

---

## 1. 模板去硬编码 + 引用行机制

> **Plan 决策**: D1 规则分层、D2 引用行机制(见上方映射表第 1 行)
> **文件**: `templates/core/rules/project_rules.md`

### 类型/接口定义

project_rules.md 的 §项目技术约束 章节结构(渲染后):

```markdown
### 技术栈约束(profile 引用)

{{stackReferenceLine}}
```

`{{stackReferenceLine}}` 为组合占位符，由 renderer 按 stack 两态生成（避免占位符中性文本被拼进路径）:

- **已设置**(stack="machineserver"):
  ```
  本项目的技术栈约束由 `.qoder/rules/profiles/machineserver-profile.md` 定义(由 `add-coder stack set` 管理)。
  - **当前技术栈**: `machineserver`(machineserver-profile.md 已生效,AI 必须遵守其中全部约束)
  ```
- **未设置**:
  ```
  本项目的技术栈未设置,不施加任何技术栈假设。
  AI 必须通过 `get_project_context` 读取项目实际代码推断真实技术栈,禁止套用模板或案例中的默认技术栈。
  (可用 `add-coder stack set <name>` 启用技术栈约束)
  ```
  [修订: 2026-08-05 实现审查 HITL round 3 决议——原「路径+占位符拼接」中性渲染出 `profiles/无（add-coder stack set 可启用）` 路径为问题,改为组合占位符按需生成]

### 移除清单

| 原章节 | 内容 | 去向 |
|--------|------|------|
| §项目技术约束 → 数据库 Schema(L861-865) | Prisma 强制句 | `webapp-profile.md` §数据库 |
| §项目技术约束 → Agent 节点(L869-873) | LangGraph 强制句 | `webapp-profile.md` §Agent 管线 |
| §项目技术约束 → 代码质量(L877-881) | TypeScript/ESLint/any | `webapp-profile.md` §代码质量 |
| MCP-1 get_db_schema(L893) | "获取 Prisma Schema 模型定义" | 改为通用表述: "获取项目数据模型定义(如 Prisma Schema/ORM 模型)" |
| 附录 A(L964-993) | LangChain BaseCallbackHandler | `webapp-profile.md` §附录 A |

### WHEN-THEN

- WHEN 渲染 project_rules.md 且 config.stack 为空 → THEN 引用行渲染为「未设置技术栈」中性文本,不含任何技术栈名词
- WHEN 渲染 project_rules.md 且 config.stack 为 `machineserver` → THEN 引用行指向 `profiles/machineserver-profile.md`
- WHEN 模板中出现 `LangGraph`、`Prisma`、`Next.js`、`TypeScript 编译必须通过` 等强制句 → THEN grep 断言应仅命中 profiles/ 目录,不得命中 project_rules.md

---

## 2. profile 注册表与内置 profile

> **Plan 决策**: D3 profile 注册表(见映射表第 2 行)
> **文件**: `templates/core/rules/profiles/index.toml`、`webapp-profile.md`、`machineserver-profile.md`

### 类型/接口定义

`index.toml` 结构(对齐 caijuehub TOML 真源模式):

```toml
# add-coder 技术栈 profile 注册表(内置)
# 用户自定义: 在 {magicDir}/rules/profiles/ 下放置任意 *.md 即可被 stack list 识别

[[profile]]
name = "webapp"
description = "Web 应用(前端/全栈): LangGraph/Next.js/Prisma/TypeScript 案例栈"
file = "webapp-profile.md"

[[profile]]
name = "machineserver"
description = "后端服务(机器人→中间件→平台链路): Kestra/HTTP API/事件驱动"
file = "machineserver-profile.md"
```

`machineserver-profile.md` 核心内容(新,后端服务链路):

```markdown
# machineserver-profile — 后端服务技术栈约束

> 由 add-coder 分发,可通过 `add-coder stack set machineserver` 启用/切换。
> 本 profile 描述「机器人 → 中间件 → 平台」后端链路的通用约束,不绑定具体框架实现。

## 技术栈事实(不是约束,仅供 AI 参考)
- 典型链路: 机器人/Agent → Kestra 工作流编排 → HTTP API → 平台
- 典型形态: 事件驱动 + 任务编排 + 服务间 HTTP 集成

## 代码质量
- 服务边界: 编排(工作流)与业务(API)分层,禁止在编排层写业务逻辑
- 幂等: 任务/接口消费必须幂等,失败可重放
- 契约: 跨服务 API 必须有显式契约(OpenAPI/JSON Schema),禁止隐式字段约定
- 可观测: 每个任务/请求链路必须有 traceId 贯穿

## 错误处理
- 失败路径与成功路径信息密度等价
- 编排失败必须有重试/补偿策略,禁止静默失败
```

### WHEN-THEN

- WHEN `stack set machineserver` → THEN 生成 `profiles/machineserver-profile.md` 到 `.add/rules/profiles/` + `{magicDir}/rules/profiles/`
- WHEN `stack set webapp` → THEN 生成的 webapp-profile.md 内容与旧版 project_rules.md 技术栈约束**语义等价**(Prisma/LangGraph/TypeScript/LangChain 约束不丢失)
- WHEN `stack set <未注册名>` 且用户项目 `{magicDir}/rules/profiles/<名>-profile.md` 存在 → THEN 视为自定义 profile,允许设置
- WHEN `stack set <未注册名>` 且文件不存在 → THEN 拒绝并提示 `stack list` 查看可用项
- WHEN `sync --patch` 扫描到用户自建自定义 profile（`{magicDir}/rules/profiles/*.md` 非注册表项）→ THEN 白名单命中,不覆盖、不删除该文件 [回流: Review P1 #1 sync 白名单]

---

## 3. 渲染与状态

> **Plan 决策**: D4 stack 状态、D5 渲染(见映射表第 3 行)
> **文件**: `src/config/schema.ts`、`src/config/defaults.ts`、`src/core/renderer.ts`

### 类型/接口定义

```typescript
// schema.ts 新增
stack: z.string().optional(),  // 当前技术栈 profile 名; 空 = 未设置(中性)

// defaults.ts 新增
stack: "",

// renderer.ts
const STACK_PLACEHOLDERS: Record<string, "stackName" | "stackProfile"> = {
  "{{stackName}}": "stackName",      // 如 "machineserver"
  "{{stackProfile}}": "stackProfile", // 如 "machineserver-profile.md"
};
// 无 stack 时: {{stackName}} → "未设置", {{stackProfile}} → "无(add-coder stack set 可启用)"

// stack.json 读写(renderer 新增导出)
export function loadStack(projectRoot: string): string        // 读 {magicDir}/stack.json,容错
export function saveStack(projectRoot: string, magicDir: string, stack: string): void
```

profile 注入逻辑(renderCore 扩展): config.stack 命中注册表时,额外把 `templates/core/rules/profiles/{file}` 渲染输出到 `.add/rules/profiles/` + `{magicDir}/rules/profiles/`;未设置或未命中 → 不输出任何 profile 文件。

### WHEN-THEN

- WHEN 渲染且 stack="" → THEN 输出文件不含 profiles/,project_rules.md 为中性引用
- WHEN 渲染且 stack="webapp" → THEN 输出 profiles/webapp-profile.md(两 magic 路径)
- WHEN stack.json 缺失/损坏 → THEN 按未设置处理,不抛错、不阻断 init/sync
- WHEN stack 未命中注册表且用户自定义文件存在 → THEN 只渲染引用行({{stackProfile}} = 自定义文件名),不复制模板 profile

---

## 4. stack CLI 命令

> **Plan 决策**: D6 CLI(见映射表第 4 行)
> **文件**: `src/cli/commands/stack.ts`、`src/cli/index.ts`

### 类型/接口定义

```typescript
// stack.ts
export async function stackCommand(sub: string, options: { adapter?: string }) {
  // list: 内置(注册表) + 自定义({magicDir}/rules/profiles/*.md 非注册表项) + 当前标记
  // set <name>: 校验存在性 → saveStack → 重渲染 profile 相关文件(复用 renderCore) → 更新 hash
  // show: 输出当前 stack + profile 文件路径 + 更新时间
}

// index.ts 注册
program.command("stack").description("管理技术栈约束 profile").argument("[sub]", "list | set <name> | show").action(...);
```

### WHEN-THEN

- WHEN `add-coder stack list` → THEN 列出内置(webapp/machineserver)+ 自定义 profile,标记当前生效项
- WHEN `add-coder stack set machineserver` → THEN 写 stack.json + 生成 profiles/machineserver-profile.md 到 `.add/rules/profiles/` 和 `{magicDir}/rules/profiles/` + 更新 project_rules.md 引用行(重渲染)+ 更新 `.add-coder-hash.json`
- WHEN `add-coder stack set ""` / `--clear` → THEN 清除 stack.json,移除引用(中性),不删除用户自建 profile 文件
- WHEN `add-coder stack show` → THEN 输出当前 stack(空则提示未设置)

---

## 5. init 技术栈申报

> **Plan 决策**: D7 init 申报(见映射表第 5 行)
> **文件**: `src/cli/commands/init.ts`

### 类型/接口定义

```typescript
interface InitOptions { adapter?: string; config?: string; force?: boolean; dryRun?: boolean; stack?: string; }

// 交互提问(非 force 且未传 --stack):
//   技术栈约束: [1] 不设置(中性,推荐)  [2] webapp  [3] machineserver  [4] 自定义(输入文件名)
// force 或 --stack: 直接使用,不提问
```

流程: prepare() 阶段解析 stack → 写入 stack.json(与 magicDir 一致)→ renderAndWrite 时 config.stack 已带值 → renderCore 自动完成引用行 + profile 注入。

### WHEN-THEN

- WHEN init 未传 --stack 且非 force → THEN 交互提问;用户回车默认「不设置」
- WHEN init --stack machineserver → THEN 初始化完成后 `.add/rules/profiles/machineserver-profile.md` 与 `{magicDir}/rules/profiles/machineserver-profile.md` 均存在,project_rules.md 引用行指向 machineserver-profile.md
- WHEN init 无 --stack 且用户选「不设置」→ THEN 项目中不存在 rules/profiles/,project_rules.md 为中性引用
- WHEN init --dry-run --stack machineserver → THEN 输出预览包含 profiles/machineserver-profile.md,不实际写入

---

## 6. MCP 上下文兼容

> **Plan 决策**: D8 MCP 上下文(见映射表第 6 行)
> **文件**: `templates/core/scripts/mcp-server/tools/context.ts`

### 类型/接口定义

```typescript
// context.ts 读取规则逻辑扩展:
// 1. 读 project_rules.md(原有)
// 2. 尝试读 {magicDir}/stack.json → 有 stack 且 profiles/{stack}-profile.md 存在 → 追加内容
// 3. 拼接为 rules 文本返回(AI 上下文可见技术栈约束)
// 失败路径: stack.json/profile 缺失 → 仅返回 project_rules.md,不报错
```

### WHEN-THEN

- WHEN stack.json 存在且 profile 文件存在 → THEN get_project_context 返回的 rules 包含 profile 全文
- WHEN stack.json 缺失 → THEN 返回 project_rules.md 原文,零技术栈假设
- WHEN profile 文件被用户删除但 stack.json 仍指向它 → THEN 返回 project_rules.md + 警告标注「profile 文件缺失,技术栈约束未生效」

## 7. MCP 工具路由安全

> **Plan 决策**: D9 多 MCP 路由安全(见映射表第 7 行)
> **文件**: `templates/core/scripts/mcp-server/tools/index.ts`、`templates/core/scripts/mcp-server/tools/audit.ts`

### 背景

工作区多项目共存时(如 add-coder + htc_g13_extra_time 同开),两个项目的 dev MCP 同时加载,工具集同名同描述(record_dev_operation / check_dps / plan_track 等 29 个),AI 调用时无法从工具本身区分 server 归属,易把审计写入错误项目的数据库。

### 类型/接口定义

```typescript
// shared/env.ts(已有,不修改): PROJECT_ID = basename(PROJECT_ROOT)
// add-coder → "add-coder", htc_g13_extra_time → "htc_g13_extra_time"

// tools/index.ts registerAllTools 包装(单点):
// 所有 registerTool 调用的 description 自动加前缀 `[项目: {PROJECT_ID}] `
// 包装方式: server.registerTool = (name, schema, cb) => orig(name, { ...schema, description: 前缀+原文 }, cb)

// tools/audit.ts 写操作响应声明落库项目:
// record_dev_operation 成功响应追加 `  落库项目: {PROJECT_ID} ({PROJECT_ROOT})`
// query_audit_logs 响应头部追加 `  服务项目: {PROJECT_ID}`
```

### WHEN-THEN

- WHEN 两个 dev MCP 同时加载 → THEN 每个工具 description 均带 `[项目: {PROJECT_ID}]` 前缀,客户端可辨识归属
- WHEN AI 调用 record_dev_operation → THEN 响应文本声明 `落库项目: {PROJECT_ID}`,可回查确认未写错库
- WHEN 调用 query_audit_logs → THEN 响应头部声明 `服务项目: {PROJECT_ID}`,过滤结果归属明确
- WHEN htc 等旧项目 mcp.json 缺 PROJECT_ROOT env → THEN resolveProjectRoot 走 dirname_fallback(确定性,不依赖 cwd),项目定位不漂移
- WHEN 注册工具时 → THEN 经 ToolRegistrar 基类接口(Pick<McpServer,"registerTool">)派生装饰,无类型逃逸
- WHEN audit.ts 编译 → THEN 零 TS 错误(args 窄化 + 行类型断言,基线 14 错误已修复) [修订: 2026-08-05 实现审查 HITL round 3 决议]

---

## Impact

- Affected specs: 无(新功能)
- Affected code: 见 §1-7 文件清单(13 个源文件: 11 + sync.ts + tools/index.ts + audit.ts)
- 父 Plan: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md`
- 依赖: 无(独立 Plan)
- 后续依赖: 无

## Boundaries

本次只允许:
- 修改模板文件、配置 schema、渲染器、CLI 命令、MCP context 读取逻辑、sync --patch 白名单逻辑、MCP 工具注册包装(index.ts/audit.ts 项目标识注入)

本次禁止:
- 禁止修改 AgentAuditPhase / agent-audit-logger.ts(本 Plan 无运行时审计变更)
- 禁止升级模板引擎(不做条件渲染语法)
- 禁止删除 profiles/ 中用户自建的自定义 profile 文件
- 禁止修改 prisma 相关模板与本 Plan 无关的部分
- 禁止 sync --patch 覆盖或删除用户自建自定义 profile(白名单必须包含 {magicDir}/rules/profiles/ 非注册表项) [回流: Review P1 #1]
