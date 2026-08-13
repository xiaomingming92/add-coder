import dotenv from "dotenv"
import { Client } from "pg"
import { realpathSync } from "fs"
import { resolve } from "path"
import { createRuntimeContext, type AdapterMagicDir } from "../templates/core/scripts/mcp-server/shared/runtime-context.js"

dotenv.config({ path: resolve(process.cwd(), ".env.development") })

interface LegacyPlan {
  id: string
  planName: string
  planPath: string
}

interface ScopeCandidate {
  id: string
  planName: string
  planPath: string
  projectRoot: string
  projectKey: string
  adapterKey: string
  magicDir: AdapterMagicDir
}

const PLAN_PATH_SCOPE = /^(.*)\/(\.(?:add|claude|codex|qoder|trae|vscode))\/(?:plans|reviews|specs)(?:\/|$)/

export function scopeCandidateFromPlanPath(plan: LegacyPlan): ScopeCandidate | null {
  const absolutePath = resolve(plan.planPath)
  const match = absolutePath.match(PLAN_PATH_SCOPE)
  if (!match) return null
  const projectRoot = realpathSync.native(match[1])
  const context = createRuntimeContext(projectRoot, match[2])
  return {
    ...plan,
    projectRoot,
    projectKey: context.projectKey,
    adapterKey: context.adapterKey,
    magicDir: context.magicDir,
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL 未设置")
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const plans = await client.query<LegacyPlan>('SELECT "id", "planName", "planPath" FROM "PlanRecord" ORDER BY "createdAt"')
    const candidates = plans.rows.map(scopeCandidateFromPlanPath)
    const ambiguous = plans.rows.filter((_, index) => candidates[index] === null)
    const scoped = candidates.filter((candidate): candidate is ScopeCandidate => candidate !== null)
    const childCounts = await client.query<{ tableName: string; count: string }>(`
      SELECT 'HitlRecord' AS "tableName", count(*)::text AS count FROM "HitlRecord"
      UNION ALL SELECT 'ReviewRecord', count(*)::text FROM "ReviewRecord"
      UNION ALL SELECT 'DevOperation', count(*)::text FROM "DevOperation"
      UNION ALL SELECT 'AuditLog', count(*)::text FROM "AuditLog"
      UNION ALL SELECT 'CollabContract', count(*)::text FROM "CollabContract"
    `)
    const duplicateContexts = new Map<string, number>()
    for (const row of scoped) {
      const key = `${row.projectKey}:${row.adapterKey}:${row.planName}`
      duplicateContexts.set(key, (duplicateContexts.get(key) ?? 0) + 1)
    }
    const collisions = [...duplicateContexts.entries()].filter(([, count]) => count > 1)
    const report = {
      mode: "dry-run",
      safeToMigrate: ambiguous.length === 0 && collisions.length === 0,
      planCount: plans.rowCount ?? plans.rows.length,
      proposedScopes: scoped.map(({ id, planName, planPath, projectRoot, projectKey, adapterKey }) => ({
        id, planName, planPath, projectRoot, projectKey, adapterKey,
      })),
      ambiguousPlans: ambiguous,
      scopedKeyCollisions: collisions.map(([key, count]) => ({ key, count })),
      childCounts: Object.fromEntries(childCounts.rows.map((row) => [row.tableName, Number(row.count)])),
      legacyAuditPolicy: "无法唯一关联 Plan 的历史 AuditLog/DevOperation 保留 legacy-unknown，并被 scoped runtime fail-closed 排除",
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!report.safeToMigrate) process.exitCode = 2
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith("runtime-scope-dry-run.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`[runtime-scope-dry-run] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
