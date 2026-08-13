import { inputRequired, type InputRequiredResult } from "@modelcontextprotocol/server"
import { join } from "path"
import { readFileSafe, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"

/**
 * HITL Review 触发
 * ADD-9 方向验证 / ADD-10 语义对齐 / ADD-11 证据持久化
 *
 * 方案/实现 Review: 读取模板 → 整理 dimensions → create_hitl → update_hitl → status_hitl → 写入正式 Review
 * Runtime Review: [T] 全部通过后按模板直接生成，不走 HITL
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
  const requiresHitl = reviewType !== "runtime"
  const reviewPlanName = reviewType === "plan"
    ? `${planKeyword}-review-v1`
    : `${planKeyword}-review-${reviewType}`

  const workflowGuide = requiresHitl ? `
## HITL 审核流程

1. 根据模板与审查证据，将待拍板发现整理为 dimensions
2. 调用 create_hitl({ planName: "${reviewPlanName}", type: "PLAN_REVIEW", dimensions })
3. 人类审核提案后调用 update_hitl 完成 TONGYI/BOHUI 拍板
4. 通过 status_hitl 确认 TONGYI 后，生成完整 Review 写入 ${MAGIC_DIR}/reviews/
5. 将 Review 结论回流至 Plan 与 Specs（Step 0.6.5）

模板:
${template?.slice(0, 3000) ?? `标准 ${reviewType} Review 模板`}
` : `
## Runtime Review 流程

1. 确认 implementation checklist 的 [T] 项已全部通过
2. 按模板直接生成 Runtime Review 写入 ${MAGIC_DIR}/reviews/
3. 持久化运行时证据，并将发现回流至 Plan、Specs 或 runtime-fix Plan

模板:
${template?.slice(0, 3000) ?? "标准 runtime Review 模板"}
`

  const prompt = `请为 Plan "${planKeyword}" 生成 Review（类型: ${reviewType}）。
先读取 ${MAGIC_DIR}/templates/${templateFile}，再严格执行下述流程。

${workflowGuide}`

  const sampleRequest = inputRequired.createMessage({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt } }],
    maxTokens: 4000
  })

  return inputRequired({
    inputRequests: { sample: sampleRequest }
  })
}
