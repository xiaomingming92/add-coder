/*
 * PostgreSQL FTS 适配器（Plan §8.2，§17-3 定案：pg_trgm 支持 CJK）
 *
 * 双通道候选（RRF 融合用）：
 *  - 通道 A：pg_trgm similarity（`%` 操作符 + similarity() 排序）
 *  - 通道 B：websearch_to_tsquery('simple') 全文匹配（拉丁词强、CJK 弱，作为补充信号）
 * 短查询（<3 字符）pg_trgm 命中率低 → ILIKE 兜底（Plan §17-3 衍生意图一致）
 *
 * 降级：扩展/索引缺失 → health() 报 degraded，调用方切换受限结构化查询。
 */
import type { LexicalSearchAdapter, RankedId, RecallFilter, RawQuerier, ComponentHealth } from "../types.js"
import { extractQueryTerms } from "../query-terms.js"

/**
 * 通道 C：词项重叠计分（拉丁词 + CJK 二元组的 ILIKE 命中比例）
 * 弥补 trigram 子串语义对释义查询的召回不足（如 "新端口怎么申请" → 命中 "新增端口"）
 */
function channelC(query: string, filter: RecallFilter, limit: number): { sql: string; params: unknown[] } | null {
  const terms = extractQueryTerms(query)
  if (terms.length === 0) return null
  // 参数布局：$1 repo, $2 statuses, $3 now, $4 kinds, $5..$(4+n) terms, $(5+n) limit
  const expr = terms
    .map((_, i) => `CASE WHEN topic ILIKE '%' || $${5 + i} || '%' OR content ILIKE '%' || $${5 + i} || '%' THEN 1 ELSE 0 END`)
    .join(" + ")
  const sql = `
SELECT * FROM (
  SELECT id, (${expr})::float / ${terms.length} AS score
  FROM "AddMemory"
  WHERE "repositoryRef" = $1
    AND "status"::text = ANY($2)
    AND ("validUntil" IS NULL OR "validUntil" > $3)
    AND ($4::text[] IS NULL OR "kind"::text = ANY($4))
) t WHERE score > 0
ORDER BY score DESC
LIMIT $${5 + terms.length}
`
  return {
    sql,
    params: [filter.repositoryRef, [...filter.statuses], filter.now,
      filter.kinds && filter.kinds.length > 0 ? [...filter.kinds] : null,
      ...terms, limit],
  }
}

const CHANNEL_A_SQL = `
SELECT id,
       GREATEST(
         similarity(topic || ' ' || content, $1),
         CASE WHEN topic ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%' THEN 0.01 ELSE 0 END
       ) AS score
FROM "AddMemory"
WHERE "repositoryRef" = $2
  AND "status"::text = ANY($3)
  AND ("validUntil" IS NULL OR "validUntil" > $4)
  AND ($5::text[] IS NULL OR "kind"::text = ANY($5))
  AND (topic % $1 OR content % $1
       OR topic ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%')
ORDER BY score DESC
LIMIT $6
`

const CHANNEL_B_SQL = `
SELECT id, ts_rank(to_tsvector('simple', topic || ' ' || content), websearch_to_tsquery('simple', $1)) AS score
FROM "AddMemory"
WHERE "repositoryRef" = $2
  AND "status"::text = ANY($3)
  AND ("validUntil" IS NULL OR "validUntil" > $4)
  AND ($5::text[] IS NULL OR "kind"::text = ANY($5))
  AND to_tsvector('simple', topic || ' ' || content) @@ websearch_to_tsquery('simple', $1)
ORDER BY score DESC
LIMIT $6
`

function params(query: string, filter: RecallFilter, limit: number): unknown[] {
  return [
    query,
    filter.repositoryRef,
    [...filter.statuses],
    filter.now,
    filter.kinds && filter.kinds.length > 0 ? [...filter.kinds] : null,
    limit,
  ]
}

async function runChannel(
  q: RawQuerier,
  sql: string,
  query: string,
  filter: RecallFilter,
  limit: number,
): Promise<RankedId[]> {
  const rows = await q.query<{ id: string; score: number | string }>(sql, params(query, filter, limit))
  return rows.map((r, i) => ({ memoryId: r.id, rank: i + 1, score: Number(r.score) }))
}

export function createPgFtsAdapter(q: RawQuerier): LexicalSearchAdapter & {
  searchChannels(query: string, filter: RecallFilter, limit: number): Promise<RankedId[][]>
} {
  return {
    id: "pg-trgm",
    async search(query, filter, limit) {
      const channels = await this.searchChannels(query, filter, limit)
      return channels[0] ?? []
    },
    async searchChannels(query, filter, limit) {
      const a = await runChannel(q, CHANNEL_A_SQL, query, filter, limit)
      let b: RankedId[] = []
      try {
        b = await runChannel(q, CHANNEL_B_SQL, query, filter, limit)
      } catch {
        // tsquery 通道失败（如查询含特殊字符）不阻断主通道
      }
      let c: RankedId[] = []
      const cc = channelC(query, filter, limit)
      if (cc) {
        const rows = await q.query<{ id: string; score: number | string }>(cc.sql, cc.params)
        c = rows.map((r, i) => ({ memoryId: r.id, rank: i + 1, score: Number(r.score) }))
      }
      return [a, b, c]
    },
    async health(): Promise<ComponentHealth> {
      try {
        const ext = await q.query<{ count: number | string }>(
          "SELECT COUNT(*)::int AS count FROM pg_extension WHERE extname = 'pg_trgm'", [])
        if (Number(ext[0]?.count ?? 0) < 1) {
          return { component: "pg-fts", status: "degraded", detail: "pg_trgm 扩展缺失" }
        }
        const idx = await q.query<{ count: number | string }>(
          "SELECT COUNT(*)::int AS count FROM pg_indexes WHERE tablename = 'AddMemory' AND indexname LIKE '%trgm%'", [])
        if (Number(idx[0]?.count ?? 0) < 2) {
          return { component: "pg-fts", status: "degraded", detail: "trgm GIN 索引缺失，需 reindex" }
        }
        return { component: "pg-fts", status: "ok" }
      } catch (e) {
        return { component: "pg-fts", status: "unavailable", detail: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}
