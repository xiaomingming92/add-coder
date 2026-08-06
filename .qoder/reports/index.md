# Reports 总览

> 自动生成: 2026-08-06 10:13:55 | 共 6 份 Report | 下次更新: 每天 2:10 AM
>
> 扫描范围: `.qoder/reports/`（Plan Review 在 `.qoder/reviews/`，由 Plan 管线管理）

---

## 快速导航

| 类型 | 说明 | 入口 |
|------|------|------|
| combined-report | 综合代码审查报告 | [code-review-combined-report.md](./code-review-combined-report.md) |
| fix-verify | 修复验证对照报告 | [code-review-fix-verification-report.md](./code-review-fix-verification-report.md) |
| suggestions | 审查建议（历史） | [code-review-suggestions.md](./code-review-suggestions.md) |
| runtime-report | 运行时报告（按子系统） | [runtime-report/](./runtime-report/) |
| boundary | Runtime Report ↔ 静态 Report 边界 | [boundary-runtime-report.md](./boundary-runtime-report.md) |
| workflow | Report 工作流 | [REPORT-WORKFLOW.md](./REPORT-WORKFLOW.md) |

---

## 修复概览

| 状态 | 数量 |
|------|:----:|
| ✅ 已修复 | 34 |
| ⚠️ 部分修复 | 7 |
| ❌ 仍存在 | 34 |

---

## Report 文件

| 日期 | 类型 | 文件 | 标题 |
|------|------|------|------|
| 2026-08-06 | `report` | [prisma-sync-defects-report.md](./prisma-sync-defects-report.md) | add-coder 代码审查报告 — Prisma Schema 同步器（sync --patch）缺陷 |
| 2026-06-29 | `combined-report` | [code-review-combined-report.md](./code-review-combined-report.md) | add-coder 项目代码审查综合报告 |
| 2026-06-30（第十一次验证，修正 #20a） | `fix-verify` | [code-review-fix-verification-report.md](./code-review-fix-verification-report.md) | add-coder Code Review 修复验证对照报告 |
| 2026-08-05 | `runtime-gateway` | [runtime-report/gateway.md](./runtime-report/gateway.md) | add-coder 运行时报告 — gateway |
| 2026-08-05 | `suggestions` | [code-review-suggestions.md](./code-review-suggestions.md) | add-coder 项目代码审查建议 |
| 2026-07-17 | `report` | [issue-6-tool-call-throttling-report.md](./issue-6-tool-call-throttling-report.md) | add-coder 代码审查报告 — GitHub Issue #6 工具调用并发节流 |

---

## 运行时报告（按子系统分类）

> `runtime-report/{subsystem}.md`，每份报告对应一个子系统。
> 由各子系统自动追加，去重后每条 Finding 对应一条记录。

| 日期 | 子系统 | 文件 | 标题 |
|------|--------|------|------|
| 2026-08-05 | `gateway` | [runtime-report/gateway.md](./runtime-report/gateway.md) | add-coder 运行时报告 — gateway |

---

*索引由 `scripts/gen-report-index.sh` 自动生成，勿手动编辑*
*最后更新: 2026-08-06 10:13:55*
