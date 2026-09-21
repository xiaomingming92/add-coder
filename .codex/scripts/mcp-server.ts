import { McpServer } from "@modelcontextprotocol/server"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { registerAll } from "./mcp-server/index.js"
import { redact } from "./mcp-server/shared/redact.js"
import { DATABASE_URL, getRuntimeContext } from "./mcp-server/shared/env.js"
import { prisma } from "./mcp-server/shared/prisma.js"
import { resolvePlanStatus } from "./mcp-server/shared/plan-lifecycle.js"
import { createPrismaPlanStatusStore } from "./mcp-server/shared/plan-status-store.js"
import {
  createPgLifecycleListenClient,
  PlanLifecycleSubscriber,
} from "./mcp-server/shared/plan-lifecycle-subscriber.js"
import { PlanRoundSubscriber } from "./mcp-server/shared/plan-round-subscriber.js"
import { queryPlanRounds, type PlanRoundReadClient } from "./mcp-server/shared/plan-round-store.js"
import { PROJECT_ROOT, MAGIC_DIR } from "./mcp-server/shared/env.js"
import { clearRestartRequiredMarker } from "./mcp-server/shared/runtime-freshness.js"
import { buildServerOptions } from "./mcp-server/shared/server-capabilities.js"

/**
 * 启动后清掉本 adapter 的"需重启"标记（2026-09-14）：
 * 该标记的语义是"运行中的 server 早于产物"，本进程刚启动 → 必然晚于现有产物，
 * 旧标记已失效。不清掉会留下**过期告警**（实测：重启后标记仍在，谁读到都以为还得重启）。
 */
function clearOwnStaleMarker(): void {
  try {
    clearRestartRequiredMarker(MAGIC_DIR, PROJECT_ROOT)
  } catch {
    /* fail-open：标记清理失败不影响启动 */
  }
}

/**
 * 孤儿自退（2026-09-14）：IDE/app 退出时通常只杀直接子进程（`npx`），
 * `npm exec → sh -c → tsx → node` 这几代会被 reparent 到 systemd 继续存活
 * （实测同一逻辑 server 5 个进程，旧实例的 server 在 app 重启后仍活 20+ 分钟；
 * `.codex` 与 `.qoder` 上都反复出现）。
 * 记录启动时的父 pid，一旦被 reparent 即视为启动者已死 → 自杀退出（stdio 对端本就没了）。
 */
function watchLauncher(): void {
  const launcherPid = process.ppid
  const timer = setInterval(() => {
    if (process.ppid !== launcherPid) {
      console.error(`[ADD-MCP] 启动者已退出（ppid ${launcherPid} → ${process.ppid}），孤儿自退`)
      clearInterval(timer)
      process.exit(0)
    }
  }, 15_000)
  timer.unref?.()
}

async function main() {
  const server = new McpServer(
    { name: "add-dev-tools", version: "1.0.0" },
    // 能力与 instructions 的真源在 shared/server-capabilities.ts（可被单测断言）：
    // extensions["io.modelcontextprotocol/ui"] 走官方扩展协商；legacy 位（工具 _meta.ui.resourceUri +
    // openai/outputTemplate）在 tools/hitl.ts 中保留，两条路径并存。
    buildServerOptions()
  )
  registerAll(server)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  clearOwnStaleMarker()
  watchLauncher()
  let lifecycleSubscriber: PlanLifecycleSubscriber | undefined
  let planRoundSubscriber: PlanRoundSubscriber | undefined
  if (/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
    const context = getRuntimeContext()
    const store = createPrismaPlanStatusStore(prisma)
    lifecycleSubscriber = new PlanLifecycleSubscriber({
      context,
      clientFactory: () => createPgLifecycleListenClient(DATABASE_URL),
      resolveStatus: ({ context: subscriberContext, planId }) => resolvePlanStatus(
        store,
        subscriberContext,
        planId ? { planId } : { activeOnly: true },
      ),
      onSnapshot: (snapshot, envelope) => {
        const trigger = envelope ? `notify:${envelope.eventId}` : "initial"
        console.error(`[ADD-MCP] lifecycle pull (${trigger}) ${JSON.stringify(snapshot)}`)
      },
      onError: (error) => console.error(`[ADD-MCP] lifecycle subscriber: ${redact(error.message)}`),
    })
    await lifecycleSubscriber.start().catch((error: unknown) => {
      console.error(`[ADD-MCP] lifecycle initial pull failed: ${redact(error instanceof Error ? error.message : String(error))}`)
    })
    planRoundSubscriber = new PlanRoundSubscriber({
      context,
      clientFactory: () => createPgLifecycleListenClient(DATABASE_URL),
      queryRounds: ({ context: subscriberContext, planId }) => queryPlanRounds(
        prisma as unknown as PlanRoundReadClient,
        { context: subscriberContext, planId },
      ),
      onSnapshot: (snapshot, envelope) => {
        const trigger = envelope ? `notify:${envelope.eventId}` : "initial"
        console.error(`[ADD-MCP] PlanRound pull (${trigger}) ${JSON.stringify({
          contextId: snapshot.context.contextId,
          planId: snapshot.planId,
          planName: snapshot.planName,
          records: snapshot.rounds.length,
        })}`)
      },
      onError: (error) => console.error(`[ADD-MCP] PlanRound subscriber: ${redact(error.message)}`),
    })
    await planRoundSubscriber.start().catch((error: unknown) => {
      console.error(`[ADD-MCP] PlanRound initial pull failed: ${redact(error instanceof Error ? error.message : String(error))}`)
    })
  }
  process.stdin.once("end", () => {
    void lifecycleSubscriber?.stop()
    void planRoundSubscriber?.stop()
  })
  console.error("[ADD-MCP] add-dev-tools MCP server started on stdio")
}

main().catch((error) => {
  console.error("[ADD-MCP] Fatal error:", redact(error instanceof Error ? error.message : String(error)))
  process.exit(1)
})
