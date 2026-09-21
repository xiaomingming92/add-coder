/*
 * dev-operation.ts — DevOperation（ADD-7 开发操作审计）写入的**唯一实现**
 *
 * 背景（2026-09-21 决策）：审计写入此前散成两份——`tools/audit.ts::record_dev_operation` 一份、
 * 临时脚本 `scripts/plan-close.ts` 又手写一份（自己解析 AddUser + 直写）⇒ 典型的"同一能力两处实现"漂移。
 * 现抽为本文件：**record_dev_operation / plan_update / 脚本** 三方共用，形状与幂等键语义完全一致。
 *
 * 幂等：`operationKey` 未提供时按 `{projectKey, producerAdapterKey, action, targetType, targetId,
 * planKeyword, beforeState, afterState, reason}` 的规范化 JSON 取 sha256（与既有行为逐字一致，
 * 不把 toolName 纳入 hash —— 换调用方不该产生新审计行）。落库按唯一键
 * `projectKey_producerAdapterKey_toolName_operationKey` upsert（重复调用吸收）。
 */
import { createHash } from "node:crypto"
import type { RuntimeContextKey } from "./runtime-context.js"

export interface DevOperationWriterDatabase {
  devOperation: {
    upsert(args: Record<string, unknown>): Promise<DevOperationWrittenRow>
  }
  addUser: {
    findUnique(args: Record<string, unknown>): Promise<{ id: string } | null>
    create(args: Record<string, unknown>): Promise<{ id: string }>
  }
}

export interface DevOperationWrittenRow {
  id: string
  operationKey: string
  createdAt: Date
  beforeState: unknown
  afterState: unknown
}

export interface WriteDevOperationInput {
  context: RuntimeContextKey
  action: string
  targetType: string
  targetId?: string
  planKeyword?: string
  beforeState: Record<string, unknown> | unknown[]
  afterState: Record<string, unknown> | unknown[]
  reason?: string | null
  operationKey?: string
  /** 审计来源工具/脚本名；默认 record_dev_operation */
  toolName?: string
}

/** 审计用户解析：先 ai-assistant，缺失则建；再退回库内首个用户；都没有则显式报错（不静默） */
async function resolveAuditUserId(database: DevOperationWriterDatabase): Promise<string> {
  const existing = await database.addUser.findUnique({ where: { username: "ai-assistant" }, select: { id: true } })
  if (existing) return existing.id
  const created = await database.addUser.create({
    data: { id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" },
  })
  return created.id
}

export async function writeDevOperation(
  database: DevOperationWriterDatabase,
  input: WriteDevOperationInput,
): Promise<DevOperationWrittenRow> {
  const toolName = input.toolName ?? "record_dev_operation"
  const userId = await resolveAuditUserId(database)
  const operationPayload = {
    projectKey: input.context.projectKey,
    producerAdapterKey: input.context.adapterKey,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId || "unknown",
    planKeyword: input.planKeyword || "unknown",
    beforeState: input.beforeState,
    afterState: input.afterState,
    reason: input.reason ?? null,
  }
  const operationKey =
    (input.operationKey ?? "").trim() ||
    createHash("sha256").update(JSON.stringify(operationPayload)).digest("hex")

  return database.devOperation.upsert({
    where: {
      projectKey_producerAdapterKey_toolName_operationKey: {
        projectKey: input.context.projectKey,
        producerAdapterKey: input.context.adapterKey,
        toolName,
        operationKey,
      },
    },
    create: {
      ...operationPayload,
      userId,
      contextId: input.context.contextId,
      toolName,
      operationKey,
    },
    update: {},
  })
}
