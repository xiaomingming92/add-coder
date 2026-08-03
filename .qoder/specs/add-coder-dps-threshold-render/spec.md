# DPS 阈值文案渲染 Spec

> 对应 Plan: `.qoder/plans/2026-08/03/add-coder-dps-threshold-render-plan-v1.md`
> Review: `.qoder/reviews/add-coder-dps-threshold-render-review-v1.md`（复审通过，P1 归零）

---

## Plan→Spec 映射

| # | Plan 决策 | 文件 | 关键变更 |
|---|------|------|------|
| 1 | renderer 直读 TOML [thresholds]，支持 {{dpsPass}}/{{dpsWarn}} 占位符（P1-1） | `src/core/renderer.ts` | 阈值占位符注入（不新增 [display] 段，transcribe 不动） |
| 2 | check_dps description 运行时动态化 | `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` | description 模板字符串 `${CFG.THRESHOLD_PASS}` |
| 3 | 28 处模板文案占位符化（P1-2 实测清单） | `templates/core/**`（14 处）+ `templates/adapters/*/hooks/lib/*.sh`（10 处） | "≥ 85"/">= 85" → `{{dpsPass}}` |
| 4 | 文档声明式（P1-3） | `README.md`（中英 2）+ `GUIDE.md`（2）+ `docs/caijuehub.md`（1） | 去硬编码数字，指向 dps-scoring-rules.toml |
| 5 | 豁免边界（P1-2） | `gateway.backup` ×1、`templates/core/plans/2026-07/08/add-coder-npm-package-add-route-v1.md` ×2 | 不改不删，写入 add-route 边界 |
| 6 | 分发验证（P2-3） | 用户项目 sync --patch | pnpm build 前置 + gen-src-hash |

---

## 1. renderer 阈值占位符注入

> **Plan 决策**: Task 1.1——renderer 直读 TOML `[thresholds]`（P1-1 修正）
> **文件**: `src/core/renderer.ts`

### 类型/接口定义

```typescript
// render() 扩展可选参数（精确签名在实现时确认，Plan/Spec 边界）
export interface RenderThresholds {
  dpsPass: number; // 来自 src/caijuehub/dps-scoring-rules.toml [thresholds].pass
  dpsWarn: number; // 来自 [thresholds].warn
}
```

### WHEN-THEN

- 当模板内容含 `{{dpsPass}}` → 渲染为 `[thresholds].pass` 的字符串值（如 "80"）
- 当模板内容含 `{{dpsWarn}}` → 渲染为 `[thresholds].warn` 的字符串值（如 "65"）
- 当 TOML 缺失/解析失败 → 占位符保持原样 + 警告日志（不静默注入 0）
- 既有占位符（{{projectName}}/{{projectRoot}}/{{magicDir}}/{{docsDir}}）行为不变

### 数据来源

- 直读 `src/caijuehub/dps-scoring-rules.toml` 的 `[thresholds]` 段（smol-toml 解析，与 caijuehub 同一解析库）
- **不新增** `[display]` 段（P1-1：避免判定值/展示值新双真源）
- **不改** transcribe.ts（已输出 THRESHOLD_PASS 供代码消费，文案层不走转录）

## 2. check_dps description 动态化

> **Plan 决策**: Task 1.2
> **文件**: `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts`

### WHEN-THEN

- description 由硬编码 `"DPS >= 85 可进入 Step 1。"` 改为模板字符串：
  `\`...DPS >= ${CFG.THRESHOLD_PASS} 可进入 Step 1。\``
- CFG 已 import（`DPS_SCORING_CONFIG as CFG`，行 22），运行时取策略值（80）
- 判定逻辑分支不动（dps >= THRESHOLD_PASS → PASS 等）

## 3. 模板文案占位符化（28 处）

> **Plan 决策**: Task 1.3（P1-2 实测清单）
> **文件**: 见替换映射表

### 替换规则

- `DPS ≥ 85` / `DPS >= 85` / `check_dps ≥ 85` / `≥ 85 进入` / `≥ 85 方可` / `直到 ≥ 85` / `≥ 85 通过` → 对应 `{{dpsPass}}` 语义替换（格式保留，"≥" 由渲染层拼接：`≥ {{dpsPass}}`）
- 仅替换 DPS 相关阈值；RAHS ≥ 90 不涉及（本 Plan 范围外）

### 替换映射（28 处）

| 文件 | 处数 |
|------|:---:|
| templates/core/skills/add-paradigm/SKILL.md | 2 |
| templates/core/vocabulary/add-governance-vocabulary.md | 3 |
| templates/core/agents/add-flow-guardian.md | 4 |
| templates/core/templates/01-架构/《ADD开发工作路径与文档协同规范》.md | 1 |
| templates/core/scripts/mcp-server/tools/context.ts | 1 |
| templates/core/rules/project_rules.md | 1 |
| templates/core/hooks/lib/context-inject.sh | 1 |
| templates/core/hooks/lib/common.sh | 1 |
| templates/adapters/{claude,qoder,vscode,codex,trae}/hooks/lib/context-inject.sh | 5 |
| templates/adapters/{claude,qoder,vscode,codex,trae}/hooks/lib/common.sh | 5 |

## 4. 文档声明式（5 处）

> **Plan 决策**: Task 2.1（P1-3）
> **文件**: `README.md`、`GUIDE.md`、`docs/caijuehub.md`

### WHEN-THEN

- README.md 中文（L127）+ 英文（L449）"≥ 85" → "阈值以 dps-scoring-rules.toml 为准（PASS=80/WARN=65）"
- GUIDE.md 2 处（L200/L268）→ 同上声明式
- docs/caijuehub.md L103 "≥85 才放行" → 同上声明式

## 5. 豁免边界

> **Plan 决策**: Task 1.5（P1-2 定案）

- `templates/core/scripts/mcp-server/tools/gateway.backup`（含 "≥ 85" ×1）：**不改不删**（历史备份；独立任务评估移除分发）
- `templates/core/plans/2026-07/08/add-coder-npm-package-add-route-v1.md`（含 "≥ 85" ×2）：**不改不删**（历史归档；独立任务评估是否移出模板分发）
- `.qoder/plans`、`.qoder/specs` 历史记录：不改

## 6. 分发验证

> **Plan 决策**: Task 2.2（P2-3）

### WHEN-THEN

- add-coder 自身：改真源 → `pnpm run sync`（magic 目录对齐）→ 全部 magic 目录 grep "≥ 85" 归零
- 用户项目分发：`pnpm build`（本地链接走 dist 时前置）→ `pnpm exec tsx scripts/gen-src-hash.ts` → 用户项目 `add-coder sync --adapter=qoder --patch` → 副本正确

---
