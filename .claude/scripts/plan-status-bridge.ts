#!/usr/bin/env node
import { getRuntimeContext } from "./mcp-server/shared/env.js"
import { prisma } from "./mcp-server/shared/prisma.js"
import { resolvePlanStatus } from "./mcp-server/shared/plan-lifecycle.js"
import { createPrismaPlanStatusStore } from "./mcp-server/shared/plan-status-store.js"

async function main(): Promise<void> {
  const context = getRuntimeContext()
  const store = createPrismaPlanStatusStore(prisma)
  const snapshot = await resolvePlanStatus(store, context, { activeOnly: true })
  process.stdout.write(`${JSON.stringify(snapshot)}\n`)
  if (snapshot.availability === "STATUS_UNAVAILABLE") process.exitCode = 3
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`[ADD plan-status-bridge] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 3
  })
  .finally(async () => {
    const runtimeClient = prisma as unknown as Record<string, unknown>
    const disconnect = runtimeClient.$disconnect
    if (typeof disconnect === "function") {
      await Reflect.apply(disconnect, prisma, []).catch(() => undefined)
    }
  })
