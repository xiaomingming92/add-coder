/*
 * 轮次 1 契约测试：状态机 / scope / 去重 / 冲突 / 密钥 / 指标候选
 * 对应 Spec §2/§3/§11，验收锚定 tasks.md Task 1.3
 */
import { describe, it, expect } from "vitest"
import {
  assertTransition,
  DEFAULT_RECALL_STATUSES,
  DIAGNOSTIC_RECALL_STATUSES,
} from "../../templates/core/scripts/mcp-server/shared/memory/domain/state-machine.js"
import {
  scopeRank,
  scopeApplies,
  scopesCompatible,
  assertScopeWritable,
} from "../../templates/core/scripts/mcp-server/shared/memory/domain/scope.js"
import {
  normalizeContent,
  contentHash,
  memoryIdempotencyKey,
  charBigrams,
  jaccardSimilarity,
} from "../../templates/core/scripts/mcp-server/shared/memory/domain/dedup.js"
import { detectConflicts } from "../../templates/core/scripts/mcp-server/shared/memory/domain/conflicts.js"
import { scanSecrets, assertNoSecrets } from "../../templates/core/scripts/mcp-server/shared/memory/domain/secrets.js"
import {
  detectAnomalyStreak,
  metricSourceRef,
  DEFAULT_METRIC_RULE,
} from "../../templates/core/scripts/mcp-server/shared/memory/domain/metric-candidate.js"
import { MEMORY_ERROR } from "../../templates/core/scripts/mcp-server/shared/memory/domain/errors.js"

describe("state-machine", () => {
  it("合法迁移全路径：CANDIDATE → PENDING → ACTIVE → STALE → SUPERSEDED → ARCHIVED", () => {
    expect(assertTransition("CANDIDATE", "submit_review").to).toBe("PENDING")
    expect(
      assertTransition("PENDING", "approve", { evidenceCount: 1, approvedBy: "local-user" }).to,
    ).toBe("ACTIVE")
    expect(assertTransition("ACTIVE", "mark_stale").to).toBe("STALE")
    expect(
      assertTransition("STALE", "supersede", { supersededById: "new-id", supersessionCompatible: true }).to,
    ).toBe("SUPERSEDED")
    expect(assertTransition("SUPERSEDED", "archive").to).toBe("ARCHIVED")
    expect(assertTransition("ARCHIVED", "restore").to).toBe("CANDIDATE")
  })

  it("非法迁移被拒绝：ERR_ILLEGAL_TRANSITION", () => {
    expect(() => assertTransition("REJECTED", "approve", { evidenceCount: 1, approvedBy: "u" }))
      .toThrowError(/ERR_ILLEGAL_TRANSITION/)
    expect(() => assertTransition("CANDIDATE", "archive")).toThrowError(/ERR_ILLEGAL_TRANSITION/)
    expect(() => assertTransition("CANDIDATE", "mark_stale")).toThrowError(/ERR_ILLEGAL_TRANSITION/)
    expect(() => assertTransition("ACTIVE", "submit_review")).toThrowError(/ERR_ILLEGAL_TRANSITION/)
  })

  it("approve 强制 Evidence ≥1（ERR_EVIDENCE_REQUIRED）", () => {
    expect(() => assertTransition("PENDING", "approve", { evidenceCount: 0, approvedBy: "u" }))
      .toThrowError(/ERR_EVIDENCE_REQUIRED/)
    expect(() => assertTransition("PENDING", "approve", { approvedBy: "u" }))
      .toThrowError(/ERR_EVIDENCE_REQUIRED/)
  })

  it("approve 强制 approvedBy（ERR_APPROVAL_REQUIRED）", () => {
    expect(() => assertTransition("PENDING", "approve", { evidenceCount: 2 }))
      .toThrowError(/ERR_APPROVAL_REQUIRED/)
  })

  it("supersede 强制 supersededById 且 scope 兼容（ERR_SUPERSESSION_INVALID）", () => {
    expect(() => assertTransition("ACTIVE", "supersede", {}))
      .toThrowError(/ERR_SUPERSESSION_INVALID/)
    expect(() =>
      assertTransition("ACTIVE", "supersede", { supersededById: "x", supersessionCompatible: false }),
    ).toThrowError(/ERR_SUPERSESSION_INVALID/)
  })

  it("propose 是创建语义，任何当前状态均可发起（由调用方决定合并）", () => {
    expect(assertTransition("CANDIDATE", "propose").to).toBe("CANDIDATE")
  })

  it("默认召回仅 ACTIVE；诊断模式放行 STALE", () => {
    expect(DEFAULT_RECALL_STATUSES).toEqual(["ACTIVE"])
    expect(DIAGNOSTIC_RECALL_STATUSES).toContain("STALE")
  })
})

describe("scope", () => {
  it("优先级：symbol > path > module > branch > repository", () => {
    expect(scopeRank("SYMBOL")).toBeGreaterThan(scopeRank("PATH"))
    expect(scopeRank("PATH")).toBeGreaterThan(scopeRank("MODULE"))
    expect(scopeRank("MODULE")).toBeGreaterThan(scopeRank("BRANCH"))
    expect(scopeRank("BRANCH")).toBeGreaterThan(scopeRank("REPOSITORY"))
    expect(scopeRank("REPOSITORY")).toBeGreaterThan(scopeRank("ORGANIZATION"))
  })

  it("ORGANIZATION 写入被拒绝（§17-7 定案）", () => {
    expect(() => assertScopeWritable({ type: "ORGANIZATION", value: "org-1" }))
      .toThrowError(/ERR_ORG_SCOPE_DISABLED/)
    expect(scopeApplies({ type: "ORGANIZATION", value: "org-1" }, { repository: "r" })).toBe(false)
  })

  it("PATH scope 前缀匹配；PLAN/SPEC 仅显式历史查询参与", () => {
    const ctx = { repository: "repo-1", paths: ["src/memory/domain/scope.ts"], planKeyword: "agent-memory" }
    expect(scopeApplies({ type: "PATH", value: "src/memory" }, ctx)).toBe(true)
    expect(scopeApplies({ type: "PATH", value: "src/other" }, ctx)).toBe(false)
    expect(scopeApplies({ type: "PLAN", value: "agent-memory" }, ctx)).toBe(false)
    expect(scopeApplies({ type: "PLAN", value: "agent-memory" }, { ...ctx, includePlanScope: true })).toBe(true)
  })

  it("supersede 兼容矩阵", () => {
    expect(scopesCompatible({ type: "PATH", value: "src/a" }, { type: "PATH", value: "src/a" })).toBe(true)
    expect(scopesCompatible({ type: "PATH", value: "src/a/b" }, { type: "MODULE", value: "src/a" })).toBe(true)
    expect(scopesCompatible({ type: "REPOSITORY", value: "r1" }, { type: "PATH", value: "src/a" })).toBe(true)
    expect(scopesCompatible({ type: "REPOSITORY", value: "r1" }, { type: "REPOSITORY", value: "r2" })).toBe(false)
    expect(scopesCompatible({ type: "BRANCH", value: "main" }, { type: "BRANCH", value: "dev" })).toBe(false)
  })
})

describe("dedup", () => {
  it("规范化：全半角折叠 + 大小写折叠 + 空白折叠", () => {
    expect(normalizeContent("  Hello　Ｗorld  A  B ")).toBe("hello world a b")
  })

  it("contentHash 幂等：规范化后相同文本哈希一致", () => {
    expect(contentHash("Prisma 迁移前要跑 smoke test")).toBe(contentHash("Prisma 迁移前要跑 smoke test"))
    expect(contentHash("Ｐrisma 迁移前要跑  smoke test")).toBe(contentHash("prisma 迁移前要跑 smoke test"))
    expect(contentHash("a")).not.toBe(contentHash("b"))
  })

  it("幂等键包含 repository + contentHash + scope", () => {
    const k = memoryIdempotencyKey({
      repositoryRef: "r1", content: "x", scopeType: "PATH", scopeValue: "src/",
    })
    expect(k.split("|")).toHaveLength(4)
  })

  it("bigram Jaccard：相似文本高分，无关文本低分", () => {
    const a = charBigrams("迁移前执行双后端 smoke test")
    const b = charBigrams("迁移前执行双后端 smoke test 可避免失败")
    const c = charBigrams("今天天气不错适合出门散步")
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.6)
    expect(jaccardSimilarity(a, c)).toBeLessThan(0.1)
  })
})

describe("conflicts", () => {
  const actives = [
    {
      id: "m1", kind: "CONSTRAINT", scopeType: "REPOSITORY", scopeValue: "r1",
      topic: "迁移规范", content: "涉及 Prisma migration 的改动必须在提交前执行双后端 smoke test",
    },
  ]

  it("同 scope 高相似 CONSTRAINT 检出冲突", () => {
    const conflicts = detectConflicts(
      {
        kind: "CONSTRAINT", scopeType: "REPOSITORY", scopeValue: "r1",
        topic: "迁移规范", content: "涉及 Prisma migration 的改动必须在提交前执行双后端 smoke test，否则容易失败",
      },
      actives,
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].memoryId).toBe("m1")
  })

  it("不同 scope 或低相似不冲突；非管控类 kind 不参与", () => {
    expect(detectConflicts(
      { kind: "CONSTRAINT", scopeType: "PATH", scopeValue: "src/x", topic: "迁移规范", content: actives[0].content },
      actives,
    )).toHaveLength(0)
    expect(detectConflicts(
      { kind: "FACT", scopeType: "REPOSITORY", scopeValue: "r1", topic: "迁移规范", content: actives[0].content },
      actives,
    )).toHaveLength(0)
    expect(detectConflicts(
      { kind: "CONSTRAINT", scopeType: "REPOSITORY", scopeValue: "r1", topic: "无关", content: "今天天气不错" },
      actives,
    )).toHaveLength(0)
  })
})

describe("secrets", () => {
  it("命中常见密钥模式", () => {
    expect(scanSecrets("-----BEGIN RSA PRIVATE KEY-----").length).toBeGreaterThan(0)
    expect(scanSecrets("aws key: AKIAIOSFODNN7EXAMPLE").length).toBeGreaterThan(0)
    expect(scanSecrets("token = ghp_1234567890abcdefghij1234").length).toBeGreaterThan(0)
    expect(scanSecrets("sk-proj-1234567890abcdefghijklmn").length).toBeGreaterThan(0)
    expect(scanSecrets("postgresql://user:s3cret@host:5432/db").length).toBeGreaterThan(0)
    expect(scanSecrets('password = "my-secret-password"').length).toBeGreaterThan(0)
  })

  it("正常技术文本不误报", () => {
    expect(scanSecrets("DATABASE_URL 从 .env.development 读取，端口契约见 ports.md")).toHaveLength(0)
    expect(scanSecrets("涉及 Prisma migration 的多个 Plan 重复失败")).toHaveLength(0)
  })

  it("assertNoSecrets 命中时抛 ERR_SECRET_DETECTED", () => {
    expect(() => assertNoSecrets("-----BEGIN PRIVATE KEY-----")).toThrowError(/ERR_SECRET_DETECTED/)
    expect(() => assertNoSecrets("正常文本")).not.toThrow()
  })
})

describe("metric-candidate", () => {
  const mk = (value: number, baseline: number, i: number) => ({
    repositoryRef: "r1",
    metricType: "dps",
    value,
    baseline,
    planKeyword: "agent-memory",
    measuredAt: new Date(2026, 7, 19, i),
    sourceRef: metricSourceRef("DPS", "agent-memory", `run-${i}`),
  })

  it("sourceRef 约定：{gate}:{planKeyword}:{runId}（Review P1 #2）", () => {
    expect(metricSourceRef("DPS", "agent-memory", "abc")).toBe("DPS:agent-memory:abc")
  })

  it("连续异常达阈值 → 生成候选建议；未达阈值 → null", () => {
    const bad = [mk(50, 80, 0), mk(55, 80, 1), mk(52, 80, 2)]
    const p = detectAnomalyStreak(bad)
    expect(p).not.toBeNull()
    expect(p!.evidenceSourceRefs).toHaveLength(3)
    expect(p!.topic).toContain("连续 3 次")
    expect(detectAnomalyStreak([mk(50, 80, 0), mk(90, 80, 1)])).toBeNull()
  })

  it("尾部正常值打断连续计数", () => {
    const pts = [mk(50, 80, 0), mk(52, 80, 1), mk(95, 80, 2), mk(50, 80, 3)]
    expect(detectAnomalyStreak(pts)).toBeNull()
  })

  it("规则对象默认值符合 Plan §10 语义", () => {
    expect(DEFAULT_METRIC_RULE.streakThreshold).toBe(3)
    expect(MEMORY_ERROR.ERR_INVARIANT).toBeTruthy()
  })
})
