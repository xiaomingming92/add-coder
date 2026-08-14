#!/usr/bin/env tsx
// capture-golden.ts — bash 版行为快照抓取器（B1 基准，Task 1.4）
// 数据流: bash hook + 用例集 → spawn 执行 → {stdin, stdout, stderr, exitCode} 快照
// 基准归属（Plan §3.6 B1）: core 共享逻辑以 core 版为准；adapter 私有协议各端自身为准
// 抓取源: 生成态 magicDir（sync 烘焙后的实际运行副本）——与 node 产物同物理位置，
//         保证 magicDir 物理推导可比（源目录 templates/** 推导结果不同）。
// 用法:
//   tsx tests/fixtures/capture-golden.ts                        # 全量抓取（core + 5 adapter）
//   tsx tests/fixtures/capture-golden.ts --scope core           # 仅 core
//   tsx tests/fixtures/capture-golden.ts --scope qoder --hook prompt-submit  # 单 hook
//   tsx tests/fixtures/capture-golden.ts --baseline             # 固化 bash 冷启动基线（B2 对比对象）
//   tsx tests/fixtures/capture-golden.ts --refresh-fixed --scope core --hook session-start
//     # 修复类 hook（bash 缺陷已修）: 用 node 产物输出反写 golden（修复后行为基准）
// 输出: tests/fixtures/hook-golden/<scope>/<hook>.golden.json + bash-baseline.json

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join, relative, dirname, basename } from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { projectRoot } from "../../src/shared/paths.js"

const PROJECT_DIR = projectRoot() ?? process.cwd()
const FIXTURE_DIR = join(PROJECT_DIR, "tests", "fixtures", "hook-golden")

interface GoldenCase {
  name: string
  stdin: string
  env: Record<string, string>
}

interface GoldenFile {
  hook: string
  scope: string
  source: string
  capturedAt: string
  cases: Array<GoldenCase & { expect: { stdout: string; stderr: string; exitCode: number } }>
}

// 默认用例集（每 hook 通用三用例；hook 特定触发词用例在轮次 2-7 迁移前逐个补充）
function defaultCases(magicDir: string): GoldenCase[] {
  return [
    { name: "empty-stdin", stdin: "", env: { MAGIC_DIR: magicDir, PROJECT_DIR } },
    { name: "json-object", stdin: "{}", env: { MAGIC_DIR: magicDir, PROJECT_DIR } },
    { name: "no-magicdir-failclosed", stdin: "{}", env: { PROJECT_DIR } },
  ]
}

const SCOPES: Array<{ name: string; dir: string; magicDir: string }> = [
  // 生成态抓取（与 node 产物同物理位置）
  { name: "core", dir: ".add/hooks", magicDir: ".add" },
  { name: "claude", dir: ".claude/hooks", magicDir: ".claude" },
  { name: "qoder", dir: ".qoder/hooks", magicDir: ".qoder" },
  { name: "vscode", dir: ".vscode/hooks", magicDir: ".vscode" },
  { name: "trae", dir: ".trae/hooks", magicDir: ".trae" },
  { name: "codex", dir: ".codex/hooks", magicDir: ".codex" },
]

/** 递归列出 .sh 文件（相对 scope 根） */
function listShFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listShFiles(full))
    else if (entry.isFile() && entry.name.endsWith(".sh")) out.push(full)
  }
  return out
}

/** 执行单个用例，抓取快照 */
function runCase(shPath: string, c: GoldenCase): GoldenFile["cases"][number]["expect"] {
  // 用例前置清理：dev/tpl/recovery 标记是跨用例共享的 /tmp 状态，统一清零保证抓取与重放一致
  const h = createHash("md5").update(`${PROJECT_DIR}\n`).digest("hex").slice(0, 8)
  for (const f of [`/tmp/add_dev_${h}`, `/tmp/add_tpl_${h}`, `/tmp/add_recovery_${h}`]) {
    try {
      rmSync(f, { force: true })
    } catch {
      /* ignore */
    }
  }
  const r = spawnSync("bash", [shPath], {
    input: c.stdin,
    env: { ...process.env, ...c.env },
    timeout: 10_000,
    encoding: "utf-8",
    cwd: PROJECT_DIR,
  })
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    exitCode: r.status ?? -1,
  }
}

function captureOne(scope: string, magicDir: string, srcRoot: string, shPath: string): void {
  // hook 名用相对路径（lib/session-end 与根 session-end 不冲突）
  const hookRel = relative(srcRoot, shPath).replace(/\.sh$/, "")
  const outDir = join(FIXTURE_DIR, scope, dirname(hookRel))
  mkdirSync(outDir, { recursive: true })
  const golden: GoldenFile = {
    hook: hookRel.replaceAll("/", "-"),
    scope,
    source: relative(PROJECT_DIR, shPath),
    capturedAt: new Date().toISOString(),
    cases: defaultCases(magicDir).map((c) => ({
      ...c,
      expect: runCase(shPath, c),
    })),
  }
  writeFileSync(join(outDir, `${basename(hookRel)}.golden.json`), JSON.stringify(golden, null, 2) + "\n", "utf-8")
}

/** 固化 bash 冷启动基线（每 hook 3 次计时取中位，B2 对比对象） */
function captureBaseline(): void {
  interface BaselineEntry {
    hook: string
    scope: string
    coldMs: number
    samples: number[]
  }
  const baseline: BaselineEntry[] = []
  for (const s of SCOPES) {
    const srcDir = join(PROJECT_DIR, s.dir)
    for (const f of listShFiles(srcDir)) {
      const samples: number[] = []
      for (let i = 0; i < 3; i++) {
        const start = performance.now()
        spawnSync("bash", [f], {
          input: "{}",
          env: { ...process.env, MAGIC_DIR: s.magicDir, PROJECT_DIR },
          timeout: 10_000,
          encoding: "utf-8",
          cwd: PROJECT_DIR,
        })
        samples.push(Number((performance.now() - start).toFixed(1)))
      }
      samples.sort((a, b) => a - b)
      baseline.push({
        hook: relative(srcDir, f),
        scope: s.name,
        coldMs: samples[1],
        samples,
      })
    }
  }
  mkdirSync(FIXTURE_DIR, { recursive: true })
  writeFileSync(
    join(FIXTURE_DIR, "bash-baseline.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), entries: baseline }, null, 2) + "\n",
    "utf-8"
  )
  const avg = baseline.length
    ? Math.round(baseline.reduce((a, b) => a + b.coldMs, 0) / baseline.length)
    : 0
  console.log(`⏱️  bash 冷启动基线已固化: ${baseline.length} 个 hook，均值 ${avg}ms → bash-baseline.json`)
}

/** 递归列出目录下指定后缀文件 */
function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, ext))
    else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full)
  }
  return out
}

/** 修复类 hook 反写前清理共享 /tmp 标记（对齐 runCase——抓取与重放状态一致，
 *  Task 9.4 修复: 原不清理导致 dev 标记残留时抓成 Q4 场景，对比时 cleanMarks 后走 Q3 → 假 diff） */
function cleanMarks(): void {
  const h = createHash("md5").update(`${PROJECT_DIR}\n`).digest("hex").slice(0, 8)
  for (const f of [`/tmp/add_dev_${h}`, `/tmp/add_tpl_${h}`, `/tmp/add_recovery_${h}`]) {
    try {
      rmSync(f, { force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * 修复类 hook golden 反写（Plan §3.2 ④: golden fixture 按修复后行为抓取）:
 * bash 版存在缺陷（PLANS_DIR 未绑定崩溃 / SHARED_LIB 路径断裂 / magicDir 推导 bug），
 * TS 版为修复后行为——用 node 产物以同用例重放，覆写 golden 的 expect。
 */
function refreshFixed(scopeArg: string, hookArg: string): void {
  for (const s of SCOPES) {
    if (scopeArg && s.name !== scopeArg) continue
    const mjsDir = join(PROJECT_DIR, s.dir)
    for (const f of listFiles(mjsDir, ".mjs")) {
      const hookRel = relative(mjsDir, f).replace(/\.mjs$/, "")
      if (hookArg && basename(hookRel) !== hookArg && hookRel !== hookArg) continue
      const goldenPath = join(FIXTURE_DIR, s.name, dirname(hookRel), `${basename(hookRel)}.golden.json`)
      if (!existsSync(goldenPath)) continue
      const golden = JSON.parse(readFileSync(goldenPath, "utf-8")) as GoldenFile
      const newCases = golden.cases.map((c) => {
        cleanMarks()
        const r = spawnSync(process.execPath, [f], {
          input: c.stdin,
          env: { ...process.env, ...c.env },
          timeout: 10_000,
          encoding: "utf-8",
          cwd: PROJECT_DIR,
        })
        return {
          ...c,
          expect: {
            stdout: r.stdout ?? "",
            stderr: r.stderr ?? "",
            exitCode: r.status ?? -1,
          },
        }
      })
      golden.cases = newCases
      golden.source = relative(PROJECT_DIR, f)
      golden.capturedAt = new Date().toISOString()
      writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + "\n", "utf-8")
      console.log(`🔄 修复类反写: ${s.name}/${basename(hookRel)}（${newCases.length} 用例，修复后行为）`)
    }
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const scopeArg = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : ""
  const hookArg = args.includes("--hook") ? args[args.indexOf("--hook") + 1] : ""

  if (args.includes("--refresh-fixed")) {
    refreshFixed(scopeArg, hookArg)
    return
  }

  if (args.includes("--baseline")) {
    captureBaseline()
    return
  }

  const targets = SCOPES.filter((s) => !scopeArg || s.name === scopeArg)
  let captured = 0
  for (const s of targets) {
    const srcDir = join(PROJECT_DIR, s.dir)
    const shFiles = listShFiles(srcDir)
    for (const f of shFiles) {
      if (hookArg && basename(f, ".sh") !== hookArg) continue
      captureOne(s.name, s.magicDir, srcDir, f)
      captured++
    }
    console.log(`📸 ${s.name}: ${shFiles.length} 个 bash hook，已抓取 ${hookArg ? 1 : shFiles.length} 个`)
  }
  console.log(`\n✅ golden 快照共 ${captured} 个 → ${relative(PROJECT_DIR, FIXTURE_DIR)}/`)
}

main()
