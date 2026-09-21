/*
 * plan-close.ts — Plan 生命周期关闭/重开的**脚本入口**（随模板分发到 `{magicDir}/scripts/plan-close.ts`）
 *
 * 与 MCP 工具 `plan_update` **共用同一实现**：`scripts/mcp-server/tools/plan-lifecycle.ts::updatePlanLifecycle()`
 * （编排 = 前置校验 + 状态机迁移 + PUL 元数据 + 统一审计）。本文件只做参数解析与退出码，不再自己写逻辑
 * —— 2026-09-21 决策：禁止"工具一份、脚本一份"的漂移。
 *
 * 用法（工作目录 = 项目根）：
 *   PROJECT_ROOT=$PWD MAGIC_DIR=.codex DATABASE_URL="postgresql://..." \
 *   npx tsx "${MAGIC_DIR}/scripts/plan-close.ts" --plan <planName> [--to CLOSED] [--reason "…"] [--policy-ref "PUL:…"] [--force] [--dry-run]
 *
 * --to 取值即真源枚举（DRAFT/ACTIVE/BLOCKED/REJECTED/CLOSED/REOPENED/ABANDONED），默认 CLOSED。
 * 退出码：0 成功/幂等；1 前置校验或审计失败（stderr 给原因）；2 用法/环境错误。
 * 幂等：已是目标态 → 0 并报 idempotent。
 */

const argv = process.argv.slice(2)
const argValue = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const hasFlag = (name: string) => argv.includes(name)

const planName = argValue("--plan")
const to = (argValue("--to") ?? "CLOSED").toUpperCase()
const reason = argValue("--reason")
const policyRef = argValue("--policy-ref")
const force = hasFlag("--force")
const dryRun = hasFlag("--dry-run")

const { PROJECT_ROOT, MAGIC_DIR, DATABASE_URL } = process.env
const missing = [["PROJECT_ROOT", PROJECT_ROOT], ["MAGIC_DIR", MAGIC_DIR], ["DATABASE_URL", DATABASE_URL]]
  .filter(([, v]) => !v)
  .map(([k]) => k)
if (!planName || missing.length > 0) {
  console.error('usage: plan-close.ts --plan <planName> [--to CLOSED|REOPENED|ACTIVE|…] [--reason "…"] [--policy-ref "PUL:…"] [--force] [--dry-run]')
  if (missing.length > 0) console.error(`缺少环境变量: ${missing.join(" / ")}`)
  process.exit(2)
}

const { prisma } = await import("./mcp-server/shared/prisma.js")
const { createRuntimeContext } = await import("./mcp-server/shared/runtime-context.js")
const { PlanLifecycleStatusSchema } = await import("./mcp-server/shared/plan-lifecycle.js")
const { updatePlanLifecycle } = await import("./mcp-server/tools/plan-lifecycle.js")

// 目标状态必须来自真源枚举（zod 校验，禁止脚本里第二份字面量清单）
const parsed = PlanLifecycleStatusSchema.safeParse(to)
if (!parsed.success) {
  console.error(`--to 非法: ${to}（可选：${PlanLifecycleStatusSchema.options.join(" | ")}）`)
  process.exit(2)
}
const target = parsed.data

const runtime = createRuntimeContext(PROJECT_ROOT as string, MAGIC_DIR as string)

if (dryRun) {
  const current = await prisma.planRecord.findFirst({
    where: { projectKey: runtime.projectKey, adapterKey: runtime.adapterKey, planName },
  })
  console.log(JSON.stringify({ planName, from: (current as unknown as { lifecycle?: string } | null)?.lifecycle ?? null, to: target, dryRun: true }, null, 2))
  process.exit(0)
}

const result = await updatePlanLifecycle(prisma, runtime, {
  planName,
  target,
  reason: reason ?? null,
  policyRef: policyRef ?? null,
  force,
})

console.log(JSON.stringify({ planName, ...result }, null, 2))
if (!result.ok) {
  console.error(`✗ ${result.error ?? "更新失败"}`)
  process.exit(1)
}
if (result.idempotent) process.exit(0)
if (result.audit && !result.audit.ok) {
  console.error(`⚠️ ${result.audit.detail}`)
  process.exit(1)
}
process.exit(0)

// 顶层 await 需本文件被视为模块（tsconfig target=ES2022 / module=ESNext）
export {}
