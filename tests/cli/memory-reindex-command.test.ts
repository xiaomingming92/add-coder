/*
 * `memory:reindex` 用例 — Plan Task 2.3 / Spec §4–§5
 *
 * 覆盖验收项：
 *  - sqlite：probe 报缺失（退出码 0）→ apply 补齐 → 复探收敛；再次 apply 为 no-op（幂等）；
 *  - 后端缺省按项目 Prisma datasource 自动判定（不靠 --backend）；
 *  - postgres：同一条编排（probe/apply 收敛语义一致），经项目 prisma CLI 执行原生 SQL；
 *  - 失败路径：库文件缺失 / 无法判定后端 → 退出码 2 + 显式原因（**不静默当成功**）。
 *
 * 为什么 sqlite 侧用真库：node:sqlite 是 Node 内置，用例可零依赖跑真实引擎（对象存在性、
 * 幂等、触发器同步都是 DB 事实而非断言猜测）。postgres 侧无客户端驱动（checklist：无新增依赖），
 * 故注入 `run`——它按 argv 契约真读 SQL 文件、模拟 `prisma db execute` 的退出码与 stderr 形状。
 */
import { describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { memoryReindexCommand } from "../../src/cli/commands/memory-reindex.js"
import { PG_MISSING_MARKER } from "../../src/lib/memory-fts-objects.js"
import { sqlitePathCandidates, type FtsRunner } from "../../src/lib/memory-fts-runtime.js"

const SQL = readFileSync(
  join(import.meta.dirname, "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql"),
  "utf-8",
)

function captureIo() {
  const lines: string[] = []
  const errors: string[] = []
  return {
    lines,
    errors,
    io: {
      log: (...a: unknown[]) => lines.push(a.join(" ")),
      warn: (...a: unknown[]) => lines.push(a.join(" ")),
      error: (...a: unknown[]) => errors.push(a.join(" ")),
    },
  }
}

/** 临时 sqlite 项目：datasource sqlite + .env.development + 已建 Prisma 基表的库文件 */
function makeSqliteProject(opts: { withFts?: boolean; withDb?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "add-coder-reindex-cmd-"))
  mkdirSync(join(root, "prisma"), { recursive: true })
  writeFileSync(
    join(root, "prisma", "schema.prisma"),
    `datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}\n`,
    "utf-8",
  )
  writeFileSync(join(root, ".env.development"), `DATABASE_URL="file:./data/dev.db"\n`, "utf-8")
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "probe" }), "utf-8")

  const dbPath = join(root, "data", "dev.db")
  if (opts.withDb !== false) {
    mkdirSync(dirname(dbPath), { recursive: true })
    const db = new DatabaseSync(dbPath)
    db.exec(`CREATE TABLE "AddMemory" (id TEXT PRIMARY KEY, topic TEXT NOT NULL, content TEXT NOT NULL)`)
    if (opts.withFts) db.exec(SQL)
    db.close()
  }
  return { root, dbPath }
}

function sqliteObjects(dbPath: string): string[] {
  const db = new DatabaseSync(dbPath)
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','trigger') AND name LIKE 'add_memory_fts%'")
      .all() as { name: string }[]
    const names = ["add_memory_fts", "add_memory_fts_ai", "add_memory_fts_au", "add_memory_fts_ad"]
    return rows.map((r) => r.name).filter((n) => names.includes(n)).sort()
  } finally {
    db.close()
  }
}

describe("memory:reindex · sqlite（真实引擎）", () => {
  it("probe 报缺失且退出码 0 → apply 补齐收敛 → 再次 apply 为 no-op", async () => {
    const { root, dbPath } = makeSqliteProject()
    try {
      const probe = captureIo()
      const probeCode = await memoryReindexCommand({ cwd: root, probe: true }, { io: probe.io })
      expect(probeCode).toBe(0) // 探测成功（有缺失≠探测失败）
      expect(probe.lines.join("\n")).toContain("缺失（4）")
      expect(probe.lines.join("\n")).toContain("memory:reindex --apply")
      expect(sqliteObjects(dbPath)).toEqual([])

      const apply = captureIo()
      const applyCode = await memoryReindexCommand({ cwd: root, apply: true }, { io: apply.io })
      expect(applyCode).toBe(0)
      expect(apply.lines.join("\n")).toContain("本次重建（4）")
      expect(sqliteObjects(dbPath)).toHaveLength(4)

      const again = captureIo()
      const againCode = await memoryReindexCommand({ cwd: root, apply: true }, { io: again.io })
      expect(againCode).toBe(0)
      expect(again.lines.join("\n")).not.toContain("本次重建") // 健康库：无 DDL 执行
      expect(sqliteObjects(dbPath)).toHaveLength(4)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("健康库 probe：完成度 4/4 且不再提示修复", async () => {
    const { root } = makeSqliteProject({ withFts: true })
    try {
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root }, { io: io.io })
      expect(code).toBe(0)
      expect(io.lines.join("\n")).toContain("完成度 4/4（100%）")
      expect(io.lines.join("\n")).toContain("✅ 期望态完整")
      expect(io.lines.join("\n")).not.toContain("--apply")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("后端缺省按 datasource 自动判定（无 --backend）", async () => {
    const { root } = makeSqliteProject()
    try {
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root, json: true }, { io: io.io })
      expect(code).toBe(0)
      expect(JSON.parse(io.lines.join("\n"))).toMatchObject({ backend: "sqlite", total: 4, present: 0, progress: 0 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("库文件缺失：退出码 2 + 显式原因（不得静默通过）", async () => {
    const { root } = makeSqliteProject({ withDb: false })
    try {
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root }, { io: io.io })
      expect(code).toBe(2)
      expect(io.errors.join("\n")).toContain("SQLite 库文件不存在")
      expect(io.errors.join("\n")).toContain("已试")
      expect(io.lines).toEqual([]) // 未探测成功 → 不输出报告
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("--probe 与 --apply 互斥：退出码 2", async () => {
    const { root } = makeSqliteProject()
    try {
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root, probe: true, apply: true }, { io: io.io })
      expect(code).toBe(2)
      expect(io.errors.join("\n")).toContain("互斥")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("memory:reindex · 上下文解析", () => {
  it("sqlite 相对路径候选：项目根与 prisma/ 双口径都覆盖（不静默选错）", () => {
    expect(sqlitePathCandidates("file:./data/dev.db", "/p")).toEqual(["/p/data/dev.db", "/p/prisma/data/dev.db"])
    expect(sqlitePathCandidates("file:/abs/dev.db", "/p")).toEqual(["/abs/dev.db"])
  })

  it("无法判定后端（无 datasource / 无 DATABASE_URL）：退出码 2", async () => {
    const root = mkdtempSync(join(tmpdir(), "add-coder-reindex-nocontext-"))
    try {
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "probe" }), "utf-8")
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root }, { io: io.io, env: {} })
      expect(code).toBe(2)
      expect(io.errors.join("\n")).toContain("无法判定后端")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("datasource 非 postgresql/sqlite：显式报错（不猜测后端）", async () => {
    const root = mkdtempSync(join(tmpdir(), "add-coder-reindex-mysql-"))
    try {
      mkdirSync(join(root, "prisma"), { recursive: true })
      writeFileSync(join(root, "prisma", "schema.prisma"), `datasource db {\n  provider = "mysql"\n}\n`, "utf-8")
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root }, { io: io.io, env: {} })
      expect(code).toBe(2)
      expect(io.errors.join("\n")).toContain("不支持的 datasource provider")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("memory:reindex · postgres（prisma CLI 适配，同一条编排）", () => {
  /** 假 prisma：读 --file 内容——探针文件看 marker，DDL 文件按对象名登记 */
  function fakePrisma(state: Set<string>) {
    const seen: string[][] = []
    const run: FtsRunner = (argv) => {
      seen.push(argv)
      const file = argv[argv.indexOf("--file") + 1]
      const sql = readFileSync(file, "utf-8")
      if (sql.includes(PG_MISSING_MARKER)) {
        const expected = ["pg_trgm", "AddMemory_topic_trgm_idx", "AddMemory_content_trgm_idx", "AddMemoryEvidence_excerpt_trgm_idx"]
        const missing = expected.filter((n) => !state.has(n))
        return missing.length > 0
          ? { status: 1, stderr: `Error: ${PG_MISSING_MARKER} ${missing.join(",")}` }
          : { status: 0, stderr: "" }
      }
      const m = sql.match(/CREATE (?:EXTENSION|INDEX) IF NOT EXISTS "?([\w]+)"?/i)
      if (m) state.add(m[1])
      return { status: 0, stderr: "" }
    }
    return { run, seen }
  }

  function makePgProject() {
    const root = mkdtempSync(join(tmpdir(), "add-coder-reindex-pg-"))
    mkdirSync(join(root, "prisma"), { recursive: true })
    writeFileSync(
      join(root, "prisma", "schema.prisma"),
      `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n`,
      "utf-8",
    )
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "probe" }), "utf-8")
    return root
  }

  it("probe → apply → 复探收敛，且走 `prisma db execute --file` 契约", async () => {
    const root = makePgProject()
    const state = new Set<string>(["pg_trgm"])
    const { run, seen } = fakePrisma(state)
    try {
      const env = { DATABASE_URL: "postgresql://u:p@localhost:5434/mem" }
      const probe = captureIo()
      const probeCode = await memoryReindexCommand({ cwd: root }, { io: probe.io, env, run })
      expect(probeCode).toBe(0)
      expect(probe.lines.join("\n")).toContain("缺失（3）")
      expect(probe.lines.join("\n")).toContain("AddMemory_topic_trgm_idx")
      expect(probe.lines.join("\n")).toContain(":***@") // 口令遮蔽

      const apply = captureIo()
      const applyCode = await memoryReindexCommand({ cwd: root, apply: true }, { io: apply.io, env, run })
      expect(applyCode).toBe(0)
      expect(apply.lines.join("\n")).toContain("本次重建（3）")
      expect([...state].sort()).toEqual([
        "AddMemoryEvidence_excerpt_trgm_idx", "AddMemory_content_trgm_idx", "AddMemory_topic_trgm_idx", "pg_trgm",
      ])

      // argv 契约：pnpm/npm 参数路由 + --file（Prisma 7 无 --schema：datasource 走 prisma.config.ts）
      for (const argv of seen) {
        expect(argv.join(" ")).toContain("db execute --file")
        expect(argv.join(" ")).not.toContain("--schema")
        expect(existsSync(argv[argv.indexOf("--file") + 1])).toBe(false) // 临时文件用后即删
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("prisma 报非缺失类错误（如库不可达）：退出码 2 + 透出 stderr（不吞错）", async () => {
    const root = makePgProject()
    try {
      const run: FtsRunner = () => ({ status: 1, stderr: "Error: P1001: Can't reach database server" })
      const io = captureIo()
      const code = await memoryReindexCommand({ cwd: root }, { io: io.io, env: { DATABASE_URL: "postgresql://u:p@h/db" }, run })
      expect(code).toBe(2)
      expect(io.errors.join("\n")).toContain("PG FTS 探测失败")
      expect(io.errors.join("\n")).toContain("P1001")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("--apply 后仍缺失（DDL 被静默忽略）：退出码 1，不伪装成功", async () => {
    const root = makePgProject()
    try {
      // apply 报成功（退出码 0）但对象并未落库——模拟 DDL 被忽略/无效果
      const run: FtsRunner = (argv) => {
        const sql = readFileSync(argv[argv.indexOf("--file") + 1], "utf-8")
        return sql.includes(PG_MISSING_MARKER)
          ? { status: 1, stderr: `Error: ${PG_MISSING_MARKER} AddMemory_topic_trgm_idx` }
          : { status: 0, stderr: "" }
      }
      const io = captureIo()
      const code = await memoryReindexCommand(
        { cwd: root, apply: true },
        { io: io.io, env: { DATABASE_URL: "postgresql://u:p@h/db" }, run },
      )
      expect(code).toBe(1)
      expect(io.lines.join("\n")).toContain("❌ 重建后仍缺失")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
