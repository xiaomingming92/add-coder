/**
 * MCP shared 层单元测试
 * 测试 response.ts / types.ts，零依赖
 *
 * 运行: npx vitest run tests/shared.test.ts
 */

import { describe, it, expect } from "vitest"
import { textResponse, errorResponse } from "../templates/core/scripts/mcp-server/shared/response.js"

describe("textResponse", () => {
  it("返回 { content: [{ type: 'text', text }] } 结构", () => {
    const r = textResponse("hello")
    expect(r.content).toHaveLength(1)
    expect(r.content[0]).toEqual({ type: "text", text: "hello" })
  })

  it("处理空字符串", () => {
    const r = textResponse("")
    expect(r.content[0].text).toBe("")
  })

  it("处理多行文本", () => {
    const r = textResponse("line1\nline2\nline3")
    expect(r.content[0].text).toContain("\n")
  })
})

describe("errorResponse", () => {
  it("返回 { content, isError: true } 结构", () => {
    const r = errorResponse("something wrong")
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toBe("something wrong")
  })

  it("textResponse 不带 isError", () => {
    const r = textResponse("ok")
    expect(r).not.toHaveProperty("isError")
  })
})
