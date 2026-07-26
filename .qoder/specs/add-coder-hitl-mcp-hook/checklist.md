# Checklist: add-coder HITL MCP Hook

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证 — 证据: 命令+结果（如 `tsc=0` / `vitest 18/18`）
> - `[R]` = 运行时验证 — 证据: 部署后确认（如 `curl 200` / `MCP 调用返回`）
> - `[E]` = 静态检查 — 证据: grep/diff 输出
>
> **审计链（证据→devlog→checklist）**:
> - 初验规则: 先找证据（命令+结果）→ 调 `record_dev_operation` 落库 → 将返回的真实 cuid（25位）写入 checklist。**禁止抄写 `cmq...` 占位符**。
> - 复验规则: 先查 checklist 是否已有真实审计 ID → 重新验证证据 → 证据一致则不复写 devlog，不一致则追写新 devlog（新 cuid）

## 一、编译与 Lint 门禁

- [ ] [T] `npx tsc --noEmit` 通过 — 证据: (待填写)|审计: (待填写)
- [ ] [T] `prisma migrate dev` 通过，三表可读写 — 证据: (待填写)|审计: (待填写)

## ADD 规则合规检查

- [ ] [E] ADD-7 开发操作审计 — 证据: 每个 Task 完成时已调 `record_dev_operation` 落库
- [ ] [E] ADD-13 HITL 人机审核 — 证据: pre-tool-use.sh §C 含 `.hitl-tongyi` 检查逻辑
- [ ] [E] ADD-17 临时文件机制 — 证据: hitl-template.md 替代 temporary.md，人工拍板后写正式文件
- [ ] [E] Review 回流完整 — 证据: Review 发现的 9 个问题在 tasks.md 中均有对应修正

## 二、数据模型验收（轮次 1）

- [ ] [T] HitlRecord 含 10 字段 + @unique planName + @relation → PlanRecord — 证据: (待填写)|审计: (待填写)
- [ ] [T] PlanRecord 含 13 字段 + @unique planName — 证据: (待填写)|审计: (待填写)
- [ ] [T] ReviewRecord 不含 @unique planName（1:N 关系）— 证据: (待填写)|审计: (待填写)
- [ ] [T] ReviewRecord.planName → PlanRecord.planName 有 @relation约束 — 证据: (待填写)|审计: (待填写)
- [ ] [E] HitlStatus 枚举仅含 DRAFT / TONGYI / BOHUI，无 SUBMITTED（Review #4 处置）— 证据: `grep 'enum HitlStatus' prisma/add.prisma` 输出

## 三、MCP 工具验收（轮次 2）

- [ ] [R] `create_hitl({ planName, type })` → HitlRecord DRAFT + 提案文件生成 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `update_hitl({ planName, type, status: TONGYI })` → `.hitl-tongyi-{planName}` 生成 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `update_hitl({ planName, type, status: BOHUI, reason })` → 驳回时间 + 原因记录，提案文件保留 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `status_hitl({ planName, type })` → 返回正确状态 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `plan_track({ planName })` → PlanRecord.totalTasks/doneTasks 正确 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `plan_track({ scanAll: true })` → 遍历多 magicDir 全量补录 — 证据: (待填写)|审计: (待填写)
- [ ] [R] `plan_status({ planName })` → 区分「正常运行」和「review 缺失」— 证据: (待填写)|审计: (待填写)
- [ ] [R] `review_track({ planName })` → p0Count/p1Count/backflowRate 正确 — 证据: (待填写)|审计: (待填写)

## 四、Hook 拦截验收（轮次 2）

- [ ] [T] pre-tool-use.sh §C 段存在 — 证据: `grep -c '§C' templates/core/hooks/pre-tool-use.sh` 输出 ≥ 1
- [ ] [R] 无 `.hitl-tongyi-{planName}` 时写入 plans/ → BLOCKED — 证据: (待填写)|审计: (待填写)
- [ ] [R] 有 `.hitl-tongyi-{planName}` 时写入 plans/ → 放行 — 证据: (待填写)|审计: (待填写)
- [ ] [E] 标记文件统一为无 `.md` 后缀格式（Review #6）— 证据: `grep 'hitl-tongyi' templates/core/hooks/pre-tool-use.sh` 不含 `.md`
- [ ] [E] Hook 区分 review 类型（Review #2）：仅 review-template.md 需要 HITL 检测 — 证据: grep 确认 §C 有 review 类型判断分支

## 五、SKILL / Rules / Templates 验收（轮次 3）

- [ ] [E] SKILL.md 含 `create_hitl` + `status_hitl` 关键词 — 证据: `grep -c 'create_hitl' templates/core/skills/add-paradigm/SKILL.md` ≥ 1
- [ ] [E] project_rules.md 含 ADD-13 — 证据: `grep 'ADD-13' templates/core/rules/project_rules.md` 命中
- [ ] [T] hitl-template.schema.json 格式正确 — 证据: `python3 -m json.tool` 通过
- [ ] [E] doc-format-guard.sh 含 hitl-template 识别规则 — 证据: `grep 'hitl-template' templates/core/hooks/doc-format-guard.sh` 命中

## 六、sync 验证（轮次 4）

- [ ] [R] weather_proxy `npx add-coder sync --adapter qoder --patch` 后 HITL 工具可调用 — 证据: (待填写)|审计: (待填写)
- [ ] [R] weather_proxy sync 后 pre-tool-use.sh §C HITL 拦截生效 — 证据: (待填写)|审计: (待填写)
# Checklist: HITL 人机审核架构

## 编译期验证 [T]

- [T] `npx tsc --noEmit` 通过
- [T] `prisma/add.prisma` 含 HitlRecord + PlanRecord + ReviewRecord + 3 enum
- [T] HitlRecord 含 round 字段 + @@unique([planName, round])
- [T] PlanRecord.planName @relation 到 HitlRecord（可选，允许历史补录无审批）
- [T] ReviewRecord.planName @relation 到 PlanRecord（必选）
- [T] ReviewRecord.planName 非 @unique（支持 1:N）
- [T] `src/mcp/hitl-tools.ts` 含 create_hitl / update_hitl / status_hitl
- [T] `src/mcp/plan-tools.ts` 含 plan_track / plan_status / plan_sync
- [T] `src/mcp/review-tools.ts` 含 review_track / review_status / review_sync
- [T] `pre-tool-use.sh` 含 `.hitl-tongyi-{planName}` 哨兵检查逻辑
- [T] `pre-tool-use.sh` 仅对 PLAN_REVIEW 类型 review 做 tongyi 检测
- [T] `add-paradigm/SKILL.md` 含 create_hitl + status_hitl 步骤
- [T] `project_rules.md` 含 ADD-13 HITL 规则
- [T] `hitl-template.md` + `hitl-template.schema.json` 存在
- [T] `doc-format-guard.sh` 含 hitl schema 校验路径
- [T] `tests/hitl.test.ts` 存在
- [T] `prisma migrate dev` 通过
- [T] `record_dev_operation` ROUND_CLOSED 落库（每轮完成后）

## 运行时验证 [R]

- [R] create_hitl → HitlRecord status=DRAFT 写入 DB
- [R] update_hitl(TONGYI) → `.hitl-tongyi-{planName}` 标记文件生成
- [R] update_hitl(BOHUI, reason) → HitlRecord 记录驳回时间 + 原因
- [R] BOHUI 后 round+1 create_hitl → 新记录不修改旧记录
- [R] pre-tool-use hook 无标记时阻断写入
- [R] pre-tool-use hook implementation/runtime review 不受 HITL 影响
- [R] plan_track scanAll → 现有 Plan 三表补录成功
- [R] plan_status → 正确标记 review 缺失
- [R] review_track → p0/p1/backflowRate 落表
- [R] weather_proxy sync --patch → HITL 规则生效
- [R] `.hitl-tongyi-{planName}` 无 .md 后缀
- [R] `.hitl-bohui-{planName}` 无 .md 后缀
