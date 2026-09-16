/*
 * memory-expected-state.ts — 记忆子系统"期望态"应用（库层，Plan Task 1.2/1.3/2.1 共用）
 *
 * 分层约束（命令模式 + 函数式）：
 *  - **命令层**（`src/cli/commands/*.ts`）只做编排与输出，不含业务规则；
 *  - **策略层**（`src/caijuehub/strategies/*.strategy.ts`）由 rules TOML 生成，禁止手写；
 *  - 故本能力落在**库层**：纯函数 + 可注入执行器，命令层与脚本层都只是调用方。
 *
 * 解决的问题（Spec §1–§3）：`init --engine sqlite` 只跑 `prisma db push`（Prisma 表），
 * FTS5 虚表与 3 个同步触发器是**原生 DDL**（Prisma schema 不表达），此前无入口创建 →
 * sqlite 项目里 `recall_memory` 的 `JOIN add_memory_fts` 直接 `no such table`。
 *
 * 单一真源：SQL 文件是**生成物**（真源 `scripts/memory/reindex.ts` 的 `SQLITE_FTS_OBJECTS`，
 * 由 `scripts/memory/gen-sqlite-fts-sql.ts` 生成；用例断言二者逐字一致）。
 */
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { runCommand } from "./run-command.js"
import { detectPm } from "./utils.js"

export interface ExpectedStateOptions {
  projectRoot: string
  magicDir: string
  /** 数据库引擎；仅 sqlite 需要应用原生 DDL（PG 由 migration 负责，保持零改动） */
  engine: string
  /** 执行器注入（测试用）；默认按项目包管理器调 `prisma db execute --file` */
  run?: (argv: string[], cwd: string) => { status: number | null; stderr?: string }
  /** 超时（ms），默认 60s */
  timeoutMs?: number
}

export interface ExpectedStateResult {
  /** 是否需要应用（false = 该引擎不参与，例如 postgresql/manual） */
  applicable: boolean
  ok: boolean
  /** 相对项目根的 SQL 路径（用于日志与手工恢复提示） */
  relSql: string
  /** 手工恢复命令（ok=false 时给用户照抄） */
  manualCmd: string
  /** 失败原因（stderr 前两行或异常消息） */
  detail?: string
}

/** 记忆 FTS5 期望态 SQL 在项目中的相对路径（生成物，随 sync 分发） */
export function expectedStateSqlRelPath(magicDir: string): string {
  return join(magicDir, "scripts", "mcp-server", "shared", "memory", "retrieval", "fts", "sqlite-fts5.sql")
}

/**
 * 应用记忆子系统期望态（幂等）。
 * - 引擎非 sqlite → `applicable=false, ok=true`（不动作，不告警）；
 * - SQL 文件缺失 → `ok=false`（提示先 sync），**不抛**；
 * - 执行失败/异常 → `ok=false` + `detail`，**不抛**（调用方决定 fail-open 或非零退出）。
 */
export function applyMemoryExpectedState(opts: ExpectedStateOptions): ExpectedStateResult {
  const { projectRoot, magicDir, engine } = opts
  const relSql = expectedStateSqlRelPath(magicDir)
  // Prisma 7 起 `db execute` 的 datasource 从 prisma.config.ts 读取，`--schema` 已移除（实测 7.9.1：
  // "unknown or unexpected option: --schema"）；Prisma 6 无 --schema 时默认 ./prisma/schema.prisma。
  // 故统一**不带 --schema**，两个大版本都成立。
  const manualCmd = `npx prisma db execute --file ${relSql}`
  if (engine !== "sqlite") return { applicable: false, ok: true, relSql, manualCmd }

  const absSql = resolve(projectRoot, relSql)
  if (!existsSync(absSql)) {
    return {
      applicable: true,
      ok: false,
      relSql,
      manualCmd,
      detail: `期望态 SQL 未找到（${relSql}）——请先执行 add-coder sync 后重跑`,
    }
  }

  // 必须用**项目自身的 prisma**（`exec`），不能用 `dlx`：dlx 会从 registry 拉最新版
  // （实测 pnpm dlx 解析到 8.0.0-rc 并联网下载），可能与项目的 prisma.config.ts / schema 不匹配。
  const pm = detectPm(projectRoot)
  const argv = pm === "pnpm"
    ? ["exec", "prisma", "db", "execute", "--file", absSql]
    : ["exec", "prisma", "--", "db", "execute", "--file", absSql]
  const run = opts.run ?? ((a: string[], cwd: string) => runCommand(pm, a, { cwd, timeout: opts.timeoutMs ?? 60000 }))

  try {
    const r = run(argv, projectRoot)
    if (r.status !== 0) {
      const why = (r.stderr || "").trim().split("\n").slice(0, 2).join(" | ")
      return { applicable: true, ok: false, relSql, manualCmd, detail: `退出码 ${r.status}${why ? `: ${why}` : ""}` }
    }
    return { applicable: true, ok: true, relSql, manualCmd }
  } catch (e) {
    return { applicable: true, ok: false, relSql, manualCmd, detail: e instanceof Error ? e.message : String(e) }
  }
}
