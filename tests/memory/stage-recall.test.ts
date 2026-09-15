/*
 * 轮 1 契约测试：阶段确定性召回（Spec §2 §DeterministicRecall）
 *
 * 覆盖验收项：
 *  - 白名单命中才召回；未命中不访问 DB、不写审计
 *  - ADD_MEMORY_RECALL_MODE=off → 整体停用
 *  - 召回审计：命中时写入 Recall + RecallItem
 *  - fail-open：管线异常不抛出，降级为 pipeline-error
 *  - Hook 侧阶段词提示为纯文本（off 模式不输出）
 */
import { describe, it, expect, vi } from "vitest"
import {
  detectRecallStage,
  buildStageRecallHint,
  isRecallStage,
  RECALL_STAGES,
} from "../../templates/core/scripts/mcp-server/shared/memory/metrics/stage-words.js"
import {
  recallForStage,
  DEFAULT_STAGE_RECALL_MAX_TOKENS,
} from "../../templates/core/scripts/mcp-server/shared/memory/metrics/gate-recall.js"
import type {
  RecallPipelineDeps,
  MemoryRowLike,
} from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/pipeline.js"

describe("detectRecallStage 阶段词识别", () => {
  it("五阶段各自可识别", () => {
    expect(detectRecallStage("帮我生成 plan")).toBe("plan-start")
    expect(detectRecallStage("补一下 spec 三元组")).toBe("spec-start")
    expect(detectRecallStage("跑一下 DPS 门禁")).toBe("dps")
    expect(detectRecallStage("RAHS 现在多少分")).toBe("rahs")
    expect(detectRecallStage("生成 handoff 交接手册")).toBe("handoff")
  })

  it("特异性优先：包含 plan 的交接语句判为 handoff", () => {
    expect(detectRecallStage("把 plan 收口并交接给下一轮")).toBe("handoff")
  })

  it("无法判定时返回 null（不猜测）", () => {
    expect(detectRecallStage("今天天气如何")).toBeNull()
    expect(detectRecallStage("")).toBeNull()
  })

  it("白名单与类型守卫一致", () => {
    expect(RECALL_STAGES).toHaveLength(5)
    expect(isRecallStage("dps")).toBe(true)
    expect(isRecallStage("prompt")).toBe(false)
    expect(isRecallStage("session-start")).toBe(false)
  })
})

describe("buildStageRecallHint Hook 侧提示", () => {
  it("off 模式不产出提示", () => {
    expect(buildStageRecallHint("dps", "off")).toBeNull()
  })

  it("shadow / inject 模式提示语区分语义", () => {
    const shadow = buildStageRecallHint("plan-start", "shadow")
    const inject = buildStageRecallHint("plan-start", "inject")
    expect(shadow).toContain('stage: "plan-start"')
    expect(shadow).toContain("shadow")
    expect(inject).toContain("inject")
  })
})

/** 最小管线依赖：单条候选 + 审计记录器 */
function fakeDeps(over: Partial<RecallPipelineDeps> = {}) {
  const search = vi.fn(() => Promise.resolve([{ memoryId: "m-1", rank: 1, score: 0.9 }]))
  const createRecall = vi.fn(() => Promise.resolve({ id: "recall-1" }))
  const createRecallItem = vi.fn(() => Promise.resolve({}))
  const row: MemoryRowLike = {
    id: "m-1",
    kind: "CONSTRAINT",
    status: "ACTIVE",
    topic: "运行态与源码同版本",
    content: "magic 目录产物必须与 templates 同版本，否则运行态行为与源码不符。",
    summary: null,
    scopeType: "REPOSITORY",
    scopeValue: "repo",
    repositoryRef: "repo",
    importance: 0.9,
    confidence: 0.9,
    validUntil: null,
    supersedes: [],
  }
  const deps: RecallPipelineDeps = {
    lexical: [
      {
        id: "fake-fts",
        search,
        health: () => Promise.resolve({ component: "fake-fts", status: "ok" as const }),
      },
    ],
    fetchByIds: () => Promise.resolve([row]),
    fetchEvidenceSourceRefs: () => Promise.resolve(new Map([["m-1", ["plan.md"]]])),
    audit: { createRecall, createRecallItem },
    degradedMode: "fts-only(embedding=none)",
    ...over,
  }
  return { deps, search, createRecall, createRecallItem }
}

describe("recallForStage 白名单与开关注入门", () => {
  it("阶段不在白名单 → 不召回、不访问 DB、不写审计", async () => {
    const { deps, search, createRecall } = fakeDeps()
    const result = await recallForStage(
      { stage: "prompt", query: "随便问问", repositoryRef: "repo" },
      deps,
    )
    expect(result.injected).toBe(false)
    expect(result.skippedReason).toBe("stage-not-whitelisted")
    expect(result.stage).toBeNull()
    expect(search).not.toHaveBeenCalled()
    expect(createRecall).not.toHaveBeenCalled()
  })

  it("ADD_MEMORY_RECALL_MODE=off → 停用，不访问 DB", async () => {
    const { deps, search, createRecall } = fakeDeps()
    const result = await recallForStage(
      { stage: "dps", query: "跑门禁前找约束", repositoryRef: "repo" },
      deps,
      { mode: "off" },
    )
    expect(result.skippedReason).toBe("recall-off")
    expect(result.injected).toBe(false)
    expect(search).not.toHaveBeenCalled()
    expect(createRecall).not.toHaveBeenCalled()
  })
})

describe("recallForStage 命中路径与召回审计", () => {
  it("白名单命中 → 返回上下文 + auditId，且写入 Recall/RecallItem", async () => {
    const { deps, createRecall, createRecallItem } = fakeDeps()
    const result = await recallForStage(
      {
        stage: "plan-start",
        query: "起草 Plan 前需要哪些约束",
        repositoryRef: "repo",
        planKeyword: "demo-plan-v1",
      },
      deps,
      { mode: "shadow" },
    )
    expect(result.injected).toBe(true)
    expect(result.stage).toBe("plan-start")
    expect(result.auditId).toBe("recall-1")
    expect(result.itemCount).toBe(1)
    expect(result.context).toContain("magic 目录产物")
    expect(createRecall).toHaveBeenCalledTimes(1)
    expect(createRecallItem).toHaveBeenCalledTimes(1)
    const recallArg = createRecall.mock.calls[0][0] as { stage: string; consumerRef: string }
    expect(recallArg.stage).toBe("plan-start")
    expect(recallArg.consumerRef).toBe("mcp:stage-recall:plan-start")
    expect(result.degradedMode).toBe("fts-only(embedding=none)")
  })

  it("token 预算默认 600，超预算时裁剪且可观测", async () => {
    const { deps } = fakeDeps()
    const tight = await recallForStage(
      { stage: "handoff", query: "交接", repositoryRef: "repo", maxTokens: 5 },
      deps,
    )
    expect(tight.usedTokens).toBeLessThanOrEqual(5)
    const generous = await recallForStage(
      { stage: "handoff", query: "交接", repositoryRef: "repo" },
      deps,
    )
    expect(generous.itemCount).toBe(1)
    expect(DEFAULT_STAGE_RECALL_MAX_TOKENS).toBe(600)
  })

  it("管线异常 → fail-open，降级为 pipeline-error，不抛出", async () => {
    const { deps } = fakeDeps({
      lexical: [
        {
          id: "boom",
          search: () => Promise.reject(new Error("fts backend down")),
          health: () => Promise.resolve({ component: "boom", status: "unavailable" as const }),
        },
      ],
      audit: null,
    })
    const result = await recallForStage(
      { stage: "rahs", query: "门禁前找失败记忆", repositoryRef: "repo" },
      deps,
    )
    expect(result.injected).toBe(false)
    expect(result.skippedReason).toBe("pipeline-error")
    expect(result.error).toContain("fts backend down")
  })

  it("repository 越界 → fail-open（管线边界校验抛错被兜住）", async () => {
    const { deps } = fakeDeps()
    const result = await recallForStage(
      {
        stage: "spec-start",
        query: "起草 Spec",
        repositoryRef: "repo-a",
        scopeCtx: { repository: "repo-b" },
      },
      deps,
    )
    expect(result.injected).toBe(false)
    expect(result.skippedReason).toBe("pipeline-error")
    expect(result.error).toContain("ERR_REPOSITORY_MISMATCH")
  })
})
