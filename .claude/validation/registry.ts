/*
 * validator 注册表（Plan core-validation-lifecycle Task 1.2 / Spec §2 §ValidatorRegistry）
 *
 * 文档类型 → validator 配置的**工厂**。未注册类型直接报错——不回落"通用校验"，
 * 否则遗漏一个类型不会被发现（Spec §2）。
 *
 * 17 类文档与 schema 真源的对应关系见 Spec §5 覆盖表；schema 文件名由本表推导，不散落在调用方。
 */

export interface ValidatorConfig {
  /** 文档类型标识（与 Spec §5 覆盖表一一对应） */
  type: string
  /** schema 文件名（位于 `{magicDir}/templates/` 或 `templates/core/templates/`） */
  schema: string
  /** 是否多轮文档（需要 expectRounds） */
  multiRound?: boolean
  /** 该类型特有的附加规则标识（由 validators/* 实现消费） */
  extra?: "checklistT" | "tasksCheckbox" | "addRouteSteps"
}

export const VALIDATOR_REGISTRY: readonly ValidatorConfig[] = [
  { type: "plan.standard", schema: "standard-plan-template.schema.json" },
  { type: "plan.simple", schema: "simple-plan-template.schema.json" },
  { type: "spec", schema: "spec-template.schema.json" },
  { type: "tasks", schema: "tasks-template.schema.json", extra: "tasksCheckbox" },
  { type: "checklist", schema: "checklist-template.schema.json", extra: "checklistT" },
  { type: "add-route", schema: "add-route-template.schema.json", extra: "addRouteSteps" },
  { type: "handoff.single", schema: "handoff-single-round-template.schema.json" },
  { type: "handoff.multi", schema: "handoff-multi-round-template.schema.json", multiRound: true },
  { type: "review", schema: "review-template.schema.json" },
  { type: "review.implementation", schema: "review-implementation-template.schema.json" },
  { type: "review.runtime", schema: "review-runtime-template.schema.json" },
  { type: "hitl", schema: "hitl-template.schema.json" },
  { type: "report", schema: "report-template.schema.json" },
  { type: "runtime-report", schema: "runtime-report-template.schema.json" },
  { type: "collab-contract", schema: "collab-contract-template.schema.json" },
  { type: "fix-verification", schema: "fix-verification-template.schema.json" },
  { type: "prd", schema: "prd-standard-template.schema.json" },
] as const

export class UnknownValidatorTypeError extends Error {
  constructor(type: string) {
    super(
      `未注册的文档类型：${type}。已注册：${VALIDATOR_REGISTRY.map((v) => v.type).join(", ")}`,
    )
    this.name = "UnknownValidatorTypeError"
  }
}

/** 工厂：按类型取配置；未注册即抛（不回落通用校验） */
export function resolveValidator(type: string): ValidatorConfig {
  const found = VALIDATOR_REGISTRY.find((v) => v.type === type)
  if (!found) throw new UnknownValidatorTypeError(type)
  return found
}

/** 覆盖完整性自检：返回 schema 清单中未被注册的类型对应文件（供 checklist 断言用） */
export function unregisteredSchemas(schemaFiles: readonly string[]): string[] {
  const registered = new Set(VALIDATOR_REGISTRY.map((v) => v.schema))
  return schemaFiles.filter((f) => !registered.has(f))
}
