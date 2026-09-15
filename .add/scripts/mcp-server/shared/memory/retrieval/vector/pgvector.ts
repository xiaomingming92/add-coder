/*
 * pgvector 向量检索适配器（Plan §3.4 轮 3 Task 3.2 / Spec §6 §VectorCapability）
 *
 * 设计要点：
 *  1. **Prisma schema 不表达向量列**（架构文档定案）：扩展/表/索引由本适配器的原生 DDL 管理，
 *     `ensureSchema()` 幂等可重放；对应 migration 只负责首次交付（见 3.4）；
 *  2. **能力检测优先**：`capability()` 先看扩展、再看表；任一缺失都返回 unavailable/degraded，
 *     调用方据此走 fts-only，绝不因向量缺失阻塞召回；
 *  3. **维度真源**：表按 provider 维度建列；写入前校验向量长度，禁止脏向量进库。
 */
import type { ComponentHealth, RankedId, RecallFilter, RawQuerier } from "../types.js"
import { MemoryError } from "../../domain/errors.js"
import type { VectorSearchAdapter } from "../../embedding/index.js"

export const PG_VECTOR_TABLE = "add_memory_vector"
export const PG_VECTOR_EXTENSION = "vector"

/** 向量字面量（pgvector 接受 '[1,2,3]' 形式） */
export function pgVectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`
}

export function pgVectorSchemaDdl(dimension: number, table = PG_VECTOR_TABLE): string[] {
  if (!Number.isFinite(dimension) || dimension <= 0) {
    throw new MemoryError("ERR_DIMENSION_MISMATCH", `非法向量维度：${dimension}`)
  }
  return [
    `CREATE EXTENSION IF NOT EXISTS vector;`,
    `CREATE TABLE IF NOT EXISTS "${table}" (
  "memory_id" text PRIMARY KEY,
  "model" text NOT NULL,
  "dim" integer NOT NULL,
  "embedding" vector(${dimension}) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);`,
    `CREATE INDEX IF NOT EXISTS "${table}_embedding_hnsw" ON "${table}" USING hnsw ("embedding" vector_cosine_ops);`,
  ]
}

export interface PgVectorAdapterOptions {
  querier: RawQuerier
  /** 维度真源（来自 provider 元数据） */
  dimension: number
  /** 模型标识：检索时按模型过滤，避免混用不同模型向量 */
  model: string
  table?: string
}

export interface PgVectorAdapter extends VectorSearchAdapter {
  capability(): Promise<ComponentHealth>
  ensureSchema(): Promise<{ statements: number }>
}

export function createPgVectorAdapter(opts: PgVectorAdapterOptions): PgVectorAdapter {
  const table = opts.table ?? PG_VECTOR_TABLE

  function assertDim(vector: readonly number[]): void {
    if (vector.length !== opts.dimension) {
      throw new MemoryError(
        "ERR_DIMENSION_MISMATCH",
        `向量维度不符：实际 ${vector.length} vs 期望 ${opts.dimension}`,
      )
    }
  }

  async function capability(): Promise<ComponentHealth> {
    try {
      const ext = await opts.querier.query<{ name: string }>(
        `SELECT extname AS name FROM pg_extension WHERE extname = $1`,
        [PG_VECTOR_EXTENSION],
      )
      if (ext.length === 0) {
        return {
          component: "vector-search",
          status: "unavailable",
          detail: `pgvector 扩展未安装（table=${table}）→ 降级 fts-only`,
        }
      }
      const tbl = await opts.querier.query<{ name: string | null }>(
        `SELECT to_regclass($1)::text AS name`,
        [`public.${table}`],
      )
      if (!tbl[0]?.name) {
        return {
          component: "vector-search",
          status: "degraded",
          detail: `pgvector 已装但表 ${table} 缺失 → 需 ensureSchema()`,
        }
      }
      return { component: "vector-search", status: "ok", detail: `pgvector table=${table} dim=${opts.dimension}` }
    } catch (error) {
      return {
        component: "vector-search",
        status: "unavailable",
        detail: `pgvector 探测失败：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return {
    async ensureSchema(): Promise<{ statements: number }> {
      const ddl = pgVectorSchemaDdl(opts.dimension, table)
      for (const sql of ddl) await opts.querier.query(sql, [])
      return { statements: ddl.length }
    },

    async upsert(memoryId: string, vector: number[], model: string): Promise<void> {
      assertDim(vector)
      await opts.querier.query(
        `INSERT INTO "${table}" ("memory_id", "model", "dim", "embedding")
         VALUES ($1, $2, $3, $4::vector)
         ON CONFLICT ("memory_id") DO UPDATE
           SET "model" = EXCLUDED."model",
               "dim" = EXCLUDED."dim",
               "embedding" = EXCLUDED."embedding",
               "updated_at" = now()`,
        [memoryId, model, vector.length, pgVectorLiteral(vector)],
      )
    },

    async search(vector: number[], filter: RecallFilter, limit: number): Promise<RankedId[]> {
      assertDim(vector)
      const rows = await opts.querier.query<{ memory_id: string; score: number | string }>(
        `SELECT v."memory_id" AS memory_id, 1 - (v."embedding" <=> $1::vector) AS score
         FROM "${table}" v
         JOIN "AddMemory" m ON m."id" = v."memory_id"
         WHERE m."repositoryRef" = $2
           AND m."status"::text = ANY($3)
           AND v."model" = $4
         ORDER BY v."embedding" <=> $1::vector
         LIMIT $5`,
        [pgVectorLiteral(vector), filter.repositoryRef, [...filter.statuses], opts.model, limit],
      )
      return rows.map((r, i) => ({ memoryId: r.memory_id, rank: i + 1, score: Number(r.score) }))
    },

    async health(): Promise<ComponentHealth> {
      return capability()
    },

    capability,
  }
}
