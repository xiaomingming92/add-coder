/*
 * 产物-进程新鲜度（Plan hitl-widget-runtime-gap §Freshness）
 *
 * 背景：`npm run sync` 会重写 `{magicDir}/scripts/mcp-server.ts` 等产物，但不会重启正在运行的
 * server 进程 → 出现「产物是新的、跑的是旧代码」的静默陈旧（实测：进程 Sep 12 11:49 vs 产物 09-13 09:47）。
 *
 * 覆盖面：**6 个 adapter 各自都有 server 副本**，因此检测范围是全部 magic 目录，不限于 .codex。
 * 判定不确定时一律返回 "unknown"（宁可漏报，不误报"需重启"）。
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

export const RESTART_MARKER_FILE = ".mcp-restart-required"
export const DEFAULT_MAGIC_DIRS = [".codex", ".add", ".qoder", ".claude", ".vscode", ".trae"] as const

export interface RunningServer {
  magicDir: string
  pid: number
  command: string
  startedAt?: Date
}

export interface FreshnessInfo {
  stale: boolean | "unknown"
  magicDir: string
  processStartedAt?: string
  artifactMtime?: string
  markerPath?: string
  detail: string
}

export interface FreshnessDeps {
  /** 测试注入：ps 输出（`ps -eo pid=,etimes=,args=` 形式） */
  psOutput?: string
  listServers?: () => RunningServer[]
  mtimeOf?: (path: string) => Date | null
  markerExists?: (path: string) => boolean
  now?: () => Date
}

/** 扫描全部 adapter 的运行中 MCP server（解析失败返回空数组，不抛） */
export function listRunningMcpServers(deps: Pick<FreshnessDeps, "psOutput" | "now"> = {}): RunningServer[] {
  let out = deps.psOutput
  if (out === undefined) {
    try {
      out = execSync("ps -eo pid=,etimes=,args=", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
    } catch {
      return []
    }
  }
  const now = (deps.now ?? (() => new Date()))()
  const servers: RunningServer[] = []
  for (const line of out.split("\n")) {
    if (!line.includes("mcp-server.ts")) continue
    if (line.includes("mcp-restart-notice")) continue // 跳过本脚本自身
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    const cmd = m[3]
    if (cmd.includes("node_modules")) continue // 排除依赖树噪声
    // magic 段必须以点开头（.codex/.qoder…），且路径后是行尾或参数分隔
    const magic = cmd.match(/(?:^|[/\s])(\.[a-z][a-z0-9-]*)\/scripts\/mcp-server\.ts(?:\s|$)/)
    if (!magic) continue
    const etimes = Number(m[2])
    servers.push({
      magicDir: magic[1],
      pid: Number(m[1]),
      command: cmd,
      startedAt: Number.isFinite(etimes) ? new Date(now.getTime() - etimes * 1000) : undefined,
    })
  }
  return servers
}

/**
 * 按 adapter 聚合：同一 adapter 常同时存在多条进程记录（npx / npm exec / sh -c / tsx 包装链）。
 * 取**最早的启动时间**（最保守判定）合成一条，避免一个逻辑 server 被报成十几条。
 */
export function earliestPerAdapter(servers: RunningServer[]): Map<string, RunningServer> {
  const out = new Map<string, RunningServer>()
  for (const s of servers) {
    const prev = out.get(s.magicDir)
    if (!prev) {
      out.set(s.magicDir, s)
      continue
    }
    const prevAt = prev.startedAt?.getTime() ?? Number.POSITIVE_INFINITY
    const curAt = s.startedAt?.getTime() ?? Number.POSITIVE_INFINITY
    if (curAt < prevAt) out.set(s.magicDir, s)
  }
  return out
}

/** 判定单个 adapter 的新鲜度（未知一律 "unknown"） */
export function computeFreshness(
  magicDir: string,
  projectRoot: string,
  deps: FreshnessDeps = {},
): FreshnessInfo {
  const artifactPath = join(projectRoot, magicDir, "scripts", "mcp-server.ts")
  const markerPath = join(projectRoot, magicDir, RESTART_MARKER_FILE)
  const mtime = deps.mtimeOf
    ? deps.mtimeOf(artifactPath)
    : existsSync(artifactPath)
      ? statSync(artifactPath).mtime
      : null
  const hasMarker = deps.markerExists ? deps.markerExists(markerPath) : existsSync(markerPath)
  const base: Omit<FreshnessInfo, "stale" | "detail"> = {
    magicDir,
    ...(mtime ? { artifactMtime: mtime.toISOString() } : {}),
    ...(hasMarker ? { markerPath } : {}),
  }
  if (!mtime) {
    return { ...base, stale: "unknown", detail: "产物不存在，无法判定新鲜度" }
  }
  const perAdapter = earliestPerAdapter(
    (deps.listServers ?? (() => listRunningMcpServers()))().filter((s) => s.magicDir === magicDir),
  )
  const server = perAdapter.get(magicDir)
  if (!server) {
    return { ...base, stale: false, detail: `${magicDir} 无运行中 server` }
  }
  if (!server.startedAt) {
    return { ...base, stale: "unknown", detail: `进程 pid=${server.pid} 启动时间不可得` }
  }
  const stale = server.startedAt.getTime() < mtime.getTime()
  return {
    ...base,
    processStartedAt: server.startedAt.toISOString(),
    stale,
    detail: stale
      ? `${magicDir} server(pid ${server.pid}) 启动早于产物更新，需重启`
      : `${magicDir} server(pid ${server.pid}) 晚于产物，已最新`,
  }
}

/** 写重启标记（失败返回 null，调用方 fail-open） */
export function writeRestartRequiredMarker(
  magicDir: string,
  projectRoot: string,
  info: { reason: string; pid?: number; artifactMtime?: string },
): string | null {
  const markerPath = join(projectRoot, magicDir, RESTART_MARKER_FILE)
  try {
    writeFileSync(
      markerPath,
      JSON.stringify({ magicDir, at: new Date().toISOString(), ...info }, null, 2),
      "utf-8",
    )
    return markerPath
  } catch {
    return null
  }
}

export function readRestartRequiredMarker(magicDir: string, projectRoot: string): string | null {
  const markerPath = join(projectRoot, magicDir, RESTART_MARKER_FILE)
  try {
    return existsSync(markerPath) ? readFileSync(markerPath, "utf-8") : null
  } catch {
    return null
  }
}

export function clearRestartRequiredMarker(magicDir: string, projectRoot: string): void {
  try {
    rmSync(join(projectRoot, magicDir, RESTART_MARKER_FILE), { force: true })
  } catch {
    /* fail-open */
  }
}
