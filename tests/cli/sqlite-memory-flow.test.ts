/*
 * SQLite 记忆期望态闭环用例 — Plan Task 1.4 / Spec §2
 *
 * 背景（缺陷本体）：`init --engine sqlite` 只跑 `prisma db push`（Prisma 表），
 * `add_memory_fts` 虚表 + 3 个同步触发器是**原生 DDL**（Prisma schema 表达不了），
 * 此前**没有任何入口创建** → 新项目 recall_memory 直接 `no such table`。
 *
 * 覆盖验收项：
 *  - 库层入口（init 唯一消费点）应用期望态后，对象在**真实 sqlite 引擎**上存在；
 *  - 重复应用幂等：不报错、对象不重复、目录不变；
 *  - 应用后**立即可用**：写入 AddMemory 即可被 FTS5 检索（"开箱可用"≠"对象存在"）；
 *  - 接线守卫：init 的 sqlite 分支与 db-ensure.sh 的 sqlite 分支都消费同一期望态
 *    （本 Plan 的缺陷正是"无人接线"，缺少该守卫则接线被删用例仍然全绿）；
 *  - 真源一致性：库层给出的相对路径 = 模板仓库中的真源文件路径（sync 落位即被消费）。
 *
 * 为什么不起 prisma 真进程：`npm exec prisma -- db execute` 需要解析/下载查询引擎
 * （联网 + 分钟级），会把用例变成环境依赖且不稳定。这里注入的 `run` 只消费 `--file`
 * 参数、用 node:sqlite **真执行该 SQL 文件**；prisma 的 argv 契约（`--file` / `--schema`）
 * 仍被断言，SQL 本身来自仓库模板真源、不做二次加工。
 */
import { describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyMemoryExpectedState,
  expectedStateSqlRelPath,
} from "../../src/lib/memory-expected-state.js"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const MAGIC_DIR = ".codex"
/**
 * 模板仓库中的期望态真源：`templates/core/` 下的内容是 magic 目录**内容**本身，
 * sync 把它映射到 `<magicDir>/…`。故去掉 magicDir 前缀即为真源相对路径。
 */
const TEMPLATE_SQL = resolve(
  REPO_ROOT,
  "templates/core",
  expectedStateSqlRelPath(MAGIC_DIR).replace(`${MAGIC_DIR}/`, ""),
)

/** SQLite 基表：`prisma db push` 的产物（枚举在 SQLite 下以 TEXT 存储，既有模式） */
function createPrismaBaseTables(db: DatabaseSync): void {
  db.exec(`CREATE TABLE "AddMemory" (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CANDIDATE',
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    scopeType TEXT NOT NULL,
    scopeValue TEXT NOT NULL,
    repositoryRef TEXT NOT NULL
  )`)
}

/**
 * 期望态对象的真实目录（直接查 sqlite_master，不猜测）。
 * FTS5 虚表自带影子表（_config/_content/_data/_docsize/_idx），不属于期望态对象清单，予以排除。
 */
const FTS_OBJECT_NAMES = ["add_memory_fts", "add_memory_fts_ad", "add_memory_fts_ai", "add_memory_fts_au"]
function ftsObjectNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','trigger') AND name LIKE 'add_memory_fts%' ORDER BY 1",
    )
    .all() as { name: string }[]
  return rows.map((r) => r.name).filter((n) => FTS_OBJECT_NAMES.includes(n))
}

/**
 * 临时 sqlite 项目夹具：
 *  - `<root>/.codex/.../sqlite-fts5.sql` ← 仓库模板真源（逐字复制，模拟 sync 落位）
 *  - `<root>/data/memory.db` ← 已建好 Prisma 基表（模拟 `prisma db push` 之后的状态）
 */
function makeSqliteProject() {
  const root = mkdtempSync(join(tmpdir(), "add-coder-sqlite-flow-"))
  const relSql = expectedStateSqlRelPath(MAGIC_DIR)
  mkdirSync(dirname(join(root, relSql)), { recursive: true })
  writeFileSync(join(root, relSql), readFileSync(TEMPLATE_SQL, "utf-8"), "utf-8")
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "probe", scripts: {} }), "utf-8")

  const dbPath = join(root, "data", "memory.db")
  mkdirSync(dirname(dbPath), { recursive: true })
  const seed = new DatabaseSync(dbPath)
  createPrismaBaseTables(seed)
  seed.close()
  return { root, dbPath }
}

/** 注入执行器：真跑 SQL 文件（只消费 --file，prisma 进程不在用例内） */
function sqliteExecutor(dbPath: string, seen: string[][]) {
  return (argv: string[]): { status: number; stderr?: string } => {
    seen.push(argv)
    const i = argv.indexOf("--file")
    if (i < 0 || !argv[i + 1]) return { status: 2, stderr: "缺少 --file 参数" }
    // Prisma 7 移除 `db execute --schema`（datasource 走 prisma.config.ts）：带该参数即视为契约破坏
    if (argv.includes("--schema")) return { status: 2, stderr: "不应传 --schema（Prisma 7 已移除）" }
    const db = new DatabaseSync(dbPath)
    try {
      db.exec(readFileSync(argv[i + 1], "utf-8"))
      return { status: 0 }
    } catch (e) {
      return { status: 1, stderr: e instanceof Error ? e.message : String(e) }
    } finally {
      db.close()
    }
  }
}

function withDb<T>(dbPath: string, fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

describe("sqlite 记忆期望态闭环（init 唯一消费点）", () => {
  it("库层应用后：add_memory_fts 虚表 + 3 个触发器齐备", () => {
    const { root, dbPath } = makeSqliteProject()
    try {
      const before = withDb(dbPath, ftsObjectNames)
      expect(before).toEqual([]) // 前提：Prisma 不建这些对象（缺陷复现）

      const r = applyMemoryExpectedState({
        projectRoot: root,
        magicDir: MAGIC_DIR,
        engine: "sqlite",
        run: sqliteExecutor(dbPath, []),
      })

      expect(r.applicable).toBe(true)
      expect(r.ok).toBe(true)
      expect(withDb(dbPath, ftsObjectNames)).toEqual([
        "add_memory_fts",
        "add_memory_fts_ad",
        "add_memory_fts_ai",
        "add_memory_fts_au",
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("重复应用幂等：不报错、对象集合不变（可重放）", () => {
    const { root, dbPath } = makeSqliteProject()
    try {
      const first = applyMemoryExpectedState({
        projectRoot: root, magicDir: MAGIC_DIR, engine: "sqlite", run: sqliteExecutor(dbPath, []),
      })
      const objectsAfterFirst = withDb(dbPath, ftsObjectNames)

      const second = applyMemoryExpectedState({
        projectRoot: root, magicDir: MAGIC_DIR, engine: "sqlite", run: sqliteExecutor(dbPath, []),
      })

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      expect(second.detail).toBeUndefined()
      expect(withDb(dbPath, ftsObjectNames)).toEqual(objectsAfterFirst)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("应用后开箱可用：写入 AddMemory 即可被 FTS5 检索，删除后同步失效", () => {
    const { root, dbPath } = makeSqliteProject()
    try {
      applyMemoryExpectedState({
        projectRoot: root, magicDir: MAGIC_DIR, engine: "sqlite", run: sqliteExecutor(dbPath, []),
      })

      withDb(dbPath, (db) => {
        db.prepare(
          'INSERT INTO "AddMemory" (id, kind, topic, content, scopeType, scopeValue, repositoryRef) VALUES (?,?,?,?,?,?,?)',
        ).run("m1", "LESSON", "sqlite 记忆", "SQLite 下 FTS5 期望态必须由 init 应用", "REPOSITORY", "r1", "r1")
        const hit = db
          .prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?")
          .all('"期望态必须"') as { memory_id: string }[]
        expect(hit.map((h) => h.memory_id)).toEqual(["m1"])

        db.prepare('DELETE FROM "AddMemory" WHERE id = ?').run("m1")
        const gone = db
          .prepare("SELECT memory_id FROM add_memory_fts WHERE add_memory_fts MATCH ?")
          .all('"期望态必须"') as { memory_id: string }[]
        expect(gone).toEqual([])
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("执行器契约：走 `prisma db execute --file <项目内绝对路径>`（Prisma 7 无 --schema）", () => {
    const { root, dbPath } = makeSqliteProject()
    try {
      const seen: string[][] = []
      applyMemoryExpectedState({
        projectRoot: root, magicDir: MAGIC_DIR, engine: "sqlite", run: sqliteExecutor(dbPath, seen),
      })
      expect(seen).toHaveLength(1)
      const argv = seen[0]
      expect(argv.join(" ")).toContain("db execute --file")
      // Prisma 7：datasource 从 prisma.config.ts 读，`--schema` 已移除（带=unknown option，实测 7.9.1）
      expect(argv.join(" ")).not.toContain("--schema")
      // --file 必须是项目内绝对路径（prisma 以项目根为 cwd，相对路径会解析错）
      expect(argv[argv.indexOf("--file") + 1]).toBe(join(root, expectedStateSqlRelPath(MAGIC_DIR)))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("真源一致性：库层相对路径 = 模板仓库真源文件（sync 落位即被消费）", () => {
    expect(expectedStateSqlRelPath(MAGIC_DIR)).toBe(
      join(MAGIC_DIR, "scripts", "mcp-server", "shared", "memory", "retrieval", "fts", "sqlite-fts5.sql"),
    )
    expect(existsSync(TEMPLATE_SQL)).toBe(true)
    // 真源是生成物（gen-sqlite-fts-sql.ts），头部必须标明唯一真源位置，避免被手改成第二份实现
    expect(readFileSync(TEMPLATE_SQL, "utf-8")).toContain("src/lib/memory-fts-objects.ts")
  })
})

/**
 * 接线守卫：本 Plan 的缺陷形态是"实现齐备但无人调用"（init 只 push Prisma 表）。
 * 因此断言两侧真实消费点存在——否则删掉接线用例仍会全绿，等于零证据。
 */
describe("接线守卫（无接线 = 缺陷本体）", () => {
  it("init 的 sqlite 分支调用库层入口（命令层只编排，规则在库层）", () => {
    const init = readFileSync(resolve(REPO_ROOT, "src/cli/commands/init.ts"), "utf-8")
    const sqliteBranchAt = init.indexOf('datasource: "sqlite"')
    const callAt = init.indexOf("applyMemoryExpectedState(")
    expect(sqliteBranchAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(sqliteBranchAt)
    // 失败路径不得并入 `fail`（Spec §2：告警不阻断，退出码语义不变）
    const expectedAt = init.indexOf("const expected = applyMemoryExpectedState")
    const catchAt = init.indexOf("} catch (e) { fail", expectedAt) // 外层 catch 起点（其赋值属异常兜底，非失败分支）
    expect(callAt).toBeGreaterThan(sqliteBranchAt)   // 调用点落在 sqlite 分支内（import 语句不含 "(" 后缀）
    expect(expectedAt).toBeGreaterThan(sqliteBranchAt)
    expect(catchAt).toBeGreaterThan(expectedAt)
    const handlingBlock = init.slice(expectedAt, catchAt)
    expect(handlingBlock).toContain("console.warn")
    expect(handlingBlock).not.toContain("fail =")
    expect(handlingBlock).toContain("memory:reindex --apply") // 告警给出自助修复入口
  })

  it("db-ensure.sh 的 sqlite 分支消费同一期望态 SQL 且仅告警不阻断", () => {
    const sh = readFileSync(resolve(REPO_ROOT, "templates/core/scripts/db-ensure.sh"), "utf-8")
    const start = sh.indexOf('if [ "$ENGINE" = "sqlite" ]; then')
    expect(start).toBeGreaterThan(-1)
    const end = sh.indexOf("\nfi\n", start)
    const block = sh.slice(start, end)
    // 路径真源与库层同一处：库层 `.codex/...` → shell `${MAGIC_DIR:-.codex}/...`
    expect(block).toContain("scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql")
    expect(block).toContain("db execute --file")
    expect(block).toContain("|| echo") // 失败仅告警
    expect(block).not.toContain("exit 1")
    expect(block.trimEnd().endsWith("exit 0")).toBe(true) // 早退语义保持：不落进 PG 容器段
    // PG 段零改动：sqlite 分支内不得出现容器编排（该改动只补原生 DDL 应用）
    expect(block).not.toContain("podman-compose")
  })
})
