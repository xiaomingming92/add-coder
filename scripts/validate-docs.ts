/*
 * validate-docs.ts — 文档批量校验命令（Plan core-validation-lifecycle Task 4.1 / Spec §4）
 *
 * 用途：收尾 / sync / 巡检时批量校验 `{magicDir}/{plans,specs,reviews}` 下的文档。
 * 与 hook 卡位**共用同一入口**（`core/validation`）——这是"联动"的可测定义：
 * 同一文档从 hook 与从本命令得到完全相同的结论。
 *
 * 用法：
 *   npx tsx scripts/validate-docs.ts [--json] [--strict] [--hook <Hook>] [--file <path>] [--dir <magicDir>]
 *
 * 口径：默认 `hook=manual`（advisory，不阻断）；`--hook PreToolUse` 可复现写入时口径（blocking）。
 * 退出码：默认恒 0（报告）；`--strict` 时存在缺陷则 1。
 * 结果落点：**AuditBridge**（`{magicDir}/reports/hook-events.jsonl`，与守卫同通道、幂等去重由消费端负责）。
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { pathToFileURL } from "node:url"
import { validate, type GovernanceHook, type ValidationIssue } from "../templates/core/validation/index.js"

export interface BatchTarget {
  path: string
  rel: string
  type: string
  expectRounds?: number
}

export interface BatchItemResult {
  rel: string
  type: string
  ok: boolean
  issues: ValidationIssue[]
  diagnostics: ValidationIssue[]
  skipped?: string
}

export interface BatchReport {
  magicDir: string
  hook: GovernanceHook
  checked: number
  skipped: number
  failed: number
  diagnostics: number
  items: BatchItemResult[]
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.name.endsWith(".md")) out.push(full)
  }
  return out
}

/** 从文档路径推导校验类型；无法判定返回 null（**报告为跳过，不静默忽略**） */
export function inferDocType(rel: string): string | null {
  // 前置 "/" 使 `plans/...` 这类相对路径也能被 "/plans/" 匹配到（2026-09-13 修复：漏前缀导致零命中）
  const p = "/" + rel.replace(/\\/g, "/")
  const name = p.split("/").pop() ?? ""
  if (p.includes("/specs/")) {
    if (name === "spec.md") return "spec"
    if (name === "tasks.md") return "tasks"
    if (name === "checklist.md") return "checklist"
    return null
  }
  if (p.includes("/reviews/")) {
    if (name.includes("review-implementation")) return "review.implementation"
    if (name.includes("review-runtime")) return "review.runtime"
    if (name.includes("review")) return "review"
    return null
  }
  if (p.includes("/plans/")) {
    if (name.includes(".hitl.")) return "hitl"
    if (name.includes("add-route")) return "add-route"
    if (name.includes("handoff")) return "handoff" // 单/多轮在收集阶段按轮次判定
    if (/-plan-v\d+\.md$/.test(name)) return "plan.standard"
    return null
  }
  return null
}

/** 轮次数推导：取各制品中 `轮次 N` 的最大编号；编号从 0 起 → +1，从 1 起 → 不变 */
export function roundsFromContents(contents: readonly string[]): number {
  const nums: number[] = []
  for (const c of contents) for (const m of c.matchAll(/轮次\s*(\d+)/g)) nums.push(Number(m[1]))
  if (nums.length === 0) return 1
  const max = Math.max(...nums)
  const min = Math.min(...nums)
  return min === 0 ? max + 1 : max
}

export function collectTargets(projectRoot: string, magicDir: string): BatchTarget[] {
  const base = join(projectRoot, magicDir)
  const files = [...walkFiles(join(base, "plans")), ...walkFiles(join(base, "specs")), ...walkFiles(join(base, "reviews"))]
  const targets: BatchTarget[] = []
  for (const abs of files) {
    const rel = relative(base, abs)
    const type = inferDocType(rel)
    if (!type) continue
    if (type === "handoff") {
      // 轮次取该 Plan 的 tasks.md（同为既有制品）
      const planName = rel.split("/").pop()?.replace(/-handoff.*$/, "") ?? ""
      const tasksCandidates = walkFiles(join(base, "specs")).filter((f) => f.endsWith("tasks.md"))
      const rounds = roundsFromContents(
        tasksCandidates
          .filter((f) => relative(base, f).includes(planName.replace(/-plan-v\d+$/, "")))
          .map((f) => readFileSync(f, "utf-8")),
      )
      targets.push({ path: abs, rel, type: rounds > 1 ? "handoff.multi" : "handoff.single", expectRounds: rounds })
      continue
    }
    targets.push({ path: abs, rel, type })
  }
  return targets
}

export function runBatch(opts: {
  projectRoot: string
  magicDir: string
  hook?: GovernanceHook
  file?: string
}): BatchReport {
  const hook = opts.hook ?? "manual"
  let targets = collectTargets(opts.projectRoot, opts.magicDir)
  if (opts.file) targets = targets.filter((t) => t.path === opts.file || t.rel === opts.file)

  const items: BatchItemResult[] = []
  let skipped = 0
  for (const t of targets) {
    try {
      const r = validate({
        type: t.type,
        path: t.path,
        hook,
        expectRounds: t.expectRounds,
        projectRoot: opts.projectRoot,
        magicDir: opts.magicDir,
      })
      items.push({ rel: t.rel, type: t.type, ok: r.ok, issues: r.issues, diagnostics: r.diagnostics })
    } catch (error) {
      skipped++
      items.push({
        rel: t.rel,
        type: t.type,
        ok: false,
        issues: [],
        diagnostics: [],
        skipped: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    magicDir: opts.magicDir,
    hook,
    checked: items.filter((i) => !i.skipped).length,
    skipped,
    failed: items.filter((i) => !i.skipped && !i.ok).length,
    diagnostics: items.reduce((sum, i) => sum + i.diagnostics.length, 0),
    items,
  }
}

/** 结果落 AuditBridge（与守卫同通道） */
export function writeAuditLine(projectRoot: string, report: BatchReport): void {
  const dir = join(projectRoot, report.magicDir, "reports")
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 不阻断 */
  }
  const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const line =
    `{"ts":"${ts}","hook":"validate-docs","decision":"${report.failed > 0 ? "fail" : "pass"}",` +
    `"cmd":"validate-docs","reason":"checked=${report.checked},failed=${report.failed},diagnostics=${report.diagnostics}",` +
    `"planKeyword":"unknown","planStatus":"none","hookMode":"${report.hook}"}\n`
  try {
    appendFileSync(join(dir, "hook-events.jsonl"), line)
  } catch {
    /* fail-open */
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const has = (flag: string): boolean => args.includes(flag)
  const value = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const projectRoot = process.cwd()
  const magicDir = value("--dir") ?? process.env.MAGIC_DIR ?? ".codex"
  const hook = (value("--hook") ?? "manual") as GovernanceHook
  const file = value("--file")

  const report = runBatch({ projectRoot, magicDir, hook, file })
  writeAuditLine(projectRoot, report)

  if (has("--json")) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`=== 文档批量校验（magicDir=${magicDir}, hook=${report.hook}）===`)
    for (const item of report.items) {
      const mark = item.skipped ? "⏭" : item.ok ? "✅" : "❌"
      const detail = item.skipped
        ? `跳过：${item.skipped}`
        : `缺陷=${item.issues.length} 诊断=${item.diagnostics.length}`
      console.log(`${mark} [${item.type}] ${item.rel} — ${detail}`)
    }
    console.log(`--- 合计：检查 ${report.checked} / 失败 ${report.failed} / 跳过 ${report.skipped} / 诊断 ${report.diagnostics}`)
  }

  const strict = has("--strict")
  process.exitCode = strict && report.failed > 0 ? 1 : 0
}

const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
