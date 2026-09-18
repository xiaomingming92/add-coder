/*
 * Plan ↔ 兄弟制品版本配对用例（2026-09-18，farm-agent 多 v2 Plan 暴露）
 *
 * 报障现象：check_spec_sync({ planKeyword: "farm-agent-long-term-memory" }) 映射到
 * `2026-08/07/...-add-route-v1.md`，于是拿旧版路线图的附录比对当前工作区，报 37 个「未登记」。
 * 根因：add-route 解析按 planKeyword 去版本后缀取**首个匹配**；Plan 解析只要求文件名含 "-plan-v"
 * （`.hitl.md` 提案因此能顶替真 Plan）。本用例把配对口径钉死。
 */
import { describe, expect, it } from "vitest"
import {
  attributeToOtherPlans,
  extractAppendixFiles,
  parseArtifactName,
  resolvePlanArtifact,
  splitGitPathList,
} from "../templates/core/scripts/mcp-server/tools/gateway/plan-resolve.js"

/** farm-agent 实测布局（2026-09-18，两个版本共存 + hitl 提案干扰） */
const FARM_LAYOUT = [
  "2026-08/07/farm-agent-long-term-memory-plan-v1.md",
  "2026-08/07/farm-agent-long-term-memory-plan-v1.hitl.md",
  "2026-08/07/farm-agent-long-term-memory-add-route-v1.md",
  "2026-08/07/farm-agent-long-term-memory-handoff-v1.md",
  "2026-09/18/farm-agent-long-term-memory-plan-v2.md",
  "2026-09/18/farm-agent-long-term-memory-plan-v2.hitl.md",
  "2026-09/18/farm-agent-long-term-memory-add-route-v2.md",
  "2026-09/16/farm-agent-conversation-memory-injection-plan-v1.md",
  "2026-09/16/farm-agent-conversation-memory-injection-add-route-v1.md",
]

describe("resolvePlanArtifact：Plan 解析", () => {
  it("命中版本最高的真 Plan，不让 .hitl.md 提案顶替", () => {
    const { plan } = resolvePlanArtifact(FARM_LAYOUT, "farm-agent-long-term-memory", "plan")
    expect(plan?.file).toBe("2026-09/18/farm-agent-long-term-memory-plan-v2.md")
    expect(plan?.version).toBe(2)
    expect(plan?.base).toBe("farm-agent-long-term-memory")
    expect(plan?.dir).toBe("2026-09/18")
  })

  it("只有 .hitl 提案 + 旧版 Plan 时，退到旧版真 Plan（提案不算 Plan）", () => {
    const files = [
      "2026-08/07/farm-agent-long-term-memory-plan-v1.md",
      "2026-08/07/farm-agent-long-term-memory-plan-v1.hitl.md",
      "2026-09/18/farm-agent-long-term-memory-plan-v2.hitl.md",
    ]
    const { plan } = resolvePlanArtifact(files, "farm-agent-long-term-memory", "plan")
    expect(plan?.file).toBe("2026-08/07/farm-agent-long-term-memory-plan-v1.md")
    expect(plan?.version).toBe(1)
  })

  it("关键词无命中返回 null（不猜）", () => {
    expect(resolvePlanArtifact(FARM_LAYOUT, "no-such-plan", "plan").plan).toBeNull()
  })
})

describe("resolvePlanArtifact：add-route 与 Plan 版本配对", () => {
  it("v2 Plan 配 v2 add-route（旧实现命中 v1）", () => {
    const { artifact } = resolvePlanArtifact(FARM_LAYOUT, "farm-agent-long-term-memory", "add-route")
    expect(artifact?.file).toBe("2026-09/18/farm-agent-long-term-memory-add-route-v2.md")
    expect(artifact?.version).toBe(2)
    expect(artifact?.via).toBe("paired-same-dir-version")
    expect(artifact?.warning).toBeNull()
  })

  it("Plan 升到 v2 但只存在 v1 路线图 → 配对 v1 并显式告警（不静默）", () => {
    const files = FARM_LAYOUT.filter((f) => !f.includes("add-route-v2"))
    const { artifact } = resolvePlanArtifact(files, "farm-agent-long-term-memory", "add-route")
    expect(artifact?.file).toBe("2026-08/07/farm-agent-long-term-memory-add-route-v1.md")
    expect(artifact?.version).toBe(1)
    expect(artifact?.via).toBe("paired-base-max-version")
    expect(artifact?.warning).toMatch(/落后于 Plan v2/)
  })

  it("基名与 Plan 不同时按关键词兜底，并提示确认对应关系", () => {
    const files = [
      "2026-09/01/farm-agent-foo-plan-v1.md",
      "2026-09/02/farm-agent-foo-bar-add-route-v1.md",
    ]
    const { artifact } = resolvePlanArtifact(files, "farm-agent-foo", "add-route")
    expect(artifact?.file).toBe("2026-09/02/farm-agent-foo-bar-add-route-v1.md")
    expect(artifact?.via).toBe("keyword-max-version")
    expect(artifact?.warning).toMatch(/基名不同/)
  })

  it("review 变体名（-review-implementation-vN）可解析并配对到 Plan 基名", () => {
    const files = [
      ...FARM_LAYOUT,
      "reviews/farm-agent-long-term-memory-review-implementation-v1.md",
    ]
    expect(parseArtifactName("x/farm-agent-long-term-memory-review-implementation-v1.md", "review"))
      .toEqual({ base: "farm-agent-long-term-memory", version: 1 })
    const { artifact } = resolvePlanArtifact(files, "farm-agent-long-term-memory", "review")
    expect(artifact?.file).toBe("reviews/farm-agent-long-term-memory-review-implementation-v1.md")
  })

  it("无任何 add-route 时返回 null（由调用方显式报「未找到」）", () => {
    const files = ["2026-09/18/farm-agent-long-term-memory-plan-v2.md"]
    expect(resolvePlanArtifact(files, "farm-agent-long-term-memory", "add-route").artifact).toBeNull()
  })
})

describe("splitGitPathList：git diff 路径解析", () => {
  it("-z 的 NUL 分隔输出原样保留中文/空格路径（不再有引号与八进制转义）", () => {
    const raw = "src/lib/log/phase.ts\u0000docs/大田精准耕播智能决策系统/a b.md\u0000"
    expect(splitGitPathList(raw)).toEqual([
      "src/lib/log/phase.ts",
      "docs/大田精准耕播智能决策系统/a b.md",
    ])
  })

  it("无 NUL 时兼容按行输出，并清掉 CR（Windows）", () => {
    expect(splitGitPathList("a.ts\r\nb.ts\n")).toEqual(["a.ts", "b.ts"])
  })

  it("反斜杠一律归一到 POSIX（清单比对两侧同口径）", () => {
    expect(splitGitPathList("src\\agents\\context-engine\\init.ts\u0000")).toEqual([
      "src/agents/context-engine/init.ts",
    ])
  })
})

describe("attributeToOtherPlans：多 Plan 在飞时的噪声分摊", () => {
  it("命中即归属，全部命中后不再读后续 add-route（提前结束）", async () => {
    const routes = ["r1.md", "r2.md", "r3.md"]
    const read: string[] = []
    const { owners, unowned } = await attributeToOtherPlans(
      ["src/a.ts", "src/b.ts"],
      routes,
      async (rel) => {
        read.push(rel)
        if (rel === "r1.md") return "| `src/a.ts` | MODIFY |\n"
        return "| `src/b.ts` | MODIFY |\n"
      },
    )
    expect([...owners.keys()].sort()).toEqual(["src/a.ts", "src/b.ts"])
    expect(owners.get("src/b.ts")?.route).toBe("r2.md")
    expect(unowned).toEqual([])
    expect(read).toEqual(["r1.md", "r2.md"]) // r3 未读
  })

  it("任何 add-route 都未登记的留在 unowned（真·未登记）", async () => {
    const { owners, unowned } = await attributeToOtherPlans(
      ["src/a.ts", "src/z.ts"],
      ["r1.md"],
      async () => "`src/a.ts`\n",
    )
    expect(owners.size).toBe(1)
    expect(unowned).toEqual(["src/z.ts"])
  })
})

describe("extractAppendixFiles", () => {
  it("覆盖 ts/tsx/sql/prisma/toml 等交付物后缀，且忽略非反引号路径", () => {
    const content = [
      "| `src/lib/memory/memory-store.ts` | CREATE |",
      "| `prisma/nongqing.prisma` | MODIFY |",
      "| `sql/fts5.sql` | CREATE |",
      "| `src/caijuehub/caijue.toml` | MODIFY |",
      "裸路径 src/not-quoted.ts 不入清单",
    ].join("\n")
    expect(extractAppendixFiles(content)).toEqual([
      "src/lib/memory/memory-store.ts",
      "prisma/nongqing.prisma",
      "sql/fts5.sql",
      "src/caijuehub/caijue.toml",
    ])
  })
})
