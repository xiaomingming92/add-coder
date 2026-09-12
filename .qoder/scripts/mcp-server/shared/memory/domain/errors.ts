/*
 * Memory 子系统稳定错误码（Plan §12.3：MCP 错误采用稳定错误码，不能只返回自由文本）
 * 契约：code 字符串冻结，变更需走 Review；message 可携带上下文细节。
 */
export const MEMORY_ERROR = {
  ERR_REPOSITORY_MISMATCH: "调用方 repositoryRef 与运行时上下文不一致，越权访问被拒绝",
  ERR_ORG_SCOPE_DISABLED: "ORGANIZATION scope 首版禁用（Plan §17-7 定案）",
  ERR_ILLEGAL_TRANSITION: "非法状态迁移",
  ERR_EVIDENCE_REQUIRED: "进入 ACTIVE 必须至少关联一条 Evidence",
  ERR_APPROVAL_REQUIRED: "进入 ACTIVE 必须提供 approvedBy/approvedAt",
  ERR_SUPERSESSION_INVALID: "supersede 需要有效的 supersededById 且 repository/scope 兼容",
  ERR_INVARIANT: "字段不变量违反（如 importance/confidence 越出 [0,1]）",
  ERR_FTS_UNAVAILABLE: "FTS 能力不可用且无法降级",
  ERR_SECRET_DETECTED: "内容命中密钥/凭证模式，拒写",
  ERR_NOT_FOUND: "记录不存在",
  ERR_EMBEDDING_DISABLED: "EmbeddingProvider=none，向量能力未启用",
} as const

export type MemoryErrorCode = keyof typeof MEMORY_ERROR

export class MemoryError extends Error {
  readonly code: MemoryErrorCode
  constructor(code: MemoryErrorCode, detail?: string) {
    super(detail ? `${code}: ${MEMORY_ERROR[code]}（${detail}）` : `${code}: ${MEMORY_ERROR[code]}`)
    this.name = "MemoryError"
    this.code = code
  }
}

export function isMemoryError(e: unknown): e is MemoryError {
  return e instanceof MemoryError
}
