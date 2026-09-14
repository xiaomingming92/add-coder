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
  ppid: number
  command: string
  startedAt?: Date
  /**
   * 启动者已死（ppid 指向 init/systemd）——**残留族**（2026-09-14 新增）：
   * 实测成因：IDE/app 退出时通常只杀直接子进程（`npx`），
   * `npm exec → sh -c → tsx → node` 这几代被 reparent 到 systemd 继续存活
   * （同一逻辑 server 5 个进程；旧实例的 server 在 app 重启后仍活了 20+ 分钟）。
   * 这类进程的 stdio 对端已消失，属可回收垃圾；也不应参与新鲜度判定。
   */
  orphan?: boolean
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
      out = execSync("ps -eo pid=,ppid=,etimes=,args=", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
    } catch {
      return []
    }
  }
  const now = (deps.now ?? (() => new Date()))()
  const lines = out.split("\n")
  // 启动者已死的判定依据：ppid 落在 init / systemd 上（reparent 的结果）
  const supervisorPids = new Set<number>()
  const allPids = new Set<number>()
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    allPids.add(Number(m[1]))
    if (/(^|\/)(systemd|init)(\s|$)/.test(m[4])) supervisorPids.add(Number(m[1]))
  }
  const servers: RunningServer[] = []
  for (const line of lines) {
    if (!line.includes("mcp-server.ts")) continue
    if (line.includes("mcp-restart-notice")) continue // 跳过本脚本自身
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    const ppid = Number(m[2])
    const cmd = m[4]
    if (cmd.includes("node_modules")) continue // 排除依赖树噪声
    // magic 段必须以点开头（.codex/.qoder…），且路径后是行尾或参数分隔
    const magic = cmd.match(/(?:^|[/\s])(\.[a-z][a-z0-9-]*)\/scripts\/mcp-server\.ts(?:\s|$)/)
    if (!magic) continue
    const etimes = Number(m[3])
    servers.push({
      magicDir: magic[1],
      pid: Number(m[1]),
      ppid,
      command: cmd,
      startedAt: Number.isFinite(etimes) ? new Date(now.getTime() - etimes * 1000) : undefined,
      orphan: false, // 先按 o 标记，稍后按"整族"传播（见下）
    })
  }
  /*
   * 孤儿按**整族**传播：链上后几代（npm exec / sh -c / tsx / node）的 ppid 指向族内进程，
   * 单看自身 ppid 判不出来 —— 只有族根（其 ppid 不在族内）能反映"启动者是否还在"。
   * 族根判定为孤儿时，整族标记（含 rootPpid 不存在＝父进程已消失的情形）。
   */
  const byPid = new Map(servers.map((s) => [s.pid, s]))
  const childrenOf = new Map<number, number[]>()
  for (const s of servers) {
    if (!byPid.has(s.ppid)) continue
    childrenOf.set(s.ppid, [...(childrenOf.get(s.ppid) ?? []), s.pid])
  }
  for (const s of servers) {
    if (byPid.has(s.ppid)) continue // 不是族根
    const rootParentGone = s.ppid === 1 || supervisorPids.has(s.ppid) || !allPids.has(s.ppid)
    if (!rootParentGone) continue
    const stack = [s.pid]
    while (stack.length > 0) {
      const pid = stack.pop() as number
      const node = byPid.get(pid)
      if (!node || node.orphan) continue
      node.orphan = true
      stack.push(...(childrenOf.get(pid) ?? []))
    }
  }
  return servers
}

/**
 * 残留族清单（供 `scripts/mcp-restart-notice.ts` 回收）：
 * 只按 adapter 取**全部孤儿 pid**（含 npx/npm/sh/tsx/node 各代），非孤儿一律不动。
 */
export function orphanPidsToReap(servers: readonly RunningServer[]): number[] {
  return [...new Set(servers.filter((s) => s.orphan).map((s) => s.pid))].sort((a, b) => a - b)
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
  const allServers = deps.listServers ? deps.listServers() : listRunningMcpServers()
  // 残留族（启动者已死）不参与新鲜度判定：否则"孤儿进程"会把判定带偏
  // （实测：旧实例的 server 让新鲜度报出错误的 pid / 错误的 stale 值）
  const perAdapter = earliestPerAdapter(allServers.filter((s) => s.magicDir === magicDir && !s.orphan))
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
