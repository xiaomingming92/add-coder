/*
 * 专司 validator 的共享契约（Plan core-validation-lifecycle Task 2.x / Spec §2 §ValidatorRegistry）
 *
 * 分工原则：**schema 层管形式，专司层管本类型特有的语义**。
 * 专司只补充「schema 表达不了」的规则（如"§8 必须有可执行审计查询"、"checklist 的 [T] 未勾数"），
 * 不重复章节存在性判定——那由 schema 层负责（Spec §1）。
 */
import type { ValidationIssue } from "../schema-validator.js"

export interface TypeCheckContext {
  type: string
  content: string
  path: string
  /** 多轮文档的期望轮次（由调用方给出） */
  expectRounds?: number
}

export type TypeCheck = (ctx: TypeCheckContext) => ValidationIssue[]

export function issue(code: string, detail: string, expected?: string): ValidationIssue {
  return expected === undefined ? { code, detail } : { code, detail, expected }
}

/** 统计匹配次数（供各专司复用） */
export function countMatches(content: string, re: RegExp): number {
  return (content.match(re) ?? []).length
}

/** 去掉围栏代码块（语义检查一般不该被示例代码命中） */
export function proseOnly(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "\n")
}
