# add-coder-stack-profile-review-v1

## Review 元信息

- **Review 对象**: `add-coder-stack-profile-plan-v1.md` + Specs 三元组（spec.md / tasks.md / checklist.md）+ add-route
- **对比方案**: 方案 A（仅用户侧自建 profile） vs 方案 B（profile 目录 + 注册表 + CLI，本项目方案） vs 方案 C（模板引擎条件渲染）
- **Review 时间**: 2026-08-05
- **Review 类型**: 方案选型 / 架构决策
- **前置阅读**: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md`、`.qoder/specs/add-coder-stack-profile/spec.md`

---

## HITL 发现总览（一次性提交人类审核）

> **规则**: AI 必须先在此表中列出 **所有发现**，等待人类一次性审核通过后再逐项推进。

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | P1 | 范围边界 | sync --patch 白名单未覆盖用户自建自定义 profile，存在被同步覆盖/删除的风险 | 范围边界补充：sync --patch 白名单需包含用户自建自定义 profile 文件 | ✅ 同意(已调整) |
| 2 | P2 | 文档质量 | Plan §3.3 映射表行序与 Spec 节序错位，导致 DPS 语义延续性失真（46%） | 映射表按 Spec 节序重排（D1/D2 合并为 6 行一一对应） | ✅ 同意 |
| 3 | P2 | 工具兼容 | add-route 依赖拓扑 ASCII 行被 check_dps depPattern 误匹配（1/10），短路表格「依赖」列检测 | add-route 增加 Task Dependencies 显式声明块（10 行，对齐 tasks.md 编号） | ✅ 同意 |

> **人类确认后**: AI 在下方逐条展开详细分析。每一条展开时必须引用上方编号。

---

## 1. 问题复现

为什么需要这次评审？

1. **模板污染**: `templates/core/rules/project_rules.md`（994 行）内嵌前端案例技术栈假设（Prisma/LangGraph/TypeScript/LangChain），随 `add-coder init/sync` 分发到所有用户项目，导致机器人后端（Kestra+HTTP API）等项目被 AI 按前端案例技术栈生成方案。
2. **无覆盖机制**: 用户 AGENTS.md 文字声明无法替代实际规则覆盖，`.add/rules/` 下不存在 `machineserver-profile.md` 等覆盖文件。
3. **无定制入口**: 无 CLI/配置途径让用户声明或切换技术栈约束。

评审输入：Plan（D1-D8 设计决策）+ Specs 三元组 + add-route（8 Task 映射 + 依赖拓扑）+ DPS 首轮评分（75 WARN，未达 80 准入线）。

---

## 2. 方案对比

### 2.1 方案 A: 仅用户侧自建 profile 文件

- 治本程度低（仅救单个用户），用户需手动维护，无平台级复用
- 行业对齐弱（不符合 Cursor .cursor/rules 模块化演进方向）
- 结论: ✗ 排除

### 2.2 方案 B: profile 目录 + 注册表 + CLI 命令（本项目方案）

- 治本程度高（平台级）：project_rules.md 只保留范式通用规则，技术栈约束移入 `rules/profiles/{stack}-profile.md`
- 用户定制：`add-coder stack list/set/show` 一键管理 + 自定义 profile 文件自动识别
- 行业对齐强：Cursor `.cursor/rules/` 目录 + MDC 格式（技术栈规则独立成文件、按需加载、用户规则优先）；AGENTS.md 开放标准（closest wins）
- 结论: ✅ 采用

### 2.3 方案 C: 模板引擎条件渲染（{{ifStack}} 语法）

- 需升级模板引擎（条件语法），与现有「占位符替换」渲染器不兼容，breaking 成本高
- 收益低：问题本质是内容分层而非渲染能力
- 结论: ✗ 排除

---

## 3. 决策结论

**采用方案 B**，并落实以下评审发现：

- **P1 #1（范围边界）**: 同步白名单扩展——`sync --patch` 的分发/覆盖白名单必须包含用户自建自定义 profile（`{magicDir}/rules/profiles/*.md` 非注册表项），保证 sync 不覆盖、不删除用户自建定义。`stack set` 允许任意名称的前提是用户文件不被同步机制破坏。
- **P2 #2（文档质量）**: Plan §3.3 映射表按 Spec 节序重排（6 行一一对应），消除 DPS 语义错位。
- **P2 #3（工具兼容）**: add-route 补充 Task Dependencies 显式声明块，规避 DPS 依赖提取短路。

DPS 复评结果：83 ≥ 80（语义 73 / 熵 95 / CPM 73 / 结构 91），闸门通过。

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | 操作 | 评审关注点 |
|------|------|-----------|
| `templates/core/rules/project_rules.md` | 修改 | 去硬编码后必须保留范式通用规则完整性（P1 #1 回流） |
| `templates/core/rules/profiles/*`（3 文件） | 新建 | 注册表 + webapp/machineserver profile |
| `src/config/schema.ts`、`defaults.ts` | 修改 | stack 可选字段，向后兼容 |
| `src/core/renderer.ts` | 修改 | profile 按需注入 + 占位符 |
| `src/cli/commands/stack.ts`、`init.ts`、`src/cli/index.ts` | 新建/修改 | stack 命令 + init 申报 |
| `templates/core/scripts/mcp-server/tools/context.ts` | 修改 | MCP 上下文追加 profile |
| `sync --patch` 白名单逻辑 | 修改 | **新增用户自建自定义 profile 白名单项（P1 #1）** |

### 4.2 数据流影响

- 无新增依赖（复用 smol-toml 解析 index.toml）
- stack.json 为新增状态文件，缺失/损坏按「未设置」容错，不阻断 init/sync
- MCP context.ts 追加 profile 内容后，AI 上下文可见技术栈约束；profile 缺失时降级为仅 project_rules.md

### 4.3 回滚风险

- 模板真源改动单向可回退（templates/ + src/ 均在 git 管控）
- 已初始化用户项目通过 `sync --patch` 增量分发，`stack set webapp` 可恢复旧版等效约束
- profile 文件缺失不崩溃（警告引用），stack.json 损坏不阻断（中性回退）

---

## 5. 建议修正优先级

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | P1 #1 sync 白名单 | 必须回流 Plan/Specs 并纳入验收标准，防止用户自建文件被同步破坏 |
| 中 | P2 #2 映射表重排 | 已执行（DPS 修复），保持文档一致性 |
| 低 | P2 #3 Task Dependencies | 已执行（DPS 修复），add-route 可读性提升 |

## 6. 最终建议

- 按方案 B 进入 Step 1 实施；P1 #1 回流至 Plan §3.2 D3/D6 与 Spec §Boundaries，并在验收标准中增加对应项
- 实施轮次按 Plan §4 三轮回合推进，每轮完成 tsc + checklist 独立验证
