#!/usr/bin/env tsx
// hook-bake.ts — TS 源码 → esbuild 烘焙 mjs 分发管线（轮次 1 / Task 1.1）
// 数据流: templates/**/hooks/*.ts → esbuild bundle ESM mjs → 各 magicDir hooks/*.mjs
// 校验: 产物零 node_modules 引用 + 可独立执行（node 冒烟退出码 ∈ {0,2}）
// 使用: tsx scripts/hook-bake.ts            # 全量烘焙 + 校验
//       tsx scripts/hook-bake.ts --check    # 仅校验现有产物
//       tsx scripts/hook-bake.ts --dry-run  # 只列出计划不落盘
//       tsx scripts/hook-bake.ts --publish  # 发布预烘焙: 产物写入模板源目录（随 npm 分发）
//                                            用户 init/sync 零编译（修复 0.3.27+ 打包产物缺失）

import { projectRoot } from "../src/shared/paths.js"
import { genHookRules } from "./hook-rules-gen.js"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join, relative, dirname, basename } from "node:path"
import { spawnSync } from "node:child_process"
import { build } from "esbuild"

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_DIR = projectRoot() ?? process.cwd()
const TARGET = "node24" // [回流: Review P1 #5 target 对齐 node24]

interface BakeTarget {
  src: string
  dest: string
  name: string
}

// 与 SYNC_MAGIC_CONFIG.HOOKS 同构；trae 为独立源（Task 1.6 切断镜像后）；
// codex 补充在 HOOKS 配置之外（codex 端 hooks.json 直调 node 产物）
const BAKE_TARGETS: BakeTarget[] = [
  { src: "templates/core/hooks", dest: ".add/hooks", name: ".add hooks" },
  { src: "templates/adapters/claude/hooks", dest: ".claude/hooks", name: "claude hooks" },
  { src: "templates/adapters/qoder/hooks", dest: ".qoder/hooks", name: "qoder hooks" },
  { src: "templates/adapters/vscode/hooks", dest: ".vscode/hooks", name: "vscode hooks" },
  { src: "templates/adapters/trae/hooks", dest: ".trae/hooks", name: "trae hooks" },
  { src: "templates/adapters/codex/hooks", dest: ".codex/hooks", name: "codex hooks" },
]

/** 发布预烘焙目标：仅 adapter 源目录（core hooks 为 dogfood 源，无分发 hooks.json 消费方） */
const PUBLISH_TARGETS = BAKE_TARGETS.filter((t) => !t.src.startsWith("templates/core/"))

/** 递归列出目录下所有 .ts 文件（相对 src 路径）；lib/ 子目录跳过——
 * lib 仅作为源码被入口 bundle 内联（产物自包含），lib.mjs 无消费者且纯库化后无行为 */
function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === "lib") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full)
    }
  }
  return out
}

interface ArtifactCheck {
  zeroDep: boolean
  smoke: string
}

/** 校验产物：零外部依赖（排除注释行）+ node 冒烟退出码 ∈ {0,2} */
function checkArtifact(file: string): ArtifactCheck {
  const content = readFileSync(file, "utf-8")
  // 零依赖精确断言: esbuild bundle 内联依赖（如 find-up）时以 `// node_modules/.pnpm/...`
  // 注释保留模块来源路径——非真实依赖引用，需排除注释行后检查（2026-08-14 Task 5.1 修正: 裸 includes 误报）
  const codeLines = content.split("\n").filter((l) => !l.trim().startsWith("//"))
  const zeroDep = !codeLines.some((l) => l.includes("node_modules"))
  const r = spawnSync(process.execPath, [file], {
    input: "{}",
    timeout: 5000,
    encoding: "utf-8",
  })
  // 0 = 正常/无操作；2 = 阻断语义；1/崩溃/超时 = 不通过
  const smoke =
    r.status === 0 || r.status === 2
      ? "ok"
      : `FAIL(exit=${r.status}, signal=${r.signal ?? "none"})`
  return { zeroDep, smoke }
}

interface BakeResult {
  baked: string[]
  failures: string[]
}

async function bakeTarget(target: BakeTarget): Promise<BakeResult> {
  const srcAbs = join(PROJECT_DIR, target.src)
  const destAbs = join(PROJECT_DIR, target.dest)
  const tsFiles = listTsFiles(srcAbs)
  const baked: string[] = []
  const failures: string[] = []

  if (tsFiles.length === 0) {
    // 轮次 1 时源目录仅有 .sh（双形态共存窗口），空源不报错
    return { baked, failures }
  }

  mkdirSync(destAbs, { recursive: true })

  for (const tsFile of tsFiles) {
    const relName = relative(srcAbs, tsFile).replace(/\.ts$/, ".mjs")
    const outFile = join(destAbs, relName)
    mkdirSync(dirname(outFile), { recursive: true })
    try {
      await build({
        entryPoints: [tsFile],
        bundle: true,
        format: "esm",
        platform: "node",
        target: TARGET,
        outfile: outFile,
        logLevel: "silent",
      })
      const { zeroDep, smoke } = checkArtifact(outFile)
      if (!zeroDep || smoke !== "ok") {
        failures.push(
          `${target.name}/${relName}: zeroDep=${zeroDep}, smoke=${smoke}`
        )
      }
      baked.push(relative(PROJECT_DIR, outFile))
    } catch (err) {
      failures.push(
        `${target.name}/${relName}: bake error ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  return { baked, failures }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const checkOnly = args.includes("--check")
  const dryRun = args.includes("--dry-run")
  const publish = args.includes("--publish")

  console.log(`🍞 hook-bake ${checkOnly ? "(check)" : dryRun ? "(dry-run)" : publish ? "(publish)" : ""} — target=${TARGET}`)

  // 规则控制面注入（Task 1.3）: 烘焙前重生成 rules.ts（真源 = caijuehub hook-*.toml ×5），
  // 入口源码 import "./lib/rules.js" 时由 bundle 内联（产物零依赖）
  if (!checkOnly && !dryRun) {
    const rulesExit = genHookRules()
    if (rulesExit !== 0) {
      console.error("⚠️ 规则真源部分缺失（已用 fail-safe 默认常量），继续烘焙")
    }
  }

  // ── 发布预烘焙：产物写入模板源目录（src == dest），随 npm 包分发 ──
  // 修复 0.3.27+ 打包缺陷：hooks.json 引用 .mjs 但 templates 只有 .ts，CLI init/sync 无编译步骤
  if (publish) {
    let totalBaked = 0
    const allFailures: string[] = []
    for (const t of PUBLISH_TARGETS) {
      if (dryRun) {
        const tsFiles = listTsFiles(join(PROJECT_DIR, t.src))
        console.log(`  📋 ${t.name}: ${tsFiles.length} 个 .ts → ${t.src}`)
        continue
      }
      const r = await bakeTarget({ src: t.src, dest: t.src, name: `${t.name} (publish)` })
      totalBaked += r.baked.length
      allFailures.push(...r.failures)
      console.log(`  ✅ ${t.name}: 发布产物 ${r.baked.length} 个` + (r.failures.length ? `（${r.failures.length} 失败）` : ""))
    }
    if (allFailures.length > 0) {
      console.error("\n❌ 发布烘焙校验失败（不静默降级）:")
      for (const f of allFailures) console.error(`   - ${f}`)
      process.exitCode = 2
      return
    }
    console.log(`\n🎯 hook-bake --publish 完成，发布产物 ${totalBaked} 个（已写入模板源目录）`)
    return
  }

  let totalBaked = 0
  const allFailures: string[] = []
  for (const t of BAKE_TARGETS) {
    if (dryRun) {
      const tsFiles = listTsFiles(join(PROJECT_DIR, t.src))
      console.log(`  📋 ${t.name}: ${tsFiles.length} 个 .ts → ${t.dest}`)
      continue
    }
    if (checkOnly) {
      const destAbs = join(PROJECT_DIR, t.dest)
      const mjsFiles = listTsFiles(destAbs).filter(f => f.endsWith(".mjs"))
      for (const f of mjsFiles) {
        const { zeroDep, smoke } = checkArtifact(f)
        if (!zeroDep || smoke !== "ok") {
          allFailures.push(`${t.name}/${relative(PROJECT_DIR, f)}: zeroDep=${zeroDep}, smoke=${smoke}`)
        }
      }
      console.log(`  ✅ ${t.name}: ${mjsFiles.length} 个产物校验完成`)
      continue
    }
    const r = await bakeTarget(t)
    totalBaked += r.baked.length
    allFailures.push(...r.failures)
    console.log(`  ✅ ${t.name}: 烘焙 ${r.baked.length} 个产物` + (r.failures.length ? `（${r.failures.length} 失败）` : ""))
  }

  if (allFailures.length > 0) {
    console.error("\n❌ 校验失败（不静默降级）:")
    for (const f of allFailures) console.error(`   - ${f}`)
    process.exitCode = 2
    return
  }
  console.log(`\n🎯 hook-bake 完成${checkOnly ? "（校验通过）" : ""}，产物 ${totalBaked || "现有"} 个`)
}

main()
