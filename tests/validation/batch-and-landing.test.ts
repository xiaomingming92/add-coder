/*
 * 轮 4 契约测试：批量命令等价性 + 真实 adapter 落脚一致性 + 锚点适用性
 *
 * 覆盖验收：
 *  - 同一文档：core 直调 / 批量命令 / 两个 adapter 的守卫入口（.codex、.qoder）**结论一致**
 *  - 锚点规则的适用性差异：PreToolUse 算缺陷、manual(批量) 降级为诊断
 */
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { validate } from "../../templates/core/validation/index.js"
import { runBatch, roundsFromContents, inferDocType } from "../../scripts/validate-docs.js"

const root = mkdtempSync(join(tmpdir(), "validate-docs-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** 把真源 schema 与模板播种到临时 magicDir（锚点校验需要模板行；schema 是唯一真源） */
function seedTemplates(magicDir: string, files: string[]): void {
  const dir = join(root, magicDir, "templates")
  mkdirSync(dir, { recursive: true })
  for (const f of files) {
    copyFileSync(join(process.cwd(), "templates", "core", "templates", f), join(dir, f))
  }
}

/** 构造一个缺锚点、缺章节的 add-route（用于验证适用性差异） */
function makeAddRouteFixture(magicDir: string): { dir: string; file: string } {
  seedTemplates(magicDir, ["add-route-template.schema.json", "add-route-template.md"])
  const dir = join(root, magicDir)
  mkdirSync(join(dir, "plans", "2026-09", "14"), { recursive: true })
  const file = join(dir, "plans", "2026-09", "14", "demo-add-route-v1.md")
  // 刻意不写 "plan_track"（schema 的 anchor 为 plan_track，within="## Step 0"）
  writeFileSync(file, "# demo add-route\n## Step 0：文档先行\n- [x] 甲\n## Task 映射表\n", "utf-8")
  return { dir, file }
}

describe("类型推导与轮次推导", () => {
  it("inferDocType 识别 plans/specs/reviews 与相对路径前缀", () => {
    expect(inferDocType("plans/2026-09/12/x-plan-v1.md")).toBe("plan.standard")
    expect(inferDocType("plans/2026-09/12/x-add-route-v1.md")).toBe("add-route")
    expect(inferDocType("plans/2026-09/12/x.hitl.md")).toBe("hitl")
    expect(inferDocType("specs/x/spec.md")).toBe("spec")
    expect(inferDocType("reviews/2026-09/x-review-v1.md")).toBe("review")
    expect(inferDocType("plans/random.md")).toBeNull()
  })

  it("roundsFromContents：0 起编号 → +1；1 起编号 → 原值", () => {
    expect(roundsFromContents(["## 轮次 0", "## 轮次 1", "## 轮次 3"])).toBe(4)
    expect(roundsFromContents(["## 轮次 1："])).toBe(1)
    expect(roundsFromContents([])).toBe(1)
  })
})

describe("锚点适用性差异（抽层副作用的修正验证）", () => {
  const { file } = makeAddRouteFixture(".codex")

  it("PreToolUse（写入时）：锚点缺失算缺陷", () => {
    const r = validate({ type: "add-route", path: file, hook: "PreToolUse", projectRoot: root, magicDir: ".codex" })
    expect(r.issues.some((i) => i.code === "ANCHOR_MISS")).toBe(true)
    expect(r.diagnostics.some((i) => i.code === "ANCHOR_MISS")).toBe(false)
  })

  it("manual（批量/收尾）：锚点缺失降级为诊断，不算缺陷", () => {
    const r = validate({ type: "add-route", path: file, hook: "manual", projectRoot: root, magicDir: ".codex" })
    expect(r.issues.some((i) => i.code === "ANCHOR_MISS")).toBe(false)
    expect(r.diagnostics.some((i) => i.code === "ANCHOR_MISS")).toBe(true)
  })
})

describe("多入口结论一致性（联动验收）", () => {
  const { file } = makeAddRouteFixture(".qoder")

  it("core 直调 与 批量命令 结论一致（同 hook、同 issues 集合）", () => {
    const direct = validate({ type: "add-route", path: file, hook: "PreToolUse", projectRoot: root, magicDir: ".qoder" })
    const batch = runBatch({ projectRoot: root, magicDir: ".qoder", hook: "PreToolUse" })
    const item = batch.items.find((i) => i.rel.endsWith("demo-add-route-v1.md"))
    expect(item).toBeDefined()
    const codes = (a: { code: string }[]) => a.map((i) => i.code).sort().join(",")
    expect(codes(item!.issues)).toBe(codes(direct.issues))
    expect(codes(item!.diagnostics)).toBe(codes(direct.diagnostics))
  })

  it("两个 adapter 的守卫入口（.codex / .qoder）对同一文档给出一致结论", () => {
    const runGuard = (adapter: string, magicDir: string): { code: number; out: string } => {
      seedTemplates(magicDir, [
        "handoff-single-round-template.schema.json",
        "handoff-single-round-template.md",
        "handoff-multi-round-template.schema.json",
        "handoff-multi-round-template.md",
      ])
      const dir = join(root, magicDir)
      mkdirSync(join(dir, "plans", "2026-09", "14"), { recursive: true })
      const target = join(dir, "plans", "2026-09", "14", "demo-handoff-v1.md")
      // handoff 单轮内容：带模板标记，使守卫走 handoff 校验分支
      writeFileSync(target, "# demo handoff\n## 交接前状态\nx\n", "utf-8")
      const payload = JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: target, file_content: "# demo handoff\n## 交接前状态\nx\n" },
      })
      try {
        const out = execFileSync("npx", ["tsx", `templates/adapters/${adapter}/hooks/doc-format-guard.ts`], {
          input: payload,
          cwd: process.cwd(),
          encoding: "utf-8",
          env: { ...process.env, PROJECT_DIR: root, MAGIC_DIR: magicDir },
          stdio: ["pipe", "pipe", "pipe"],
        })
        return { code: 0, out }
      } catch (error) {
        const e = error as { status?: number; stdout?: string }
        return { code: e.status ?? -1, out: e.stdout ?? "" }
      }
    }
    const codex = runGuard("codex", ".codex")
    const qoder = runGuard("qoder", ".qoder")
    // 契约：两端对同一文档给出一致的"需阻断/放行"判定（exit code 相同）
    expect(codex.code).toBe(qoder.code)
  }, 120_000)
})
