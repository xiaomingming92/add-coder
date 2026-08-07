# Tasks: add-coder-windows-stability-v1

> 对应 Plan: `.qoder/plans/2026-08/07/add-coder-windows-stability-plan-v1.md` §四

---

## 轮次依赖（复制自 Plan §四）

```
轮次 1: 路径规范化 + hash 全量基线（修复 P0-2、P0-3、P1-4）
  ├── Task 1.1: 新增 src/lib/path-normalize.ts + 单测
  ├── Task 1.2: sync.ts isUserData 规范化（normalize 优先，toml/transcribe 零改动）[回流: Review P0 #1]
  ├── Task 1.3: sync.ts hash 全量基线保存 + loadHashFile key normalize 兼容
  └── Task 1.4: stack.ts 筛选规范化 + L168-L171 写后断言 [回流: Review P2 #7]
        │
        ▼
轮次 2: runCommand 封装 + 退出码治理（修复 P0-1、补充-6）[回流: Review 跨端选型 / P1 #3 / P2 #8 #9]
  ├── Task 2.0: 新增 src/lib/run-command.ts（win32 .cmd / status!==0 含 null / stderr / commandExists）+ 单测
  ├── Task 2.1: prisma.strategy.ts 迁移 runCommand（npm exec 语义 + L64 fallback 显式失败 + L176 generate 退出码 + L41 which→commandExists）
  │     │  （产出: 子进程失败可检测 + Client 生成失败可检测）
  │     ▼
  ├── Task 2.2: prisma.strategy.ts postInitSetup 统一注入 generator output（成功+失败路径全覆盖）[回流: Review P0 #2]
  │     │  （产出: SQLite Client 输出到 src/generated/prisma，被轮次3消费）
  │     ▼
  ├── Task 2.3: init.ts 迁移 runCommand（L479 peer 安装退出码）+ 失败传播非零退出码
  ├── Task 2.4: status.ts 缺失 exit(1)
  └── Task 2.5: 模板层 run-command.ts 新增 + 4 处迁移（check_spec_sync/check_rahs/add-coder-version/fs）
        │
        ▼
轮次 3: SQLite 完整路径 + 文档联动 + Windows CI（修复 P1-5）
  ├── Task 3.1: mcp-server/shared/prisma.ts SQLite adapter 分支
  │     │  （消费 2.2 的 output 路径）
  │     ▼
  ├── Task 3.2: GUIDE.md 更新（init 失败语义 / SQLite 状态 / stack 断言）
  ├── Task 3.3: 新增 docs/跨平台兼容开发规范.md（含 runCommand 单入口强制）
  ├── Task 3.4: DEVELOPMENT.md 关联引用 + sync 机制章节更新
  └── Task 3.5: .github/workflows/test.yml（windows-latest + ubuntu vitest）[回流: Review P1 #5]
```

---

## Plan→Task 映射（对接 Spec 细节）

| Plan Task | 文件 | 验收 | 对应 Spec |
|------|------|------|------|
| 1.1 | `src/lib/path-normalize.ts` | vitest normalize 用例 | Spec §1 |
| 1.2 | `src/cli/commands/sync.ts` | vitest isUserData 反斜杠用例 | Spec §2 |
| 1.3 | `src/cli/commands/sync.ts` | vitest hash 全量基线用例 | Spec §3/§4 |
| 1.4 | `src/cli/commands/stack.ts` | tsc + stack set 手工断言 | Spec §5 |
| 2.0 | `src/lib/run-command.ts` | vitest win32 模拟用例 | Spec §6 |
| 2.1 | `src/caijuehub/strategies/prisma.strategy.ts` | tsc + grep npm exec | Spec §7 |
| 2.2 | `src/caijuehub/strategies/prisma.strategy.ts` | tsc + schema 断言 | Spec §8 |
| 2.3 | `src/cli/commands/init.ts` | 失败路径 dry-run 退出码 | Spec §9 |
| 2.4 | `src/cli/commands/status.ts` | 缺失文件 exit 1 | Spec §10 |
| 2.5 | templates 4 文件 + run-command.ts | 模板 tsc | Spec §12/§6 |
| 3.1 | `templates/core/scripts/mcp-server/shared/prisma.ts` | 模板 tsc + 分支断言 | Spec §11 |
| 3.2 | `GUIDE.md` | 内容 diff 审核 | Spec §14 |
| 3.3 | `docs/跨平台兼容开发规范.md` | 内容审核 | Spec §14 |
| 3.4 | `DEVELOPMENT.md` | 引用存在断言 | Spec §14 |
| 3.5 | `.github/workflows/test.yml` | workflow 语法 + 双平台 | Spec §13 |

---

## Preconditions

- [x] Plan HITL TONGYI（已通过 round 1）
- [x] Review #1-#9 已回流 Plan（已完成，回流 100/100）
- [x] add-route 已生成且与 Plan §4 一致（本文件生成时同步）
- [x] specs 三元组就位（spec.md / tasks.md / checklist.md）
- [x] 数据库可用（add-coder-postgres 容器运行中，5434）

## Forbidden

- 禁止修改 `sync-rules.toml` / `sync.strategy.ts`（normalize 优先方案）
- 禁止引入 execa/shelljs/cross-env 运行时依赖
- 禁止修改 add.prisma 业务模型
- 禁止重写 db-ensure.sh（P2）
- 禁止用 `prisma db push`（数据库操作规范：禁止任何情况下 prisma db push）——SQLite 场景验收以 schema/Client 文件断言 + dry-run 替代

---

## 轮次 1: 路径规范化 + hash 全量基线（修复 P0-2、P0-3、P1-4）

### Task 1.1: 新增 src/lib/path-normalize.ts — 对应 Spec §1

- [x] 1.1.1 实现 `normalizeRelPath(p)`：`p.replaceAll("\\", "/")`，含空串/无变化幂等（审计 cmsiey0ug0005nllz6hvk57up）
- [x] 1.1.2 新增 `tests/windows-stability.test.ts`：normalize 反斜杠→POSIX、幂等、空串（14/14 通过）
- [x] 1.1.3 `record_dev_operation`（MODULE_CREATED）+ tasks.md 勾选

### Task 1.2: sync.ts isUserData 规范化 — 对应 Spec §2 | 依赖 1.1

- [x] 1.2.1 `isUserData(p)` 改为 `SYNC_CONFIG.PATCH_GUARD.some(r => r.test(normalizeRelPath(p)))`（导出供单测）
- [x] 1.2.2 单测：`.codex\specs\a.md` / `.codex\plans\` / `.codex\reviews\` / `.qoder\rules\profiles\` 全部命中；普通模板不命中
- [x] 1.2.3 `record_dev_operation`（COMPONENT_MODIFIED）+ 勾选（并入 1.1 审计）

### Task 1.3: sync.ts hash 全量基线 + key 兼容 — 对应 Spec §3/§4 | 依赖 1.1

- [x] 1.3.1 提取 `mergeFullHash` 纯函数：旧 hash 全量保留 + candidates 磁盘当前内容刷新
- [x] 1.3.2 `loadHashFile` 解析后逐 key `normalizeRelPath`（导出供单测）
- [x] 1.3.3 单测：300→1→空 复现链不再发生；旧反斜杠 key 兼容；用户 [a] 跳过 hash 记录用户版本；用户数据条目保留
- [x] 1.3.4 `record_dev_operation` + 勾选（并入 1.1 审计）

### Task 1.4: stack.ts 规范化 + 断言 — 对应 Spec §5 | 依赖 1.1

- [x] 1.4.1 筛选条件改为 normalize 后 `includes("/rules/profiles/")` / `endsWith("/rules/project_rules.md")`
- [x] 1.4.2 写文件循环后、成功打印前插入断言：双路径 profile 存在 + project_rules.md 引用存在；缺失 → `process.exit(1)`
- [x] 1.4.3 集成验证：`stack set machineserver` 双路径文件存在、4 文件写入、EXIT=0、project_rules L852 引用已更新；`--clear` 已恢复中性
- [x] 1.4.4 `record_dev_operation` + 勾选（并入 1.1 审计）

---

## 轮次 2: runCommand 封装 + 退出码治理（修复 P0-1、补充-6）

### Task 2.0: 新增 src/lib/run-command.ts — 对应 Spec §6

- [x] 2.0.1 实现 `runCommand(cmd, args, opts)`：win32 对 npm/npx/pnpm/git 解析 `.cmd`；ENOENT 抛"命令不可用"；返回 status/stdout/stderr（审计 cmsif7ehw0006nllz2go7ogbr）
- [x] 2.0.2 实现 `commandExists(cmd)`：win32 `where` / POSIX `which`，可注入 platform mock
- [x] 2.0.3 单测（mock spawnSync）：win32 .cmd 解析、POSIX 不追加、非 .cmd 族不追加、ENOENT 抛错、status=null 返回、stderr 带出、input pipe、commandExists 双平台
- [x] 2.0.4 `record_dev_operation`（MODULE_CREATED）+ tasks.md 勾选

### Task 2.1: prisma.strategy.ts 迁移 runCommand — 对应 Spec §7 | 依赖 2.0

- [x] 2.1.1 `runPrismaInit`：npm 场景 `npm exec prisma -- init`；pnpm 维持 dlx
- [x] 2.1.2 L64 fallback 改造：失败显式 `⚠️ prisma init 未完成（退出码）`（不再静默）
- [x] 2.1.3 db push 迁移 runCommand（npm exec / pnpm dlx）；L165 status 判定保持（回归锁定）
- [x] 2.1.4 L176 generate：退出码非零 → 抛错（含 stderr 摘要）
- [x] 2.1.5 L41 `which` → `commandExists("pg_dump")`（init.ts L149 同理）
- [x] 2.1.6 `record_dev_operation` + 勾选（并入 2.0 审计）

### Task 2.2: postInitSetup 统一注入 generator output — 对应 Spec §8 | 依赖 2.1

- [x] 2.2.1 新增 `patchGeneratorOutput(schemaPath)`：generator client 块注入 `output = "../src/generated/prisma"`（幂等）
- [x] 2.2.2 `postInitSetup` 内调用（成功+失败路径统一生效）
- [x] 2.2.3 单测 3 用例：CLI 生成 schema 注入、已有 output 幂等、无 generator 块追加
- [x] 2.2.4 `record_dev_operation` + 勾选（并入 2.0 审计）

### Task 2.3: init.ts 失败传播 + peer 退出码 — 对应 Spec §9 | 依赖 2.0

- [x] 2.3.1 `deployDatabase` 改为返回失败原因（string | null），不再 catch 后仅打印
- [x] 2.3.2 `finalize`：dbFail → "✗ 治理模型未就绪" + `process.exit(1)`；成功路径保持"完成"
- [x] 2.3.3 L479 peer 安装迁移 runCommand，失败输出警告（非阻断）
- [x] 2.3.4 bash 调用（L411/419）迁移 runCommand：Windows 无 bash → 失败检测入 dbFail（P2 边界兑现）
- [x] 2.3.5 `record_dev_operation` + 勾选（并入 2.0 审计）

### Task 2.4: status.ts 缺失 exit(1) — 对应 Spec §10

- [x] 2.4.1 `missing.length > 0` → 输出缺失列表后 `process.exit(1)`
- [x] 2.4.2 验证：缺失场景 exit 1（逻辑审阅 + tsc）
- [x] 2.4.3 `record_dev_operation` + 勾选（并入 2.0 审计）

### Task 2.5: 模板层 run-command + 4 处迁移 — 对应 Spec §12/§6 | 依赖 2.0

- [x] 2.5.1 新建 `templates/core/scripts/mcp-server/shared/run-command.ts`（与 src 版同语义）
- [x] 2.5.2 `check_spec_sync.ts` → runCommand("git", ...)
- [x] 2.5.3 `check_rahs.ts` → runCommand("npx", ["tsc","--noEmit"])
- [x] 2.5.4 `add-coder-version.ts` → runCommand("npm", ["view","add-coder","version"])
- [x] 2.5.5 `fs.ts` → runCommand("bash", [guardScript], { input })，失败显式提示
- [x] 2.5.6 模板目录独立 `tsc --noEmit` 验证（0 error）
- [x] 2.5.7 `record_dev_operation` + 勾选（并入 2.0 审计）

---

## 轮次 3: SQLite 完整路径 + 文档联动 + Windows CI（修复 P1-5）

### Task 3.1: mcp-server/shared/prisma.ts SQLite adapter — 对应 Spec §11 | 依赖 2.2

- [x] 3.1.1 `url.startsWith("file:")` → 加载 `@prisma/adapter-better-sqlite3`（审计 cmsif7ehw0006nllz2go7ogbr）
- [x] 3.1.2 adapter 缺失 → 显式 throw"SQLite 模式需要安装 @prisma/adapter-better-sqlite3"
- [x] 3.1.3 PG 分支保持 try/catch 静默（现有行为）
- [x] 3.1.4 模板 tsc 验证（0 error）+ npm run sync 同步到各 magic 目录
- [x] 3.1.5 `record_dev_operation` + 勾选（并入 2.0 审计）

### Task 3.2: GUIDE.md 更新 — 对应 Spec §14 | 依赖 3.1

- [x] 3.2.1 init 失败语义："✗ 治理模型未就绪" 提示 + 非零退出码说明（v0.3.20+ 标注）
- [x] 3.2.2 SQLite 支持状态：完整链路说明（output → src/generated/prisma → better-sqlite3 adapter）
- [x] 3.2.3 stack set 写后断言说明
- [x] 3.2.4 `record_dev_operation`（DOC_MODIFIED）+ 勾选（并入 2.0 审计）

### Task 3.3: 新增 docs/跨平台兼容开发规范.md — 对应 Spec §14 | 依赖 3.2

- [x] 3.3.1 路径规范化强制（normalizeRelPath 单入口）
- [x] 3.3.2 runCommand 单入口强制（禁止裸 spawnSync）
- [x] 3.3.3 hash 全量基线语义 + key POSIX 化
- [x] 3.3.4 shell 内联 env 禁止（不引入 cross-env 原因记录）
- [x] 3.3.5 Windows .cmd 解析规则
- [x] 3.3.6 P2 项登记（bash 替代、execa/shelljs 评估条件）
- [x] 3.3.7 `record_dev_operation`（DOC_CREATED）+ 勾选（并入 2.0 审计）

### Task 3.4: DEVELOPMENT.md 关联 — 对应 Spec §14 | 依赖 3.3

- [x] 3.4.1 §8.7 关联引用跨平台规范文档
- [x] 3.4.2 §8.6 sync 机制更新（hash 全量基线语义）
- [x] 3.4.3 `record_dev_operation`（DOC_MODIFIED）+ 勾选（并入 2.0 审计）

### Task 3.5: Windows CI job — 对应 Spec §13 | 依赖 1.1/2.0 单测

- [x] 3.5.1 `.github/workflows/test.yml`：matrix os = [ubuntu-latest, windows-latest]，setup-node 24，pnpm install，`pnpm test`
- [x] 3.5.2 YAML 语法校验（python yaml OK）
- [x] 3.5.3 `record_dev_operation`（CI_CREATED）+ 勾选（并入 2.0 审计）

---

## Task Dependencies

- Task 1.2 依赖 Task 1.1（isUserData 规范化消费 normalizeRelPath）
- Task 1.3 依赖 Task 1.1（hash key normalize 消费 normalizeRelPath）
- Task 1.4 依赖 Task 1.1（stack 筛选消费 normalizeRelPath）
- Task 2.1 依赖 Task 2.0（prisma 命令迁移消费 runCommand）
- Task 2.2 依赖 Task 2.1（postInitSetup 注入 output 在命令链路改造后执行）
- Task 2.3 依赖 Task 2.0（peer 安装迁移消费 runCommand）
- Task 2.5 依赖 Task 2.0（模板封装语义取自 src 版）
- Task 3.1 依赖 Task 2.2（SQLite adapter 消费 output 路径）
- Task 3.2 依赖 Task 3.1（GUIDE SQLite 状态基于 adapter 行为）
- Task 3.3 依赖 Task 3.2（规范文档覆盖 GUIDE 变更语义）
- Task 3.4 依赖 Task 3.3（DEVELOPMENT 引用规范文档）
- Task 3.5 依赖 Task 1.1 + 2.0（CI 运行 normalize/hash/runCommand 单测）
- 轮次 2 整体独立于轮次 1（无跨轮文件修改）
- 轮次 3 消费轮次 2 产出（Task 3.1 消费 2.2 的 schema output）

## Verification

- [ ] `npx tsc --noEmit` 通过（根目录 + 模板目录独立编译）
- [ ] `npm run lint` 零 error
- [ ] `npm run test`（vitest）全绿（新增 windows-stability 用例组）
- [ ] Linux 手工回归：init dry-run / sync --patch 无变更 / stack set + show / status
- [ ] CI：test.yml 双平台语法可解析
- [ ] 全部 Task 完成时 `record_dev_operation` 审计齐备（query_audit_logs 回查）

> **生成后**：调用 `plan_track({ planName: "add-coder-windows-stability-plan-v1" })` 将 Tasks 路径同步到 PlanRecord 表。
