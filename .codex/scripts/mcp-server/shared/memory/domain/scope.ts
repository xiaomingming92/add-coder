/*
 * Memory Scope 规则（Plan §7.2）
 *
 * 优先级：symbol > path > module > branch > repository > organization
 * ORGANIZATION 首版禁用（写入拒绝，§17-7）；PLAN/SPEC 只在对应流程或显式历史查询中参与。
 */
import { MemoryError } from "./errors.js"

export type MemoryScopeType =
  | "ORGANIZATION" | "REPOSITORY" | "BRANCH" | "MODULE"
  | "PATH" | "SYMBOL" | "PLAN" | "SPEC"

export interface Scope {
  type: MemoryScopeType
  value: string
}

/** 召回时的上下文坐标（由调用方从运行时环境组装） */
export interface ScopeContext {
  repository: string
  branch?: string
  module?: string
  paths?: string[]
  symbols?: string[]
  planKeyword?: string
  specRef?: string
  /** 显式历史查询时放行 PLAN/SPEC scope（默认 false） */
  includePlanScope?: boolean
}

const RANK: Record<MemoryScopeType, number> = {
  SYMBOL: 7,
  PATH: 6,
  MODULE: 5,
  BRANCH: 4,
  REPOSITORY: 3,
  PLAN: 2,
  SPEC: 2,
  ORGANIZATION: 1,
}

export function scopeRank(t: MemoryScopeType): number {
  return RANK[t]
}

/** 写入守卫：ORGANIZATION 首版禁用 */
export function assertScopeWritable(scope: Scope): void {
  if (scope.type === "ORGANIZATION") {
    throw new MemoryError("ERR_ORG_SCOPE_DISABLED")
  }
}

/** 判定一条 Memory 的 scope 在当前上下文是否有效（召回过滤用） */
export function scopeApplies(memScope: Scope, ctx: ScopeContext): boolean {
  switch (memScope.type) {
    case "ORGANIZATION":
      return false // 首版禁用
    case "REPOSITORY":
      return memScope.value === ctx.repository
    case "BRANCH":
      return !!ctx.branch && ctx.branch === memScope.value
    case "MODULE":
      // module 语义：当前任一路径以该模块目录为前缀
      return !!ctx.module && ctx.module === memScope.value ||
        (ctx.paths ?? []).some((p) => p === memScope.value || p.startsWith(memScope.value + "/"))
    case "PATH":
      return (ctx.paths ?? []).some(
        (p) => p === memScope.value || p.startsWith(memScope.value.replace(/\/?$/, "/")),
      )
    case "SYMBOL":
      return (ctx.symbols ?? []).includes(memScope.value)
    case "PLAN":
      return !!ctx.includePlanScope && !!ctx.planKeyword && ctx.planKeyword === memScope.value
    case "SPEC":
      return !!ctx.includePlanScope && !!ctx.specRef && ctx.specRef === memScope.value
  }
}

/**
 * supersede 兼容性（Plan §4.4）：新旧 Memory 的 repository/scope 必须兼容。
 * 兼容 = 同类型同值；或 PATH/MODULE 类型间存在前缀覆盖；或一方为 REPOSITORY（全库覆盖）。
 */
export function scopesCompatible(a: Scope, b: Scope): boolean {
  if (a.type === b.type && a.value === b.value) return true
  if (a.type === "REPOSITORY" || b.type === "REPOSITORY") {
    return a.type === "REPOSITORY" && b.type === "REPOSITORY" ? a.value === b.value : true
  }
  const pathLike = (t: MemoryScopeType) => t === "PATH" || t === "MODULE"
  if (pathLike(a.type) && pathLike(b.type)) {
    return a.value.startsWith(b.value.replace(/\/?$/, "/")) ||
      b.value.startsWith(a.value.replace(/\/?$/, "/"))
  }
  return false
}
