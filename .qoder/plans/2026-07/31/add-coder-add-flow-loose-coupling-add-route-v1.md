# add-coder-add-flow-loose-coupling-add-route-v1

> ADD 执行路线图

## Plan 绑定

- **Plan**: `add-coder-add-flow-loose-coupling-plan-v1`
- **Spec**: `specs/add-coder-add-flow-loose-coupling/spec.md`
- **Tasks**: `specs/add-coder-add-flow-loose-coupling/tasks.md`
- **Checklist**: `specs/add-coder-add-flow-loose-coupling/checklist.md`

---

## Step 0: Plan + Specs 生成

- [x] Plan 已生成（标准版模板）
- [x] Specs 三元组（spec.md + tasks.md + checklist.md）已生成
- [x] PlanRecord 已同步（plan_track 已调用）

### §0.8 DPS 闸门
- [x] check_dps({ planKeyword: "add-coder-add-flow-loose-coupling" }) ≥ 80 (DPS=84 🟢)

---

## Step 1: 功能分析

无需新增 Phase 枚举（纯流程/hook 优化，不涉及 Agent 审计链路）

- [x] 无需 AgentAuditPhase 扩展

---

## Step 2: 审计基础设施

- [x] 无需 agentAudit() 通道

---

## Step 3: 业务逻辑实现

### Task Dependencies

| Task | 依赖 | 文件 |
|------|------|------|
| Task 1.1 | 无 | `hooks/post-tool-use.sh` |
| Task 1.2 | 无 | `hooks/pre-tool-use.sh` |
| Task 1.3 | Task 1.1 | `hooks/post-tool-use.sh` |
| Task 1.4 | Task 1.3 | `hooks/post-tool-use.sh` |
| Task 1.5 | 无 | `agents/add-flow-guardian.md` |
| Task 1.6 | 无 | `hooks/post-tool-use.sh` |
| Task 1.7 | 无 | `tools/gateway/check_spec_sync.ts` |

### Task 1.1: HITL DPS 自动化
- [x] post-tool-use 解析 check_dps 返回值，≥80 建哨兵

### Task 1.2: 模板格式前置注入
- [x] pre-tool-use 对 plans/ 写入注入模板类型提示

### Task 1.3: plan_track 自动触发
- [x] post-tool-use 对 specs/add-route 写入提醒 plan_track

### Task 1.4: devlog 自动提醒
- [x] post-tool-use 检测 Step 8 全 [x] 后提醒

### Task 1.5: Guardian Phase 0.1 用 plan_status
- [x] 四级降级，plan_status MCP 排第 0

### Task 1.6: schema.json 自动 regen
- [x] post-tool-use 检测模板改后提醒更新 schema

### Task 1.7: check_spec_sync 精简
- [x] 去 tasks/checklist 扫描，保留 git diff↔add-route

---

## Step 8: 收敛

- [x] 全部 checkbox 勾选
- [x] 双版本 hook（core + Qoder adapter）均已适配
- [x] npm run sync 后验证
