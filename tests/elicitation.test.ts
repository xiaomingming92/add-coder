/**
 * MCP Elicitation 单元测试
 * 验证 inputRequired.elicit() 返回的 InputRequiredResult 结构
 *
 * 运行: npx vitest run tests/elicitation.test.ts
 */

import { describe, it, expect } from "vitest"
import { elicitHitlConfirm, elicitRiskPrompt } from "../templates/core/scripts/mcp-server/elicitation/index.js"

describe("elicitHitlConfirm", () => {
    const result = elicitHitlConfirm("是否确认执行此操作？")

    it("resultType 是 input_required", () => {
        expect(result).toHaveProperty("resultType", "input_required")
    })

    it("含 inputRequests", () => {
        expect(result).toHaveProperty("inputRequests")
    })

    it("inputRequests 含 elicit 请求", () => {
        const ir = result.inputRequests as Record<string, unknown>
        expect(ir).toHaveProperty("elicit")
    })

    it("不同消息产生不同结果", () => {
        const r1 = elicitHitlConfirm("消息A")
        const r2 = elicitHitlConfirm("消息B")
        expect(r1).not.toBe(r2)
    })
})

describe("elicitRiskPrompt", () => {
    const result = elicitRiskPrompt("此操作将删除全部数据", "建议先备份到 /tmp")

    it("resultType 是 input_required", () => {
        expect(result).toHaveProperty("resultType", "input_required")
    })

    it("含 inputRequests", () => {
        expect(result).toHaveProperty("inputRequests")
    })

    it("inputRequests 含 elicit 请求", () => {
        const ir = result.inputRequests as Record<string, unknown>
        expect(ir).toHaveProperty("elicit")
    })
})
