# add-coder-addroute-path-persistence-add-route-v1

> ADD 执行路线图

## Plan 绑定

- **Plan**: `add-coder-addroute-path-persistence-plan-v1`
- **Spec**: `specs/add-coder-addroute-path-persistence/spec.md`
- **Tasks**: `specs/add-coder-addroute-path-persistence/tasks.md`
- **Checklist**: `specs/add-coder-addroute-path-persistence/checklist.md`

---

## Step 0: Plan + Specs 生成

- [x] Plan 已生成（标准版模板）
- [x] Specs 三元组（spec.md + tasks.md + checklist.md）已生成

### §0.8 DPS 闸门
- [x] check_dps({ planKeyword: "add-coder-addroute-path-persistence" }) ≥ 85 (DPS=83 🟢)

---

## Step 1: 功能分析

无需新增 Phase 枚举（纯基础设施变更，不涉及 Agent 审计链路）

- [x] 无需 AgentAuditPhase 扩展

---

## Step 2: 审计基础设施

- [x] 无需 agentAudit() 通道（纯数据/Schema 变更）

---

## Step 3: 业务逻辑实现

### Task Dependencies

| Task | 依赖 | 文件 |
|------|------|------|
| Task 1.1 | 无 | `prisma/add.prisma` |
| Task 1.2 | Task 1.1 | `templates/.../plan.ts` |
| Task 1.3 | Task 1.2 | `templates/.../plan.ts` |
| Task 1.4 | Task 1.3 | - |

### Task 1.1: Schema 变更
- [x] `prisma/add.prisma` PlanRecord 加 `addRoutePath String?`（双项目均已加）
- [x] `npx prisma validate` 通过

### Task 1.2: plan_track 扫描
- [x] plan_track 加 add-route 前缀匹配 + upsert 写入
- [x] 匹配失败不阻断

### Task 1.3: plan_status 返回
- [x] plan_status 输出追加 addRoutePath

### Task 1.4: 同步验证
- [x] `npm run sync` → farm-agent
- [x] farm-agent `prisma generate` + `db push`
- [x] farm-agent plan_track + plan_status 验证通过

---

## Step 8: 收敛

- [x] 全部 checkbox 勾选
- [x] sync 后 farm-agent 验证通过
- [x] PlanRecord 含 addRoutePath（add-coder + farm-agent 双项目验证通过）
- [x] 模板更新（add-route/spec/tasks/checklist + 3 schema.json）+ sync
