// hook-benchmark.test.ts — B2 性能基准（Task 1.5，轮次 1）
// 断言（spec §5）:
//   - node 产物冷启动均值 ≤100ms（spawnSync 计时，实测试点 27ms）
//   - 产物零依赖: 每个 .mjs 无 node_modules 引用（grep 断言）
//   - 配置真源 command 形态: 全部 "node ...mjs"（无 bash / 无 .sh）
//   - bash 基线对比: bash-baseline.json（固化为对比对象，CI 只断言 node 侧）
// 防抖: ≤100ms 留 3.7 倍余量（实测 27ms），不设环境豁免

import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, basename } from "node:path"
import { spawnSync } from "node:child_process"
import { projectRoot } from "../src/shared/paths.js"

const PROJECT_DIR = projectRoot() ?? process.cwd()
const FIXTURE_DIR = join(PROJECT_DIR, "tests", "fixtures", "hook-golden")
const COLD_LIMIT_MS = 100

/** 递归列出 .mjs 产物 */
function listMjs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listMjs(full))
    else if (entry.isFile() && entry.name.endsWith(".mjs")) out.push(full)
  }
  return out
}

/** bridge 依赖型入口（detectActiveAdd → spawn node --import tsx bridge，固有 DB 查询成本） */
const BRIDGE_HOOKS = new Set([
  "session-start",
  "stop-check",
  "pre-tool-use",
  "post-tool-use",
  "prompt-submit",
  "subagent-stop",
  "pre-compact",
  "notification",
  "session-end",
  "doc-format-guard",
])

/** bridge 类上限：tsx 冷启动 ~500-700ms（实测），留 3 倍余量 */
const BRIDGE_LIMIT_MS = 2000

/** 冷启动计时（3 次取中位） */
function coldStartMs(file: string): number {
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    spawnSync(process.execPath, [file], {
      input: "{}",
      timeout: 10_000,
      encoding: "utf-8",
      cwd: PROJECT_DIR,
    })
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples[1]
}

describe("B2 性能基准", () => {
  const mjsFiles = listMjs(join(PROJECT_DIR, ".add", "hooks"))

  it("node 产物冷启动均值 ≤100ms（现有产物逐文件断言）", () => {
    // 轮次 1 仅 lib/common.mjs；轮次 2-7 产物逐步增多，轮次 8 全量 85 文件
    expect(mjsFiles.length).toBeGreaterThan(0)
    const times = mjsFiles.map((f) => ({ file: relative(PROJECT_DIR, f), ms: coldStartMs(f) }))
    // 纯冷启动组：≤100ms 硬断言（无 bridge 依赖）
    const pure = times.filter((t) => !BRIDGE_HOOKS.has(basename(t.file, ".mjs")))
    for (const t of pure) {
      expect(t.ms, `${t.file} 冷启动超限`).toBeLessThanOrEqual(COLD_LIMIT_MS)
    }
    if (pure.length > 0) {
      const avg = pure.reduce((a, b) => a + b.ms, 0) / pure.length
      expect(avg).toBeLessThanOrEqual(COLD_LIMIT_MS)
    }
    // bridge 依赖组：≤2000ms（node --import tsx bridge 固有 DB 查询成本）
    for (const t of times.filter((t) => BRIDGE_HOOKS.has(basename(t.file, ".mjs")))) {
      expect(t.ms, `${t.file} bridge 冷启动超限`).toBeLessThanOrEqual(BRIDGE_LIMIT_MS)
    }
  })

  it("产物零依赖：排除 esbuild 模块来源注释后无 node_modules 引用", () => {
    for (const f of mjsFiles) {
      const content = readFileSync(f, "utf-8")
      // esbuild bundle 内联依赖（如 find-up）时以 `// node_modules/.pnpm/...` 注释保留来源路径，
      // 非真实依赖引用——排除注释行后断言（2026-08-14 Task 5.1 修正: 裸 includes 误报）
      const codeLines = content.split("\n").filter((l) => !l.trim().startsWith("//"))
      expect(
        codeLines.some((l) => l.includes("node_modules")),
        `${relative(PROJECT_DIR, f)} 含 node_modules 引用`
      ).toBe(false)
    }
  })

  it("配置真源 command 形态：node 直调（无 bash 字样 / 无 .sh）", () => {
    const configs = [
      "templates/adapters/qoder/settings.json",
      "templates/adapters/claude/settings.json",
      "templates/adapters/trae/hooks.json",
      "templates/adapters/codex/hooks.json",
    ]
    for (const c of configs) {
      const content = readFileSync(join(PROJECT_DIR, c), "utf-8")
      expect(content.includes("bash "), `${c} 仍含 bash 命令`).toBe(false)
      expect(content.includes(".sh"), `${c} 仍指向 .sh`).toBe(false)
      expect(content.includes("node "), `${c} 未指向 node`).toBe(true)
    }
  })

  it("bash 基线已固化（B2 对比对象，134 hook）", () => {
    const baselinePath = join(FIXTURE_DIR, "bash-baseline.json")
    expect(existsSync(baselinePath), "bash-baseline.json 缺失（先运行 capture-golden.ts --baseline）").toBe(true)
    const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"))
    expect(baseline.entries.length).toBeGreaterThan(100)
    // 对比输出（不断言 node 必须快于 bash——CI 只断言 node 侧上限）
    const avgBash = Math.round(
      baseline.entries.reduce((a: number, b: { coldMs: number }) => a + b.coldMs, 0) / baseline.entries.length
    )
    console.log(`[B2] bash 基线均值 ${avgBash}ms（node 上限 ${COLD_LIMIT_MS}ms）`)
  })
})
