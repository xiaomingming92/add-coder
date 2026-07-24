import { inputRequired, type InputRequiredResult, type InputRequest } from "@modelcontextprotocol/server"

function buildConfirmElicit(message: string, actions: readonly string[]): InputRequest {
  return inputRequired.elicit({
    message,
    requestedSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string" as const,
          enum: [...actions],
          description: "选择操作"
        }
      },
      required: ["action"]
    }
  })
}

export function elicitHitlConfirm(message: string): InputRequiredResult {
  return inputRequired({
    inputRequests: { elicit: buildConfirmElicit(message, ["accept", "reject", "modify"]) }
  })
}

export function elicitRiskPrompt(risk: string, suggestion: string): InputRequiredResult {
  return inputRequired({
    inputRequests: { elicit: buildConfirmElicit(`⚠️ 风险提示: ${risk}\n建议: ${suggestion}`, ["proceed", "abort"]) }
  })
}
