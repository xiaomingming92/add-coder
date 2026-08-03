# add-coder-dps-threshold-render-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。

## PLAN 元信息

- **Plan 名称**: add-coder-dps-threshold-render-v1
- **启动时间**: 2026-08-03T23:40:00+08:00
- **主导 AI**: Qoder
- **HITL 状态**: 轮次 1 TONGYI（PLAN，recordId: cmsddt6py000lswwr2iqfjc6t）＋ 轮次 2 TONGYI（PLAN_REVIEW，recordId: cmsdq2g9w000pswwrkwrqhc38，2026-08-04 人类拍板修订方向）
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/03/add-coder-dps-threshold-render-add-route-v1.md`（⚠️ 待 Review 通过后补建，原引用为虚假引用）
  - Handoff: `.qoder/plans/2026-08/03/add-coder-dps-threshold-render-handoff-v1.md`（⚠️ 待补建）
  - Review: `.qoder/reviews/add-coder-dps-threshold-render-review-v1.md`（已存在，结论：不可接受→修订后复审）
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| src/caijuehub/dps-scoring-rules.toml | CONFIG | CONFIG_UPDATED | `[thresholds] pass=80/warn=65` | **不变**（renderer 直读，不新增 [display] 段，避免新双真源） | 待实施 |
| src/core/renderer.ts | COMPONENT | COMPONENT_UPDATED | 无阈值占位符替换 | 支持 `dpsPass 占位符`/`dpsWarn 占位符` 占位符注入（直读 TOML [thresholds]，transcribe 不改） | 待实施 |
| templates/core/scripts/mcp-server/tools/gateway/check_dps.ts | COMPONENT | COMPONENT_UPDATED | description 硬编码 "DPS >= 85" | 模板字符串 `CFG.THRESHOLD_PASS 模板串` 动态化 | 待实施 |
| templates/core/**（SKILL×2、vocabulary×3、guardian×4、协同规范×1、context.ts×1、project_rules×1、core hooks lib×2，共 14 处） | TEMPLATE | TEMPLATE_UPDATED | 硬编码 "≥ 85" | 占位符 `dpsPass 占位符` 化 | 待实施 |
| templates/adapters/*/hooks/lib/*.sh（5 adapter ×2 = 10 处） | TEMPLATE | TEMPLATE_UPDATED | 硬编码 "≥ 85" | 占位符 `dpsPass 占位符` 化 | 待实施 |
| README.md / GUIDE.md / docs/caijuehub.md | DOC | DOC_UPDATED | 硬编码 "≥ 85" 共 5 处（README 中英 2 + GUIDE 2 + caijuehub.md 1） | 声明式引用（以 dps-scoring-rules.toml 为准） | 待实施 |
| templates/core/scripts/mcp-server/tools/gateway.backup | TEMPLATE | **豁免** | 模板内备份文件含 "≥ 85" ×1 | 不改不删（历史备份，写入边界声明，独立任务评估移除） | 豁免 |
| templates/core/plans/2026-07/08/add-coder-npm-package-add-route-v1.md | TEMPLATE | **豁免** | 模板内历史示例含 "≥ 85" ×2 | 不改不删（历史归档，写入边界声明，独立任务评估是否移出分发） | 豁免 |

---

## HITL 计划总览（轮次 1 已拍板）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | caijuehub TOML + renderer.ts + 28 处模板文案 + README/GUIDE/caijuehub.md 5 处文档 | ✅ 同意 |
| 预估文件数 | 修改约 4 个真源 + 28 处模板文案占位符化 + 5 处文档声明式（0 新建/0 删除，历史记录与 gateway.backup 豁免） | ✅ 同意 |
| 架构变更 | 无新模块：renderer 直读 TOML [thresholds]（transcribe 不改，砍 [display]） | ✅ 同意 |
| 新增依赖 | 无（基于现有 caijuehub/renderer 机制） | ✅ 同意 |
| 风险等级 | 🟢低：只改文案层与渲染注入；gateway.backup/历史 add-route 豁免边界已定案 | ✅ 同意 |
| 预计轮次 | 1-2 轮：① 运行时动态化 + 模板占位符 ② 文档声明式 + 验证闭环 | ✅ 同意 |
| **Review 轮次**（round 2 PLAN_REVIEW） | 修订方向全采纳：砍 [display]、28 处实测清单、5 处文档、豁免定案、修正引用 | ✅ 同意 |

---

## 一、背景与目标

### 1.1 问题现状

DPS 阈值存在**双真源漂移**：判定逻辑已 TOML 化（`dps-scoring-rules.toml` pass=80 → 策略 `THRESHOLD_PASS: 80` → check_dps 判定），但**文案层仍硬编码 85**——实测 28 处模板 + 5 处文档（README 中英 2、GUIDE 2、docs/caijuehub.md 1）共 33 处过时表述（Review 实测清单）。AI/用户看到的"≥ 85"与实际执行"≥ 80"不一致，导致判断混乱（本次分歧即由文案滞后引发）。

### 1.2 目标

所有 DPS 阈值文案**单一真源化**：阈值只定义在 `dps-scoring-rules.toml`，文案（MCP 描述、模板、文档）全部从该真源派生——改 TOML 即全链更新，永不漂移。

## 二、方案选型

### 2.1 候选方案对比

| 方案 | 覆盖范围 | 改动量 | 效果 | 结论 |
|------|---------|:---:|------|------|
| A: 只改 check_dps.ts description | 仅 MCP 描述 | 1 行 | 描述动态化，模板仍漂移 | 否（不彻底） |
| B: 运行时动态化 + 模板占位符渲染 + 文档声明式 | 全链文案 | ~8 真源 + 24 模板 | 全链单一真源 | ✅ 推荐 |
| C: 全量硬编码改 80 | 全链文案 | 47 处 | 一次性正确，下次改阈值又漂移 | 否（治标不治本） |

### 2.2 选型理由

- 方案 B 复用**现有全部机制**：caijuehub 转录（TOML→策略）、renderer 占位符（placeholder 占位符 替换）、sync 分发（真源→副本）——零新增模块
- **Review P1-1 修正**：砍掉 [display] 展示字段（避免"判定值/展示值"新双真源），renderer **直读** `[thresholds] pass/warn`，文案格式（"≥"）由渲染层拼接，不落数据；transcribe.ts 不动（已输出 THRESHOLD_PASS，无需新增）
- 方案 C 是"再改一次数字"，违反单一真源原则，下轮调阈值（如 85→90）必然再次漂移

## 三、架构设计

### 3.1 数据流转（改后链路）

```
dps-scoring-rules.toml（唯一真源: [thresholds] pass=80/warn=65）
  ├─→ transcribe.ts ──→ dps-scoring.strategy.ts（THRESHOLD_PASS/WARN，代码判定消费）✅ 已有，不改
  └─→ renderer.ts 直读 [thresholds]（新增，P1-1 修正：不新增 [display] 段）
            │
            ▼
      占位符注入 dpsPass 占位符/dpsWarn 占位符
            │
            ▼
  模板文案 dpsPass 占位符（28 处）→ 渲染后 "≥ 80"
            │
            ▼
  sync 分发（templates/ → 各 magic 目录 + 用户项目）

check_dps.ts description: `DPS >= CFG.THRESHOLD_PASS 模板串`（运行时动态，不经渲染）
README/GUIDE/caijuehub.md: "阈值以 dps-scoring-rules.toml 为准（PASS=80/WARN=65）"（声明式）
```

### 3.4 Plan→Spec 实施映射

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|---|---|---|---|
| renderer 直读 TOML thresholds 注入 dpsPass/dpsWarn 占位符（不新增 display 段） | Spec §1 | src/core/renderer.ts | 阈值占位符替换逻辑，TOML 缺失时保留占位符并告警 |
| check_dps description 运行时动态化（CFG.THRESHOLD_PASS 模板串） | Spec §2 | templates/core/scripts/mcp-server/tools/gateway/check_dps.ts | 描述文案动态化，判定分支不动 |
| 28 处模板文案占位符化（core 14 + adapters 10 实测清单） | Spec §3 | templates/core/** 与 templates/adapters/*/hooks/lib/*.sh | 硬编码阈值替换为 dpsPass 占位符 |
| 文档声明式（README 中英 2 + GUIDE 2 + caijuehub.md 1 共 5 处） | Spec §4 | README.md GUIDE.md docs/caijuehub.md | 去硬编码数字，指向 dps-scoring-rules.toml |
| 豁免边界定案（gateway.backup 与模板内历史 add-route 不改不删） | Spec §5 | templates/core/scripts/mcp-server/tools/gateway.backup 等 | 豁免声明写入 add-route 边界 |
| 分发验证链路（pnpm build 前置 + gen-src-hash + 用户项目 sync --patch） | Spec §6 | 用户项目 magic 目录 | 副本经 hash 驱动更新 |

### 3.2 回退路径

```
transcribe 输出异常 → 策略生成失败 → npm run generate 重跑（幂等）
renderer 注入失败 → 占位符残留 → 渲染后 grep dpsPass 占位符 检测 → 修复注入
不满足预期 → git revert（真源改动均在 templates/ 与 src/caijuehub/，单向可回退）
```

### 3.3 轮次规划（依赖图）

```
轮次 1：运行时动态化 + 模板占位符
  ├─ Task 1.1: renderer.ts 支持 dpsPass 占位符/dpsWarn 占位符 占位符（直读 TOML [thresholds]，P1-1）
  ├─ Task 1.2: check_dps.ts description 改 CFG.THRESHOLD_PASS 模板串 动态化
  ├─ Task 1.3: 28 处模板文案占位符化——core 14 处（SKILL×2、vocabulary×3、guardian×4、协同规范×1、context.ts×1、project_rules×1、core hooks lib×2）+ adapters 5×2=10 处（P1-2 实测清单）
  ├─ Task 1.4: 同步验证（pnpm run sync → 全部 magic 目录 .qoder/.claude/.vscode 副本 grep 无 "≥ 85" 残留，P2-2）
  └─ Task 1.5: 豁免边界声明（gateway.backup ×1、模板内历史 add-route ×2 不改不删，写入 add-route 边界）
        ▼
轮次 2：文档声明式 + 验证闭环
  ├─ Task 2.1: README 中英 2 + GUIDE 2 + docs/caijuehub.md 1 共 5 处声明式引用（P1-3）
  ├─ Task 2.2: 分发验证——pnpm build 前置（本地链接走 dist 时）+ gen-src-hash + 用户项目 sync --patch（P2-3）
  ├─ Task 2.3: 最终 grep 全链 "85" 残留归零（豁免清单除外）
  └─ Task 2.4: plan.ts .hitl 过滤缺陷记录（P2-4，独立任务，本轮不动）
```

## 四、Task 验收标准

| Task | 内容 | 验收标准 |
|------|------|---------|
| 1.1 | renderer 支持阈值占位符（直读 [thresholds]） | 渲染产物中 `dpsPass 占位符` → "80"；无 [display] 段 |
| 1.2 | check_dps description 动态化 | 描述含 `CFG.THRESHOLD_PASS 模板串` 模板串 |
| 1.3 | 28 处模板占位符化（core 14 + adapters 10） | templates/ 内无硬编码 "≥ 85"/">= 85"（豁免清单除外） |
| 1.4 | 同步验证（全部 magic 目录） | `pnpm run sync` 后 .qoder/.claude/.vscode 副本 grep "≥ 85" 归零 |
| 1.5 | 豁免边界声明 | add-route 记录 gateway.backup/历史 add-route 豁免（不改不删） |
| 2.1 | README/GUIDE/caijuehub.md 声明式 | 5 处无硬编码阈值数字，指向 TOML 真源 |
| 2.2 | 分发验证 | pnpm build（如需）+ gen-src-hash + 用户项目 sync --patch 后副本正确 |
| 2.3 | 全链归零 | grep "85" 仅剩豁免清单（gateway.backup、历史 add-route、.qoder 历史计划） |
| 2.4 | plan.ts 缺陷记录 | 缺陷已记录至边界（独立任务，本轮不动） |

## 五、风险与对策

| 风险 | 等级 | 对策 |
|------|:---:|------|
| renderer 注入点遗漏（某模板占位符未渲染） | 🟢 | 渲染后 grep `dpsPass 占位符` 残留检测（Task 1.4 验收项） |
| 本地链接分发走 dist（src 改动需先 build） | 🟢 | Task 2.2 明确 pnpm build 前置（P2-3） |
| gateway.backup / 模板内历史 add-route 含 85 | 🟢 | **豁免定案**：不改不删（历史归档），写入 add-route 边界；独立任务评估移除分发（P1-2） |
| plan.ts .hitl 过滤缺陷 | 🟢 | 记录边界，独立任务修复（P2-4），本轮不动代码 |
| 历史记录文件含 85（.qoder/plans/specs 旧文件） | 🟢 | 明确边界：历史归档，不改 |
