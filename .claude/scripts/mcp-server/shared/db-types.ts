/*
 * 数据层结构化类型（MCP server）— zod 托管版（D1）
 *
 * 背景：shared/prisma.ts 运行时动态 require 生成的 Prisma client（模板会被复制到任意
 * 消费方项目，不能静态依赖特定生成类型）——加载点的「无类型」不可避免。
 *
 * 本文件职责（边界从「盲信 cast」升级为「运行期验证」）：
 * 1. zod schema 为单一真源：行类型一律 z.infer 派生（编译期约束不丢）
 * 2. validatedDelegate 包装 findFirst/findMany/create/update/delete：
 *    DB 返回行过 schema.parse —— 消费方迁移滞后/schema 漂移时**立即显式报错**，
 *    而非让 undefined 字段静默漂移到下游
 * 3. z.looseObject 前瞻兼容（zod v4 替代已弃用的 .passthrough()）：add.prisma 未来加列不误伤旧模板
 * 4. parse 失败出处方式报错（弱模型可执行），不裸抛 zod issue 堆栈
 *
 * 契约：schema 须与 prisma/add.prisma 模型对齐（字段名/可空性）。
 */
import * as z from "zod/v4"

// ===== 行 schema（对齐 prisma/add.prisma；looseObject 前瞻兼容） =====

export const PlanRowSchema = z.looseObject({
  id: z.string(),
  planName: z.string(),
  planPath: z.string(),
  planKeyword: z.string().nullable(),
  specPath: z.string().nullable(),
  tasksPath: z.string().nullable(),
  checklistPath: z.string().nullable(),
  addRoutePath: z.string().nullable(),
  totalTasks: z.number(),
  doneTasks: z.number(),
  checklistT: z.number(),
  checklistTDone: z.number(),
  checklistR: z.number(),
  dpsStructScore: z.number().nullable(),
  dpsSemScore: z.number().nullable(),
  dpsEntropyScore: z.number().nullable(),
  dpsCpmScore: z.number().nullable(),
  dpsComposite: z.number().nullable(),
  contractRole: z.string().nullable(),
  contractName: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const HitlRowSchema = z.looseObject({
  id: z.string(),
  planName: z.string(),
  round: z.number(),
  type: z.enum(["PLAN", "PLAN_REVIEW", "COLLAB_CONTRACT"]),
  status: z.enum(["DRAFT", "SUBMITTED", "TONGYI", "BOHUI"]),
  approvedAt: z.date().nullable(),
  rejectedAt: z.date().nullable(),
  rejectReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const ReviewRowSchema = z.looseObject({
  id: z.string(),
  planName: z.string(),
  reviewType: z.string(),
  reviewPath: z.string(),
  p0Count: z.number(),
  p1Count: z.number(),
  p2Count: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const AuditLogRowSchema = z.looseObject({
  id: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  beforeState: z.string().nullable(),
  afterState: z.string().nullable(),
  reason: z.string().nullable(),
  planKeyword: z.string().nullable(),
  createdAt: z.date(),
})

// ===== 类型派生（单一真源：schema → 类型） =====

export type PlanRow = z.infer<typeof PlanRowSchema>
export type HitlRow = z.infer<typeof HitlRowSchema>
export type ReviewRow = z.infer<typeof ReviewRowSchema>
export type AuditLogRow = z.infer<typeof AuditLogRowSchema>

// ===== 查询参数（Prisma 最常用子集，结构化约束） =====

export type OrderDirection = "asc" | "desc"

export interface QueryArgs<T> {
  where?: Partial<T>
  orderBy?: { [K in keyof T]?: OrderDirection }
  take?: number
  skip?: number
}

export interface BatchResult { count: number }

// ===== 泛型委托接口：业务层唯一依赖的数据访问契约 =====

export interface TableDelegate<T> {
  findFirst(args: Pick<QueryArgs<T>, "where" | "orderBy">): Promise<T | null>
  findMany(args?: QueryArgs<T>): Promise<T[]>
  create(args: { data: Partial<T> }): Promise<T>
  update(args: { where: Partial<T>; data: Partial<T> }): Promise<T>
  delete(args: { where: Partial<T> }): Promise<T>
  deleteMany(args: { where: Partial<T> }): Promise<BatchResult>
}

// ===== 边界升级：validating delegate（无类型收敛单点 + 运行期行校验） =====

/**
 * 把动态加载的无类型 delegate 包装为**运行期校验**的泛型委托。
 * - 读路径（findFirst/findMany）与写返回值（create/update/delete）过 schema.parse
 * - parse 失败 → 可读处方报错（表名 + 首个问题 + 迁移指引），不裸抛 zod 堆栈
 * - deleteMany 仅返回计数，无行结构可校验，直通
 */
export function validatedDelegate<T>(
  rawDelegate: unknown,
  rowSchema: z.ZodType<T>,
  tableName: string,
): TableDelegate<T> {
  const raw = rawDelegate as TableDelegate<unknown>

  const parseRow = (row: unknown): T => {
    const result = rowSchema.safeParse(row)
    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue?.path?.join(".") || "(未知字段)"
      throw new Error(
        `DB 行结构与预期不符（表 ${tableName}）: ${field} — ${issue?.message ?? "校验失败"}\n` +
        `处方: 检查项目是否已迁移至最新 prisma/add.prisma（bash scripts/db-ensure.sh），或核对 db-types.ts schema 与 add.prisma 是否同步`
      )
    }
    return result.data
  }

  return {
    async findFirst(args) {
      const row = await raw.findFirst(args as never)
      return row === null ? null : parseRow(row)
    },
    async findMany(args) {
      const rows = await raw.findMany(args as never)
      return rows.map(parseRow)
    },
    async create(args) { return parseRow(await raw.create(args as never)) },
    async update(args) { return parseRow(await raw.update(args as never)) },
    async delete(args) { return parseRow(await raw.delete(args as never)) },
    async deleteMany(args) { return raw.deleteMany(args as never) as Promise<BatchResult> },
  }
}
