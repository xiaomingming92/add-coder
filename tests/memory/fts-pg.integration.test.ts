/*
 * PG 主通道集成用例 — Plan 轮 3 / Task 3.5
 *
 * 覆盖（真实 PG，非内存替身）：
 *   ① 新主通道可用：`to_tsvector('simple', "searchText")` 命中 **2 字中文查询**（旧 trigram 窗口=3 字必然失败）；
 *   ② health() 按主通道判定（列 + 表达式索引齐 → ok）；
 *   ③ 语料在**事务内**灌入并回滚，不污染库（可重复执行）。
 *
 * 无 `DATABASE_URL` 时整组跳过（CI 无库不报红，但也不假装通过）——本仓库单测的既有惯例。
 */
import { describe, expect, it } from "vitest"
import { createPgFtsAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/pg.js"
import { expandForIndexWithMethod } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/cjk-segmenter.js"
import type { RawQuerier, RecallFilter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

const DATABASE_URL = process.env.DATABASE_URL
const maybe = DATABASE_URL ? describe : describe.skip

const FILTER: RecallFilter = {
  repositoryRef: "eval-repo",
  statuses: ["ACTIVE"],
  now: new Date(),
}

maybe("PG 主通道集成（真实库 · 事务内 · 回滚）", () => {
  it("2 字中文查询可命中（bigram/jieba token 化 + searchText 表达式索引）", async () => {
    const { Client } = await import("pg")
    const client = new Client({ connectionString: DATABASE_URL })
    await client.connect()
    try {
      await client.query("BEGIN")
      const content = "新增端口需要先在端口契约里登记，再改 .env"
      const searchText = expandForIndexWithMethod(`端口契约 ${content}`).text
      await client.query(
        `INSERT INTO "AddMemory" (id, kind, status, topic, content, "searchText", "scopeType", "scopeValue",
           "repositoryRef", importance, confidence, "contentHash", "updatedAt")
         VALUES ('it-pg-01','CONVENTION','ACTIVE','端口契约',$1,$2,'REPOSITORY','eval-repo','eval-repo',0.5,0.5,'hash-it',NOW())
         ON CONFLICT (id) DO UPDATE SET "searchText" = EXCLUDED."searchText"`,
        [content, searchText],
      )

      const querier: RawQuerier = {
        query: async <T,>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows as T[],
      }
      const adapter = createPgFtsAdapter(querier)

      const health = await adapter.health()
      expect(health.status).toBe("ok")

      const hits = await adapter.search("端口", FILTER, 5)
      expect(hits.map((h) => h.memoryId)).toContain("it-pg-01")
    } finally {
      await client.query("ROLLBACK")
      await client.end()
    }
  })
})
