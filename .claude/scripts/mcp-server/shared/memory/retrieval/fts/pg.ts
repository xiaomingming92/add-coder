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

/**
 * 主通道 SQL（轮 3 / Task 3.1）：`searchText` 的 tsvector 表达式索引。
 * `searchText` 由写入期以**同一 tokenization 契约**产出（jieba 主 / bigram 兜底）⇒ 读写同源。
 * 与旧实现的区别：旧 B 通道对 `topic||content` 直接 `to_tsvector('simple')`，中文整段落一个 token（等于没索引）。
 */
const MAIN_CHANNEL_SQL = `
SELECT id, ts_rank(to_tsvector('simple', "searchText"), $1::tsquery) AS score
FROM "AddMemory"
WHERE "repositoryRef" = $2
  AND "status"::text = ANY($3)
  AND ("validUntil" IS NULL OR "validUntil" > $4)
  AND ($5::text[] IS NULL OR "kind"::text = ANY($5))
  AND to_tsvector('simple', "searchText") @@ $1::tsquery
ORDER BY score DESC
LIMIT $6
`

/**
 * 由查询串构造 tsquery：token 用**引号包裹 + OR** 连接（召回优先），并剥离会破坏 tsquery 语法的字符。
 * 返回 null 表示该查询无法构造有效 tsquery（如纯符号）→ 主通道跳过，由补充通道兜底。
 */
function buildTsquery(query: string): string | null {
  const safe = extractQueryTerms(query)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((t) => t.length > 0)
  if (safe.length === 0) return null
  return safe.map((t) => `'${t}'`).join(" | ")
}

/** 补充通道 A：pg_trgm 相似度（子串/模糊召回；不再是基线） */
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
    id: "pg-bigram-fts",
    async search(query, filter, limit) {
      const channels = await this.searchChannels(query, filter, limit)
      // 主通道可能因"查询无有效 token"为空（如纯符号）→ 返回首个非空通道，避免整条检索空手而归
      return channels.find((c) => c.length > 0) ?? []
    },
    async searchChannels(query, filter, limit) {
      // 主通道：searchText 的 tsvector（读写同源）
      let main: RankedId[] = []
      const tsquery = buildTsquery(query)
      if (tsquery) {
        try {
          const rows = await q.query<{ id: string; score: number | string }>(MAIN_CHANNEL_SQL, [
            tsquery,
            filter.repositoryRef,
            [...filter.statuses],
            filter.now,
            filter.kinds && filter.kinds.length > 0 ? [...filter.kinds] : null,
            limit,
          ])
          main = rows.map((r, i) => ({ memoryId: r.id, rank: i + 1, score: Number(r.score) }))
        } catch {
          // 主通道异常（索引缺失 / tsquery 非法）不阻断补充通道；健康度由 health() 显式上报
          main = []
        }
      }
      // 补充通道 A：pg_trgm（子串/模糊）
      const a = await runChannel(q, CHANNEL_A_SQL, query, filter, limit)
      let c: RankedId[] = []
      const cc = channelC(query, filter, limit)
      if (cc) {
        const rows = await q.query<{ id: string; score: number | string }>(cc.sql, cc.params)
        c = rows.map((r, i) => ({ memoryId: r.id, rank: i + 1, score: Number(r.score) }))
      }
      return [main, a, c]
    },
    async health(): Promise<ComponentHealth> {
      try {
        // 轮 3 / Task 3.1 新判定：**主通道**（searchText 列 + 表达式索引）才决定是否 degraded；
        // 补充通道（pg_trgm）缺失只影响子串/模糊召回，不再整体降级。
        const col = await q.query<{ count: number | string }>(
          "SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_name = 'AddMemory' AND column_name = 'searchText'", [])
        if (Number(col[0]?.count ?? 0) < 1) {
          return { component: "pg-fts", status: "degraded", detail: "AddMemory.searchText 列缺失（迁移未应用）" }
        }
        const mainIdx = await q.query<{ count: number | string }>(
          "SELECT COUNT(*)::int AS count FROM pg_indexes WHERE tablename = 'AddMemory' AND indexname = 'AddMemory_searchText_tsv_idx'", [])
        if (Number(mainIdx[0]?.count ?? 0) < 1) {
          return { component: "pg-fts", status: "degraded", detail: "主通道表达式索引缺失（AddMemory_searchText_tsv_idx），需 reindex" }
        }
        const trgm = await q.query<{ count: number | string }>(
          "SELECT COUNT(*)::int AS count FROM pg_indexes WHERE tablename = 'AddMemory' AND indexname LIKE '%trgm%'", [])
        if (Number(trgm[0]?.count ?? 0) < 2) {
          return { component: "pg-fts", status: "ok", detail: "补充通道（pg_trgm）索引缺失：子串/模糊召回受限，主通道正常" }
        }
        return { component: "pg-fts", status: "ok" }
      } catch (e) {
        return { component: "pg-fts", status: "unavailable", detail: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}
