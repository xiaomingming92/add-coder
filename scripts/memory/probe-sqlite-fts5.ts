import { DatabaseSync } from "node:sqlite"

const db = new DatabaseSync(":memory:")
try {
  db.exec("CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram')")
  db.exec("INSERT INTO t(x) VALUES('涉及 Prisma migration 的多个 Plan 重复失败')")
  const r1 = db.prepare("SELECT rowid FROM t WHERE t MATCH ?").all("migration")
  const r2 = db.prepare("SELECT rowid FROM t WHERE t MATCH ?").all('"重复失败"')
  const r3 = db.prepare("SELECT rowid FROM t WHERE t MATCH ?").all('"重复"')
  console.log("trigram OK | latin:", r1.length, "| cjk-4:", r2.length, "| cjk-2(short):", r3.length)
} catch (e) {
  console.log("trigram unavailable:", (e as Error).message)
}
console.log("sqlite version:", (db.prepare("SELECT sqlite_version() v").get() as { v: string }).v)
