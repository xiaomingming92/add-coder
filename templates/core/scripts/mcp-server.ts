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

async function main() {
  const server = new McpServer(
    { name: "add-dev-tools", version: "1.0.0" },
    { capabilities: { tools: {}, resources: { subscribe: true } } }
  )
  registerAll(server)
  const transport = new StdioServerTransport()
  await server.connect(transport)
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
