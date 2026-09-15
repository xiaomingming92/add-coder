/*
 * gate-runner.ts — MCP 门禁工具降级执行器（ADD 降级模式）
 *
 * 用途：本会话 MCP Server 未挂载时，直接以 tsx 调用 templates/core/scripts/mcp-server
 * 下的门禁工具（check_dps / check_add_route_status / check_add_route_completeness /
 * check_rahs / check_spec_sync / record_dev_operation / query_audit_logs ...）。
 *
 * 用法：
 *   PROJECT_ROOT=$PWD MAGIC_DIR=.codex DATABASE_URL=... \
 *   npx tsx scripts/memory/gate-runner.ts <moduleRelPath> <exportName> <toolName> '<jsonArgs>'
 *
 * 示例：
 *   npx tsx scripts/memory/gate-runner.ts gateway/check_dps.ts registerCheckDps check_dps '{"planKeyword":"agent-memory"}'
 *
 * 注意：工作目录必须为仓库根；env.ts/fs.ts 依赖 PROJECT_ROOT/MAGIC_DIR/DATABASE_URL。
 */

const [moduleRel, exportName, toolName, argsJson] = process.argv.slice(2)
if (!moduleRel || !exportName || !toolName) {
  console.error("usage: gate-runner.ts <moduleRelPath> <exportName> <toolName> '<jsonArgs>'")
  process.exit(2)
}

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<unknown>

const captured: Record<string, Handler> = {}
const fakeRegistrar = {
  registerTool(name: string, _meta: unknown, handler: Handler) {
    captured[name] = handler
  },
}

const mod = await import(`../../templates/core/scripts/mcp-server/tools/${moduleRel}`)
const register = mod[exportName] as (server: unknown) => void
if (typeof register !== "function") {
  console.error(`export ${exportName} not found in ${moduleRel}`)
  process.exit(2)
}
register(fakeRegistrar)

const handler = captured[toolName]
if (!handler) {
  console.error(`tool ${toolName} not registered; available: ${Object.keys(captured).join(", ")}`)
  process.exit(2)
}

const args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
const result = (await handler(args, {})) as { content?: { text?: string }[] } | string
if (typeof result === "string") {
  console.log(result)
} else if (result && Array.isArray(result.content)) {
  console.log(result.content.map((c) => c.text ?? "").join("\n"))
} else {
  console.log(JSON.stringify(result, null, 2))
}
