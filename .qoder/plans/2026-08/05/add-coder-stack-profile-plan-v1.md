# add-coder-stack-profile-plan-v1

## PLAN 元信息

- **Plan 名称**: add-coder-stack-profile-plan-v1
- **启动时间**: 2026-08-05T15:30:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/05/add-coder-stack-profile-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-08/05/add-coder-stack-profile-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-stack-profile-review-v1.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| templates/core/rules/project_rules.md | RULE | RULE_MODIFIED | 内嵌 Prisma/LangGraph/TypeScript 硬编码约束 | 技术栈章节改为 profile 引用行 | 待实施 |
| templates/core/rules/profiles/index.toml | RULE | RULE_CREATED | 不存在 | profile 注册表(webapp/machineserver) | 待实施 |
| templates/core/rules/profiles/machineserver-profile.md | RULE | RULE_CREATED | 不存在 | 后端服务链路技术栈约束 | 待实施 |
| templates/core/rules/profiles/webapp-profile.md | RULE | RULE_CREATED | 不存在 | 前端案例技术栈约束(旧硬编码迁移) | 待实施 |
| src/config/schema.ts | COMPONENT | COMPONENT_MODIFIED | 无 stack 字段 | 新增 stack 可选字段 | 待实施 |
| src/config/defaults.ts | COMPONENT | COMPONENT_MODIFIED | 无 stack 默认值 | stack 默认空 | 待实施 |
| src/core/renderer.ts | COMPONENT | COMPONENT_MODIFIED | 仅占位符替换 | 支持 stack profile 按需注入 + stack 占位符 | 待实施 |
| src/cli/commands/stack.ts | COMPONENT | COMPONENT_CREATED | 不存在 | stack list/set/show 命令 | 待实施 |
| src/cli/index.ts | COMPONENT | COMPONENT_MODIFIED | 3 个命令 | 注册 stack 命令 | 待实施 |
| src/cli/commands/init.ts | COMPONENT | COMPONENT_MODIFIED | 无技术栈申报 | --stack 选项 + 交互申报 + 写入 stack.json | 待实施 |
| src/cli/commands/sync.ts | COMPONENT | COMPONENT_MODIFIED | --patch 白名单无自定义 profile | --patch 白名单包含用户自建自定义 profile(不覆盖不删除) [回流: Review P1 #1] | 待实施 |
| templates/core/scripts/mcp-server/tools/context.ts | MCP_TOOL | MCP_TOOL_MODIFIED | 只返回 project_rules.md | 附加当前 profile 内容 | 待实施 |
| templates/core/scripts/mcp-server/tools/index.ts | MCP_TOOL | MCP_TOOL_MODIFIED | 工具 description 无项目标识 | registerTool 包装注入 [项目: PROJECT_ID] 前缀(D9) | 待实施 |
| templates/core/scripts/mcp-server/tools/audit.ts | MCP_TOOL | MCP_TOOL_MODIFIED | 写操作响应无项目声明 | record_dev_operation/query_audit_logs 落库声明项目(D9) | 待实施 |

---

## HITL 计划总览(一次性提交人类审核)

> 已通过 HITL 审批: 2026-08-05 TONGYI(8 维度全部同意; 预估文件数调整为明确清单)。

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | add-coder 模板体系 + CLI + 渲染器 + schema 配置 | ✅ 同意 |
| 预估文件数 | 11 个源文件(修改 7 + 新建 4) + 文档产物 5 + 同步产物若干 | ✅ 同意(已明确) |
| 架构变更 | 技术栈 profile 机制: 规则按「范式通用 + 技术栈独立」分层 | ✅ 同意 |
| 新增依赖 | 无(复用 smol-toml) | ✅ 同意 |
| 风险等级 | 🟡中 | ✅ 同意 |
| 预计轮次 | 3 轮 | ✅ 同意 |
| 兼容策略 | sync --patch 分发 + stack set 恢复等效约束 | ✅ 同意 |
| 验收标准 | 5 条(见 §五) | ✅ 同意 |

---

## 一、背景与目标

### 1.1 问题现状

1. **模板污染**: `templates/core/rules/project_rules.md`(994 行)内嵌 ADD 案例研究的技术栈假设——Prisma(§数据库 Schema)、LangGraph(§Agent 节点)、TypeScript(§代码质量)、LangChain(附录 A)。该文件随 `add-coder init/sync` 分发到所有用户项目,导致机器人后端(Kestra+HTTP API)等项目被 AI 按前端案例技术栈生成方案。
2. **无覆盖机制**: 用户 AGENTS.md 写防护条款(如"案例技术栈不自动成为约束")只是文字声明; `.add/rules/` 下不存在 `machineserver-profile.md` 等实际覆盖文件,AI 读到的 `project_rules.md` 仍是强技术栈假设。
3. **无定制入口**: 不同项目技术栈不同,但目前没有任何 CLI 或配置途径让用户声明/切换技术栈约束。

### 1.2 目标

1. **案例与约束分离**: project_rules.md 只保留范式通用规则,技术栈约束移入独立 profile 文件。
2. **用户可定制**: 通过独立 CLI 命令(`add-coder stack`)设置/切换/查看技术栈约束。
3. **无申报中性**: 用户不申报技术栈时,不写入任何技术栈假设。
4. **兼容既有用户**: 已初始化项目可通过 `sync --patch` 获取新模板;旧版技术栈约束用户可用 `add-coder stack set webapp` 恢复等效约束。

---

## 二、方案选型

### 2.1 候选方案对比

| 方案 | 治本程度 | 用户定制 | 实现成本 | 行业对齐 | 结论 |
|------|---------|---------|---------|---------|------|
| A: 仅用户侧自建 profile 文件 | 低(仅救单个用户) | 手动 | 低 | 弱 | ✗ |
| B: profile 目录 + 注册表 + CLI 命令(本项目方案) | 高(平台级) | 一键命令 + 自定义文件 | 中 | 强(Cursor .cursor/rules 模块化 + globs 按需加载) | ✅ |
| C: 模板引擎条件渲染({{ifStack}} 语法) | 高 | 需升级渲染器 | 高(模板引擎升级,breaking) | 中 | ✗ |

### 2.2 选型理由

- **行业最佳实践**(调研结论):
  - Cursor 从 `.cursorrules` 单文件演进到 `.cursor/rules/` 目录 + MDC 格式(description/globs/alwaysApply),**技术栈规则独立成文件**(如 `01-tech-stack.mdc`),按 glob 命中按需加载,不命中不占 token;规则按数字前缀分层加载。
  - AGENTS.md 开放标准(Agentic AI Foundation / Linux Foundation 托管): 根级 + 嵌套文件,最近优先,冲突时 closest wins; 显式用户指令覆盖一切。
  - 核心共识: ①技术栈约束独立文件、与通用规则分离; ②按需加载,不硬塞上下文; ③用户规则优先级高于模板; ④规则精简(≤200 行)。
- 方案 B 将「技术栈约束」从 project_rules.md 中抽离为 `rules/profiles/{stack}-profile.md` 独立文件,由 `add-coder stack set` 管理,对齐行业「技术栈独立文件 + 用户可覆盖」模式; 无申报时中性,符合用户反馈「无申报则不写任何技术栈假设」。
- 方案 C 需要升级模板引擎(条件语法),与现有「占位符替换」渲染器不兼容,成本高收益低。

---

## 三、架构设计

### 3.1 数据流转(文件级)

```
templates/core/rules/                          ← npm 包内置模板真源
├── project_rules.md                            ← 范式通用规则(去技术栈,含 profile 引用行)
└── profiles/
    ├── index.toml                              ← profile 注册表(内置: webapp/machineserver)
    ├── webapp-profile.md                       ← 前端案例技术栈约束(旧硬编码迁移)
    └── machineserver-profile.md                ← 后端服务链路技术栈约束(新)

渲染链路(init / sync / stack set 共用 renderCore):
  renderCore(config) — config.stack 决定:
    ├── 通用: project_rules.md → .add/rules/ + {magicDir}/rules/
    │         {{stackName}}/{{stackProfile}} 占位符 → 按 config.stack 填充
    │         (无 stack → 渲染为「未设置,不施加任何技术栈假设」)
    └── profile: 命中注册表 → profiles/{stack}-profile.md → 两目录
                 (无 stack → 不注入任何 profile 文件)

用户项目侧:
  {magicDir}/rules/profiles/{stack}-profile.md   ← 已申报: 落盘,AI 可见
  {magicDir}/stack.json                          ← 当前技术栈状态(init/stack set 读写)
  MCP context.ts → 读 project_rules.md + 追加当前 profile 内容 → 喂给 AI

回退链:
  - stack.json 缺失/损坏 → 按「未设置」处理(中性),不阻断 init/sync
  - 注册表未命中 → 视为自定义 profile(文件存在即可用),stack set 允许任意名称
  - profile 文件缺失 → project_rules.md 保留「已设置但文件缺失」警告引用,不崩溃
```

### 3.2 关键设计决策

| 决策 | 内容 |
|------|------|
| D1 规则分层 | project_rules.md 保留: 规则优先级表、SKILL、ADD-0~18、文档规范、MCP 约束(通用表述)。移除: §项目技术约束的 Prisma/LangGraph/TypeScript 强制句、附录 A LangChain 实现。 |
| D2 引用行机制 | project_rules.md §项目技术约束 改为: 「技术栈约束由 {magicDir}/rules/profiles/{{stackProfile}} 定义(add-coder stack set 管理)。未设置时以项目实际代码为准,不施加任何技术栈假设。」 |
| D3 profile 注册表 | `profiles/index.toml`: `[[profile]] name/description/file`。内置 webapp(旧案例)、machineserver(新)。用户自定义: 任意 `{magicDir}/rules/profiles/*.md`(不在注册表内)自动识别。**sync --patch 白名单必须包含用户自建自定义 profile,不覆盖、不删除**。[回流: Review P1 #1 sync 白名单] |
| D4 stack 状态 | `{magicDir}/stack.json`: `{ "stack": "machineserver" | "", "updatedAt": ISO }`。init 写入; sync 读取(幂等); stack set 重写。 |
| D5 渲染 | renderer.ts 新增: ①`{{stackName}}`/`{{stackProfile}}` 占位符(取 config.stack); ②profile 按需注入(命中注册表且 stack 非空才输出 profiles/ 文件)。 |
| D6 CLI | `add-coder stack list`(内置+自定义)/ `set <name>`(写 stack.json + 重渲染 profile + 更新 hash)/ `show`(当前栈)。 |
| D7 init 申报 | init 新增 `--stack <name>` 非交互选项 + 交互提问(设置/不设置); 结果写 stack.json。无申报 → 中性。 |
| D8 MCP 上下文 | context.ts 读 project_rules.md 后,检测 stack.json,命中则追加对应 profile 内容(AI 上下文可见技术栈约束)。 |
| D9 多 MCP 路由安全 | 工作区多项目共存时,两个 dev MCP(如 add-dev-tools / htc-add-tools)工具同名同描述易选错。所有工具 description 注入 `[项目: {PROJECT_ID}]` 前缀(PROJECT_ID = PROJECT_ROOT basename,env.ts 已有);写操作(record_dev_operation/query_audit_logs)响应声明落库项目。 |

### 3.3 Plan→Spec 实施映射

> 从设计决策到精确实施的一对一映射。行序与 Spec 节序一一对应。

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| D1 规则分层 + D2 引用行机制 | Spec §1 模板去硬编码 + 引用行 | `templates/core/rules/project_rules.md` | 移除技术栈强制句,改 {{stackName}}/{{stackProfile}} 引用行 |
| D3 profile 注册表 | Spec §2 注册表与内置 profile | `templates/core/rules/profiles/index.toml` + 2 个 profile | 内置 webapp/machineserver 定义 |
| D4 stack 状态 + D5 渲染 | Spec §3 渲染与状态 | `src/config/schema.ts`、`src/config/defaults.ts`、`src/core/renderer.ts` | stack 字段 + profile 注入 + 占位符 |
| D6 stack CLI 命令 | Spec §4 stack CLI 命令 | `src/cli/commands/stack.ts`、`src/cli/index.ts` | list/set/show |
| D7 init 技术栈申报 | Spec §5 init 技术栈申报 | `src/cli/commands/init.ts` | --stack + 交互申报 + stack.json |
| D8 MCP 上下文 | Spec §6 MCP 上下文兼容 | `templates/core/scripts/mcp-server/tools/context.ts` | 追加 profile 内容 |
| D9 多 MCP 路由安全 | Spec §7 MCP 工具路由安全 | `templates/core/scripts/mcp-server/tools/index.ts`、`tools/audit.ts` | description 注入 [项目: PROJECT_ID] 前缀 + 写操作落库声明 |

---

## 四、实施 Task 概要

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

> 详细子任务 + 验证证据见 tasks.md——Plan 只定义轮次边界和依赖顺序,不展开每个 Task 的子步骤。

---

## 五、验收标准

- [ ] ① project_rules.md 模板无任何 LangGraph/Next.js/Prisma/TypeScript 硬编码强制句(技术栈内容全部移入 profiles/)
- [ ] ② `add-coder stack set machineserver` 后生成 machineserver-profile.md 且 project_rules.md 引用正确
- [ ] ③ `init --stack machineserver` 全流程可跑(含 dry-run 验证)
- [ ] ④ 无 stack 时零技术栈假设(project_rules.md 渲染为中性引用)
- [ ] ⑤ tsc --noEmit / eslint / 既有测试通过
- [ ] ⑥ `sync --patch` 后用户自建自定义 profile 文件保留(白名单生效,不覆盖不删除) [回流: Review P1 #1]
- [ ] ⑦ 多 MCP 工作区共存时,工具 description 带 `[项目: {PROJECT_ID}]` 前缀可区分,写操作响应声明落库项目(D9)

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-08/05/add-coder-stack-profile-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-08/05/add-coder-stack-profile-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-stack-profile-review-v1.md` |
| Spec | `.qoder/specs/add-coder-stack-profile/spec.md` |
| Tasks | `.qoder/specs/add-coder-stack-profile/tasks.md` |
| Checklist | `.qoder/specs/add-coder-stack-profile/checklist.md` |
