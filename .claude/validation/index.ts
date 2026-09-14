/*
 * 校验层单一入口（Plan core-validation-lifecycle Task 1.3 / Spec §4 §LifecycleWiring）
 *
 * **所有调用方（hook 卡位 / 收尾 / 批量命令 / 封口判定）都调这一个入口**：
 *   validate({ type, path, hook, mode?, expectRounds?, projectRoot, magicDir })
 *
 * 入口职责：读文档 → 解析类型配置（工厂）→ 取 schema 真源 → 执行 schema 校验 → 应用策略（口径）。
 * 不在本层做任何"该类型特有"的判定（那是 validators/* 的专司）。
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveValidator } from "./registry.js"
import { applyApplicability, decidePolicy, type GovernanceHook, type ValidationMode } from "./policy.js"
import { typeCheckFor } from "./validators/index.js"
import {
  validateAgainstSchema,
  type SchemaFile,
  type ValidationIssue,
} from "./schema-validator.js"

export interface ValidateInput {
  type: string
  /** 文档绝对路径 */
  path: string
  hook: GovernanceHook
  /** 显式覆盖策略（缺省按卡位） */
  mode?: ValidationMode
  /** 多轮文档的期望轮次（由调用方给出，不由本层猜） */
  expectRounds?: number
  projectRoot: string
  magicDir: string
}

export interface ValidateOutcome {
  ok: boolean
  type: string
  hook: GovernanceHook
  mode: ValidationMode
  /** 策略依据（可审计） */
  basis: string
  schemaPath: string | null
  /** 该卡位算作缺陷的问题（参与 ok 判定） */
  issues: ValidationIssue[]
  /** 该卡位不算缺陷、但仍需可见的问题（诊断；不参与 ok 判定）——规则适用性过滤的产物 */
  diagnostics: ValidationIssue[]
}

/** schema 查找顺序：magic 目录副本优先，其次 templates/core 真源 */
function resolveSchemaPath(input: ValidateInput, schemaFile: string): string | null {
  const candidates = [
    join(input.projectRoot, input.magicDir, "templates", schemaFile),
    join(input.projectRoot, "templates", "core", "templates", schemaFile),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/** 模板查找（anchor 校验需要从模板对应行提取 token；顺序同 schema） */
function resolveTemplatePath(input: ValidateInput, templateFile: string): string | null {
  const candidates = [
    join(input.projectRoot, input.magicDir, "templates", templateFile),
    join(input.projectRoot, "templates", "core", "templates", templateFile),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

export function validate(input: ValidateInput): ValidateOutcome {
  const config = resolveValidator(input.type) // 未注册类型 → 抛错（不回落通用校验）
  const policy = decidePolicy(input.hook, input.type, input.mode)
  const schemaPath = resolveSchemaPath(input, config.schema)

  const base: Omit<ValidateOutcome, "ok" | "issues" | "diagnostics" | "schemaPath"> = {
    type: input.type,
    hook: input.hook,
    mode: policy.mode,
    basis: policy.basis,
  }

  // schema 缺失 = 无法判定 → 显式失败（禁止静默放行，Spec §1）
  if (!schemaPath) {
    return {
      ...base,
      ok: false,
      schemaPath: null,
      issues: [
        {
          code: "MISSING_SECTION",
          detail: `schema 真源缺失：${config.schema}（请执行 add-coder sync 或核对 templates/core/templates/）`,
          expected: config.schema,
        },
      ],
      diagnostics: [],
    }
  }
  if (!existsSync(input.path)) {
    return {
      ...base,
      ok: false,
      schemaPath,
      issues: [{ code: "MISSING_SECTION", detail: `文档不存在：${input.path}`, expected: input.path }],
      diagnostics: [],
    }
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as SchemaFile
  const content = readFileSync(input.path, "utf-8")
  // 锚点规则需要模板内容（token 从模板行提取）；缺模板则锚点规则自动跳过（不误判）
  const templatePath = schema.template ? resolveTemplatePath(input, schema.template) : null
  const templateContent = templatePath ? readFileSync(templatePath, "utf-8") : undefined
  // schema 层（形式）+ 专司层（本类型特有语义）——两层各自负责，互不重复
  const rawIssues = validateAgainstSchema(content, schema, {
    expectRounds: config.multiRound ? input.expectRounds : undefined,
    templateContent,
  })
  const typeCheck = typeCheckFor(input.type)
  if (typeCheck) {
    rawIssues.push(...typeCheck({ type: input.type, content, path: input.path, expectRounds: input.expectRounds }))
  }
  // 规则适用性（Rule × Hook）：不在本卡位生效的规则降级为诊断，不参与 ok 判定
  const { applicable, diagnostics } = applyApplicability(rawIssues, input.hook)
  return { ...base, ok: applicable.length === 0, schemaPath, issues: applicable, diagnostics }
}

export { resolveValidator, VALIDATOR_REGISTRY, UnknownValidatorTypeError } from "./registry.js"
export { decidePolicy, applyApplicability, DEFAULT_RULE_APPLICABILITY } from "./policy.js"
export type { RuleApplicability, ApplicabilityResult } from "./policy.js"
export type { ValidationMode, GovernanceHook } from "./policy.js"
export {
  validateAgainstSchema,
  inferRoundHeading,
  countRounds,
  stripFencedBlocks,
} from "./schema-validator.js"
export type { SchemaFile, SchemaSection, ValidationIssue, IssueCode } from "./schema-validator.js"
export { typeCheckFor, uncoveredTypes } from "./validators/index.js"
export type { TypeCheck, TypeCheckContext } from "./validators/types.js"
