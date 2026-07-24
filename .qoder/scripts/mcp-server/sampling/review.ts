import { inputRequired, type InputRequiredResult } from "@modelcontextprotocol/server"
import { join } from "path"
import { readFileSafe, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"

/**
 * HITL Review 触发
 * ADD-9 方向验证 / ADD-10 语义对齐 / ADD-11 证据持久化
 *
 * 流程: 读取 Review 模板 → 生成 HITL 发现总览 temporary.md → 人类拍板 → 写入正式 Review
 * 参考: add-paradigm SKILL Step 0.6.5（Review 结论回流至 Plan 与 Specs）
 */
export async function createReviewRequest(planKeyword: string, reviewType: "plan" | "implementation" | "runtime" = "plan"): Promise<InputRequiredResult> {
  const templateFile = reviewType === "plan"
    ? "review-template.md"
    : reviewType === "implementation"
      ? "review-implementation-template.md"
      : "review-runtime-template.md"

  const templatePath = join(PROJECT_ROOT, MAGIC_DIR, "templates", templateFile)
  const template = await readFileSafe(templatePath)

  const hitlGuide = `
## HITL 审核流程（两步法）

1. 先写 {review-name}.temporary.md（只含 HITL 发现总览表 + 问题清单）
2. 人类拍板后 → 生成完整 Review 写入 ${MAGIC_DIR}/reviews/
3. 将 Review 结论回流至 Plan（Step 0.6.5）

模板:
${template?.slice(0, 3000) ?? `标准 ${reviewType} Review 模板`}
`

  const prompt = `请为 Plan "${planKeyword}" 发起 HITL Review（类型: ${reviewType}）。
先读取 ${MAGIC_DIR}/reviews/ 下已有的 Review 模板，
然后按 HITL 两步法：先写 temporary.md → 人类拍板 → 生成完整 Review。

${hitlGuide}`

  const sampleRequest = inputRequired.createMessage({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt } }],
    maxTokens: 4000
  })

  return inputRequired({
    inputRequests: { sample: sampleRequest }
  })
}
