/*
 * 检索管线公共类型（Plan §7/§8.1）
 */
import type { MemoryStatus } from "../domain/state-machine.js"
import type { ScopeContext } from "../domain/scope.js"

export interface RankedId {
  memoryId: string
  rank: number
  score?: number
}

export interface RecallFilter {
  repositoryRef: string
  statuses: readonly MemoryStatus[]
  scopeCtx: ScopeContext
  kinds?: string[]
  /** validUntil 过滤基准时刻 */
  now: Date
}

export interface ComponentHealth {
  component: string
  status: "ok" | "degraded" | "unavailable" | "disabled"
  detail?: string
}

export interface LexicalSearchAdapter {
  readonly id: string
  search(query: string, filter: RecallFilter, limit: number): Promise<RankedId[]>
  health(): Promise<ComponentHealth>
}

/** 最小原生 SQL 查询接口：PG/SQLite adapter 与测试桩共用（生产由 prisma.$queryRawUnsafe 适配） */
export interface RawQuerier {
  query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>
}

/** recall_memory 返回项（Plan §6.2：必须结构化，不依赖模型从自由文本推断） */
export interface RecalledMemory {
  memoryId: string
  kind: string
  topic: string
  content: string
  scope: { type: string; value: string }
  confidence: number
  importance: number
  sourceRefs: string[]
  whySelected: string[]
  scoreBreakdown: Record<string, number>
  supersedes: string[]
}
