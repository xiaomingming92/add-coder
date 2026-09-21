/*
 * SQLite FTS5 适配器（Plan §8.3，trigram 分词器，schema 见同目录 sqlite-fts5.sql）
 *
 * trigram 限制：查询词 <3 字符无法产生匹配 → 由 LIKE 通道兜底。
 * 双通道候选：A = FTS5 MATCH + bm25 排序；B = 词项重叠 LIKE 计分（覆盖短查询与释义查询）。
 */
import type { LexicalSearchAdapter, RankedId, RecallFilter, RawQuerier, ComponentHealth } from "../types.js"
import { extractQueryTerms } from "../query-terms.js"

/** 通道 B：词项重叠计分（拉丁词 + CJK 二元组的 LIKE 命中比例），覆盖短查询与释义查询 */
function channelB(query: string, filter: RecallFilter, limit: number): { sql: string; params: unknown[] } | null {
  const terms = extractQueryTerms(query)
  if (terms.length === 0) return null
  const expr = terms
    .map(() => `CASE WHEN topic LIKE '%' || ? || '%' OR content LIKE '%' || ? || '%' THEN 1 ELSE 0 END`)
    .join(" + ")
  const statuses = filter.statuses.map((s) => `'${s}'`).join(",")
  const kinds = filter.kinds && filter.kinds.length > 0
    ? `kind IN (${filter.kinds.map((k) => `'${k}'`).join(",")})`
    : "1=1"
  const sql = `
SELECT * FROM (
  SELECT id, (${expr}) * 1.0 / ${terms.length} AS score
  FROM "AddMemory"
  WHERE repositoryRef = ?
    AND status IN (${statuses})
    AND (validUntil IS NULL OR validUntil > ?)
    AND (${kinds})
) WHERE score > 0
ORDER BY score DESC
LIMIT ?
`
  const termParams = terms.flatMap((t) => [t, t])
  return { sql, params: [...termParams, filter.repositoryRef, filter.now.toISOString(), limit] }
}

/**
 * 构造 FTS5 MATCH 串（轮 3 / Task 3.2）。
 *
 * 变更理由：虚表已从 `topic/content + trigram` 改为 **`searchText` + unicode61**（写入期 token 串），
 * 因此查询侧不再需要"≥3 字符片段"这种 trigram 窗口补偿——直接把查询用**同一 tokenization 契约**
 * 展开成 token，逐 token 加引号后 `OR` 连接即可（1-2 字中文 token 天然可命中）。
 */
export function buildMatchQuery(raw: string): string | null {
  const tokens = extractQueryTerms(raw)
    .map((t) => t.replace(/"/g, ""))
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t}"`).join(" OR ")
}

/** @deprecated 旧名（trigram 时代）；等价于 `buildMatchQuery`，保留仅为兼容外部导入 */
export const buildTrigramQuery = buildMatchQuery

const CHANNEL_A_SQL = `
SELECT m.id AS id, bm25(add_memory_fts) AS score
FROM add_memory_fts f
JOIN "AddMemory" m ON m.id = f.memory_id
WHERE add_memory_fts MATCH ?
  AND m.repositoryRef = ?
  AND m.status IN (STATUS_PLACEHOLDER)
  AND (m.validUntil IS NULL OR m.validUntil > ?)
  AND (KIND_PLACEHOLDER)
ORDER BY score
LIMIT ?
`

function buildSql(template: string, filter: RecallFilter): string {
  const statuses = filter.statuses.map((s) => `'${s}'`).join(",")
  const kinds = filter.kinds && filter.kinds.length > 0
    ? `m.kind IN (${filter.kinds.map((k) => `'${k}'`).join(",")})`
    : "1=1"
  return template
    .replace("STATUS_PLACEHOLDER", statuses)
    .replace("KIND_PLACEHOLDER", kinds)
}

export function createSqliteFtsAdapter(q: RawQuerier): LexicalSearchAdapter & {
  searchChannels(query: string, filter: RecallFilter, limit: number): Promise<RankedId[][]>
} {
  return {
    id: "sqlite-fts5",
    async search(query, filter, limit) {
      const channels = await this.searchChannels(query, filter, limit)
      return channels[0] ?? []
    },
    async searchChannels(query, filter, limit) {
      let a: RankedId[] = []
      const matchQ = buildMatchQuery(query)
      if (matchQ) {
        const rows = await q.query<{ id: string; score: number }>(
          buildSql(CHANNEL_A_SQL, filter), [matchQ, filter.repositoryRef, filter.now.toISOString(), limit],
        )
        a = rows.map((r, i) => ({ memoryId: r.id, rank: i + 1, score: -Number(r.score) }))
      }
      let b: RankedId[] = []
      const cb = channelB(query, filter, limit)
      if (cb) {
        const rowsB = await q.query<{ id: string; score: number }>(cb.sql, cb.params)
        b = rowsB.map((r, i) => ({ memoryId: r.id, rank: i + 1, score: Number(r.score) }))
      }
      return [a, b]
    },
    async health(): Promise<ComponentHealth> {
      try {
        const rows = await q.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'add_memory_fts'", [])
        if (rows.length < 1) {
          return { component: "sqlite-fts", status: "unavailable", detail: "add_memory_fts 虚表缺失，需执行 sqlite-fts5.sql" }
        }
        // 轮 3 / Task 3.2：虚表列必须是 searchText（unicode61 口径）；否则是旧库未升级
        const cols = await q.query<{ name: string }>("PRAGMA table_info(add_memory_fts)", [])
        const hasSearchText = cols.some((c) => c.name === "searchText")
        if (!hasSearchText) {
          return { component: "sqlite-fts", status: "degraded", detail: "FTS 虚表仍是旧列（topic/content），需执行 sqlite-fts5.sql 重建" }
        }
        return { component: "sqlite-fts", status: "ok" }
      } catch (e) {
        return { component: "sqlite-fts", status: "unavailable", detail: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}
