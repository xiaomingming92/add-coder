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
  projectKey: z.string(),
  adapterKey: z.string(),
  planName: z.string(),
  lifecycle: z.enum(["DRAFT", "ACTIVE", "BLOCKED", "REJECTED", "CLOSED", "ABANDONED"]),
  revision: z.number(),
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
  projectKey: z.string(),
  adapterKey: z.string(),
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
  projectKey: z.string(),
  adapterKey: z.string(),
  planName: z.string(),
  type: z.enum(["PLAN_REVIEW", "IMPLEMENTATION", "RUNTIME"]),
  reviewPath: z.string().nullable(),
  p0Count: z.number(),
  p1Count: z.number(),
  backflowRate: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const AuditLogRowSchema = z.looseObject({
  id: z.string(),
  projectKey: z.string(),
  producerAdapterKey: z.string(),
  contextId: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  beforeState: z.unknown().nullable(),
  afterState: z.unknown().nullable(),
  reason: z.string().nullable(),
  planKeyword: z.string().nullable(),
  createdAt: z.date(),
})

export const DevOperationRowSchema = z.looseObject({
  id: z.string(),
  userId: z.string(),
  projectKey: z.string(),
  producerAdapterKey: z.string(),
  contextId: z.string(),
  toolName: z.string(),
  operationKey: z.string(),
  planKeyword: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  beforeState: z.unknown().nullable(),
  afterState: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdAt: z.date(),
})

// AddUser 仅消费 id（select { id } 场景），username/email 宽容可空
// （避免 select 裁剪导致必填字段缺失误伤——机器占位机器回刷原则）
export const AddUserRowSchema = z.looseObject({
  id: z.string(),
  username: z.string().optional(),
  email: z.string().nullable().optional(),
})

export const CollabContractRowSchema = z.looseObject({
  id: z.string(),
  projectKey: z.string(),
  ownerAdapterKey: z.string(),
  contractName: z.string(),
  contractPath: z.string(),
  masterPlanName: z.string(),
  masterProjectKey: z.string(),
  masterAdapterKey: z.string(),
  participants: z.unknown(),
  abilityMatrix: z.unknown().nullable(),
  stages: z.unknown(),
  dependencyGraph: z.string().nullable(),
  fileBoundaries: z.unknown(),
  completionCriteria: z.unknown().nullable(),
  status: z.string(),
  version: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// ===== 类型派生（单一真源：schema → 类型） =====

export type PlanRow = z.infer<typeof PlanRowSchema>
export type HitlRow = z.infer<typeof HitlRowSchema>
export type ReviewRow = z.infer<typeof ReviewRowSchema>
export type AuditLogRow = z.infer<typeof AuditLogRowSchema>
export type DevOperationRow = z.infer<typeof DevOperationRowSchema>
export type AddUserRow = z.infer<typeof AddUserRowSchema>
export type CollabContractRow = z.infer<typeof CollabContractRowSchema>

// ===== 查询参数（Prisma 最常用子集，结构化约束 + 运算符支持） =====

export type OrderDirection = "asc" | "desc"

// where 放开为 Record<string, unknown>：Prisma 运算符（contains/gte/OR 等）
// 动态组合，键名约束会阻碍合法查询（如 review.ts 的 contains、audit.ts 的 OR）
export interface QueryArgs<T> {
  where?: Record<string, unknown>
  orderBy?: { [K in keyof T]?: OrderDirection }
  take?: number
  skip?: number
  include?: Record<string, unknown>
}

export interface BatchResult { count: number }

// ===== 泛型委托接口：业务层唯一依赖的数据访问契约 =====

export interface TableDelegate<T> {
  findFirst(args: Pick<QueryArgs<T>, "where" | "orderBy">): Promise<T | null>
  findMany(args?: QueryArgs<T>): Promise<T[]>
  findUnique(args: { where: Record<string, unknown>; select?: Record<string, unknown> }): Promise<T | null>
  create(args: { data: Partial<T> }): Promise<T>
  upsert(args: { where: Record<string, unknown>; create: Partial<T>; update: Partial<T> }): Promise<T>
  update(args: { where: Partial<T>; data: Partial<T> }): Promise<T>
  updateMany(args: { where: Record<string, unknown>; data: Partial<T> }): Promise<BatchResult>
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
      const row = await raw.findFirst(args)
      return row === null ? null : parseRow(row)
    },
    async findMany(args) {
      const rows = await raw.findMany(args)
      return rows.map(parseRow)
    },
    async findUnique(args) {
      if (!raw.findUnique) throw new Error(`表 ${tableName} 不支持 findUnique`)
      const row = await raw.findUnique(args)
      return row === null ? null : parseRow(row)
    },
    async create(args) { return parseRow(await raw.create(args)) },
    async upsert(args) {
      if (!raw.upsert) throw new Error(`表 ${tableName} 不支持 upsert`)
      return parseRow(await raw.upsert(args))
    },
    async update(args) { return parseRow(await raw.update(args)) },
    async updateMany(args) { return raw.updateMany(args) },
    async delete(args) { return parseRow(await raw.delete(args)) },
    async deleteMany(args) { return raw.deleteMany(args) },
  }
}
