/*
 * Memory 治理面 MCP 工具（Spec §8，Plan §6.1/§6.2）
 *
 * 8 个 MVP 工具：
 *   propose_memory / recall_memory / get_memory / list_memories
 *   review_memory / resolve_memory / feedback_memory / get_memory_health
 *
 * 横切契约：
 * - 所有写工具与读工具均强制 repositoryRef === runtimeContext.projectKey（ERR_REPOSITORY_MISMATCH）
 * - 错误一律稳定错误码（domain/errors.ts），不返回自由文本堆栈
 * - 召回降级必须 degradedMode 明示
 * - 状态迁移走领域状态机 assertTransition + AuditLog 打点（ADD-5）
 */
import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { textResponse, errorResponse } from "../shared/response.js"
import { prisma } from "../shared/prisma.js"
import { DATABASE_URL, getRuntimeContext } from "../shared/env.js"
import {
  validatedDelegate,
  AddMemoryRowSchema,
  AddMemoryEvidenceRowSchema,
  AddMemoryEvidenceLinkRowSchema,
  AddMemoryRecallRowSchema,
  AddMemoryRecallItemRowSchema,
  AuditLogRowSchema,
  AddUserRowSchema,
  type AddMemoryRow,
  type AddMemoryEvidenceRow,
  type AddMemoryEvidenceLinkRow,
  type AddMemoryRecallRow,
  type AddMemoryRecallItemRow,
  type AuditLogRow,
  type AddUserRow,
} from "../shared/db-types.js"
import { MemoryError, isMemoryError } from "../shared/memory/domain/errors.js"
import { assertTransition, type MemoryAction, type MemoryStatus } from "../shared/memory/domain/state-machine.js"
import { assertScopeWritable, scopesCompatible, type ScopeContext, type MemoryScopeType } from "../shared/memory/domain/scope.js"
import { contentHash } from "../shared/memory/domain/dedup.js"
import { detectConflicts } from "../shared/memory/domain/conflicts.js"
import { assertNoSecrets } from "../shared/memory/domain/secrets.js"
import { recallPipeline, type MemoryRowLike } from "../shared/memory/retrieval/pipeline.js"
import type { LexicalSearchAdapter, RawQuerier, RecallFilter } from "../shared/memory/retrieval/types.js"
import { createPgFtsAdapter } from "../shared/memory/retrieval/fts/pg.js"
import { createSqliteFtsAdapter } from "../shared/memory/retrieval/fts/sqlite.js"
import {
  createNoneEmbeddingProvider,
  type EmbeddingProvider,
  type VectorSearchAdapter,
} from "../shared/memory/embedding/index.js"

/** 测试可注入依赖（生产默认从 prisma/DATABASE_URL 构建） */
export interface MemoryToolDeps {
  lexical?: LexicalSearchAdapter[]
  rawQuerier?: RawQuerier
  embedding?: EmbeddingProvider
  vector?: VectorSearchAdapter | null
}

const MEMORY_KINDS = ["DECISION", "CONSTRAINT", "PITFALL", "FAILURE", "LESSON", "PATTERN", "CONVENTION", "FACT", "HANDOFF_DIGEST", "HYPOTHESIS"] as const
const SCOPE_TYPES = ["ORGANIZATION", "REPOSITORY", "BRANCH", "MODULE", "PATH", "SYMBOL", "PLAN", "SPEC"] as const
const RECALL_OUTCOMES = ["UNKNOWN", "USED", "USEFUL", "IRRELEVANT", "OUTDATED", "CONTRADICTED", "HARMFUL"] as const

export function registerMemoryTools(server: ToolRegistrar, deps: MemoryToolDeps = {}) {
  const runtimeContext = getRuntimeContext()

  // 无类型边界单点（zod 托管）：动态 client → 运行期校验的泛型委托
  const memoryDb = validatedDelegate<AddMemoryRow>(prisma.addMemory, AddMemoryRowSchema, "AddMemory")
  const evidenceDb = validatedDelegate<AddMemoryEvidenceRow>(prisma.addMemoryEvidence, AddMemoryEvidenceRowSchema, "AddMemoryEvidence")
  const linkDb = validatedDelegate<AddMemoryEvidenceLinkRow>(prisma.addMemoryEvidenceLink, AddMemoryEvidenceLinkRowSchema, "AddMemoryEvidenceLink")
  const recallDb = validatedDelegate<AddMemoryRecallRow>(prisma.addMemoryRecall, AddMemoryRecallRowSchema, "AddMemoryRecall")
  const recallItemDb = validatedDelegate<AddMemoryRecallItemRow>(prisma.addMemoryRecallItem, AddMemoryRecallItemRowSchema, "AddMemoryRecallItem")
  const auditDb = validatedDelegate<AuditLogRow>(prisma.auditLog, AuditLogRowSchema, "AuditLog")
  const userDb = validatedDelegate<AddUserRow>(prisma.addUser, AddUserRowSchema, "AddUser")

  const rawQuerier: RawQuerier = deps.rawQuerier ?? {
    query: <T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> =>
      (prisma.$queryRawUnsafe as unknown as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params) as Promise<T[]>,
  }
  const lexical: LexicalSearchAdapter[] = deps.lexical ?? [
    DATABASE_URL.startsWith("postgres") ? createPgFtsAdapter(rawQuerier) : createSqliteFtsAdapter(rawQuerier),
  ]
  const embedding: EmbeddingProvider = deps.embedding ?? createNoneEmbeddingProvider()
  const vector: VectorSearchAdapter | null = deps.vector === undefined ? null : deps.vector

  // ── 横切守卫 ──

  /** repository 边界：不一致即拒（越权测试的唯一判定） */
  function assertRepository(repositoryRef: string): void {
    if (repositoryRef !== runtimeContext.projectKey) {
      throw new MemoryError("ERR_REPOSITORY_MISMATCH", `期望 ${runtimeContext.projectKey}，实收 ${repositoryRef}`)
    }
  }

  function assertInvariant01(field: string, v: number | undefined): void {
    if (v !== undefined && (Number.isNaN(v) || v < 0 || v > 1)) {
      throw new MemoryError("ERR_INVARIANT", `${field}=${v} 越出 [0,1]`)
    }
  }

  /** 统一错误出口：MemoryError 透传稳定码；其余兜底为 ERR_INVARIANT 之外的通用包装 */
  function fail(e: unknown) {
    if (isMemoryError(e)) return errorResponse(e.message)
    return errorResponse(`ERR_INTERNAL: ${e instanceof Error ? e.message : String(e)}`)
  }

  async function ensureSystemUser(): Promise<string> {
    let u = await userDb.findUnique({ where: { username: "ai-assistant" }, select: { id: true } })
    if (!u) u = await userDb.create({ data: { id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" } })
    return u.id
  }

  /** 状态迁移审计打点（ADD-5：不落库的状态迁移视为未发生） */
  async function writeTransitionAudit(input: {
    memoryId: string; action: string; from: MemoryStatus; to: MemoryStatus; reason?: string; actor?: string
  }): Promise<string> {
    const userId = await ensureSystemUser()
    const log = await auditDb.create({
      data: {
        userId,
        projectKey: runtimeContext.projectKey,
        producerAdapterKey: runtimeContext.adapterKey,
        contextId: runtimeContext.contextId,
        action: `MEMORY_${input.action.toUpperCase()}`,
        targetType: "AddMemory",
        targetId: input.memoryId,
        beforeState: { status: input.from },
        afterState: { status: input.to, actor: input.actor ?? null },
        reason: input.reason ?? null,
      } as Partial<AuditLogRow>,
    })
    return log.id
  }

  /** 取行 + 边界校验（找不到/越库 → 稳定错误码） */
  async function getScopedMemory(memoryId: string): Promise<AddMemoryRow> {
    const row = await memoryDb.findUnique({ where: { id: memoryId } })
    if (!row) throw new MemoryError("ERR_NOT_FOUND", `memoryId=${memoryId}`)
    if (row.repositoryRef !== runtimeContext.projectKey) {
      throw new MemoryError("ERR_REPOSITORY_MISMATCH", `memoryId=${memoryId} 属于 ${row.repositoryRef}`)
    }
    return row
  }

  // ===== 1. propose_memory =====
  server.registerTool("propose_memory", {
    description: "提出记忆候选（CANDIDATE，绝不直接 ACTIVE）。执行去重（幂等键 repositoryRef+contentHash+scope）、密钥扫描（命中拒写）、同 scope 冲突检测（返回 conflicts 由人工裁决）。可关联证据引用。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      kind: z.enum(MEMORY_KINDS).describe("记忆类型"),
      topic: z.string().describe("主题（短句）"),
      content: z.string().describe("记忆正文（可验证结论，禁止只存数值）"),
      scopeType: z.enum(SCOPE_TYPES).describe("scope 类型"),
      scopeValue: z.string().describe("scope 值（如仓库名/分支/路径/符号）"),
      summary: z.string().optional().describe("可选摘要（注入上下文时优先使用）"),
      importance: z.number().optional().describe("重要性 [0,1]，默认 0.5"),
      confidence: z.number().optional().describe("置信度 [0,1]，默认 0.5"),
      evidenceRefs: z.array(z.string()).optional().describe("证据引用列表（sourceRef，如 plan 路径/审计 ID/文件路径）"),
      sourceType: z.enum(["PLAN", "SPEC", "DPS_GATE", "DEV_OPERATION", "RAHS_GATE", "HANDOFF", "MANUAL", "IMPORT"]).optional().default("MANUAL"),
      createdBy: z.string().optional().describe("提议者标识"),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const repositoryRef = args.repositoryRef as string
      assertRepository(repositoryRef)
      const kind = args.kind as string
      const topic = args.topic as string
      const content = args.content as string
      const scopeType = args.scopeType as MemoryScopeType
      const scopeValue = args.scopeValue as string
      assertScopeWritable({ type: scopeType, value: scopeValue })
      assertInvariant01("importance", args.importance as number | undefined)
      assertInvariant01("confidence", args.confidence as number | undefined)
      assertNoSecrets(`${topic}\n${content}`)

      const hash = contentHash(content)
      // 幂等去重：同幂等键且未被拒绝/归档 → 合并语义，返回已有 id
      const existing = await memoryDb.findFirst({
        where: { repositoryRef, contentHash: hash, scopeType, scopeValue, status: { notIn: ["REJECTED", "ARCHIVED"] } },
      })
      if (existing) {
        return textResponse(JSON.stringify({ memoryId: existing.id, merged: true, status: existing.status, conflicts: [] }))
      }

      // 冲突检测：同 scope 的 ACTIVE 高相似 CONSTRAINT/DECISION/CONVENTION
      const actives = await memoryDb.findMany({
        where: { repositoryRef, status: "ACTIVE", scopeType, scopeValue },
        take: 200,
      })
      const conflicts = detectConflicts({ kind, topic, content, scopeType, scopeValue }, actives)

      const created = await memoryDb.create({
        data: {
          kind, topic, content,
          summary: (args.summary as string | undefined) ?? null,
          scopeType, scopeValue, repositoryRef,
          importance: (args.importance as number | undefined) ?? 0.5,
          confidence: (args.confidence as number | undefined) ?? 0.5,
          contentHash: hash,
          createdBy: (args.createdBy as string | undefined) ?? null,
        } as Partial<AddMemoryRow>,
      })

      // 证据关联（幂等：repositoryRef+sourceType+sourceRef+contentHash 唯一）
      const evidenceRefs = (args.evidenceRefs as string[] | undefined) ?? []
      const sourceType = (args.sourceType as string | undefined) ?? "MANUAL"
      let evidenceCount = 0
      for (const ref of evidenceRefs) {
        assertNoSecrets(ref)
        const ev = await evidenceDb.upsert({
          where: {
            repositoryRef_sourceType_sourceRef_contentHash: {
              repositoryRef, sourceType, sourceRef: ref, contentHash: contentHash(ref),
            },
          },
          create: {
            repositoryRef, sourceType, sourceRef: ref,
            excerpt: ref.slice(0, 500),
            contentHash: contentHash(ref),
          } as Partial<AddMemoryEvidenceRow>,
          update: {},
        })
        const linkKey = { memoryId: created.id, evidenceId: ev.id }
        const linked = await linkDb.findFirst({ where: linkKey })
        if (!linked) await linkDb.create({ data: linkKey as Partial<AddMemoryEvidenceLinkRow> })
        evidenceCount++
      }

      return textResponse(JSON.stringify({
        memoryId: created.id, merged: false, status: created.status, evidenceCount, conflicts,
      }))
    } catch (e) { return fail(e) }
  })

  // ===== 2. recall_memory =====
  server.registerTool("recall_memory", {
    description: "受约束的混合召回（FTS-first，RRF 融合 + 治理重排 + token 预算裁剪）。返回结构化 items（含 whySelected/scoreBreakdown/supersedes）+ recallId（审计可重放）+ degradedMode（降级明示）。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      query: z.string().describe("召回意图（自然语言查询）"),
      stage: z.string().describe("召回阶段（如 session-start/plan-start/dps/rah/handoff/prompt）"),
      branch: z.string().optional(),
      module: z.string().optional(),
      paths: z.array(z.string()).optional().describe("当前上下文路径集合"),
      symbols: z.array(z.string()).optional().describe("当前上下文符号集合"),
      planKeyword: z.string().optional(),
      specRef: z.string().optional(),
      includePlanScope: z.boolean().optional().describe("显式历史查询时放行 PLAN/SPEC scope"),
      kinds: z.array(z.enum(MEMORY_KINDS)).optional().describe("限定记忆类型"),
      maxTokens: z.number().optional().default(1200).describe("注入 token 预算"),
      limit: z.number().optional().default(20).describe("候选上限"),
      consumerRef: z.string().optional().describe("消费方标识（审计用）"),
      diagnostic: z.boolean().optional().describe("诊断模式：放行 STALE（带警告）"),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const repositoryRef = args.repositoryRef as string
      assertRepository(repositoryRef)

      const scopeCtx: ScopeContext = {
        repository: repositoryRef,
        branch: args.branch as string | undefined,
        module: args.module as string | undefined,
        paths: args.paths as string[] | undefined,
        symbols: args.symbols as string[] | undefined,
        planKeyword: args.planKeyword as string | undefined,
        specRef: args.specRef as string | undefined,
        includePlanScope: (args.includePlanScope as boolean | undefined) ?? false,
      }

      // degradedMode 明示：向量能力缺失 → FTS-only（合法降级，非故障）
      const vectorHealth = vector ? await vector.health() : null
      const degradedMode = vectorHealth && vectorHealth.status === "ok"
        ? null
        : `fts-only(embedding=${embedding.id}${vector ? `,vector=${vectorHealth?.status ?? "unknown"}` : ""})`

      // 组合式 vector 候选：query → embedding → 向量索引（仅当 provider+adapter 均健康）
      const vectorForPipeline =
        vector && vectorHealth && vectorHealth.status === "ok"
          ? {
              search: async (query: string, filter: RecallFilter, limit: number) => {
                const [vec] = await embedding.embed([query])
                return vector.search(vec, filter, limit)
              },
            }
          : null

      const result = await recallPipeline(
        {
          query: args.query as string,
          stage: args.stage as string,
          repositoryRef,
          scopeCtx,
          maxTokens: (args.maxTokens as number | undefined) ?? 1200,
          kinds: args.kinds as string[] | undefined,
          limit: (args.limit as number | undefined) ?? 20,
          consumerRef: (args.consumerRef as string | undefined) ?? "mcp:recall_memory",
          diagnostic: (args.diagnostic as boolean | undefined) ?? false,
        },
        {
          lexical,
          vector: vectorForPipeline,
          fetchByIds: async (ids) =>
            (await memoryDb.findMany({
              where: { id: { in: ids } },
              include: { supersedes: { select: { id: true } } },
            })) as unknown as MemoryRowLike[],
          fetchEvidenceSourceRefs: async (memoryIds) => {
            const links = await linkDb.findMany({ where: { memoryId: { in: memoryIds } } })
            const evIds = [...new Set(links.map((l) => l.evidenceId))]
            const evs = evIds.length > 0 ? await evidenceDb.findMany({ where: { id: { in: evIds } } }) : []
            const refById = new Map(evs.map((e) => [e.id, e.sourceRef]))
            const out = new Map<string, string[]>()
            for (const l of links) {
              const ref = refById.get(l.evidenceId)
              if (!ref) continue
              const arr = out.get(l.memoryId) ?? []
              arr.push(ref)
              out.set(l.memoryId, arr)
            }
            return out
          },
          audit: {
            createRecall: (data) => recallDb.create({ data: data as Partial<AddMemoryRecallRow> }),
            createRecallItem: (data) => recallItemDb.create({ data: data as Partial<AddMemoryRecallItemRow> }),
          },
          degradedMode: degradedMode ?? undefined,
        },
      )

      return textResponse(JSON.stringify(result))
    } catch (e) { return fail(e) }
  })

  // ===== 3. get_memory =====
  server.registerTool("get_memory", {
    description: "查看单条记忆详情与 provenance：evidence 列表、supersession 链（前驱/后继）、最近召回使用情况。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      memoryId: z.string(),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      assertRepository(args.repositoryRef as string)
      const row = await getScopedMemory(args.memoryId as string)

      const links = await linkDb.findMany({ where: { memoryId: row.id } })
      const evIds = links.map((l) => l.evidenceId)
      const evidence = evIds.length > 0 ? await evidenceDb.findMany({ where: { id: { in: evIds } } }) : []

      // supersession 链：向上（supersededById）+ 向下（谁 supersede 了我）
      // 注意：validatedDelegate 会按行 schema 校验返回值，不能用 select 裁剪字段
      const supersededBy = row.supersededById
        ? await memoryDb.findUnique({ where: { id: row.supersededById } })
        : null
      const supersedes = await memoryDb.findMany({ where: { supersededById: row.id } })

      // 最近召回使用（RecallItem join Recall 元信息）
      const items = await recallItemDb.findMany({
        where: { memoryId: row.id }, orderBy: { updatedAt: "desc" }, take: 10,
      })
      const recallIds = [...new Set(items.map((i) => i.recallId))]
      const recalls = recallIds.length > 0 ? await recallDb.findMany({ where: { id: { in: recallIds } } }) : []
      const recallById = new Map(recalls.map((r) => [r.id, r]))
      const recallUsage = items.map((i) => ({
        recallId: i.recallId, selected: i.selected, rank: i.rank, outcome: i.outcome,
        query: recallById.get(i.recallId)?.query ?? null,
        stage: recallById.get(i.recallId)?.stage ?? null,
        at: recallById.get(i.recallId)?.createdAt ?? null,
      }))

      return textResponse(JSON.stringify({
        memory: row,
        evidence: evidence.map((e) => ({ id: e.id, sourceType: e.sourceType, sourceRef: e.sourceRef, excerpt: e.excerpt, occurredAt: e.occurredAt })),
        supersession: {
          supersededBy: supersededBy?.id ?? null,
          supersedes: supersedes.map((s) => s.id),
        },
        recallUsage,
      }))
    } catch (e) { return fail(e) }
  })

  // ===== 4. list_memories =====
  server.registerTool("list_memories", {
    description: "按状态/scope/kind 列表查询（cursor 分页，createdAt 倒序）。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      status: z.enum(["CANDIDATE", "PENDING", "ACTIVE", "STALE", "SUPERSEDED", "REJECTED", "ARCHIVED"]).optional(),
      kind: z.enum(MEMORY_KINDS).optional(),
      scopeType: z.enum(SCOPE_TYPES).optional(),
      scopeValue: z.string().optional(),
      cursor: z.string().optional().describe("上一页最后一行的 id"),
      limit: z.number().optional().default(20).describe("每页条数，默认 20，最大 100"),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const repositoryRef = args.repositoryRef as string
      assertRepository(repositoryRef)
      const limit = Math.min((args.limit as number | undefined) ?? 20, 100)
      const cursor = args.cursor as string | undefined

      const where: Record<string, unknown> = { repositoryRef }
      if (args.status) where.status = args.status
      if (args.kind) where.kind = args.kind
      if (args.scopeType) where.scopeType = args.scopeType
      if (args.scopeValue) where.scopeValue = args.scopeValue

      const rows = await memoryDb.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null
      return textResponse(JSON.stringify({
        items: rows.map((r) => ({
          id: r.id, kind: r.kind, status: r.status, topic: r.topic,
          scope: { type: r.scopeType, value: r.scopeValue },
          importance: r.importance, confidence: r.confidence,
          validUntil: r.validUntil, createdAt: r.createdAt,
        })),
        nextCursor,
      }))
    } catch (e) { return fail(e) }
  })

  // ===== 5. review_memory =====
  server.registerTool("review_memory", {
    description: "获取待审核治理队列：CANDIDATE/PENDING 候选 + 各自证据 + 重复项（同 contentHash）+ 疑似冲突（同 scope 高相似 ACTIVE）。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      kind: z.enum(MEMORY_KINDS).optional(),
      limit: z.number().optional().default(50),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const repositoryRef = args.repositoryRef as string
      assertRepository(repositoryRef)
      const limit = Math.min((args.limit as number | undefined) ?? 50, 200)

      const where: Record<string, unknown> = { repositoryRef, status: { in: ["CANDIDATE", "PENDING"] } }
      if (args.kind) where.kind = args.kind
      const candidates = await memoryDb.findMany({ where, orderBy: { createdAt: "asc" }, take: limit })

      const actives = await memoryDb.findMany({ where: { repositoryRef, status: "ACTIVE" }, take: 500 })
      const result = []
      for (const c of candidates) {
        const links = await linkDb.findMany({ where: { memoryId: c.id } })
        const evIds = links.map((l) => l.evidenceId)
        const evidence = evIds.length > 0 ? await evidenceDb.findMany({ where: { id: { in: evIds } } }) : []
        const duplicates = await memoryDb.findMany({
          where: { repositoryRef, contentHash: c.contentHash, id: { not: c.id }, status: { notIn: ["REJECTED", "ARCHIVED"] } },
          take: 10,
        })
        const conflicts = detectConflicts(c, actives)
        result.push({
          id: c.id, kind: c.kind, status: c.status, topic: c.topic,
          scope: { type: c.scopeType, value: c.scopeValue },
          evidence: evidence.map((e) => ({ sourceType: e.sourceType, sourceRef: e.sourceRef })),
          duplicates: duplicates.map((d) => ({ id: d.id, status: d.status, topic: d.topic })),
          conflicts,
        })
      }
      return textResponse(JSON.stringify({ backlog: result.length, candidates: result }))
    } catch (e) { return fail(e) }
  })

  // ===== 6. resolve_memory =====
  server.registerTool("resolve_memory", {
    description: "执行治理状态迁移（状态机强制校验 + AuditLog 打点）。action: submit_review|approve|reject|stale|supersede|archive|restore。approve 必须已有 ≥1 证据且提供 actor；supersede 必须提供 supersededById（新记忆 id）且 scope 兼容。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      memoryId: z.string(),
      action: z.enum(["submit_review", "approve", "reject", "stale", "supersede", "archive", "restore"]),
      reason: z.string().optional(),
      actor: z.string().optional().describe("操作者（approve 时作为 approvedBy，必填）"),
      supersededById: z.string().optional().describe("supersede 专用：新记忆 id"),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      assertRepository(args.repositoryRef as string)
      const memoryId = args.memoryId as string
      const action = args.action as string
      const actor = args.actor as string | undefined
      const row = await getScopedMemory(memoryId)
      const current = row.status as MemoryStatus
      const domainAction: MemoryAction = action === "stale" ? "mark_stale" : (action as MemoryAction)

      // 迁移上下文：按动作装配不变量证据
      const tctx: Parameters<typeof assertTransition>[2] = {}
      if (domainAction === "approve") {
        const links = await linkDb.findMany({ where: { memoryId } })
        tctx.evidenceCount = links.length
        tctx.approvedBy = actor ?? null
        tctx.approvedAt = actor ? new Date() : null
      }
      let superseding: AddMemoryRow | null = null
      if (domainAction === "supersede") {
        const newId = args.supersededById as string | undefined
        if (newId) {
          superseding = await memoryDb.findUnique({ where: { id: newId } })
          tctx.supersededById = newId
          tctx.supersessionCompatible = !!superseding &&
            superseding.repositoryRef === row.repositoryRef &&
            scopesCompatible(
              { type: row.scopeType, value: row.scopeValue },
              { type: superseding.scopeType, value: superseding.scopeValue },
            )
        }
      }

      const t = assertTransition(current, domainAction, tctx)

      const data: Record<string, unknown> = { status: t.to }
      if (domainAction === "approve") { data.approvedBy = actor; data.approvedAt = new Date() }
      if (domainAction === "supersede") data.supersededById = args.supersededById
      await memoryDb.update({ where: { id: memoryId }, data: data as Partial<AddMemoryRow> })

      const auditRef = await writeTransitionAudit({
        memoryId, action: `TRANSITION_${action.toUpperCase()}`,
        from: t.from, to: t.to,
        reason: args.reason as string | undefined, actor,
      })

      return textResponse(JSON.stringify({ memoryId, oldStatus: t.from, newStatus: t.to, auditRef }))
    } catch (e) { return fail(e) }
  })

  // ===== 7. feedback_memory =====
  server.registerTool("feedback_memory", {
    description: "记录召回结果反馈（幂等 upsert RecallItem.outcome）。outcome: UNKNOWN|USED|USEFUL|IRRELEVANT|OUTDATED|CONTRADICTED|HARMFUL。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
      recallId: z.string(),
      memoryId: z.string(),
      outcome: z.enum(RECALL_OUTCOMES),
      feedback: z.string().optional(),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      assertRepository(args.repositoryRef as string)
      const recallId = args.recallId as string
      const memoryId = args.memoryId as string

      const recall = await recallDb.findUnique({ where: { id: recallId } })
      if (!recall) throw new MemoryError("ERR_NOT_FOUND", `recallId=${recallId}`)
      if (recall.repositoryRef !== runtimeContext.projectKey) {
        throw new MemoryError("ERR_REPOSITORY_MISMATCH", `recallId=${recallId} 属于 ${recall.repositoryRef}`)
      }
      const mem = await memoryDb.findUnique({ where: { id: memoryId } })
      if (!mem) throw new MemoryError("ERR_NOT_FOUND", `memoryId=${memoryId}`)

      const outcome = args.outcome as string
      const feedback = (args.feedback as string | undefined) ?? null
      await recallItemDb.upsert({
        where: { recallId_memoryId: { recallId, memoryId } },
        create: { recallId, memoryId, selected: false, rank: null, outcome, feedback } as Partial<AddMemoryRecallItemRow>,
        update: { outcome, feedback } as Partial<AddMemoryRecallItemRow>,
      })
      return textResponse(JSON.stringify({ updated: true, recallId, memoryId, outcome }))
    } catch (e) { return fail(e) }
  })

  // ===== 8. get_memory_health =====
  server.registerTool("get_memory_health", {
    description: "运行与治理健康度：backlog（CANDIDATE/PENDING 计数）、leakage 抽查（近 20 次召回选中项的越库计数）、embedding provider 与 FTS 索引健康。",
    inputSchema: z.object({
      repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
    }),
  }, async (args: Record<string, unknown>, _ctx: unknown) => {
    try {
      const repositoryRef = args.repositoryRef as string
      assertRepository(repositoryRef)

      // backlog：raw count（validatedDelegate 不支持 count/select 裁剪）
      const backlogRows = await rawQuerier.query<{ status: string; count: number | string }>(
        `SELECT "status"::text AS status, COUNT(*)::int AS count FROM "AddMemory" WHERE "repositoryRef" = $1 GROUP BY "status"`,
        [repositoryRef],
      )
      const backlog: Record<string, number> = {}
      for (const r of backlogRows) backlog[r.status] = Number(r.count)

      // leakage 抽查：最近 20 次召回的 selectedIds 是否全部属于本仓库
      const recentRecalls = await recallDb.findMany({
        where: { repositoryRef }, orderBy: { createdAt: "desc" }, take: 20,
      })
      const selectedIds = [...new Set(recentRecalls.flatMap((r) => (r.selectedIds as string[] | null) ?? []))]
      let leakage = 0
      if (selectedIds.length > 0) {
        const memRows = await memoryDb.findMany({ where: { id: { in: selectedIds } } })
        leakage = memRows.filter((m) => m.repositoryRef !== repositoryRef).length
      }

      const [embeddingHealth, ftsHealth] = await Promise.all([
        embedding.health(),
        ...lexical.map((l) => l.health()),
      ])

      return textResponse(JSON.stringify({
        repositoryRef,
        backlog: { candidate: backlog.CANDIDATE ?? 0, pending: backlog.PENDING ?? 0, byStatus: backlog },
        leakage: { checkedRecalls: recentRecalls.length, crossRepositorySelections: leakage },
        providers: { embedding: embeddingHealth },
        index: ftsHealth ?? { component: "fts", status: "unavailable", detail: "无 lexical adapter" },
      }))
    } catch (e) { return fail(e) }
  })
}
