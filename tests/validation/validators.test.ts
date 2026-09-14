/*
 * 轮 2 契约测试：专司 validators（Spec §5 覆盖表 + §2 专司边界）
 *
 * 每个专司 1 正 1 反例；另断言：registry 17 类**全部有专司**（无缺口）、
 * 专司不重复 schema 层职责（章节存在性由 schema 层负责）。
 */
import { describe, expect, it } from "vitest"
import { VALIDATOR_REGISTRY } from "../../templates/core/validation/registry.js"
import {
  TYPE_CHECKS,
  addRouteStats,
  checkChecklist,
  checkHandoff,
  checkTasks,
  checklistStats,
  tasksStats,
  uncoveredTypes,
} from "../../templates/core/validation/validators/index.js"

const ctx = (content: string, over: Partial<{ type: string; expectRounds: number }> = {}) => ({
  type: over.type ?? "handoff.single",
  content,
  path: "/tmp/x.md",
  expectRounds: over.expectRounds,
})

describe("覆盖完整性", () => {
  it("registry 中 17 类全部登记了专司（无缺口）", () => {
    expect(uncoveredTypes(VALIDATOR_REGISTRY.map((v) => v.type))).toEqual([])
  })

  it("专司表键数与 registry 类型数一致（无多余登记）", () => {
    expect(Object.keys(TYPE_CHECKS).length).toBe(VALIDATOR_REGISTRY.length)
  })
})

describe("handoff 专司（§8 可执行查询 + §9 勾选态）", () => {
  it("有审计查询 + 后置勾选 → 无 issue", () => {
    const doc = ["> 恢复上下文审计查询", "query_audit_logs({ planKeyword: \"x\" })", "## 后置确认", "- [x] 已确认"].join("\n")
    expect(checkHandoff(ctx(doc))).toEqual([])
  })

  it("缺可执行审计查询 → AUDIT_QUERY_MISSING", () => {
    const doc = "## 后置确认\n- [x] 已确认"
    expect(checkHandoff(ctx(doc)).some((i) => i.code === "AUDIT_QUERY_MISSING")).toBe(true)
  })

  it("后置确认整节留空 → POSTCHECK_EMPTY", () => {
    const doc = "query_audit_logs({})\n## 后置确认\n（无）"
    expect(checkHandoff(ctx(doc)).some((i) => i.code === "POSTCHECK_EMPTY")).toBe(true)
  })

  it("凭据硬编码 → SECRET_HARDCODED", () => {
    const doc = "query_audit_logs({})\nJWT_SECRET = \"supersecretvalue\"\n## 后置确认\n- [x] a"
    expect(checkHandoff(ctx(doc)).some((i) => i.code === "SECRET_HARDCODED")).toBe(true)
  })
})

describe("checklist 专司（[T] 未勾数 + [R] 存在 + 证据占位）", () => {
  it("统计正确：[T] 全勾、[R] 存在、无占位 → 无 issue", () => {
    const doc = "- [x] [T] a\n- [ ] [R] b"
    expect(checklistStats(doc)).toMatchObject({ tTotal: 1, tDone: 1, tOpen: 0, rTotal: 1, evidencePlaceholders: 0 })
    expect(checkChecklist(ctx(doc, { type: "checklist" }))).toEqual([])
  })

  it("证据占位残留 → EVIDENCE_PLACEHOLDER_LEFT", () => {
    const doc = "- [x] [T] a — 证据: (待填写)|审计: (待填写)\n- [ ] [R] b"
    const issues = checkChecklist(ctx(doc, { type: "checklist" }))
    expect(issues.some((i) => i.code === "EVIDENCE_PLACEHOLDER_LEFT")).toBe(true)
  })

  it("无 [T] 项 → CHECKLIST_T_MISSING", () => {
    expect(checkChecklist(ctx("- [ ] [R] b", { type: "checklist" })).some((i) => i.code === "CHECKLIST_T_MISSING")).toBe(true)
  })
})

describe("tasks 专司", () => {
  const good = [
    "## Plan→Task 映射",
    "### Task 1.1: 甲",
    "- [x] 1.1.1 a",
    "### Task 1.2: 乙",
    "- [ ] 1.2.1 b",
  ].join("\n")

  it("Task 标题与映射表齐 → 无 issue；统计 done/total 正确", () => {
    expect(tasksStats(good)).toEqual({ total: 2, done: 1 })
    expect(checkTasks(ctx(good, { type: "tasks" }))).toEqual([])
  })

  it("缺映射表 → PLAN_TASK_MAP_MISSING", () => {
    expect(checkTasks(ctx("### Task 1.1: 甲\n- [x] a", { type: "tasks" })).some((i) => i.code === "PLAN_TASK_MAP_MISSING")).toBe(true)
  })
})

describe("add-route 专司", () => {
  it("产出项与 Task 映射表齐 → 无 issue；统计正确", () => {
    const doc = "## Task 映射表\n- [x] a\n- [ ] b"
    expect(addRouteStats(doc)).toEqual({ total: 2, open: 1, done: 1 })
    expect(uncoveredTypes(["add-route"])).toEqual([])
  })
})

describe("review / hitl / report 专司", () => {
  it("review 缺严重度 → REVIEW_SEVERITY_MISSING", () => {
    const doc = "## 问题清单\n- 甲问题"
    const issues = TYPE_CHECKS["review"](ctx(doc, { type: "review" }))
    expect(issues.some((i) => i.code === "REVIEW_SEVERITY_MISSING")).toBe(true)
  })

  it("review.runtime 有未 Triage 发现 → RUNTIME_TRIAGE_OPEN", () => {
    const doc = "## 发现列表\n- [ ] Triage 结果: 待定\n- 严重度 P1"
    const issues = TYPE_CHECKS["review.runtime"](ctx(doc, { type: "review.runtime" }))
    expect(issues.some((i) => i.code === "RUNTIME_TRIAGE_OPEN")).toBe(true)
  })

  it("hitl 有维度行与状态 → 无 issue", () => {
    const doc = "| # | 维度 | 方案内容 | 决策 |\n|---|---|---|---|\n| 1 | 范围 | x | 同意 |\n> 状态: DRAFT"
    expect(TYPE_CHECKS["hitl"](ctx(doc, { type: "hitl" }))).toEqual([])
  })

  it("report 无结论段 → REPORT_CONCLUSION_MISSING", () => {
    expect(TYPE_CHECKS["report"](ctx("过程描述", { type: "report" })).some((i) => i.code === "REPORT_CONCLUSION_MISSING")).toBe(true)
  })
})
