/*
 * 专司注册（Plan core-validation-lifecycle Task 2.5 / Spec §2 §ValidatorRegistry）
 *
 * 类型 → 专司检查函数。**未注册类型的专司缺口会被显式报告**（`uncoveredTypes()`），
 * 避免"加了新文档类型但忘了写专司"这种事悄悄发生。
 */
import type { TypeCheck } from "./types.js"
import { checkHandoff } from "./handoff.js"
import { checkChecklist } from "./checklist.js"
import { checkTasks } from "./tasks.js"
import { checkSpec } from "./spec.js"
import { checkPlan } from "./plan.js"
import { checkAddRoute } from "./add-route.js"
import { checkReview } from "./review.js"
import { checkHitl } from "./hitl.js"
import { checkReport } from "./report.js"

/** 类型 → 专司（可多对一：同类文档共用一份专司逻辑，但入口按 type 显式登记） */
export const TYPE_CHECKS: Readonly<Record<string, TypeCheck>> = {
  "plan.standard": checkPlan,
  "plan.simple": checkPlan,
  spec: checkSpec,
  tasks: checkTasks,
  checklist: checkChecklist,
  "add-route": checkAddRoute,
  "handoff.single": checkHandoff,
  "handoff.multi": checkHandoff,
  review: checkReview,
  "review.implementation": checkReview,
  "review.runtime": checkReview,
  hitl: checkHitl,
  report: checkReport,
  "runtime-report": checkReport,
  "collab-contract": checkReport,
  "fix-verification": checkReport,
  prd: checkReport,
} as const

/** 取得该类型的专司（未登记返回 null，由调用方决定是否报缺口） */
export function typeCheckFor(type: string): TypeCheck | null {
  return TYPE_CHECKS[type] ?? null
}

/** 覆盖自检：registry 里已注册但缺少专司的类型（供 checklist 断言） */
export function uncoveredTypes(registeredTypes: readonly string[]): string[] {
  return registeredTypes.filter((t) => !(t in TYPE_CHECKS))
}

export { checkHandoff, checkChecklist, checkTasks, checkSpec, checkPlan, checkAddRoute, checkReview, checkHitl, checkReport }
export { checklistStats } from "./checklist.js"
export { tasksStats } from "./tasks.js"
export { addRouteStats } from "./add-route.js"
