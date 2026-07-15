# Reports 总览

> 自动生成: 2026-07-01 11:41:22 | 共 6 份 Report | 下次更新: 每天 2:10 AM
>
> 扫描范围: `.add/reports/`（Plan Review 在 `.add/reviews/`，由 Plan 管线管理）

---

## 快速导航

| 类型 | 说明 | 入口 |
|------|------|------|
| combined-report | 综合代码审查报告 | [code-review-combined-report.md](./code-review-combined-report.md) |
| fix-verify | 修复验证对照报告 | [code-review-fix-verification-report.md](./code-review-fix-verification-report.md) |
| suggestions | 审查建议（历史） | [code-review-suggestions.md](./code-review-suggestions.md) |
| runtime-report | 运行时报告（按子系统） | [add-coder-runtime-report/](./add-coder-runtime-report/) |
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
| 2026-07-01 | `issue-draft` | [runtime-issue-20260622-01.md](./runtime-issue-20260622-01.md) | RUNTIME-20260622-01 |
| 2026-07-01 | `issue-draft` | [runtime-issue-20260624-01.md](./runtime-issue-20260624-01.md) | RUNTIME-20260624-01 |
| 2026-07-01 | `runtime-gateway` | [add-coder-runtime-report/gateway.md](./add-coder-runtime-report/gateway.md) | add-coder 运行时报告 — gateway |
| 2026-06-29 | `combined-report` | [code-review-combined-report.md](./code-review-combined-report.md) | add-coder 项目代码审查综合报告 |
| 2026-06-30 | `suggestions` | [code-review-suggestions.md](./code-review-suggestions.md) | add-coder 项目代码审查建议 |
| 2026-06-30（第十一次验证，修正 #20a） | `fix-verify` | [code-review-fix-verification-report.md](./code-review-fix-verification-report.md) | add-coder Code Review 修复验证对照报告 |

---

## 运行时报告（按子系统分类）

> `add-coder-runtime-report/{subsystem}.md`，每份报告对应一个子系统。
> 由各子系统自动追加，去重后每条 Finding 对应一条记录。

| 日期 | 子系统 | 文件 | 标题 |
|------|--------|------|------|
| 2026-07-01 | `gateway` | [add-coder-runtime-report/gateway.md](./add-coder-runtime-report/gateway.md) | add-coder 运行时报告 — gateway |

---

*索引由 `scripts/gen-report-index.sh` 自动生成，勿手动编辑*
*最后更新: 2026-07-01 11:41:22*
