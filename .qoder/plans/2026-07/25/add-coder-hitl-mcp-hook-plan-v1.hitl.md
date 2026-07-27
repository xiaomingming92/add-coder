# add-coder-hitl-mcp-hook — HITL 提案 (round 1)

> 创建: 2026-07-25  |  类型: PLAN  |  状态: TONGYI

## HITL 计划总览

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | 实施主体 | add-coder（prisma 模型 + MCP 工具 + SKILL + rules），weather_proxy 通过 sync 消费 | tongyi |
| 2 | 数据模型 | add.prisma 新增 HitlRecord（审批状态机）+ PlanRecord（计划追踪）+ ReviewRecord（评审记录）+ 3 enum（HitlType/HitlStatus/ReviewType） | tongyi |
| 3 | MCP 工具 | 9 工具：HITL×3（create_hitl / update_hitl / status_hitl）+ Plan×3（plan_track / plan_status / plan_sync）+ Review×3（review_track / review_status / review_sync） | tongyi |
| 4 | 文件命名 | 提案文件按 hitl-template.md 生成 .hitl.md，通过后写 .qoder/hitl/.tongyi-{planName} 哨兵，驳回写 .bohui-{planName}。不再叫 temporary.md | tongyi |
| 5 | 模板 + schema | 新增 hitl-template.md + hitl-template.schema.json（doc-format-guard 校验） | tongyi |
| 6 | 新增依赖 | 无 | tongyi |
| 7 | 预计文件数 | ~12 文件（prisma 1 + MCP 3 + hook 1 + SKILL 1 + rules 1 + templates 2 + index 1 + db-ensure 1 + tests 1） | tongyi |
| 8 | 预计轮次 | 3 轮：Prisma 模型 → MCP 工具+Hook → SKILL/Rules/Templates | tongyi |

## 数据模型概要

```prisma
enum HitlType   { PLAN PLAN_REVIEW }
enum HitlStatus { DRAFT SUBMITTED TONGYI BOHUI }
enum ReviewType { PLAN_REVIEW IMPLEMENTATION RUNTIME }

model HitlRecord  { planName String; round Int; type HitlType; status HitlStatus; ... @@unique([planName, round]) }
model PlanRecord  { planName String @unique; totalTasks Int; doneTasks Int; ... }
model ReviewRecord { planName String; plan PlanRecord @relation(...); p0Count Int; p1Count Int; backflowRate Int; ... }
```

> HitlRecord → PlanRecord 为自然键关联（非 FK），因 @@unique([planName, round]) 使 planName 不唯一。

## SKILL / Rules 调整

| 文件 | 改动 |
|------|------|
| `add-paradigm/SKILL.md` | Plan 流程改为 `create_hitl` → 按 hitl-template.md 生成提案 → tongyi/bohui → 通过后写正式 Plan。增加 `status_hitl` 前置检查 |
| `project_rules.md` | ADD-7 扩展 devlog 双层记录与轮次闭合章节 |
| `pre-tool-use.sh` | §C 新增 plans/reviews 写入拦截，检查 `.qoder/hitl/.tongyi-{planName}` 哨兵不存在 → BLOCKED |
| `doc-format-guard.sh` | 新增 `*hitl*` → hitl-template.md 模板匹配 + schema 校验 |

## 审批结论

| 时间 | 决策 |
|------|:----:|
| 2026-07-25 | tongyi |

> 正式 Plan：add-coder-hitl-mcp-hook-plan-v1.md（3 轮，轮次 3 Templates tongyi，仅剩测试+ROUND_CLOSED）
