# Tasks: add-coder-dps-threshold-render-v1

> 对应 Plan: `.qoder/plans/2026-08/03/add-coder-dps-threshold-render-plan-v1.md` §四

---

## 轮次依赖（复制自 Plan §四）

```
轮次 1：运行时动态化 + 模板占位符
  ├─ Task 1.1: renderer.ts 支持 {{dpsPass}}/{{dpsWarn}} 占位符（直读 TOML [thresholds]，P1-1）
  ├─ Task 1.2: check_dps.ts description 改 ${CFG.THRESHOLD_PASS} 动态化
  ├─ Task 1.3: 28 处模板文案占位符化（core 14 + adapters 10，P1-2 实测清单）
  ├─ Task 1.4: 同步验证（全部 magic 目录 grep 无 "≥ 85" 残留，P2-2）
  └─ Task 1.5: 豁免边界声明（gateway.backup ×1、历史 add-route ×2）
        ▼
轮次 2：文档声明式 + 验证闭环
  ├─ Task 2.1: README 中英 2 + GUIDE 2 + docs/caijuehub.md 1 共 5 处声明式（P1-3）
  ├─ Task 2.2: 分发验证（pnpm build 前置 + gen-src-hash + 用户项目 sync --patch，P2-3）
  ├─ Task 2.3: 最终 grep 全链 "85" 归零（豁免清单除外）
  └─ Task 2.4: plan.ts .hitl 过滤缺陷记录（P2-4，独立任务）
```

---

## Plan→Task 映射（对接 Spec 细节）

| Plan Task | 文件 | 验收 | 对应 Spec |
|------|------|------|------|
| 1.1 | `src/core/renderer.ts` | 渲染产物 dpsPass 占位符 → "80"；无 [display] 段 | Spec §1 |
| 1.2 | `templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` | description 含 CFG.THRESHOLD_PASS 模板串 | Spec §2 |
| 1.3 | 28 处模板（core 14 + adapters 10） | templates/ 无硬编码 "≥ 85"（豁免除外） | Spec §3 |
| 1.4 | 全部 magic 目录副本 | `pnpm run sync` 后 grep "≥ 85" 归零 | Spec §6 |
| 1.5 | add-route 边界 | 豁免清单已记录 | Spec §5 |
| 2.1 | README/GUIDE/caijuehub.md | 5 处声明式，无硬编码数字 | Spec §4 |
| 2.2 | 用户项目分发 | build + hash + sync --patch 后副本正确 | Spec §6 |
| 2.3 | 全链 | grep "85" 仅剩豁免清单 | Spec §3/§5 |
| 2.4 | plan.ts 缺陷 | 记录边界（独立任务） | — |

---

## Task 块（check_dps 解析用）

- [ ] Task 1.1: renderer.ts 支持 dpsPass/dpsWarn 占位符注入（直读 TOML thresholds 段，P1-1）
- [ ] Task 1.2: check_dps.ts description 改为 CFG.THRESHOLD_PASS 模板串动态化
- [ ] Task 1.3: 28 处模板文案占位符化（core 14 处 + adapters 10 处，P1-2 实测清单）
- [ ] Task 1.4: 同步验证——pnpm run sync 后全部 magic 目录 grep 无 85 残留（P2-2）
- [ ] Task 1.5: 豁免边界声明——gateway.backup 与模板内历史 add-route 不改不删（P1-2 定案）
- [ ] Task 2.1: 文档声明式——README 中英 2 处 + GUIDE 2 处 + docs/caijuehub.md 1 处（P1-3）
- [ ] Task 2.2: 分发验证——pnpm build 前置 + gen-src-hash + 用户项目 sync --patch（P2-3）
- [ ] Task 2.3: 最终 grep 全链 85 归零（豁免清单除外）
- [ ] Task 2.4: plan.ts hitl 过滤缺陷记录边界（P2-4，独立任务）
