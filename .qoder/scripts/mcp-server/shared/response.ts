import type { ToolResponse } from "../types.js"

export function textResponse(text: string): { content: ToolResponse } {
  return { content: [{ type: "text", text }] }
}

export function errorResponse(message: string): { content: ToolResponse; isError: boolean } {
  return { content: [{ type: "text", text: message }], isError: true }
}
