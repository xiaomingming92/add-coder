/*
 * 工具侧阶段确定性召回（Plan §3.1 方案 B1 / Spec §2 §DeterministicRecall）
 *
 * 与 stage-words.ts 的分工：
 *  - stage-words.ts：纯函数，Hook 侧识别阶段词（无 DB）
 *  - 本模块：有 DB 的工具侧落点，复用既有 recallPipeline（不另起一套召回实现）
 *
 * 三条硬约束：
 *  1. 阶段白名单命中才召回——未命中直接返回，不访问 DB、不写审计；
 *  2. ADD_MEMORY_RECALL_MODE=off 时整体停用（与 recall_memory 工具同语义）；
 *  3. fail-open：管线异常只降级为 skippedReason="pipeline-error"，绝不抛出，
 *     不阻塞调用它的门禁/交接流程。
 */
import { recallPipeline, type RecallPipelineDeps, type RecallPipelineResult } from "../retrieval/pipeline.js"
import { buildContext, estimateTokens } from "../retrieval/context-builder.js"
import { recallMode, type RecallMode } from "../switches.js"
import type { ScopeContext } from "../domain/scope.js"
import { isRecallStage, RECALL_STAGES, type RecallStage } from "./stage-words.js"

/** 默认 token 预算（Spec §10：ADD_MEMORY_MAX_TOKENS 默认 600，此处与 Recall 通道对齐） */
export const DEFAULT_STAGE_RECALL_MAX_TOKENS = 600

export type StageRecallSkipReason = "stage-not-whitelisted" | "recall-off" | "pipeline-error"

export interface StageRecallInput {
  /** 调用方声明的阶段；不在白名单内即不召回 */
  stage: string
  query: string
  repositoryRef: string
  scopeCtx?: Partial<ScopeContext>
  planKeyword?: string
  specRef?: string
  maxTokens?: number
  limit?: number
  consumerRef?: string
  diagnostic?: boolean
}

export interface StageRecallResult {
  injected: boolean
  stage: RecallStage | null
  context?: string
  auditId?: string | null
  degradedMode?: string | null
  itemCount: number
  usedTokens: number
  latencyMs: number
  skippedReason?: StageRecallSkipReason
  error?: string
}

/**
 * 按阶段执行确定性召回。deps 由调用方（MCP 工具）注入，便于测试与复用。
 */
export async function recallForStage(
  input: StageRecallInput,
  deps: RecallPipelineDeps,
  options: { mode?: RecallMode } = {},
): Promise<StageRecallResult> {
  const startedAt = Date.now()
  const empty = (): Omit<StageRecallResult, "skippedReason" | "stage"> => ({
    injected: false,
    itemCount: 0,
    usedTokens: 0,
    latencyMs: Math.max(0, Date.now() - startedAt),
  })

  if (!isRecallStage(input.stage)) {
    return { ...empty(), stage: null, skippedReason: "stage-not-whitelisted" }
  }
  const mode = options.mode ?? recallMode()
  if (mode === "off") {
    return { ...empty(), stage: input.stage, skippedReason: "recall-off" }
  }

  const stage = input.stage
  const maxTokens = input.maxTokens ?? DEFAULT_STAGE_RECALL_MAX_TOKENS
  const scopeCtx: ScopeContext = {
    repository: input.repositoryRef,
    planKeyword: input.planKeyword,
    specRef: input.specRef,
    ...input.scopeCtx,
  }

  try {
    const result: RecallPipelineResult = await recallPipeline(
      {
        query: input.query,
        stage,
        repositoryRef: input.repositoryRef,
        scopeCtx,
        maxTokens,
        limit: input.limit ?? 20,
        consumerRef: input.consumerRef ?? `mcp:stage-recall:${stage}`,
        diagnostic: input.diagnostic ?? false,
      },
      deps,
    )

    const budget = buildContext(
      result.items.map((item) => ({
        memoryId: item.memoryId,
        kind: item.kind,
        finalScore: item.scoreBreakdown?.final ?? item.confidence,
        tokens: estimateTokens(item.content),
        content: item.content,
        sourceRefs: item.sourceRefs,
      })),
      maxTokens,
    )

    return {
      injected: budget.selected.length > 0,
      stage,
      context: budget.selected.map((i) => i.content).join("\n\n"),
      auditId: result.recallId,
      degradedMode: result.degradedMode,
      itemCount: budget.selected.length,
      usedTokens: budget.usedTokens,
      latencyMs: result.latencyMs,
    }
  } catch (error) {
    // fail-open：召回失败不阻塞门禁/交接；错误信息进审计与返回值
    return {
      ...empty(),
      stage,
      skippedReason: "pipeline-error",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 供工具/文档展示的白名单（单一事实源来自 stage-words） */
export { RECALL_STAGES }
