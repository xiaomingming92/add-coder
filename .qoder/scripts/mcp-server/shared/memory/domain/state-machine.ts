/*
 * Memory 生命周期状态机（Plan §5）
 *
 * CANDIDATE → PENDING → ACTIVE → STALE → SUPERSEDED → ARCHIVED
 *     │          │         │        └──────────────→ ARCHIVED
 *     └──────────┴─────────┴──────────────────────→ REJECTED
 *
 * 首版默认只允许人工或显式治理调用激活（approve 的强制校验在此表达）。
 */
import { MemoryError } from "./errors.js"

export type MemoryStatus =
  | "CANDIDATE" | "PENDING" | "ACTIVE" | "STALE"
  | "SUPERSEDED" | "REJECTED" | "ARCHIVED"

export type MemoryAction =
  | "propose" | "submit_review" | "approve" | "reject"
  | "mark_stale" | "supersede" | "archive" | "restore"

interface Transition {
  from: MemoryStatus[]
  to: MemoryStatus
}

/** 迁移表：propose 是创建语义（无 from），其余均为状态到状态 */
export const TRANSITIONS: Record<MemoryAction, Transition> = {
  propose:       { from: [],                              to: "CANDIDATE" },
  submit_review: { from: ["CANDIDATE"],                   to: "PENDING" },
  approve:       { from: ["PENDING", "CANDIDATE"],        to: "ACTIVE" },
  reject:        { from: ["CANDIDATE", "PENDING"],        to: "REJECTED" },
  mark_stale:    { from: ["ACTIVE"],                      to: "STALE" },
  supersede:     { from: ["ACTIVE", "STALE"],             to: "SUPERSEDED" },
  archive:       { from: ["ACTIVE", "STALE", "SUPERSEDED"], to: "ARCHIVED" },
  restore:       { from: ["ARCHIVED", "REJECTED"],        to: "CANDIDATE" },
}

/** approve / supersede 的不变量校验输入（DB 查询结果由调用方传入，领域层保持纯函数） */
export interface TransitionContext {
  evidenceCount?: number
  approvedBy?: string | null
  approvedAt?: Date | null
  /** supersede 专用：新记忆 id 与 repository/scope 兼容性判定结果 */
  supersededById?: string | null
  supersessionCompatible?: boolean
}

export interface TransitionResult {
  from: MemoryStatus
  to: MemoryStatus
  action: MemoryAction
}

/** 判定迁移是否合法；非法时抛 MemoryError（ERR_ILLEGAL_TRANSITION / ERR_EVIDENCE_REQUIRED / ...） */
export function assertTransition(
  current: MemoryStatus,
  action: MemoryAction,
  ctx: TransitionContext = {},
): TransitionResult {
  const t = TRANSITIONS[action]
  if (action === "propose") {
    // 创建语义：不与现有状态冲突（由调用方决定新建或合并）
    return { from: current, to: t.to, action }
  }
  if (!t.from.includes(current)) {
    throw new MemoryError("ERR_ILLEGAL_TRANSITION", `${current} --${action}--> ${t.to} 不允许（允许起点: ${t.from.join("/")}）`)
  }
  if (action === "approve") {
    if (!ctx.evidenceCount || ctx.evidenceCount < 1) {
      throw new MemoryError("ERR_EVIDENCE_REQUIRED")
    }
    if (!ctx.approvedBy) {
      throw new MemoryError("ERR_APPROVAL_REQUIRED", "缺少 approvedBy")
    }
  }
  if (action === "supersede") {
    if (!ctx.supersededById) {
      throw new MemoryError("ERR_SUPERSESSION_INVALID", "缺少 supersededById")
    }
    if (ctx.supersessionCompatible === false) {
      throw new MemoryError("ERR_SUPERSESSION_INVALID", "新旧 Memory 的 repository/scope 不兼容")
    }
  }
  return { from: current, to: t.to, action }
}

/** 默认召回允许的状态集合（Plan §7.1：默认排除 CANDIDATE/PENDING/REJECTED/ARCHIVED/SUPERSEDED/过期项） */
export const DEFAULT_RECALL_STATUSES: readonly MemoryStatus[] = ["ACTIVE"]

/** 显式诊断模式额外放行 STALE（带警告） */
export const DIAGNOSTIC_RECALL_STATUSES: readonly MemoryStatus[] = ["ACTIVE", "STALE"]
