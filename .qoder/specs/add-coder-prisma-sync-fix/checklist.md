# Checklist

> 对应 Plan: `add-coder-prisma-sync-fix-plan-v1` | Spec: `spec.md` | Tasks: `tasks.md`

## 一、编译与 Lint 门禁

- [x] `npx tsc --noEmit` 通过
- [x] `npx eslint src/` 通过（add-coder lint 脚本）
- [x] `npx vitest run tests/prisma-sync.test.ts` 全绿
- [x] `npm run build`（tsup）成功

## ADD 规则合规检查

- [x] Plan/Spec/Tasks/Checklist 四件套齐全且同步（Review P0-1/P1-2/P1-3 已回流）
- [x] HITL 已 tongyi（round 1，6 维度）
- [x] 审计记录：实施完成后按 ADD-7 审计策略表记录（COMPONENT_FIXED ×3 / TEST_CREATED / BUILD_REBUILT）
- [x] Handoff 生成（`add-coder-prisma-sync-fix-handoff-v1.md`）
- [x] devlog 写入（Step 8 验收后）

## 跨项目联调检查（farm-agent 回归）

### 格式契约

- [x] `add-coder sync --adapter qoder --patch` 在 farm-agent 可正常执行（注入修复后无"已补充 0 个字段"类静默失败）

### 框架版本

- [x] add-coder dist 与 farm-agent `node_modules/add-coder` 链接一致（走 dist/index.js）

### 数据模型

- [x] 无 Prisma schema 变更（本次不涉及消费方数据模型；farm-agent 现场 schema 已由手工迁移对齐）

### 环境变量

- [x] 无新增环境变量

### API 选择

- [x] 无 API 变更（CLI 内部修复）

### E2E curl

- [x] 不适用（CLI 工具，无 HTTP 端点）；以 CLI 现场回归替代（tasks.md Task 1.6）
