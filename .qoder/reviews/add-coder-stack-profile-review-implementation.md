# add-coder-stack-profile-review-implementation

## Review 元信息

- **Review 对象**: add-coder-stack-profile Plan 三轮回合实现（模板去硬编码 + profiles/ + stack CLI + init 申报 + MCP 上下文 + sync 白名单 + D9 工具路由安全）
- **关联方案 review**: `.qoder/reviews/add-coder-stack-profile-review-v1.md`
- **Review 时间**: 2026-08-05
- **Review 类型**: 实现 review（ADD 0.1.2）
- **前置阅读**: `.qoder/plans/2026-08/05/add-coder-stack-profile-plan-v1.md`、`.qoder/specs/add-coder-stack-profile/{spec,tasks,checklist}.md`

---

## HITL 发现总览（一次性提交人类审核）

> **规则**: AI 必须先在此表中列出 **所有检查维度的发现**，等待人类一次性审核通过后再逐项展开。

| # | 严重度 | 检查维度 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | P1 | 中性引用行 | 中性场景引用行路径拼接占位符中性文本（`profiles/无（add-coder stack set 可启用）`），是问题而非展示瑕疵 | 引用行改为 `{{stackReferenceLine}}` 组合占位符，renderer 按设置/中性两态生成 | ✅ 同意(修改) |
| 2 | P1 | 基线技术债 | audit.ts 14 个 TS 基线错误（args 类型 string\|number 未窄化、prisma 返回 unknown） | 修复：s() 窄化辅助 + 行类型断言，tsc 全项目 0 错误 | ✅ 同意(修复) |
| 3 | P2 | D9 类型严谨性 | 原实现 `as unknown as McpServer` 伪造 server 对象，类型逃逸 | 基类接口 ToolRegistrar（Pick<McpServer,"registerTool">），15 个注册函数签名收敛，派生装饰 registrar | ✅ 同意(重构) |
| 4 | P2 | 契约与 E2E | ADD 范式验证以可审计 + 提前规划为主（WHEN-THEN/check_spec_sync/check_dps/RAHS），不追求测试数量；但审计链对质量的保证目前仍是预期、尚未兑现到可免测，故仍需 e2e 冒烟补充验证 | 以审计链（15 条 devlog + 文档交叉校验）作为实现质量证据，e2e 冒烟为补充验证（免测时机未到） | ✅ 同意 |

> **人类确认后**: AI 在下方逐章节展开详细检查。

---

## 1. 跨仓库格式契约

| API/契约 | 发送方 | 期望类型 | 接收方 | 实际类型 | 匹配? |
|-----|--------|---------|--------|---------|:---:|
| stack.json `{stack, updatedAt}` | init/sync/stack set 写入 | JSON | context.ts / loadStack 读取 | JSON.parse 四方一致 | ✅ |
| profile 引用行 | renderer 输出 | `.add/rules/profiles/` + `{magicDir}/rules/profiles/` | sync --patch 白名单 | `[/]rules[/]profiles[/]` 正则命中 | ✅ |
| {{stackReferenceLine}} | renderer 两态生成 | 设置态指向文件 / 中性态零假设 | project_rules.md 渲染产物 | e2e 两态断言 | ✅ |
| MCP 工具 description | tools/index.ts 派生 registrar | `[项目: {PROJECT_ID}] ` 前缀 | 29 工具注册断言 | 启动验证 29/29 | ✅ |

- [x] 所有字段名和嵌套结构一致（stack.json 四方解析一致）
- [x] 响应 Content-Type 匹配（CLI 文本输出 / MCP textResponse）

---

## 2. 框架版本兼容性

- [x] 无新依赖（复用 smol-toml 解析 index.toml 与 DPS 阈值）
- [x] 无框架升级（commander/zod/MCP SDK 版本不变）
- [x] 无 Prisma 变更（Boundaries 声明；prisma generate 仅为环境验证）
- [x] 编译产物 mtime 晚于源码（build 后 dist 验证通过）

---

## 3. 数据模型约束

- [x] 无 Prisma 模型变更（stack.json 为文件态，非 DB 模型）
- [x] stack.json 缺失/损坏 → loadStack 容错返回 ""（中性），不抛错不阻断

---

## 4. 环境变量加载链

- [x] 无新增环境变量（PROJECT_ID 从 PROJECT_ROOT basename 派生，env.ts 已有）
- [x] 三套环境（dev/local/prod）无 DATABASE_URL 之外的变更

---

## 5. 多 API 场景匹配

- [x] stack 命令 list/set/show/--clear 分支独立，无场景错配
- [x] init --stack 非交互（force）与交互申报（非 force）分支分离
- [x] context.ts 读 stack.json 失败路径仅降级不报错

---

## 6. E2E 逐端点验证（临时目录）

- [x] `init --dry-run --stack machineserver`：预览含 `.add/rules/profiles/machineserver-profile.md` + `.qoder/...`（验收③）
- [x] `init --stack machineserver` 实际执行：stack.json 写入 + profile 注入 + 引用行正确（验收②）
- [x] `stack set webapp`：切换成功，引用行更新，hash 刷新（4 文件）
- [x] 中性场景：无 profiles 目录 + `{{stackReferenceLine}}` 中性文本（验收④）
- [x] 无 stack / 损坏 stack.json：init/sync 不崩溃

> 注：ADD 范式验证以审计驱动为主（本 Plan 15 条 record_dev_operation + check_spec_sync/check_dps/RAHS 闸门），e2e 冒烟为补充证据——审计链对质量的保证目前仍是预期，尚未兑现到可免测的时机，因此 e2e 仍属必要。

---

## 7. 关联 Checklist

- 本 review 的检查项与 `.qoder/specs/add-coder-stack-profile/checklist.md` 的"跨项目联调检查"章节一一对应
- [x] checklist [T]/[E] 全部通过（20 项，[R] 保留待运行时验证）
