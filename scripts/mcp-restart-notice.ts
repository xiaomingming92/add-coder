/*
 * mcp-restart-notice.ts — sync 后的运行态告警（Plan hitl-widget-runtime-gap §SyncNotice）
 *
 * 由 `npm run sync` 在分发完成后调用：检测**全部 adapter** 的运行中 MCP server，
 * 过期者点名告警并写各自 `{magicDir}/.mcp-restart-required` 标记。
 *
 * 约定：本脚本**永不失败**（fail-open，退出码恒 0）——告警是提示，不是门禁。
 */
import {
  DEFAULT_MAGIC_DIRS,
  computeFreshness,
  clearRestartRequiredMarker,
  earliestPerAdapter,
  listRunningMcpServers,
  writeRestartRequiredMarker,
} from "../templates/core/scripts/mcp-server/shared/runtime-freshness.js"

function main(): void {
  const projectRoot = process.cwd()
  let servers: ReturnType<typeof listRunningMcpServers> = []
  try {
    servers = listRunningMcpServers()
  } catch {
    servers = []
  }
  if (servers.length === 0) {
    console.log(">>> 运行态检查：未检测到运行中的 MCP server，无需重启")
    return
  }

  const magicDirs = [...new Set([...DEFAULT_MAGIC_DIRS, ...servers.map((s) => s.magicDir)])]
  const needRestart: string[] = []
  // 按 adapter 聚合（同一逻辑 server 的进程链只报一条）
  const perAdapter = earliestPerAdapter(servers)
  for (const [magicDir, s] of perAdapter) {
    const info = computeFreshness(magicDir, projectRoot, { listServers: () => servers })
    if (info.stale === true) {
      needRestart.push(magicDir)
      writeRestartRequiredMarker(magicDir, projectRoot, {
        reason: "sync 已重写产物，但该 adapter 的 server 进程启动早于产物更新",
        pid: s.pid,
        artifactMtime: info.artifactMtime,
      })
      console.error(
        `!!! [${magicDir}] 运行中的 MCP server(pid ${s.pid}) 早于本次同步产物 —— 行为可能与源码不一致`,
      )
      console.error(`    请重启该 adapter 对应的 IDE / MCP server；标记已写入 ${magicDir}/.mcp-restart-required`)
    } else {
      // 自愈：已是最新的 adapter 清掉历史标记，避免陈旧信号残留误导下次判断
      clearRestartRequiredMarker(magicDir, projectRoot)
    }
  }

  if (needRestart.length === 0) {
    console.log(
      `>>> 运行态检查：${perAdapter.size} 个 adapter 的运行中 server 均为最新（检查 ${magicDirs.length} 个 adapter、${servers.length} 条进程记录）`,
    )
    return
  }
  console.error(
    `!!! 需重启的 adapter：${needRestart.join(", ")}（共 ${needRestart.length}/${perAdapter.size} 个运行中 adapter）`,
  )
}

try {
  main()
} catch (error) {
  // fail-open：告警不改变 sync 的退出码
  console.error(`>>> 运行态检查跳过（fail-open）：${error instanceof Error ? error.message : String(error)}`)
}
