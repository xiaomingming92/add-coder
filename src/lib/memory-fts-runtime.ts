// memory-fts-runtime.ts — FTS 期望态的运行时适配与探测/重建编排（库层）
//
// 分层：命令层（src/cli/commands/memory-reindex.ts）只做参数解析 + 输出 + 退出码；
//       探测/重建语义（缺什么、重建哪些、复探收敛）全部在此，且对后端无感——
//       双后端（postgres / sqlite）走**同一条编排代码**，差异只在 FtsAdapter 实现。
//
// 依赖策略（checklist「无新增依赖」）：不引入 pg / better-sqlite3。
//  - sqlite：Node 内置 node:sqlite 直连库文件（无子进程、无依赖）；
//  - postgres：借项目自身的 prisma CLI（`prisma db execute --file`）执行原生 SQL——
//    prisma 驱动内建，命令层无需数据库客户端；探测用「缺失即 RAISE EXCEPTION」的服务器端断言。

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { runCommand } from "./run-command.js"
import { detectPm } from "./utils.js"
import {
  PG_FTS_OBJECTS,
  parsePgProbeMissing,
  renderPgProbeSql,
  resolveFtsObjects,
  type FtsBackend,
  type FtsObjectSpec,
} from "./memory-fts-objects.js"

/** 可注入的命令执行器（与 memory-expected-state 同口径，便于用例注入） */
export type FtsRunner = (argv: string[], cwd: string) => { status: number | null; stdout?: string; stderr?: string }

/**
 * node:sqlite 的加载方式必须走 createRequire，不能用字面量 `await import("node:sqlite")`：
 * tsup/esbuild 按 target=node20 判定内置模块表（不含 sqlite）→ 会把该 specifier 改写成第三方包名
 * `import("sqlite")`，构建产物运行时直接 "Cannot find package 'sqlite'"（实测；vitest/tsx 不经过打包故不暴露）。
 * createRequire 的实参是字符串、对打包器不透明，产物中保持原样，由运行时决定可用性。
 */
const requireBuiltin = createRequire(import.meta.url)
function loadNodeSqlite(): { DatabaseSync: new (p: string) => SqliteDatabase } {
  return requireBuiltin("node:sqlite") as { DatabaseSync: new (p: string) => SqliteDatabase }
}

export interface ReindexReport {
  backend: FtsBackend
  /** 数据源描述（sqlite 库路径 / PG 连接串来源），供输出与排障 */
  source: string
  /** 应有但缺失的对象名 */
  missing: string[]
  /** 本次实际重建的对象名（重放时为 []） */
  rebuilt: string[]
  /** 已存在的对象数 / 应有总数 */
  present: number
  total: number
  /** 完成度（0-100） */
  progress: number
}

export interface FtsAdapter {
  backend: FtsBackend
  source: string
  /** 现状对象名（只读） */
  listExisting(): Promise<ReadonlySet<string>>
  /** 幂等应用一条 DDL（IF NOT EXISTS），失败即抛（不静默降级） */
  apply(ddl: string): Promise<void>
}

/** 探测：列出缺失对象与完成度（不修改任何东西） */
export async function probeVia(adapter: FtsAdapter, expected?: readonly FtsObjectSpec[]): Promise<ReindexReport> {
  const specs = expected ?? resolveFtsObjects(adapter.backend)
  const existing = await adapter.listExisting()
  const missing = specs.filter((s) => !existing.has(s.name)).map((s) => s.name)
  const present = specs.length - missing.length
  return {
    backend: adapter.backend,
    source: adapter.source,
    missing,
    rebuilt: [],
    present,
    total: specs.length,
    progress: specs.length === 0 ? 100 : Math.round((present / specs.length) * 100),
  }
}

/**
 * 重建：对缺失对象依次执行幂等 DDL，再复探确认。
 * 重放语义：目录健康时 rebuilt=[]、missing=[]，与首次成功后的结果一致。
 */
export async function reindexVia(adapter: FtsAdapter, expected?: readonly FtsObjectSpec[]): Promise<ReindexReport> {
  const specs = expected ?? resolveFtsObjects(adapter.backend)
  const first = await probeVia(adapter, specs)
  const rebuilt: string[] = []
  for (const name of first.missing) {
    const spec = specs.find((s) => s.name === name)
    if (!spec) continue
    await adapter.apply(spec.ddl)
    rebuilt.push(spec.name)
  }
  const after = await probeVia(adapter, specs)
  return { ...after, rebuilt }
}

// ────────────────────────── sqlite 适配（node:sqlite） ──────────────────────────

/**
 * sqlite 文件候选路径（按优先级）：
 * `file:./data/dev.db` 这类相对路径在 Prisma 下是相对 **schema 所在目录**解析的，
 * 而 add-coder 的默认模板把它当项目根写（历史口径不一）——两者都试，命中即用，
 * 都不存在则报错并列出已试路径（不做静默兜底选择）。
 */
export function sqlitePathCandidates(databaseUrl: string, projectRoot: string): string[] {
  const raw = (databaseUrl ?? "").replace(/^file:/, "").replace(/^sqlite:/, "").split("?")[0]
  if (!raw) return []
  if (isAbsolute(raw)) return [raw]
  return [resolve(projectRoot, raw), resolve(projectRoot, "prisma", raw)]
}

export interface SqliteAdapterOptions {
  databaseUrl: string
  projectRoot: string
  /** 显式指定库文件（跳过候选探测；用例用） */
  dbPath?: string
}

export function createSqliteAdapter(opts: SqliteAdapterOptions): FtsAdapter {
  const candidates = opts.dbPath ? [opts.dbPath] : sqlitePathCandidates(opts.databaseUrl, opts.projectRoot)
  const dbPath = candidates.find((p) => existsSync(p))
  const source = dbPath ?? `${opts.databaseUrl}（未找到库文件，已试：${candidates.join(" / ")}）`

  // 同步实现 + Promise 包装：库文件缺失/node:sqlite 不可用都会变成 rejected promise（调用方 await 可捕获）
  function withDb<T>(fn: (db: SqliteDatabase) => T): T {
    if (!dbPath) {
      throw new Error(
        `SQLite 库文件不存在：${opts.databaseUrl}。先运行 add-coder init（或确认 .env.development 的 DATABASE_URL）——已试：${candidates.join(" / ")}`,
      )
    }
    let sqlite: { DatabaseSync: new (p: string) => SqliteDatabase }
    try {
      sqlite = loadNodeSqlite()
    } catch (e) {
      throw new Error(
        `当前 Node 不支持 node:sqlite（需 ≥22.5，实测 ${process.version}）：${e instanceof Error ? e.message : String(e)}；` +
          `可改用 SQL 文件手工应用（npx prisma db execute --file <magicDir>/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql --schema prisma/schema.prisma）`,
      )
    }
    const db = new sqlite.DatabaseSync(dbPath)
    try {
      return fn(db)
    } finally {
      db.close()
    }
  }

  return {
    backend: "sqlite",
    source,
    listExisting: () =>
      Promise.resolve().then(() =>
        withDb((db) => {
        const rows = db
          .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','trigger')")
          .all() as { name: string }[]
        return new Set(rows.map((r) => r.name))
        }),
      ),
    apply: (ddl) =>
      Promise.resolve().then(() =>
        withDb((db) => {
          db.exec(ddl)
        }),
      ),
  }
}

interface SqliteStatement {
  all(): unknown[]
  run(...params: unknown[]): unknown
}
interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

// ────────────────────────── 项目上下文解析（命令层复用） ──────────────────────────

/**
 * 项目 Prisma datasource provider（`prisma/schema.prisma` 优先，分库项目回退 `prisma/add.prisma`）。
 * 返回 null = 未找到/未声明（调用方应显式报错，不得猜测）。
 */
export function readPrismaDatasourceProvider(projectRoot: string): string | null {
  for (const rel of ["prisma/schema.prisma", "prisma/add.prisma"]) {
    const p = resolve(projectRoot, rel)
    if (!existsSync(p)) continue
    const m = readFileSync(p, "utf-8").match(/datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/)
    if (m) return m[1]
  }
  return null
}

/** provider → FTS 后端（不支持的 provider 显式抛错，不做默认猜测） */
export function backendForProvider(provider: string): FtsBackend {
  const p = provider.trim().toLowerCase()
  if (p === "postgresql" || p === "postgres") return "postgres"
  if (p === "sqlite") return "sqlite"
  throw new Error(`不支持的 datasource provider: ${provider}（本命令仅支持 postgresql / sqlite）`)
}

/**
 * 项目 DATABASE_URL：进程环境优先 → `.env.development` → `.env`（与 init 的落盘口径一致）。
 * 返回 null = 三处都没有（调用方显式报错）。
 */
export function resolveProjectDatabaseUrl(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.DATABASE_URL) return env.DATABASE_URL
  for (const rel of [".env.development", ".env"]) {
    const p = resolve(projectRoot, rel)
    if (!existsSync(p)) continue
    const m = readFileSync(p, "utf-8").match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?\s*$/m)
    if (m) return m[1].trim()
  }
  return null
}

// ────────────────────────── postgres 适配（项目 prisma CLI） ──────────────────────────

export interface PrismaCliAdapterOptions {
  projectRoot: string
  /** 期望态清单（默认 PG 清单）；探测 SQL 由它渲染，故清单与探测不可能是两份 */
  expected?: readonly FtsObjectSpec[]
  run?: FtsRunner
  timeoutMs?: number
  /** 诊断输出（默认 stderr 摘要），仅用于错误信息 */
  describeSource?: string
}

export function createPrismaCliAdapter(opts: PrismaCliAdapterOptions): FtsAdapter {
  const expected = opts.expected ?? PG_FTS_OBJECTS
  const pm = detectPm(opts.projectRoot)
  // 一律 `exec`（用项目自身的 prisma）：`dlx` 会从 registry 拉最新版（实测解析到 8.0.0-rc 并联网下载），
  // 版本漂移会让"应用本项目期望态"变成对另一个 prisma 的行为下注。
  const base = pm === "pnpm" ? ["exec", "prisma"] : ["exec", "prisma", "--"]
  const run =
    opts.run ??
    ((argv: string[], cwd: string) => runCommand(pm, argv, { cwd, timeout: opts.timeoutMs ?? 120000 }))
  const source = opts.describeSource ?? "prisma db execute（项目 DATABASE_URL）"

  function executeSql(sql: string, tag: string): { status: number | null; stderr: string } {
    const dir = mkdtempSync(join(tmpdir(), "add-coder-fts-"))
    const file = join(dir, `${tag}.sql`)
    writeFileSync(file, sql, "utf-8")
    try {
      // Prisma 7：db execute 只认 --file/--stdin（+ --config），datasource 由 prisma.config.ts 提供；
      // `--schema` 已移除（实测 7.9.1 报 unknown option）→ 统一不带，兼容 Prisma 6 的默认 schema 解析。
      const r = run([...base, "db", "execute", "--file", file], opts.projectRoot)
      return { status: r.status, stderr: r.stderr ?? "" }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  return {
    backend: "postgres",
    source,
    listExisting: () => {
      const r = executeSql(renderPgProbeSql(expected), "probe")
      if (r.status === 0) return Promise.resolve(new Set(expected.map((s) => s.name)))
      const missing = parsePgProbeMissing(r.stderr, expected)
      if (missing.length > 0) {
        return Promise.resolve(new Set(expected.map((s) => s.name).filter((n) => !missing.includes(n))))
      }
      return Promise.reject(
        new Error(
          `PG FTS 探测失败（退出码 ${r.status}）：${r.stderr.trim().split("\n").slice(0, 3).join(" | ") || "无 stderr"}`,
        ),
      )
    },
    apply: (ddl) => {
      const r = executeSql(`${ddl}\n`, "apply")
      if (r.status === 0) return Promise.resolve()
      return Promise.reject(
        new Error(
          `PG FTS 期望态应用失败（退出码 ${r.status}）：${r.stderr.trim().split("\n").slice(0, 3).join(" | ") || "无 stderr"}`,
        )
      )
    },
  }
}
