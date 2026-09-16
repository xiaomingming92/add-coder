/*
 * gen-sqlite-fts-sql.ts — 从唯一真源生成 `retrieval/fts/sqlite-fts5.sql`
 *
 * 真源：`scripts/memory/reindex.ts` 的 `SQLITE_FTS_OBJECTS`（经 `renderSqliteFtsSql()` 渲染）。
 * 目的：消除"TS 常量与 .sql 文件各写一份"的双源漂移（ADD-12）——
 *       .sql 仍随包分发、可被 `prisma db execute --file` 与人工直接使用，但它是**生成物**。
 *
 * 用法：npx tsx scripts/memory/gen-sqlite-fts-sql.ts [--check]
 *   （--check：只比对不写入，供 CI/收尾巡检；不一致则以非零码退出）
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderSqliteFtsSql } from "./reindex.js"

const ROOT = resolve(import.meta.dirname, "../..")
const TARGET = resolve(
  ROOT,
  "templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql",
)

const rendered = renderSqliteFtsSql()
const checkOnly = process.argv.includes("--check")

if (checkOnly) {
  const current = readFileSync(TARGET, "utf-8")
  if (current !== rendered) {
    console.error(`✗ ${TARGET} 与真源不一致——请重跑 gen-sqlite-fts-sql.ts`)
    process.exit(1)
  }
  console.log("✅ sqlite-fts5.sql 与真源一致")
} else {
  writeFileSync(TARGET, rendered, "utf-8")
  console.log(`✅ 已生成 ${TARGET.replace(ROOT + "/", "")}`)
}
