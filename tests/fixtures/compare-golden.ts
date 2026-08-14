#!/usr/bin/env tsx
// compare-golden.ts — 双形态对比器（B1 行为等价验证，Task 2.3）
// 对 bash 版抓取的 golden 快照，用 node 版产物以同 stdin/env 重放，
// 断言 stdout/stderr/exitCode 逐字一致（diff 为空）。
// 用法:
//   tsx tests/fixtures/compare-golden.ts --scope core            # core 全量对比
//   tsx tests/fixtures/compare-golden.ts --scope core --hook vocabulary  # 单 hook
// 退出码: 0=全部逐字一致；2=存在差异（输出差异报告）

import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { projectRoot } from "../../src/shared/paths.js"

const PROJECT_DIR = projectRoot() ?? process.cwd()
const GOLDEN_DIR = join(PROJECT_DIR, "tests", "fixtures", "hook-golden")

/** 项目标记 hash（对齐 bash echo "${PROJECT_DIR}" | md5sum | cut -c1-8：echo 含换行） */
function bashHash(dir: string): string {
  return createHash("md5").update(`${dir}\n`).digest("hex").slice(0, 8)
}

/** 用例前置清理：dev/tpl/recovery 标记是跨用例共享的 /tmp 状态，统一清零保证抓取与重放状态一致 */
function cleanMarks(): void {
  const h = bashHash(PROJECT_DIR)
  for (const f of [`/tmp/add_dev_${h}`, `/tmp/add_tpl_${h}`, `/tmp/add_recovery_${h}`]) {
    try {
      rmSync(f, { force: true })
    } catch {
      /* ignore */
    }
  }
}

interface GoldenCase {
  name: string
  stdin: string
  env: Record<string, string>
  expect: { stdout: string; stderr: string; exitCode: number }
}

interface GoldenFile {
  hook: string
  scope: string
  source: string
  cases: GoldenCase[]
}

/** 递归列出 .golden.json（返回绝对路径） */
function listGolden(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirRecursive(dir).filter((entry) => entry.endsWith(".golden.json"))
}

function readdirRecursive(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...readdirRecursive(full))
    else out.push(full)
  }
  return out
}

/** 由 golden 的 source 路径推导 node 产物路径（生成态相对路径直接 .sh → .mjs） */
function mjsPathFor(source: string): string {
  const rel = source.replace(/\.sh$/, ".mjs")
  return join(PROJECT_DIR, rel)
}

interface Diff {
  hook: string
  caseName: string
  field: "stdout" | "stderr" | "exitCode"
  expected: string
  actual: string
}

/** 规范化：时间戳字段（对齐 bash date -Iseconds 与 TS localIsoSeconds 的格式，值随重放时间必然不同） */
function normalizeTs(s: string): string {
  return s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|\.\d+Z)?/g, "<TS>")
}

/**
 * 规范化：Plan 进度字段（done/total，如 15/32）——detect_active_add 返回 DB 实时值，
 * 随轮次推进必然变化（快照与重放不同），非 hook 行为差异。归一后两侧一致。
 * 注意: 其他 X/Y 形态（如证据比例）两侧同值，归一无害。
 */
function normalizeProgress(s: string): string {
  return s.replace(/\d{1,3}\/\d{1,3}/g, "<P>")
}

/**
 * 规范化：Plan 名（xxx-plan-vN）——detect_active_add 返回 DB 活跃 Plan 实时值，
 * 新 Plan 立项后快照与重放必然不同（数据非行为）。归一后两侧一致。
 */
function normalizePlanName(s: string): string {
  return s.replace(/[a-z0-9-]+-plan-v\d+/g, "<PLAN>")
}

function main(): void {
  const args = process.argv.slice(2)
  const scopeArg = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : ""
  const hookArg = args.includes("--hook") ? args[args.indexOf("--hook") + 1] : ""

  const goldenFiles = listGolden(GOLDEN_DIR)
    .map((f) => JSON.parse(readFileSync(f, "utf-8")) as GoldenFile)
    .filter((g) => !scopeArg || g.scope === scopeArg)
    .filter((g) => !hookArg || g.hook.replaceAll("/", "-") === hookArg || g.hook === hookArg)

  const diffs: Diff[] = []
  let compared = 0

  for (const golden of goldenFiles) {
    const mjsPath = mjsPathFor(golden.source)
    if (!existsSync(mjsPath)) {
      console.log(`⏭️  跳过 ${golden.scope}/${golden.hook}: node 产物不存在（${relative(PROJECT_DIR, mjsPath)}）`)
      continue
    }
    for (const c of golden.cases) {
      compared++
      cleanMarks()
      const r = spawnSync(process.execPath, [mjsPath], {
        input: c.stdin,
        env: { ...process.env, ...c.env },
        timeout: 10_000,
        encoding: "utf-8",
        cwd: PROJECT_DIR,
      })
      const stdout = normalizePlanName(normalizeProgress(normalizeTs(r.stdout ?? "")))
      const stderr = normalizePlanName(normalizeProgress(normalizeTs(r.stderr ?? "")))
      const exitCode = r.status ?? -1
      if (stdout !== normalizePlanName(normalizeProgress(normalizeTs(c.expect.stdout)))) {
        diffs.push({ hook: `${golden.scope}/${golden.hook}`, caseName: c.name, field: "stdout", expected: c.expect.stdout, actual: stdout })
      }
      if (stderr !== normalizePlanName(normalizeProgress(normalizeTs(c.expect.stderr)))) {
        diffs.push({ hook: `${golden.scope}/${golden.hook}`, caseName: c.name, field: "stderr", expected: c.expect.stderr, actual: stderr })
      }
      if (exitCode !== c.expect.exitCode) {
        diffs.push({ hook: `${golden.scope}/${golden.hook}`, caseName: c.name, field: "exitCode", expected: String(c.expect.exitCode), actual: String(exitCode) })
      }
    }
  }

  if (diffs.length === 0) {
    console.log(`✅ 双形态对比全绿：${compared} 个用例逐字一致`)
    return
  }
  console.error(`❌ 双形态对比发现 ${diffs.length} 处差异（${compared} 用例）:`)
  for (const d of diffs.slice(0, 30)) {
    console.error(`   - [${d.hook}] ${d.caseName}.${d.field}:\n     expected: ${JSON.stringify(d.expected).slice(0, 200)}\n     actual:   ${JSON.stringify(d.actual).slice(0, 200)}`)
  }
  if (diffs.length > 30) console.error(`   ... 其余 ${diffs.length - 30} 处省略`)
  process.exitCode = 2
}

main()
