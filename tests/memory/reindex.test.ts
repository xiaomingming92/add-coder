/*
 * 轮 2 契约测试：reindex 双后端探测与重建（Spec §5 §Reindex）
 *
 * 覆盖验收项：
 *  - 探测明确列出缺失对象（PG：pg_trgm + 3 个 GIN 索引；SQLite：FTS5 表 + 3 个触发器）
 *  - 重建可重放：首次补齐缺失对象，第二次为 no-op（rebuilt=[] 且 missing=[]）
 *  - 后端识别：postgres:// / postgresql:// / file: / .db
 *  - DDL 幂等性：全部 IF NOT EXISTS
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  PG_FTS_OBJECTS,
  SQLITE_FTS_OBJECTS,
  applyObjects,
  detectBackend,
  objectsFor,
  probeFts,
  reindex,
  renderSqliteFtsSql,
  resolveFtsObjects,
} from "../../scripts/memory/reindex.js"
import type { RawQuerier } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

/** 可变对象目录的假后端：解析 DDL 中的对象名，模拟「执行即创建」 */
function fakeBackend(initialNames: string[], backend: "postgres" | "sqlite") {
  const present = new Set(initialNames)
  const executed: string[] = []
  const querier: RawQuerier = {
    query: <T>(sql: string): Promise<T[]> => {
      executed.push(sql)
      if (backend === "postgres") {
        if (/pg_indexes|pg_extension/.test(sql)) {
          return Promise.resolve([...present].map((name) => ({ name })) as T[])
        }
      } else if (/sqlite_master/.test(sql)) {
        return Promise.resolve([...present].map((name) => ({ name })) as T[])
      }
      // DDL：从语句中解析出创建的对象名并加入目录
      const m =
        sql.match(/CREATE (?:VIRTUAL TABLE|TABLE|INDEX|TRIGGER|EXTENSION) IF NOT EXISTS "?([A-Za-z_][\w]*)"?/i)
      if (m) present.add(m[1])
      return Promise.resolve([] as T[])
    },
  }
  return { querier, present, executed }
}

describe("detectBackend 后端识别", () => {
  it("识别 postgres 与 sqlite，其余报错", () => {
    expect(detectBackend("postgresql://u:p@localhost:5434/db")).toBe("postgres")
    expect(detectBackend("postgres://u:p@localhost:5432/db")).toBe("postgres")
    expect(detectBackend("file:./local.db")).toBe("sqlite")
    expect(detectBackend("sqlite:./memory.sqlite")).toBe("sqlite")
    expect(() => detectBackend("mysql://x")).toThrow(/无法识别/)
  })

  it("对象清单按后端区分，且 DDL 全部 IF NOT EXISTS（可重放前提）", () => {
    // 2026-09-21（Plan Task 2.1）：PG 主通道新增 searchText 表达式索引 → 5 个对象
    expect(PG_FTS_OBJECTS).toHaveLength(5)
    expect(PG_FTS_OBJECTS.map((s) => s.name)).toContain("AddMemory_searchText_tsv_idx")
    expect(SQLITE_FTS_OBJECTS).toHaveLength(4)
    for (const spec of [...PG_FTS_OBJECTS, ...SQLITE_FTS_OBJECTS]) {
      expect(spec.ddl).toMatch(/IF NOT EXISTS/i)
    }
    expect(objectsFor("postgres").some((s) => s.kind === "extension")).toBe(true)
    expect(objectsFor("sqlite").some((s) => s.kind === "trigger")).toBe(true)
  })
})

describe("probeFts 探测", () => {
  it("PG：只列出真正缺失的对象并给出完成度", async () => {
    const { querier } = fakeBackend(
      [
        "pg_trgm",
        "AddMemory_searchText_tsv_idx",
        "AddMemory_topic_trgm_idx",
        "AddMemory_content_trgm_idx",
      ],
      "postgres",
    )
    const report = await probeFts(querier, "postgres")
    expect(report.backend).toBe("postgres")
    expect(report.missing).toEqual(["AddMemoryEvidence_excerpt_trgm_idx"])
    expect(report.present).toBe(4)
    expect(report.total).toBe(5)
    expect(report.progress).toBe(80)
    expect(report.rebuilt).toEqual([])
  })

  it("SQLite：空库 → 四个对象全缺失", async () => {
    const { querier } = fakeBackend([], "sqlite")
    const report = await probeFts(querier, "sqlite")
    expect(report.missing).toEqual([
      "add_memory_fts", "add_memory_fts_ai", "add_memory_fts_au", "add_memory_fts_ad",
    ])
    expect(report.progress).toBe(0)
  })
})

describe("reindex 重建与可重放", () => {
  it("PG：补齐缺失索引后复探为健康，rebuilt 记录实际执行对象", async () => {
    const { querier, present } = fakeBackend(["pg_trgm"], "postgres")
    const report = await reindex(querier, "postgres")
    expect(report.missing).toEqual([])
    expect(report.rebuilt).toEqual([
      "AddMemory_searchText_tsv_idx",
      "AddMemory_topic_trgm_idx",
      "AddMemory_content_trgm_idx",
      "AddMemoryEvidence_excerpt_trgm_idx",
    ])
    expect(report.progress).toBe(100)
    expect(present.size).toBe(5)
  })

  it("SQLite：首次重建全部对象，第二次执行为 no-op（可重放）", async () => {
    const { querier, executed } = fakeBackend([], "sqlite")
    const first = await reindex(querier, "sqlite")
    expect(first.rebuilt).toHaveLength(4)
    expect(first.missing).toEqual([])

    const ddlCountAfterFirst = executed.filter((s) => /^CREATE/i.test(s)).length
    const second = await reindex(querier, "sqlite")
    expect(second.rebuilt).toEqual([])
    expect(second.missing).toEqual([])
    expect(second.progress).toBe(100)
    expect(executed.filter((s) => /^CREATE/i.test(s)).length).toBe(ddlCountAfterFirst)
  })

  it("健康库上直接重建：不产生任何 DDL", async () => {
    const names = ["pg_trgm", ...PG_FTS_OBJECTS.filter((s) => s.kind === "index").map((s) => s.name)]
    const { querier, executed } = fakeBackend(names, "postgres")
    const report = await reindex(querier, "postgres")
    expect(report.rebuilt).toEqual([])
    expect(report.progress).toBe(100)
    expect(executed.filter((s) => /^CREATE/i.test(s))).toHaveLength(0)
  })
})

/*
 * 单一真源防漂移（Plan Task 1.1/1.2 / Spec §1）：
 * `retrieval/fts/sqlite-fts5.sql` 是**生成物**，真源为 SQLITE_FTS_OBJECTS。
 * 该用例把"两份拷贝"钉成"一份真源 + 生成物"——手工改 .sql 会让本条失败。
 */
describe("sqlite-fts5.sql 由真源生成（防双源漂移）", () => {
  const sqlPath = resolve(
    import.meta.dirname,
    "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql",
  )

  it("committed .sql 与 renderSqliteFtsSql() 逐字一致", () => {
    expect(readFileSync(sqlPath, "utf-8")).toBe(renderSqliteFtsSql())
  })

  it("生成物包含全部 SQLite 期望态对象（表 + 3 触发器）", () => {
    const sql = renderSqliteFtsSql()
    for (const spec of SQLITE_FTS_OBJECTS) expect(sql).toContain(spec.name)
  })

  it("applyObjects 只对缺失对象执行 DDL，且返回 missing/applied", async () => {
    const executed: string[] = []
    const existing = new Set(["add_memory_fts"]) // 表已在，触发器缺
    const r = await applyObjects("sqlite", async (ddl) => { executed.push(ddl) }, existing)
    expect(r.missing).toEqual(["add_memory_fts_ai", "add_memory_fts_au", "add_memory_fts_ad"])
    expect(r.applied).toEqual(r.missing)
    expect(executed).toHaveLength(3)
    expect(executed.every((s) => /IF NOT EXISTS/.test(s))).toBe(true)
  })

  it("resolveFtsObjects 与兼容别名 objectsFor 同一实现", () => {
    expect(objectsFor).toBe(resolveFtsObjects)
    expect(resolveFtsObjects("sqlite")).toBe(SQLITE_FTS_OBJECTS)
    expect(resolveFtsObjects("postgres")).toBe(PG_FTS_OBJECTS)
  })
})
