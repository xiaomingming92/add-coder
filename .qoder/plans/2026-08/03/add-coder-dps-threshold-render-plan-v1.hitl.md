# add-coder-dps-threshold-render-plan-v1 — HITL 提案 (round 1)

> 创建: 2026-08-03T15:26:12.554Z  |  类型: PLAN  |  状态: DRAFT

## HITL 计划总览

请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：

| # | 维度 | 方案内容 | 决策 |
|---|------|----------|:----:|
| 1 | 影响模块 | add-coder 真源：caijuehub TOML（dps-scoring-rules.toml）+ transcribe.ts + renderer.ts + 24 处模板文案（vocabulary/agents/SKILL/协同规范/rules/check_dps/context/hooks lib ×5 adapter）；README/GUIDE 2 处 | 同意/驳回 |
| 2 | 预估文件数 | 修改约 8 个真源文件 + 24 处模板文案占位符化（0 新建/0 删除，历史记录文件不动） | 同意/驳回 |
| 3 | 架构变更 | 无新增模块：复用现有链路（TOML→transcribe→策略→消费），扩展 transcribe 输出阈值变量 + renderer 注入 | 同意/驳回 |
| 4 | 新增依赖 | 无新增依赖（全部基于现有 caijuehub/renderer 机制） | 同意/驳回 |
| 5 | 风险等级 | 低：只改文案层与渲染注入，不碰判定逻辑（判定已 TOML 化）；同步走标准链路（改真源→pnpm run sync→gen-src-hash→用户项目 sync --patch） | 同意/驳回 |
| 6 | 预计轮次 | 1-2 轮：① 运行时动态化+模板占位符 ② README/GUIDE 声明式 + 验证闭环 | 同意/驳回 |
