/*
 * 追踪器口径用例（2026-09-14 修复 tracker 与校验器口径漂移）
 *
 * 背景：同一条清单被两处统计 ——
 *  · 校验层 `templates/core/validation/validators/checklist.ts`（checklistStats）
 *  · 追踪器 `templates/core/scripts/mcp-server/tools/plan.ts`（写入 PlanRecord 的进度）
 * 旧追踪器按**全文出现次数**统计 `[T]`，正文里提到 `[T]`（如"`[T]` 5 项"）也会进分母，
 * 实测把 16/16 报成 17/18。现在追踪器直接复用校验层函数（单一真源），本用例把该口径钉住。
 */
import { describe, expect, it } from "vitest"
import { checklistStats } from "../templates/core/validation/validators/checklist.js"
import {
  derivePlanNameFromReviewFile,
  pickReviewFiles,
} from "../templates/core/scripts/mcp-server/shared/review-files.js"

describe("checklist 计数口径（tracker 复用校验层）", () => {
  const fixture = [
    "# Checklist: demo",
    "",
    "> 说明：`[T]` 编译期 / `[R]` 运行时（正文里提到这些标记不算清单项）",
    "",
    "## 一、门禁",
    "",
    "- [x] [T] `tsc` 零 error — 证据: 退出码 0",
    "- [ ] [T] `eslint` 零 error",
    "- [x] [R] 真机实测通过",
    "",
  ].join("\n")

  it("只统计清单行：正文提到的 [T]/[R] 不进分母", () => {
    const s = checklistStats(fixture)
    expect(s.tTotal).toBe(2)   // 两个 [T] 清单项（不是 3 —— 头部说明里的 `[T]` 不算）
    expect(s.tDone).toBe(1)
    expect(s.rTotal).toBe(1)
  })

  it("全部勾选即满分（不出现 17/18 这类越界分母）", () => {
    const allDone = fixture.replace("- [ ] [T]", "- [x] [T]")
    const s = checklistStats(allDone)
    expect(s.tDone).toBe(s.tTotal)
  })
})

describe("审查文档命名兼容（historical + current）", () => {
  const files = [
    "2026-09/14/add-coder-core-validation-lifecycle-plan-v1-review.md", // 现行：{plan}-plan-vN-review.md
    "2026-09/add-coder-agent-memory-closure-review-v1.md",              // 历史：{planPrefix}-review-v1.md
    "2026-09/14/add-coder-x-review-runtime.md",                          // 运行时纠偏
    "2026-09/14/add-coder-x-review-implementation.md",                    // 实现审查
    "2026-09/notes.md",                                                   // 非审查文档
    "2026-09/index.md",
  ]

  it("pickReviewFiles 同时认两种命名，且排除非审查文档", () => {
    expect(pickReviewFiles(files)).toEqual([
      "2026-09/14/add-coder-core-validation-lifecycle-plan-v1-review.md",
      "2026-09/add-coder-agent-memory-closure-review-v1.md",
      "2026-09/14/add-coder-x-review-runtime.md",
      "2026-09/14/add-coder-x-review-implementation.md",
    ])
  })

  it("derivePlanNameFromReviewFile 两种命名都剥到 plan 前缀", () => {
    expect(derivePlanNameFromReviewFile("2026-09/14/add-coder-core-validation-lifecycle-plan-v1-review.md"))
      .toBe("add-coder-core-validation-lifecycle-plan-v1")
    expect(derivePlanNameFromReviewFile("2026-09/add-coder-agent-memory-closure-review-v1.md"))
      .toBe("add-coder-agent-memory-closure")
    expect(derivePlanNameFromReviewFile("add-coder-x-review-runtime.md")).toBe("add-coder-x")
    expect(derivePlanNameFromReviewFile("add-coder-x-review-implementation.md")).toBe("add-coder-x")
  })
})
