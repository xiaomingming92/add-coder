/*
 * SQLite FTS5 bigram/trigram migration 可重放测试（tasks.md Task 1.2.4/1.2.5）
 * 证据锚定 checklist §二：全新 SQLite 库 migration dry-run + 触发器同步 + CJK 检索
 */
import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expandForIndex } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/cjk-tokenize.js"

const SQL = readFileSync(
  join(__dirname, "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql"),
  "utf-8",
)

function createBase(db: DatabaseSync) {
  // SQLite 目标下枚举以 TEXT 存储（Prisma 不支持 SQLite 枚举，既有模式）
  db.exec(`CREATE TABLE "AddMemory" (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CANDIDATE',
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    searchText TEXT NOT NULL DEFAULT '',
    scopeType TEXT NOT NULL,
    scopeValue TEXT NOT NULL,
    repositoryRef TEXT NOT NULL
  )`)
}

describe("sqlite-fts5 migration", () => {
  it("可重复应用（IF NOT EXISTS 幂等）", () => {
    const db = new DatabaseSync(":memory:")
    createBase(db)
    db.exec(SQL)
    db.exec(SQL) // 重放不报错
    const t = db.prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','trigger') AND name LIKE 'add_memory_fts%' ORDER BY 1",
    ).all() as { name: string }[]
    const names = t.map((r) => r.name)
    expect(names).toContain("add_memory_fts")
    expect(names).toContain("add_memory_fts_ai")
    expect(names).toContain("add_memory_fts_au")
    expect(names).toContain("add_memory_fts_ad")
  })

  it("触发器同步：INSERT/UPDATE/DELETE 均反映到 FTS 表", () => {
    const db = new DatabaseSync(":memory:")
    createBase(db)
    db.exec(SQL)
    const ins = db.prepare(
      "INSERT INTO \"AddMemory\" (id, kind, topic, content, searchText, scopeType, scopeValue, repositoryRef) VALUES (?,?,?,?,?,?,?,?)",
    )
    ins.run(
      "m1", "LESSON", "迁移教训", "涉及 Prisma migration 的多个 Plan 重复失败",
      expandForIndex("迁移教训 涉及 Prisma migration 的多个 Plan 重复失败"),
      "REPOSITORY", "r1", "r1",
    )

    // bigram 契约：token 化后按空格切分，"重复/复失/失败" 均为独立 token → 用单 token 命中
    let hit = db.prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?").all('"失败"')
    expect(hit).toHaveLength(1)

    db.prepare("UPDATE \"AddMemory\" SET content=?, searchText=? WHERE id=?").run(
      "完全无关的内容替换掉了",
      expandForIndex("完全无关的内容替换掉了"),
      "m1",
    )
    hit = db.prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?").all('"失败"')
    expect(hit).toHaveLength(0)

    db.prepare("DELETE FROM \"AddMemory\" WHERE id=?").run("m1")
    const all = db.prepare("SELECT memory_id FROM add_memory_fts").all()
    expect(all).toHaveLength(0)
  })

  it("CJK 与拉丁混合查询均可命中（bigram 分词 FTS；2 字查询也能命中）", () => {
    const db = new DatabaseSync(":memory:")
    createBase(db)
    db.exec(SQL)
    // 写入期产出 searchText（与查询侧同一 tokenization 契约）；此处直接用真源展开
    const searchText = expandForIndex("双后端差异 SQLite 与 PostgreSQL 的 migration 行为差异处重复失败")
    db.prepare(
      "INSERT INTO \"AddMemory\" (id, kind, topic, content, searchText, scopeType, scopeValue, repositoryRef) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      "m2", "PITFALL", "双后端差异", "SQLite 与 PostgreSQL 的 migration 行为差异处重复失败",
      searchText, "REPOSITORY", "r1", "r1",
    )
    expect(db.prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?").all("migration")).toHaveLength(1)
    // bigram 契约：2 字查询是**索引化 token**，直接命中（旧 trigram 窗口=3 字时这里必然 0 命中）
    expect(db.prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?").all('"差异"')).toHaveLength(1)
    expect(db.prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?").all('"行为"')).toHaveLength(1)
  })
})
