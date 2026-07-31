# add-coder-add-flow-loose-coupling-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"。

## PLAN 元信息

- **Plan 名称**: add-coder-add-flow-loose-coupling-v1
- **启动时间**: 2026-07-31T17:00:00+08:00
- **主导 AI**: Qoder CN

---

## HITL 计划总览

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | Hooks、Guardian、模板、MCP 工具 | 同意/调整 |
| 预估文件数 | 6-8 个 | 同意/调整 |
| 架构变更 | 无 | 同意/调整 |
| 风险等级 | 🟡中 | 同意/调整 |
| 预计轮次 | 1 轮 | 同意/调整 |

---

## 一、背景与目标

DPS 基础设施成熟后，ADD 强制流程有 7 个摩擦点：

| # | 摩擦点 | 代价 |
|---|--------|------|
| **1** | **HITL 全手动** —— 每次被卡 4 次 | 打断节奏 |
| 2 | 模板格式偏离 —— agent 不选正确模板 | 返工 |
| 3 | plan_track 手动 —— specs/add-route 生成后忘落库 | 数据断裂 |
| 4 | devlog 遗漏 —— Step 8 忘写 | 审计不全 |
| 5 | Guardian 文件搜索 —— PlanRecord 已有但不用 | 无效 I/O |
| 6 | schema.json 脱节 —— 3 个全错 | 校验失效 |
| 7 | check_spec_sync 冗余 —— 5 层交叉 | 重复计算 |

---

## 二、方案选型 — 7 项逐一

### #1 HITL 哨兵自动化 ★
```
DPS ≥ 80 → post-tool-use 自动 touch .tongyi-{plan} → 进入 Step 1
DPS < 80 → stderr 提示 Review → 人工修复后手动建哨兵
```
HITL 不取消（Plan 方向仍需用户确认）。自动化的是 DPS 通过后的哨兵创建。

### #2 模板格式前置注入
`pre-tool-use.sh` 检测 Write `.qoder/plans/` 时，stderr 注入应选模板类型。

### #3 plan_track 自动触发
`post-tool-use.sh` 检测 `specs/` 或 `*add-route*` 写入后调 `plan_track` 落库。

### #4 devlog 自动提醒
`post-tool-use.sh` 检测 add-route Step 8 全 `[x]` 后 stderr 注入提醒。

### #5 Guardian Phase 0.1 用 plan_status
优先 MCP 查询 PlanRecord，失败才降级文件搜索。

### #6 schema.json 自动 regen
`post-tool-use.sh` 检测 `templates/*.md` 改后遍历对应 `.schema.json` 自动更新。

### #7 check_spec_sync 精简
保留 git diff↔add-route 一致性，去掉 plan_track 已覆盖的扫描。

---

## 三、Plan→Spec 实施映射

> 从设计决策到精确实施的一对一映射。每行对应 Spec 中的一节。

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| #1 HITL 自动化 | Spec §1 哨兵自动建 | `hooks/post-tool-use.sh` | DPS≥80 → touch .tongyi |
| #2 模板注入 | Spec §2 前置引导 | `hooks/pre-tool-use.sh` |
| #3 plan_track 自动 | Spec §3 后置同步 | `hooks/post-tool-use.sh` |
| #4 devlog 提醒 | Spec §4 收敛检测 | `hooks/post-tool-use.sh` |
| #5 Guardian MCP | Spec §5 查询优化 | `agents/add-flow-guardian.md` |
| #6 schema regen | Spec §6 模板同步 | `hooks/post-tool-use.sh` |
| #7 check_spec_sync | Spec §7 工具精简 | `tools/gateway/check_spec_sync.ts` | git diff↔add-route |

### 3.4 Plan→Spec 实施映射

> 从设计决策到精确实施的一对一映射。每行对应 Spec 中的一节。

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| #1 HITL 自动化 | Spec §1 哨兵自动建 | `hooks/post-tool-use.sh` | DPS≥80 → touch .tongyi |
| #2 模板注入 | Spec §2 前置引导 | `hooks/pre-tool-use.sh` | stderr 注入模板提示 |
| #3 plan_track 自动 | Spec §3 后置同步 | `hooks/post-tool-use.sh` | MCP plan_track |
| #4 devlog 提醒 | Spec §4 收敛检测 | `hooks/post-tool-use.sh` | Step 8 全[x] 提醒 |
| #5 Guardian MCP | Spec §5 查询优化 | `agents/add-flow-guardian.md` | plan_status 优先 |
| #6 schema regen | Spec §6 模板同步 | `hooks/post-tool-use.sh` | 自动更新 .schema.json |
| #7 check_spec_sync | Spec §7 工具精简 | `tools/gateway/check_spec_sync.ts` | git diff↔add-route |

## 四、实施 Task 概要

```
轮次 1: 7 项并行推进
  ├── Task 1.1: HITL DPS 自动化 ★
  ├── Task 1.2: pre-tool-use 模板注入
  ├── Task 1.3: post-tool-use plan_track 自动触发
  ├── Task 1.4: post-tool-use devlog 提醒
  ├── Task 1.5: Guardian Phase 0.1 用 plan_status
  ├── Task 1.6: post-tool-use schema 自动 regen
  └── Task 1.7: check_spec_sync 精简
```

---

## 五、验收标准

- [ ] DPS ≥ 80 → 自动建哨兵；< 80 → 提示 Review
- [ ] plans/ 写入 → 模板类型提示
- [ ] specs/add-route 写入 → plan_track 自动落库
- [ ] Step 8 全 [x] → devlog 提醒
- [ ] Guardian 优先 plan_status 查询
- [ ] 模板改 → schema 自动更新
- [ ] check_spec_sync 精简有效

---

## 六、Handoff

### 交接前
HITL 全手动，plan_track 手动，devlog 遗漏，Guardian 文件 I/O，schema 脱节

### 交接后
DPS≥80 自动放行，specs/add-route 生成自动落库，devlog 自动提醒，Guardian MCP，schema 自动 sync

### 回滚
```bash
git checkout -- .qoder/hooks/ templates/core/agents/ templates/core/tools/
```
