/*
 * sqlite-vec 向量检索适配器（Plan §3.4 轮 3 Task 3.2 / Spec §6 §VectorCapability）
 *
 * ⚠️ 平台说明（诚实登记）：sqlite-vec 是原生扩展，**本仓库当前环境未安装**，因此本文件的
 * SQL 路径只在扩展存在时才被执行（capability 探测先行）。DDL 与函数名集中在文件顶部常量，
 * 便于在具备扩展的环境上校正；未安装时 `capability()` 返回 unavailable，召回走 fts-only。
 *
 * 与 pgvector 适配器同契约：能力检测 → 幂等 ensureSchema → 维度校验 → upsert/search。
 */
import type { ComponentHealth, RankedId, RecallFilter, RawQuerier } from "../types.js"
import { MemoryError } from "../../domain/errors.js"
import type { VectorSearchAdapter } from "../../embedding/index.js"

export const SQLITE_VEC_TABLE = "add_memory_vector"
/** 能力探测：vec0 模块是否注册（只读） */
export const SQLITE_VEC_CAPABILITY_SQL = `SELECT 1 AS ok FROM pragma_module_list WHERE name = 'vec0'`
/** 距离函数（余弦距离，越小越近） */
export const SQLITE_VEC_DISTANCE_FN = "vec_distance_cosine"

export function sqliteVecSchemaDdl(dimension: number, table = SQLITE_VEC_TABLE): string[] {
  if (!Number.isFinite(dimension) || dimension <= 0) {
    throw new MemoryError("ERR_DIMENSION_MISMATCH", `非法向量维度：${dimension}`)
  }
  return [
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING vec0(memory_id text primary key, embedding float[${dimension}]);`,
    `CREATE TABLE IF NOT EXISTS ${table}_meta (memory_id text PRIMARY KEY, model text NOT NULL, dim integer NOT NULL, updated_at text NOT NULL DEFAULT (datetime('now')));`,
  ]
}

export interface SqliteVecAdapterOptions {
  querier: RawQuerier
  dimension: number
  model: string
  table?: string
}

export interface SqliteVecAdapter extends VectorSearchAdapter {
  capability(): Promise<ComponentHealth>
  ensureSchema(): Promise<{ statements: number }>
}

export function createSqliteVecAdapter(opts: SqliteVecAdapterOptions): SqliteVecAdapter {
  const table = opts.table ?? SQLITE_VEC_TABLE

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
      const rows = await opts.querier.query<{ ok: number }>(SQLITE_VEC_CAPABILITY_SQL, [])
      if (rows.length === 0) {
        return {
          component: "vector-search",
          status: "unavailable",
          detail: "sqlite-vec(vec0) 未安装 → 降级 fts-only",
        }
      }
      return { component: "vector-search", status: "ok", detail: `sqlite-vec table=${table} dim=${opts.dimension}` }
    } catch (error) {
      return {
        component: "vector-search",
        status: "unavailable",
        detail: `sqlite-vec 探测失败：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return {
    async ensureSchema(): Promise<{ statements: number }> {
      const ddl = sqliteVecSchemaDdl(opts.dimension, table)
      for (const sql of ddl) await opts.querier.query(sql, [])
      return { statements: ddl.length }
    },

    async upsert(memoryId: string, vector: number[], model: string): Promise<void> {
      assertDim(vector)
      // vec_f32 接受 JSON 文本形式；绑定为字符串参数
      await opts.querier.query(
        `INSERT INTO ${table}(memory_id, embedding) VALUES (?, vec_f32(?))
         ON CONFLICT(memory_id) DO UPDATE SET embedding = vec_f32(?)`,
        [memoryId, JSON.stringify(vector), JSON.stringify(vector)],
      )
      await opts.querier.query(
        `INSERT INTO ${table}_meta(memory_id, model, dim) VALUES (?, ?, ?)
         ON CONFLICT(memory_id) DO UPDATE SET model = excluded.model, dim = excluded.dim`,
        [memoryId, model, vector.length],
      )
    },

    async search(vector: number[], filter: RecallFilter, limit: number): Promise<RankedId[]> {
      assertDim(vector)
      const rows = await opts.querier.query<{ memory_id: string; distance: number | string }>(
        `SELECT v.memory_id AS memory_id, ${SQLITE_VEC_DISTANCE_FN}(v.embedding, vec_f32(?)) AS distance
         FROM ${table} v
         JOIN ${table}_meta meta ON meta.memory_id = v.memory_id
         JOIN "AddMemory" m ON m.id = v.memory_id
         WHERE m.repositoryRef = ?
           AND meta.model = ?
         ORDER BY distance ASC
         LIMIT ?`,
        [JSON.stringify(vector), filter.repositoryRef, opts.model, limit],
      )
      return rows.map((r, i) => ({ memoryId: r.memory_id, rank: i + 1, score: 1 - Number(r.distance) }))
    },

    async health(): Promise<ComponentHealth> {
      return capability()
    },

    capability,
  }
}
