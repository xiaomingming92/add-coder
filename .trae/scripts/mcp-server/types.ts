import type { McpServer } from "@modelcontextprotocol/server"

export type ToolResponse = Array<{ type: "text"; text: string }>

export interface GuardResult { ok: boolean; issues: string }

export type ToolRegistrar = (server: McpServer) => void
