import { McpServer } from "@modelcontextprotocol/server"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { registerAll } from "./mcp-server/index.js"
import { redact } from "./mcp-server/shared/redact.js"

async function main() {
  const server = new McpServer(
    { name: "add-dev-tools", version: "1.0.0" },
    { capabilities: { tools: {}, resources: { subscribe: true } } }
  )
  registerAll(server)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ADD-MCP] add-dev-tools MCP server started on stdio")
}

main().catch((error) => {
  console.error("[ADD-MCP] Fatal error:", redact(error instanceof Error ? error.message : String(error)))
  process.exit(1)
})
