/*
 * 轮 2 契约测试：单元状态由既有制品推导（Spec §2.2 并发协议裁定 + §2.3 只读不复制）
 *
 * 覆盖：三态判定、Step 勾选统计、缺失制品清单、引用表（引用而非复制）、
 *       closed 的合取条件（Step 全闭合 且 有 ROUND_CLOSED）。
 */
import { describe, expect, it } from "vitest"
import {
  countSteps,
  resolveUnitState,
  type UnitStateDeps,
} from "../../../templates/core/scripts/mcp-server/shared/memory/calibration/unit-state.js"

const planKeyword = "demo-plan-v1"
const defaultFiles: Record<string, string> = {
  "demo-plan-v1.md": "# demo plan",
  "demo-plan-v1-add-route-v1.md": [
    "# demo add-route",
    "- [x] Step 0 文档先行",
    "- [x] Step 1 审计定义",
    "- [ ] Step 3 实现",
  ].join("\n"),
  "demo-plan-v1-handoff-v1.md": "# handoff",
  "/repo/.codex/specs/demo/checklist.md": "- [x] [T] tsc 零 error\n- [ ] [R] 运行时验证",
}

function makeDeps(over: Partial<UnitStateDeps> = {}, contents = defaultFiles): UnitStateDeps {
  return {
    projectRoot: "/repo",
    magicDir: ".codex",
    listDir: () => Object.keys(contents),
    // 绝对路径优先命中（specs 下的 checklist），否则按文件名（plans 下扁平/嵌套均可）
    readFile: (p) => contents[p] ?? contents[p.split("/").pop() ?? ""] ?? null,
    exists: () => true,
    findRoundClosed: () => Promise.resolve(null),
    findPlanRecord: () => Promise.resolve({ id: "cm-plan-record", totalTasks: 10, doneTasks: 10 }),
    // handoff 合规校验默认走 core 校验层；单测注入 stub（真实路径由集成验证覆盖）
    validateHandoff: () => ({ ok: true, issues: [] }),
    ...over,
  }
}

describe("countSteps", () => {
  it("只统计产出项行：[ ] 记 open+total，[x] 记 total", () => {
    expect(countSteps("- [x] a\n- [ ] b\n- [ ] c\n普通文本\n### Task")).toEqual({ open: 2, total: 3 })
  })

  it("空内容与无勾选行 → 0/0", () => {
    expect(countSteps("")).toEqual({ open: 0, total: 0 })
    expect(countSteps("- 普通列表项")).toEqual({ open: 0, total: 0 })
  })
})

describe("resolveUnitState 三态判定", () => {
  it("封口四要素齐备即 closed，即便 Step 勾选有缺口（这正是进度与结果的分离）", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({ findRoundClosed: () => Promise.resolve({ id: "cm-rc" }) }),
    )
    expect(unit.state).toBe("closed") // 勾选缺口不影响封闭判定
    expect(unit.documentationLag.openSteps).toBe(1)
    expect(unit.documentationLag.totalSteps).toBe(3)
    expect(unit.documentationLag.lagging).toBe(true) // 但记为文档滞后诊断
  })

  it("封口四要素齐备 → closed（ROUND_CLOSED ∧ handoff ∧ 验收证据 ∧ planStatus）", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps(
        { findRoundClosed: () => Promise.resolve({ id: "cm-rc" }) },
        { ...defaultFiles, "demo-plan-v1-add-route-v1.md": "- [x] Step 0\n- [x] Step 1" },
      ),
    )
    expect(unit.state).toBe("closed")
    expect(unit.evidence).toEqual({ roundClosed: true, handoff: true, acceptance: true, planStatus: true })
    expect(unit.documentationLag.lagging).toBe(false)
  })

  it("Step 全闭合但缺 ROUND_CLOSED → in-flight（合取条件，不容单边成立）", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({}, { ...defaultFiles, "demo-plan-v1-add-route-v1.md": "- [x] Step 0" }),
    )
    expect(unit.state).toBe("in-flight")
    expect(unit.missingArtifacts).toContain("round-closed")
    expect(unit.documentationLag.lagging).toBe(false) // 勾选满了，但缺封口事件 → 仍不算收敛
  })

  it("有 plan 无 add-route → in-flight（规划中）；两者都缺 → unknown", async () => {
    const unit = await resolveUnitState(planKeyword, makeDeps({}, { "demo-plan-v1.md": "# plan" }))
    expect(unit.state).toBe("in-flight")
    expect(unit.missingArtifacts).toContain("add-route")
    const nothing = await resolveUnitState(planKeyword, makeDeps({}, {}))
    expect(nothing.state).toBe("unknown")
  })

  it("handoff 缺失 → 不得 closed（跨单元流转出口缺失）", async () => {
    const withoutHandoff = { ...defaultFiles, "demo-plan-v1-add-route-v1.md": "- [x] Step 0" }
    delete (withoutHandoff as Record<string, string>)["demo-plan-v1-handoff-v1.md"]
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({ findRoundClosed: () => Promise.resolve({ id: "cm-rc" }) }, withoutHandoff),
    )
    expect(unit.evidence.handoff).toBe(false)
    expect(unit.state).toBe("in-flight")
  })

  it("planStatus 未收敛（done<total）→ 不得 closed", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({
        findRoundClosed: () => Promise.resolve({ id: "cm-rc" }),
        findPlanRecord: () => Promise.resolve({ id: "cm-plan-record", totalTasks: 45, doneTasks: 39 }),
      }, { ...defaultFiles, "demo-plan-v1-add-route-v1.md": "- [x] Step 0" }),
    )
    expect(unit.evidence.planStatus).toBe(false)
    expect(unit.state).toBe("in-flight")
  })
})

describe("单元引用表（引用而非复制）", () => {
  it("handoff 存在但**不合规** → 不 closed（存在 ≠ 合规）", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({
        findRoundClosed: () => Promise.resolve({ id: "cm-rc" }),
        validateHandoff: () => ({
          ok: false,
          issues: [{ code: "MISSING_SUBSECTION", detail: "缺子章节：### 总体一键恢复" }],
        }),
      }),
    )
    expect(unit.evidence.handoff).toBe(false)
    expect(unit.handoffValidation?.ok).toBe(false)
    expect(unit.state).toBe("in-flight")
  })

  it("缺 handoff 文件 → 不调用校验器（无 handoffValidation）", async () => {
    const withoutHandoff = { ...defaultFiles }
    delete (withoutHandoff as Record<string, string>)["demo-plan-v1-handoff-v1.md"]
    let called = false
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps(
        {
          findRoundClosed: () => Promise.resolve({ id: "cm-rc" }),
          validateHandoff: () => {
            called = true
            return { ok: true, issues: [] }
          },
        },
        withoutHandoff,
      ),
    )
    expect(called).toBe(false)
    expect(unit.handoffValidation).toBeUndefined()
    expect(unit.state).toBe("in-flight")
  })

  it("支持 plans/{YYYY-MM}/{DD}/ 日期分层（真实仓库布局）", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps(
        { findRoundClosed: () => Promise.resolve({ id: "cm-rc" }) },
        {
          "2026-09/13/demo-plan-v1.md": "# plan",
          "2026-09/13/demo-plan-v1-add-route-v1.md": "- [x] Step 0",
          "2026-09/13/demo-plan-v1-handoff-v1.md": "# handoff",
          "/repo/.codex/specs/demo/checklist.md": "- [x] [T] tsc 零 error",
        },
      ),
    )
    expect(unit.refs.planPath).toBe(".codex/plans/2026-09/13/demo-plan-v1.md")
    expect(unit.refs.addRoutePath).toBe(".codex/plans/2026-09/13/demo-plan-v1-add-route-v1.md")
    expect(unit.state).toBe("closed")
  })

  it("产出制品路径 + PlanRecord/ROUND_CLOSED 审计 ID", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({ findRoundClosed: () => Promise.resolve({ id: "cm-rc" }) }),
    )
    expect(unit.refs).toEqual({
      planPath: ".codex/plans/demo-plan-v1.md",
      addRoutePath: ".codex/plans/demo-plan-v1-add-route-v1.md",
      handoffPath: ".codex/plans/demo-plan-v1-handoff-v1.md",
      // 约定：specs 目录 = planName 去掉 `-plan-vN`（真实例：add-coder-agent-memory-closure-plan-v1 → add-coder-agent-memory-closure）
      specsDir: ".codex/specs/demo",
      planRecordId: "cm-plan-record",
      roundClosedAuditId: "cm-rc",
    })
  })

  it("缺 handoff / specs / plan-record → 逐项列入 missingArtifacts", async () => {
    const unit = await resolveUnitState(
      planKeyword,
      makeDeps({
        listDir: () => ["demo-plan-v1.md", "demo-plan-v1-add-route-v1.md"],
        exists: () => false,
        findPlanRecord: () => Promise.resolve(null),
      }),
    )
    expect(unit.missingArtifacts).toEqual(expect.arrayContaining(["handoff", "specs", "plan-record"]))
  })

  it("不复制制品内容（只返回路径与 ID）", async () => {
    const unit = await resolveUnitState(planKeyword, makeDeps())
    expect(JSON.stringify(unit)).not.toContain("demo plan")
  })
})
