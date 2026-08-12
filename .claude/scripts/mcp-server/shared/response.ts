import type { ToolResponse } from "../types.js"
import { redact } from "./redact.js"

export function textResponse(text: string): { content: ToolResponse } {
  return { content: [{ type: "text", text: redact(text) }] }
}

export function errorResponse(message: string): { content: ToolResponse; isError: boolean } {
  return { content: [{ type: "text", text: redact(message) }], isError: true }
}
