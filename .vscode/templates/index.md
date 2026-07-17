# ADD 模板索引

> 选模板看选型指南，查 schema 看下方索引表。

## 选型指南

**我要做…** | **用这个模板** | **为什么**
--|--|--
| 写产品需求文档 | `prd-standard-template.md` | 含 Plan 拆分建议 + 裁决层关联 |
| 增量更新 PRD | `prd-incremental-template.md` | 在原 PRD 上追加/修改 |
| 新建开发任务（需要架构设计） | `standard-plan-template.md` | 含方案选型、架构设计、依赖图，适合复杂改动（**默认**）
| 新建开发任务（简单修复） | `simple-plan-template.md` | 内联 Handoff，无需独立 spec 文件（仅小修改/用户主动提）
| 定义功能需求 | `spec-template.md` | Why/What/Impact/Requirements
| 拆分执行任务 | `tasks-template.md` | Task 扁平排列
| 写验收清单 | `checklist-template.md` | [T]/[E]/[H]/[R] 分类
| 生成执行路线图 | `add-route-template.md` | 轻量项目
| 生成执行路线图（重型） | `add-route-template-heavyweight.md` | 后端/多层管线项目
| 写交接文档（单轮） | `handoff-single-round-template.md` | Bug 修复、API 改动
| 写交接文档（多轮） | `handoff-multi-round-template.md` | 管线演进、架构重构
| 方案评审 | `review-template.md` | 问题复现 → 方案对比 → 决策
| 实现评审 | `review-implementation-template.md` | 跨仓库契约、框架兼容性
| 运行时评审 | `review-runtime-template.md` | 发现列表、流程改进
| 写代码审查报告 | `report-template.md` | Issue 总览、分类统计
| 写运行时异常报告 | `runtime-report-template.md` | 发现列表、关联 Issue
| 写修复验证报告 | `fix-verification-template.md` | 逐条对照、修复趋势 |

## 模板→Schema 索引

| 模板 | Schema |
|------|------|
| `prd-standard-template.md` | `prd-standard-template.schema.json` |
| `prd-incremental-template.md` | `prd-incremental-template.schema.json` |
| `standard-plan-template.md` | `standard-plan-template.schema.json` |
| `simple-plan-template.md` | `simple-plan-template.schema.json` |
| `spec-template.md` | `spec-template.schema.json` |
| `tasks-template.md` | `tasks-template.schema.json` |
| `checklist-template.md` | `checklist-template.schema.json` |
| `handoff-single-round-template.md` | `handoff-single-round.schema.json` |
| `handoff-multi-round-template.md` | `handoff-multi-round.schema.json` |
| `add-route-template.md` | `add-route-template.schema.json` |
| `add-route-template-heavyweight.md` | `add-route-template.schema.json` |
| `review-template.md` | `review-template.schema.json` |
| `review-implementation-template.md` | `review-implementation-template.schema.json` |
| `review-runtime-template.md` | `review-runtime-template.schema.json` |
| `report-template.md` | `report-template.schema.json` |
| `runtime-report-template.md` | `runtime-report-template.schema.json` |
| `fix-verification-template.md` | `fix-verification-template.schema.json` |

## 守卫流程

```
doc-format-guard.sh → 读上表匹配 schema → 读 schema.json
  → 缺 required section → exit 2
  → 含未替换占位符 → exit 2
  → 含禁止词 → warning
```

## 标题层级

| 层级 | 标记 |
|:--:|------|
| 1 | `##` |
| 2 | `###` |
| 3 | `####` |
