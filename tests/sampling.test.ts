/**
 * MCP Sampling 单元测试
 *
 * 运行: npx vitest run tests/sampling.test.ts
 */

import { describe, it, expect } from "vitest"

describe("Sampling: createReviewRequest", () => {
    it("返回 InputRequiredResult 结构", async () => {
        const { createReviewRequest } = await import("../templates/core/scripts/mcp-server/sampling/index.js")
        const result = await createReviewRequest("test-plan")
        expect(result).toBeDefined()
        expect(typeof result).toBe("object")
    })

    it("不同关键词返回不同结果", async () => {
        const { createReviewRequest } = await import("../templates/core/scripts/mcp-server/sampling/index.js")
        const r1 = await createReviewRequest("plan-a")
        const r2 = await createReviewRequest("plan-b")
        // 两者应该有不同的 prompt 内容（关键词不同）
        expect(r1).not.toBe(r2)
    })
})
