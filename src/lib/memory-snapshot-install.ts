/*
 * memory-snapshot-install.ts — 安装/同步末尾的记忆 L1 快照刷新（库层）
 *
 * 背景（2026-09-21 Plan `add-coder-memory-injection-wiring-plan-v1`）：
 * 记忆快照此前只在 add-coder 仓库根的开发脚本里有入口，下游项目装完不会生成
 * `${MAGIC_DIR}/memory/l1-context.md` ⇒ 会话注入没有数据可注入、且完全静默。
 *
 * 分层约束（与 memory-expected-state 同口径）：
 *  - 命令层（src/cli/commands/*.ts）只做编排与输出；
 *  - 本能力落库层：单一实现 + 可注入执行器（测试不 spawn 真进程）。
 *
 * 执行方式：调用**随模板分发的同一入口** `${MAGIC_DIR}/scripts/memory/memory-jobs.ts refresh-l1`，
 * 不复制第二套刷新实现（避免两份漂移）。
 *
 * 失败策略（人类决策 2026-09-21）：**阻断** —— ok=false 时由命令层打印原因并非零退出，
 * 不做"告警放行"。原因需含可定位信息（缺脚本 / 缺 DATABASE_URL / 子进程 stderr 摘录）。
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { runCommand } from "./run-command.js"

export interface MemorySnapshotInstallOptions {
    projectRoot: string
    magicDir: string
    /** 注入环境（测试用）；默认 process.env */
    env?: NodeJS.ProcessEnv
    /** 超时（ms），默认 120s（首次需加载 Prisma client + 召回管线） */
    timeoutMs?: number
    /** 注入执行器（测试用）；默认走跨平台 runCommand */
    run?: (cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }) => {
        status: number | null
        stdout?: string
        stderr?: string
    }
}

export interface MemorySnapshotInstallResult {
    ok: boolean
    /** 入口脚本相对项目根的路径（POSIX 风格，便于输出与复现） */
    relScript: string
    /** 可复现命令（失败时给用户照抄） */
    cmd: string
    /** 失败原因（ok=false 时必填） */
    detail?: string
    stdout?: string
}

const ENV_FILE_CANDIDATES = [".env.development.local", ".env.development", ".env.local", ".env"]

/** 从项目 .env* 文件里取 DATABASE_URL（缺省链与 MCP server 的 dotenv 口径一致） */
export function readDatabaseUrlFromEnvFiles(projectRoot: string): string | undefined {
    for (const f of ENV_FILE_CANDIDATES) {
        const p = join(projectRoot, f)
        if (!existsSync(p)) continue
        const text = readFileSync(p, "utf-8")
        const m = text.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m)
        if (m?.[1]) return m[1].trim()
    }
    return undefined
}

/** 记忆异步入口脚本（随模板分发）在项目中的相对路径 */
export function memoryJobsScriptRelPath(magicDir: string): string {
    return `${magicDir}/scripts/memory/memory-jobs.ts`
}

/**
 * 安装/同步末尾刷新 L1 快照（幂等：原子写覆盖）。
 * 复用随模板分发的 `memory-jobs.ts refresh-l1` 入口，失败原因逐条可见（不吞错）。
 */
export function refreshL1SnapshotOnInstall(opts: MemorySnapshotInstallOptions): MemorySnapshotInstallResult {
    const relScript = memoryJobsScriptRelPath(opts.magicDir)
    const absScript = join(opts.projectRoot, opts.magicDir, "scripts", "memory", "memory-jobs.ts")
    const cmd = `npx tsx ${relScript} refresh-l1`

    if (!existsSync(absScript)) {
        return {
            ok: false,
            relScript,
            cmd,
            detail: `记忆入口脚本缺失: ${relScript}（模板未就绪：先执行 add-coder sync，或确认 add-coder 版本 ≥ 本 Plan 版本）`,
        }
    }

    const env = opts.env ?? process.env
    const databaseUrl = env.DATABASE_URL || readDatabaseUrlFromEnvFiles(opts.projectRoot)
    if (!databaseUrl) {
        return {
            ok: false,
            relScript,
            cmd,
            detail: `未找到 DATABASE_URL（检查 ${ENV_FILE_CANDIDATES.join(" / ")}，或在环境中显式导出）`,
        }
    }

    const runner = opts.run ?? ((c, a, o) => runCommand(c, a, o))
    const result = runner(
        "npx",
        ["tsx", absScript, "refresh-l1"],
        {
            cwd: opts.projectRoot,
            env: { ...env, PROJECT_ROOT: opts.projectRoot, MAGIC_DIR: opts.magicDir, DATABASE_URL: databaseUrl },
            timeout: opts.timeoutMs ?? 120_000,
        },
    )

    if (result.status !== 0) {
        const why = (result.stderr || "").trim().split("\n").slice(0, 4).join(" | ")
        return {
            ok: false,
            relScript,
            cmd,
            detail: `memory-jobs refresh-l1 退出码 ${result.status}${why ? ` —— ${why}` : "（无 stderr 输出）"}`,
            stdout: result.stdout,
        }
    }

    return { ok: true, relScript, cmd, stdout: result.stdout }
}
