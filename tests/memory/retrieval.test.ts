/*
 * 轮次 2 纯函数契约测试：RRF 融合 / 治理重排 / token 预算 / trigram 查询构建
 * 对应 Spec §5/§6，锚定 tasks.md Task 2.3/2.4
 */
import { describe, it, expect } from "vitest"
import { rrfFuse, rrfRank } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fusion.js"
import { rerankOne, DEFAULT_WEIGHTS, RANKING_VERSION } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/reranker.js"
import { buildContext, estimateTokens } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/context-builder.js"
import { buildTrigramQuery } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite.js"

const ctx = { repository: "r1", paths: ["src/memory/retrieval/fusion.ts"] }

describe("rrf 融合", () => {
  it("RRF(d)=Σ1/(k+rank_i)，多通道同项分数叠加", () => {
    const a = [
      { memoryId: "m1", rank: 1 }, { memoryId: "m2", rank: 2 },
    ]
    const b = [
      { memoryId: "m2", rank: 1 }, { memoryId: "m3", rank: 2 },
    ]
    const fused = rrfFuse([a, b], 60)
    // m2: 1/62 + 1/61 > m1: 1/61 > m3: 1/62
    expect(fused.get("m2")!).toBeCloseTo(1 / 62 + 1 / 61, 6)
    expect(fused.get("m2")!).toBeGreaterThan(fused.get("m1")!)
    expect(fused.get("m1")!).toBeGreaterThan(fused.get("m3")!)
  })

  it("单通道退化为原序", () => {
    const ranked = rrfRank([[{ memoryId: "x", rank: 1 }, { memoryId: "y", rank: 2 }]])
    expect(ranked.map((r) => r.memoryId)).toEqual(["x", "y"])
  })
})

describe("治理重排", () => {
  it("ACTIVE CONSTRAINT 获得强约束加分；STALE 受罚", () => {
    const base = { memoryId: "m1", rrfScore: 0.01, importance: 0.5, confidence: 0.5, scopeType: "REPOSITORY", scopeValue: "r1" }
    const constraint = rerankOne({ ...base, kind: "CONSTRAINT", status: "ACTIVE" }, ctx)
    const stale = rerankOne({ ...base, kind: "CONSTRAINT", status: "STALE" }, ctx)
    const fact = rerankOne({ ...base, kind: "FACT", status: "ACTIVE" }, ctx)
    expect(constraint.finalScore).toBeGreaterThan(fact.finalScore)
    expect(stale.finalScore).toBeLessThan(constraint.finalScore)
    expect(constraint.whySelected.join()).toContain("mandatoryConstraint")
  })

  it("更具体 scope 得分更高", () => {
    const base = { memoryId: "m", rrfScore: 0.01, kind: "LESSON", status: "ACTIVE" as const, importance: 0.5, confidence: 0.5 }
    const repo = rerankOne({ ...base, scopeType: "REPOSITORY", scopeValue: "r1" }, ctx)
    const path = rerankOne({ ...base, scopeType: "PATH", scopeValue: "src/memory" }, ctx)
    expect(path.finalScore).toBeGreaterThan(repo.finalScore)
  })

  it("scoreBreakdown 覆盖全部加减分项", () => {
    const r = rerankOne(
      { memoryId: "m", rrfScore: 0.01, kind: "CONSTRAINT", status: "ACTIVE", importance: 1, confidence: 1, scopeType: "SYMBOL", scopeValue: "s", conflicted: true, redundant: true },
      ctx,
    )
    for (const k of ["rrfScore", "scopeBoost", "kindBoost", "importanceBoost", "confidenceBoost", "mandatoryConstraintBoost", "stalePenalty", "conflictPenalty", "redundancyPenalty"]) {
      expect(r.scoreBreakdown).toHaveProperty(k)
    }
    expect(RANKING_VERSION).toBe("memory-rank-v1")
    expect(DEFAULT_WEIGHTS.mandatoryConstraintBoost).toBeGreaterThan(0)
  })
})

describe("token 预算", () => {
  it("token 估算：CJK 1/字，拉丁 4 字符/token", () => {
    expect(estimateTokens("迁移")).toBe(2)
    expect(estimateTokens("abcd")).toBe(1)
  })

  it("强约束优先保留；超预算项返回排除原因", () => {
    const items = [
      { memoryId: "c1", kind: "CONSTRAINT", finalScore: 0.01, tokens: 30, content: "迁移前必须跑双后端 smoke test 这是强制约束", sourceRefs: ["e1"] },
      { memoryId: "f1", kind: "FACT", finalScore: 0.9, tokens: 30, content: "某个无关紧要的事实记录内容占位符", sourceRefs: ["e2"] },
      { memoryId: "f2", kind: "FACT", finalScore: 0.8, tokens: 30, content: "另一个事实记录用于挤占预算空间", sourceRefs: ["e3"] },
    ]
    const r = buildContext(items, 35)
    expect(r.selected.map((s) => s.memoryId)).toEqual(["c1"])
    expect(r.excluded.find((e) => e.memoryId === "f1")?.reason).toContain("超预算")
  })

  it("近重复项合并 sourceRef，不重复占预算", () => {
    const items = [
      { memoryId: "a", kind: "LESSON", finalScore: 0.5, tokens: 10, content: "提交前执行双后端 migration smoke test 可避免失败", sourceRefs: ["e1"] },
      { memoryId: "b", kind: "LESSON", finalScore: 0.4, tokens: 10, content: "提交前执行双后端 migration smoke test 可避免失败！", sourceRefs: ["e2"] },
    ]
    const r = buildContext(items, 100)
    expect(r.selected).toHaveLength(1)
    expect(r.selected[0].sourceRefs).toContain("e2")
    expect(r.excluded[0].reason).toContain("近重复")
  })
})

describe("trigram 查询构建", () => {
  it("CJK 长片段与拉丁词加引号；短片段剔除", () => {
    expect(buildTrigramQuery("migration 迁移")).toBe('"migration"')
    expect(buildTrigramQuery("重复失败的原因")).toBe('"重复失败的原因"')
    expect(buildTrigramQuery("ab")).toBeNull()
    // "迁移" 仅 2 字符被剔除，≥3 字符片段保留
    expect(buildTrigramQuery("为什么 迁移 会失败")).toBe('"为什么" OR "会失败"')
  })
})
