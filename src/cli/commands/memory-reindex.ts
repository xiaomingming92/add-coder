// memory-reindex.ts — `add-coder memory:reindex`（命令层：只编排 + 输出 + 退出码）
//
// 本文件**不含**清单/DDL/判定规则（那在 src/lib/memory-fts-objects.ts 与 memory-fts-runtime.ts）。
// 职责边界：解析选项 → 解析项目上下文（backend / DATABASE_URL / magicDir）→ 选适配器 → 调库层 → 打印 → 返回退出码。
//
// 退出码：0 = 探测成功（**即使有缺失**，探测本身成功）/ 重建后收敛；
//         1 = --apply 后仍有缺失（重建未收敛，需人工介入）；
//         2 = 无法探测/应用（上下文缺失、库不可达、Node 不支持等**基础设施**失败——不静默当成功）。
import { resolveMagicDir } from "../../shared/paths.js"
import { detectBackend, type FtsBackend } from "../../lib/memory-fts-objects.js"
import { checkFtsFingerprint, computeFtsFingerprint, writeRecordedFingerprint } from "../../lib/memory-fts-fingerprint.js"
import {
  backendForProvider,
  createPrismaCliAdapter,
  createSqliteAdapter,
  probeVia,
  readPrismaDatasourceProvider,
  reindexVia,
  resolveProjectDatabaseUrl,
  type FtsAdapter,
  type FtsRunner,
  type ReindexReport,
} from "../../lib/memory-fts-runtime.js"

export interface MemoryReindexOptions {
  /** 只读探测（默认） */
  probe?: boolean
  /** 应用缺失对象并复探 */
  apply?: boolean
  /** 缺省按项目 Prisma datasource 自动判定 */
  backend?: "postgres" | "sqlite"
  json?: boolean
  /** 项目根（默认 process.cwd()；用例注入） */
  cwd?: string
}

export interface MemoryReindexDeps {
  run?: FtsRunner
  env?: Record<string, string | undefined>
  io?: {
    log: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
}

/** 上下文：backend + 适配器（解析失败一律抛错，由调用方转成退出码 2） */
function resolveAdapter(
  projectRoot: string,
  options: MemoryReindexOptions,
  deps: MemoryReindexDeps,
): FtsAdapter {
  const databaseUrl = resolveProjectDatabaseUrl(projectRoot, deps.env ?? process.env)
  let backend: FtsBackend
  if (options.backend) {
    backend = options.backend
  } else {
    const provider = readPrismaDatasourceProvider(projectRoot)
    if (provider) backend = backendForProvider(provider)
    else if (databaseUrl) backend = detectBackend(databaseUrl)
    else {
      throw new Error(
        "无法判定后端：未指定 --backend，且项目内既无 prisma/schema.prisma 的 datasource 声明，也无 .env.development 的 DATABASE_URL",
      )
    }
  }

  // magicDir 仅用于提示信息（SQL 生成物位置），不参与判定
  const magicDir = resolveMagicDir(projectRoot)
  if (backend === "sqlite") {
    if (!databaseUrl) {
      throw new Error(`SQLite 后端需要 DATABASE_URL（.env.development 或进程环境）；magicDir=${magicDir}`)
    }
    return createSqliteAdapter({ databaseUrl, projectRoot })
  }
  return createPrismaCliAdapter({
    projectRoot,
    run: deps.run,
    describeSource: databaseUrl ? `prisma db execute（DATABASE_URL=${maskUrl(databaseUrl)}）` : "prisma db execute（schema 内 env）",
  })
}

/** 凭据遮蔽：只保留协议与库名，避免把口令打进日志 */
function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:/@]+):[^@]*@/, "://$1:***@")
}

function printReport(report: ReindexReport, mode: "probe" | "apply", io: NonNullable<MemoryReindexDeps["io"]>): void {
  const head = mode === "apply" ? "记忆 FTS 期望态 · 重建" : "记忆 FTS 期望态 · 探测"
  io.log(`${head}（backend=${report.backend}，source=${report.source}）`)
  io.log(`  完成度 ${report.present}/${report.total}（${report.progress}%）`)
  // 检索指纹（Plan 轮 2 Task 2.7）：期望态完整 ≠ 历史 searchText 与当前分词器同源。
  // 指纹不一致（jieba 版本 / 用户词典 / tokenization 契约变化）时，历史行会"索引在、命中不了"且不报错。
  try {
    const projectRoot = process.cwd()
    const check = checkFtsFingerprint(projectRoot, resolveMagicDir(projectRoot))
    if (check.requiresReindex) {
      io.log(`  ⚠️ 检索指纹：需重索引 —— ${check.reason}`)
      io.log("     → 处置：add-coder memory:reindex --apply 后由回填脚本重算 searchText（指纹随重建写入）")
    } else {
      io.log(`  ✅ 检索指纹一致（${check.current.value}）`)
    }
  } catch (error) {
    // 指纹不可得（首次部署 / 路径不可解析）不阻断探测主流程，但必须显式说明
    io.log(`  ⚠️ 检索指纹：无法判定（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (mode === "apply" && report.rebuilt.length > 0) {
    io.log(`  本次重建（${report.rebuilt.length}）：${report.rebuilt.join(", ")}`)
  }
  if (report.missing.length > 0) {
    io.log(`  缺失（${report.missing.length}）：${report.missing.join(", ")}`)
    io.log(mode === "apply" ? "  ❌ 重建后仍缺失——请检查 DDL 是否被拒（权限/扩展不可用）" : "  → 修复：add-coder memory:reindex --apply")
  } else {
    io.log("  ✅ 期望态完整")
  }
}

/**
 * 执行 memory:reindex。返回退出码（不调用 process.exit，便于用例断言）。
 */
export async function memoryReindexCommand(
  options: MemoryReindexOptions,
  deps: MemoryReindexDeps = {},
): Promise<number> {
  const io = deps.io ?? console
  const projectRoot = options.cwd ?? process.cwd()

  if (options.apply && options.probe) {
    io.error(JSON.stringify({ ok: false, mode: "n/a", reason: "flags-conflict", detail: "--probe 与 --apply 互斥（默认 probe）", exitCode: 2 }))
    return 2
  }
  const mode: "probe" | "apply" = options.apply ? "apply" : "probe"

  try {
    const adapter = resolveAdapter(projectRoot, options, deps)
    const report = mode === "apply" ? await reindexVia(adapter) : await probeVia(adapter)
    // 先写指纹标记、后出报告（顺序有意义）：否则报告里的指纹行会先报"未记录 ⇒ 需重索引"，
    // 紧接着又打印"已记录"，用户会以为逻辑坏了（2026-09-21 实测发现的顺序 wart）。
    let fingerprintNote: string | null = null
    if (mode === "apply" && report.missing.length === 0) {
      try {
        const magicDir = resolveMagicDir(projectRoot)
        const path = writeRecordedFingerprint(projectRoot, magicDir, computeFtsFingerprint({ projectRoot, magicDir }))
        fingerprintNote = `  检索指纹：已记录（${path}）`
      } catch (e) {
        // 写标记失败不改变重建结果，但必须可见（不静默）
        fingerprintNote = `  ⚠️ 检索指纹写入失败：${e instanceof Error ? e.message : String(e)}（下次 probe 仍会提示需重索引）`
      }
    }
    if (options.json) io.log(JSON.stringify(report, null, 2))
    else printReport(report, mode, io)
    if (fingerprintNote && !options.json) io.log(fingerprintNote)
    if (mode === "probe") return 0
    return report.missing.length > 0 ? 1 : 0
  } catch (e) {
    // 失败路径的等价审计（ADD-6）：CLI 层不写 AuditLog/DevOperation——
    // 本命令最常见的失败是"库不可达"，此时任何依赖数据库的审计写入都会二次失败；
    // 故以**结构化 stderr**（含 mode/backend/exitCode/error，可 grep、可管道消费）+ 显式退出码作为审计通道。
    const detail = e instanceof Error ? e.message : String(e)
    const context = { ok: false, mode, backend: options.backend ?? "auto", exitCode: 2, error: detail }
    io.error(
      options.json
        ? JSON.stringify(context)
        : `记忆 FTS ${mode === "apply" ? "重建" : "探测"}失败：${detail}（backend=${context.backend}, exitCode=2）`,
    )
    return 2
  }
}
