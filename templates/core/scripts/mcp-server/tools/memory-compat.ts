/*
 * Memory 兼容面与合规清除（Plan §3.4 轮 2 / Spec §4 §CompatAndPurge）
 *
 * 两部分：
 *  A. v1 shim —— 5 个旧工具名注册为**弃用门面**：正常受理调用、把参数映射到 v2 语义、
 *     返回 `deprecated: true` + 目标工具 + 迁移指引，不重复实现 v2 逻辑（避免与 memory.ts 双源漂移）。
 *     ⚠️ 溯源声明：v1 工具名在仓库内**零命中**（CHANGELOG / docs / 五个 magic 目录均无），
 *     名字集合按 Plan §3.4 的「append/search/read/link/stats」字面构造。真实 v1 名单若不同，
 *     只需改下方 SHIM_TABLE 一行。
 *     执行转发（真正跑 v2 逻辑）需要把 memory.ts 的操作层抽成共享 ops 模块，按轮次边界
 *     （memory.ts 仅轮 3 装配）不在本轮改动，已登记为待补项。
 *  B. forget_memory —— 合规清除：物理删除记忆行，并清理三类外键占用（证据关联 / 召回记录 /
 *     被 supersede 指向），最后写 AuditLog 留痕（ADD-5：不落库的清除视为未发生）。
 *     普通废弃仍走状态机（resolve_memory 的 archive/reject/supersede），不物理删除。
 */
import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { textResponse, errorResponse } from "../shared/response.js"
import { prisma } from "../shared/prisma.js"
import { getRuntimeContext } from "../shared/env.js"
import {
  validatedDelegate,
  AddMemoryRowSchema,
  AddMemoryEvidenceLinkRowSchema,
  AddMemoryRecallItemRowSchema,
  AuditLogRowSchema,
  AddUserRowSchema,
  type AddMemoryRow,
  type AddMemoryEvidenceLinkRow,
  type AddMemoryRecallItemRow,
  type AuditLogRow,
  type AddUserRow,
  type TableDelegate,
} from "../shared/db-types.js"
import { MemoryError, isMemoryError } from "../shared/memory/domain/errors.js"

/** v1 → v2 映射表（表驱动：真实名单变化时只改这里） */
export interface ShimEntry {
  v1: string
  mappedTo: string
  note: string
}

export const SHIM_TABLE: readonly ShimEntry[] = [
  { v1: "append_memory", mappedTo: "propose_memory", note: "候选写入语义：落 CANDIDATE，绝不直接 ACTIVE" },
  { v1: "search_memory", mappedTo: "recall_memory", note: "受治理混合召回：RRF 融合 + 治理重排 + token 预算，返回 degradedMode" },
  { v1: "read_memory", mappedTo: "get_memory", note: "单条详情 + 证据链 + supersession 链" },
  { v1: "link_memory", mappedTo: "get_memory", note: "关联改由证据链承载（AddMemoryEvidenceLink），无独立链接工具" },
  { v1: "memory_stats", mappedTo: "get_memory_health", note: "backlog / leakage / provider / FTS 健康度" },
] as const

/** 弃用响应体（纯函数，便于测试） */
export function buildShimPayload(v1: string, args: Record<string, unknown>) {
  const entry = SHIM_TABLE.find((s) => s.v1 === v1)
  return {
    deprecated: true,
    v1,
    mappedTo: entry?.mappedTo ?? null,
    mappedArgs: args,
    note: entry?.note ?? null,
    executed: false,
    hint: entry
      ? `v1 工具 ${v1} 已弃用：请改用 ${entry.mappedTo}（参数同上表映射）。`
      : `未知的 v1 工具名 ${v1}。`,
  }
}

export type PurgeReason = "secret" | "privacy" | "compliance"

export interface PurgeResult {
  deleted: true
  memoryId: string
  reason: PurgeReason
  ftsCleared: true
  vectorCleared: boolean
  clearedLinks: number
  clearedRecallItems: number
  clearedSupersedePointers: number
  auditId: string
}

export interface PurgeDeps {
  /** 目标仓库（= 运行时 projectKey，越库直接拒绝） */
  repositoryRef: string
  context: { projectKey: string; adapterKey: string; contextId: string }
  memoryDb: Pick<TableDelegate<AddMemoryRow>, "findUnique" | "delete" | "updateMany">
  linkDb: Pick<TableDelegate<AddMemoryEvidenceLinkRow>, "deleteMany">
  recallItemDb: Pick<TableDelegate<AddMemoryRecallItemRow>, "deleteMany">
  auditDb: Pick<TableDelegate<AuditLogRow>, "create">
  ensureUserId: () => Promise<string>
}

/**
 * 合规清除（物理删除）。仅限 secret / privacy / compliance 三类原因；
 * FTS 索引随行删除自动维护（PG GIN 索引与 SQLite FTS5 触发器均为行级同步），故 ftsCleared 恒为 true；
 * 向量列由 embeddingState 决定：首版 provider=none → 无向量可清（vectorCleared=false）。
 */
export async function purgeMemory(
  deps: PurgeDeps,
  input: { memoryId: string; repositoryRef: string; reason: PurgeReason; actor?: string },
): Promise<PurgeResult> {
  if (input.repositoryRef !== deps.context.projectKey) {
    throw new MemoryError("ERR_REPOSITORY_MISMATCH", `越库清除被拒绝：${input.repositoryRef}`)
  }
  const row = await deps.memoryDb.findUnique({ where: { id: input.memoryId } })
  if (!row) throw new MemoryError("ERR_NOT_FOUND", `memoryId=${input.memoryId}`)
  if (row.repositoryRef !== deps.context.projectKey) {
    throw new MemoryError("ERR_REPOSITORY_MISMATCH", `memoryId=${input.memoryId} 属于 ${row.repositoryRef}`)
  }

  // 外键占用清理顺序：证据关联 → 召回记录 → 被指向的 supersede 指针 → 行本身
  const links = await deps.linkDb.deleteMany({ where: { memoryId: row.id } })
  const recItems = await deps.recallItemDb.deleteMany({ where: { memoryId: row.id } })
  const pointers = await deps.memoryDb.updateMany({
    where: { supersededById: row.id },
    data: { supersededById: null },
  })

  const vectorCleared = String(row.embeddingState ?? "DISABLED") !== "DISABLED"
  const userId = await deps.ensureUserId()
  const log = await deps.auditDb.create({
    data: {
      userId,
      projectKey: deps.context.projectKey,
      producerAdapterKey: deps.context.adapterKey,
      contextId: deps.context.contextId,
      action: "MEMORY_PURGE",
      targetType: "AddMemory",
      targetId: row.id,
      beforeState: {
        status: row.status,
        kind: row.kind,
        topic: row.topic,
        contentHash: row.contentHash,
        scopeType: row.scopeType,
        scopeValue: row.scopeValue,
        embeddingState: row.embeddingState ?? null,
        evidenceLinks: links.count ?? 0,
        recallItems: recItems.count ?? 0,
        supersedePointers: pointers.count ?? 0,
      },
      afterState: {
        deleted: true,
        ftsCleared: true,
        vectorCleared,
        reason: input.reason,
        actor: input.actor ?? null,
      },
      reason: input.reason,
    },
  })

  await deps.memoryDb.delete({ where: { id: row.id } })

  return {
    deleted: true,
    memoryId: row.id,
    reason: input.reason,
    ftsCleared: true,
    vectorCleared,
    clearedLinks: links.count ?? 0,
    clearedRecallItems: recItems.count ?? 0,
    clearedSupersedePointers: pointers.count ?? 0,
    auditId: log.id,
  }
}

export function registerMemoryCompatTools(server: ToolRegistrar) {
  const runtimeContext = getRuntimeContext()

  const memoryDb = validatedDelegate<AddMemoryRow>(prisma.addMemory, AddMemoryRowSchema, "AddMemory")
  const linkDb = validatedDelegate<AddMemoryEvidenceLinkRow>(
    prisma.addMemoryEvidenceLink, AddMemoryEvidenceLinkRowSchema, "AddMemoryEvidenceLink",
  )
  const recallItemDb = validatedDelegate<AddMemoryRecallItemRow>(
    prisma.addMemoryRecallItem, AddMemoryRecallItemRowSchema, "AddMemoryRecallItem",
  )
  const auditDb = validatedDelegate<AuditLogRow>(prisma.auditLog, AuditLogRowSchema, "AuditLog")
  const userDb = validatedDelegate<AddUserRow>(prisma.addUser, AddUserRowSchema, "AddUser")

  function fail(e: unknown) {
    if (isMemoryError(e)) return errorResponse(e.message)
    return errorResponse(`ERR_INTERNAL: ${e instanceof Error ? e.message : String(e)}`)
  }

  async function ensureSystemUser(): Promise<string> {
    let u = await userDb.findUnique({ where: { username: "ai-assistant" } })
    if (!u) {
      u = await userDb.create({
        data: { id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" },
      })
    }
    return u.id
  }

  // ===== A. v1 shim（5 个弃用门面） =====
  for (const entry of SHIM_TABLE) {
    server.registerTool(
      entry.v1,
      {
        description: `[已弃用] v1 兼容门面 → 请改用 ${entry.mappedTo}。${entry.note}`,
        inputSchema: z.looseObject({}),
      },
      (args: Record<string, unknown>) => {
        try {
          return Promise.resolve(textResponse(JSON.stringify(buildShimPayload(entry.v1, args))))
        } catch (e) {
          return Promise.resolve(fail(e))
        }
      },
    )
  }

  // ===== B. forget_memory（合规清除，非 shim：v2 新增运维工具） =====
  server.registerTool(
    "forget_memory",
    {
      description:
        "合规清除（物理删除 + 清证据/召回/supersede 占用 + AuditLog 留痕）。仅限 reason=secret|privacy|compliance；" +
        "普通废弃请用 resolve_memory 的 archive/reject/supersede（状态机，不物理删除）。必须显式 confirm=true。",
      inputSchema: z.object({
        repositoryRef: z.string().describe("仓库标识（必须等于运行时 projectKey）"),
        memoryId: z.string(),
        reason: z.enum(["secret", "privacy", "compliance"]).describe("清除原因（决定审计口径）"),
        actor: z.string().optional().describe("操作者标识"),
        confirm: z.boolean().describe("必须为 true：物理删除不可恢复"),
      }),
    },
    async (args: Record<string, unknown>, _ctx: unknown) => {
      try {
        if (args.confirm !== true) {
          return errorResponse("ERR_INVARIANT: 物理清除必须显式 confirm=true")
        }
        const result = await purgeMemory(
          {
            repositoryRef: runtimeContext.projectKey,
            context: {
              projectKey: runtimeContext.projectKey,
              adapterKey: runtimeContext.adapterKey,
              contextId: runtimeContext.contextId,
            },
            memoryDb, linkDb, recallItemDb, auditDb,
            ensureUserId: ensureSystemUser,
          },
          {
            memoryId: args.memoryId as string,
            repositoryRef: args.repositoryRef as string,
            reason: args.reason as PurgeReason,
            actor: args.actor as string | undefined,
          },
        )
        return textResponse(JSON.stringify(result))
      } catch (e) {
        return fail(e)
      }
    },
  )
}
