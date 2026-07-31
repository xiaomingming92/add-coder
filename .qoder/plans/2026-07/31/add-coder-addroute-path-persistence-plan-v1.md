# add-coder-addroute-path-persistence-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"。Spec 定义具体实施细节。

## PLAN 元信息

- **Plan 名称**: add-coder-addroute-path-persistence-v1
- **启动时间**: 2026-07-31T16:30:00+08:00
- **主导 AI**: Qoder CN
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/31/add-coder-addroute-path-persistence-add-route-v1.md`
  - Handoff: 融合于 Plan §七
  - Review: `.qoder/reviews/add-coder-addroute-path-persistence-review-v1.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | 状态 |
|-----|-----------|--------|------|
| prisma/add.prisma | SCHEMA | SCHEMA_MODIFIED | 待实施 |
| templates/core/scripts/mcp-server/tools/plan.ts | COMPONENT | COMPONENT_MODIFIED | 待实施 |

---

## HITL 计划总览（一次性提交人类审核）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | Prisma Schema + MCP plan_track/plan_status 工具 | 同意/调整 |
| 预估文件数 | 4 个文件（2 修改 + 2 sync） | 同意/调整 |
| 架构变更 | 无 | 同意/调整 |
| 新增依赖 | 无 | 同意/调整 |
| 风险等级 | 🟢低（nullable 字段 + 纯增量扫描逻辑） | 同意/调整 |
| 预计轮次 | 1 轮 | 同意/调整 |

---

## 一、背景与目标

### 1.1 问题现状

- **Plan 已落库，add-route 断裂**：PlanRecord 表含 planPath / specPath / tasksPath / checklistPath，但无 addRoutePath。plan_track 只扫描 `-plan-v*.md`，不处理 add-route。
- **Guardian 降级代价大**：Guardian Phase 0.1 需 index.md → Plan 文件 → search_file 三级降级才能定位 add-route，每次门禁检查都多一次文件搜索。
- **skills/rules/MCP 工具数据断裂**：add-route 作为 ADD 治理核心文档，却不在数据库中，导致自动化工具无法高效关联。

### 1.2 目标

1. PlanRecord 新增 `addRoutePath String?` 字段
2. plan_track 扫描 plans/ 时同步匹配 add-route 文件并落库
3. plan_status 返回 addRoutePath，供 Guardian 等工具直接查询
4. 同步 add-coder 模板 → farm-agent 端生效

---

## 二、方案选型

唯一方案，无需对比：

| 方案 | 描述 | 结论 |
|------|------|------|
| A: PlanRecord 加字段 | 在现有表上追加 nullable 字段，plan_track 扫描时写入 | ✅ 选用 |

不新建 AddRouteRecord 表的原因：add-route 是 Plan 的附属产物，1:1 关系，无需独立表。

---

## 三、架构设计

### 3.1 数据流转

```
plan_track 被调用
    │
    ├─ readdirRecursive("plans/") → 扫描所有文件
    │      │
    │      ├─ 匹配 `-plan-v*.md` → 提取 planName + keyword
    │      ├─ 匹配 `*add-route*.md` → 按 plan 前缀关联 【新增】
    │      │
    │      ▼
    ├─ upsert PlanRecord
    │      planPath, specPath, tasksPath, checklistPath, addRoutePath ← 新增
    │      totalTasks, doneTasks, checklistT/Done/R
    │
    ▼
plan_status / Guardian 查询 PlanRecord.addRoutePath → 直接定位
```

### 3.3 数据模型变更

```prisma
model PlanRecord {
  addRoutePath   String?   // 新增：add-route 文件绝对路径，nullable
}
```

### 3.4 Plan→Spec 实施映射

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| addRoutePath 字段 | Spec §1 Schema 加字段 | `prisma/add.prisma` | `addRoutePath String?` |
| plan_track 扫描 add-route | Spec §2 扫描逻辑 | `templates/.../plan.ts` | 按 plan 前缀匹配，upsert 写入 |
| plan_status 返回 | Spec §3 查询返回 | `templates/.../plan.ts` | 返回 addRoutePath |
| sync 到 farm-agent | Spec §4 同步验证 | - | `npm run sync` + `prisma generate` |

---

## 四、实施 Task 概要

> 详细子任务见 `specs/add-coder-addroute-path-persistence/tasks.md`

```
轮次 1: 补齐 addRoutePath 落库
  ├── Task 1.1: prisma/add.prisma 加 addRoutePath String?
  └── Task 1.2: plan_track 加 add-route 扫描，upsert 写入
        │
        ▼
  ├── Task 1.3: plan_status 返回 addRoutePath
        │
        ▼
  └── Task 1.4: npm run sync → farm-agent，prisma generate 验证
```

---

## 五、验收标准

- [ ] `npx prisma generate` 无报错，PlanRecord 类型含 addRoutePath
- [ ] plan_track 扫描后 PlanRecord.addRoutePath 非空（有 add-route 的 plan）
- [ ] plan_status 返回 addRoutePath
- [ ] 现有 plan_track / plan_status 行为不受影响（nullable 字段 + 扫描失败不阻断）
- [ ] farm-agent sync 后 Guardian 可通过 PlanRecord 定位 add-route

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-07/31/add-coder-addroute-path-persistence-add-route-v1.md` |
| Handoff | 融合于 Plan §七 |
| Review | `.qoder/reviews/add-coder-addroute-path-persistence-review-v1.md` |
| Spec | `.qoder/specs/add-coder-addroute-path-persistence/spec.md` |
| Tasks | `.qoder/specs/add-coder-addroute-path-persistence/tasks.md` |
| Checklist | `.qoder/specs/add-coder-addroute-path-persistence/checklist.md` |

---

## 七、Handoff（交接备注）

### 7.1 交接前
- PlanRecord 无 addRoutePath，plan_track 只扫 `-plan-v*.md`

### 7.2 交接后
- PlanRecord 含 addRoutePath（双项目均已迁移 + prisma generate + db push）
- plan_track 同步扫描 add-route（前缀匹配，缺失不阻断）
- plan_status 返回 addRoutePath
- 5 个模板 + 3 个 schema.json 均含 plan_track 落库步骤
- Guardian 已简化（search_file 替代 Glob，去 Bash，索引优先查找）
- Orchestrator 已删除
- Hook 5 adapter 能力对齐（post-tool-use DPS哨兵+plan_track+devlog+schema、pre-tool-use 模板注入+Write适配）

### 7.3 实际偏离
- 额外修复：Guardian 工具兼容性（Glob→search_file）+ 性能优化（去 Bash）
- 额外修复：删除无用的 Orchestrator subagent
- 额外修复：模板 schema.json 完全重写对齐实际结构

### 7.4 回滚
```sql
ALTER TABLE "PlanRecord" DROP COLUMN "addRoutePath";
```
```bash
git checkout -- prisma/add.prisma templates/core/scripts/mcp-server/tools/plan.ts
```
