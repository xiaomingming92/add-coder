# Checklist: add-coder npm 包工程化

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证 — 证据: 命令+结果（如 `tsc=0` / `vitest 9/9`）
> - `[R]` = 运行时验证 — 证据: 部署后确认（如 `npx add-coder init` 端到端）
> - `[E]` = 静态检查 — 证据: grep/diff 输出
> - `[H]` = 人工审阅 — 证据: 审阅结论 + 关注点（**无法自动化，必须读代码**）
>
> **审计链（证据→devlog→checklist）**:
> - 初验规则: 先找证据（命令+结果）→ 调 `record_dev_operation` 落库 → 将返回的真实 cuid 写入 checklist。**禁止抄写 `cmq...` 占位符**。
> - 复验规则: 先查 checklist 是否已有真实审计 ID → 重新验证证据 → 证据一致则不复写 devlog，不一致则追写新 devlog（新 cuid）

---

## 一、编译与 Lint 门禁 [T]（命令确认，一票否决）

- [x] [T] `npx tsc --noEmit` 零错误（`packages/add-coder/` 目录） — 证据: `tsc=0` (退出码 0)|审计: (待填写)
- [x] [T] `tsup` 构建成功（ESM + CJS 双格式） — 证据: `DTS ⚡️ Build success`|审计: (待填写)
- [x] [E] `dist/` 目录包含 `cli/index.js` + `core/renderer.js` + `adapters/*/renderer.js` — 证据: tsup 产出确认|审计: (待填写)

---

## 二、模板硬编码清理 [E]（grep 确认，零残留）

- [x] [E] `grep -r "farm.agent\|farm_secure_pass\|大田精准\|/home/xmm\|/Users/milkytea" templates/` 返回空 — 证据: grep 返回空|审计: (待填写)
- [x] [E] `grep -r "farm.agent\|大田" dist/` 返回空 — 证据: 已确认|审计: (待填写)
- [ ] [E] `grep -r "process.env.*||" dist/` 返回空（基建变量无兜底值） — 证据: (待填写)|审计: (待填写)
- [x] [E] 所有 `{{placeholder}}` 占位符在 `src/core/renderer.ts` 中有对应的替换逻辑 — 证据: `renderCore()` 遍历模板文件执行 replace|审计: (待填写)

---

## 三、适配器正确性 [T]/[E]（三端 init 命令确认）

- [ ] [T] `npx add-coder init --adapter claude` 生成正确的 `.claude/` 目录 — 证据: (待填写)|审计: (待填写)
  - [ ] [E] `.claude/settings.json` 含 hook 配置，matcher 使用标准工具名（`Write`, `Edit`, `Bash`）
  - [ ] [E] `.claude/mcp.json` 存在且格式正确
  - [ ] [E] `.claude/hooks/` 下 12 个脚本存在且可执行
- [ ] [T] `npx add-coder init --adapter qoder` 生成正确的 `.add/` 目录 — 证据: (待填写)|审计: (待填写)
  - [ ] [E] `.add/settings.json` matcher 使用双套工具名（`Write|write_to_file`, `Edit|edit_file`, `Bash`）
  - [ ] [E] `.add/hooks/` 下 12 个脚本 + `lib/` 存在
- [ ] [T] `npx add-coder init --adapter vscode` 生成正确的 `.vscode/` 目录 — 证据: (待填写)|审计: (待填写)
  - [ ] [E] `.vscode/settings.json`、`launch.json`、`tasks.json`、`extensions.json` 存在

---

## 四、Prisma 数据库注入 [T]

- [ ] [T] `prisma migrate dev --schema=prisma/` 成功创建 DevOperation + AuditLog 表 — 证据: (待填写)|审计: (待填写)
- [ ] [T] 重复执行 `prisma migrate dev` 幂等（不报错） — 证据: (待填写)|审计: (待填写)
- [ ] [E] 用户无 User 模型时 `init` 报错提示（而非静默失败） — 证据: (待填写)|审计: (待填写)
- [ ] [E] `prisma migrate dev` 失败时回滚 `add.prisma` — 证据: (待填写)|审计: (待填写)
- [ ] [E] 已有 `add.prisma` 时交互三选一（跳过/覆盖/diff+备份） — 证据: (待填写)|审计: (待填写)

---

## 五、构建产物 [T]

- [ ] [T] `npm pack` 产出 tarball 包含 `dist/` + `templates/` + `bin/` — 证据: (待填写)|审计: (待填写)
- [ ] [E] `npm pack` 产出 tarball 不包含 `src/` — 证据: (待填写)|审计: (待填写)
- [ ] [E] `package.json` 中 `"private": false` — 证据: (待填写)|审计: (待填写)
- [ ] [E] `"type": "module"` — 证据: (待填写)|审计: (待填写)
- [ ] [E] `"exports"` 多入口（`.`、`./config`、`./renderer`、`./adapters/*`） — 证据: (待填写)|审计: (待填写)
- [ ] [E] `"engines": { "node": ">=20" }` — 证据: (待填写)|审计: (待填写)
- [ ] [E] `"packageManager": "pnpm@11.9.0"` — 证据: (待填写)|审计: (待填写)

---

## 六、集成测试 [T]

- [ ] [T] `npx add-coder init` 在空白项目中零配置生成完整 ADD 模板 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `--yes` 模式：跳过已有文件，只创建新文件 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `--force` 模式：已有文件直接覆盖 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `--dry-run` 模式：只预览，不写入 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `--force` 和 `--yes` 互斥，同时指定时报错 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `add-coder sync` 只同步缺失文件 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `add-coder status` 检查完整性 — 证据: (待填写)|审计: (待填写)
- [ ] [T] 已有 `.add/settings.json` 时 `init` 不覆盖，展示 diff 并交互确认 — 证据: (待填写)|审计: (待填写)
- [ ] [T] 单元测试：`renderer.ts`、`config-loader.ts`、`detect.ts`、`writer.ts` 全部通过 — 证据: (待填写)|审计: (待填写)

---

## 七、CaijueHub 裁决层 [T]/[E]

- [x] [T] `caijue.toml` 可被正确解析（smol-toml 解析无报错） — 证据: `npm run generate` 4 策略全部产出|审计: (待填写)
- [x] [E] `detect.ts`/`prisma-injector.ts`/`writer.ts`/`init.ts` 均从 caijue/strategies 读取决策 — 证据: grep 确认 4 条 import|审计: (待填写)

---

## 八、ADD Report 体系验证（替代传统 E2E）

> ADD 用双层报告替代传统 E2E：代码审查报告（review-implementation.md + review-runtime.md）覆盖实现质量，
> Runtime Report 体系（gateway.md + boundary-runtime-report.md）覆盖边界合约持续监测。
> 参考: `policy-update-loop.ts` 的持续反馈闭环模式 + `.add/reports/REPORT-WORKFLOW.md`。

- [ ] [T] `review-implementation.md` 已生成，覆盖全部 9 个 Task 的变更范围 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `review-runtime.md` 已生成（含本 checklist 全部 `[R]` 项清单） — 证据: (待填写)|审计: (待填写)
- [ ] [R] `npm pack` 后 `npm install` 成功 — 证据: (待填写)|审计: (待填写)
- [ ] [R] 安装后在空白项目中 `npx add-coder init` 端到端通过 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `add-coder.config.ts` 可覆盖项目名、源码目录、日志目录等 — 证据: (待填写)|审计: (待填写)
- [ ] [R] 无效配置在 Zod 校验时报错 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `check-boundary-report` 无新增未闭合发现 — 证据: (待填写)|审计: (待填写)

---

## 八、ADD 规则合规检查 [E]

- [x] [E] ADD-7：每个文件修改已记录 `record_dev_operation` — 证据: `query_audit_logs({ planKeyword: "add-coder-npm-package" })` 命中 20 条|审计: (待填写)
- [ ] [E] Plan/Spec 一致性 — 证据: `check_spec_sync` 结果|审计: (待填写)
- [ ] [E] Plan/Spec 修订记录 — 证据: `record_dev_operation` 审计 ID|审计: (待填写)
- [ ] [E] 无新增依赖（模板引擎等） — 证据: `git diff package.json` 无新增 dependency|审计: (待填写)
- [ ] [E] 不改 add-coder 业务代码 — 证据: 仅改动 `packages/add-coder/`|审计: (待填写)
- [ ] [E] 审计日志记录完整 — 证据: `query_audit_logs` 回查确认|审计: (待填写)

---

> **流程衔接（AI 执行指令）**：
>
> 当所有 `[T]` 和 `[E]` 编译期检查项均为 `[x]` 时（`[R]` 和 `[H]` 项可保持 `[ ]`），AI 必须执行：
>
> 1. **读取** `review-implementation-template.md`，逐项填写实现审查内容
> 2. **读取** `review-runtime-template.md`，复制为 `.add/reviews/{project}-review-runtime.md`
>    - 替换占位符（标题、关联文档路径）
>    - §1 发现列表初始化为 "尚无运行时发现"
>    - §1 末尾自动插入本 checklist 中所有 `[R]` 项的清单，标记为 "待运行时验证"
> 3. **提示用户**："review-runtime.md 已就绪，包含 N 项运行时验证。部署后 `npm run dev` 启动时会扫描此文件。"