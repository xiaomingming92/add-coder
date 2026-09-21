#!/usr/bin/env tsx
// sync-magic.ts — add-coder 自动同步脚本 (TypeScript 版)
// 根据源→目标映射关系，自动同步 hooks 和 templates 到各 magic 目录
// 使用: tsx scripts/sync-magic.ts 或 npm run sync

import { projectRoot } from "../src/shared/paths.js";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  statSync,
  chmodSync,
} from "node:fs"
import { join, resolve, dirname, basename, relative } from "node:path"
import { homedir } from "node:os"
import { execSync } from "node:child_process"
import { parse } from "smol-toml"
import { SYNC_MAGIC_CONFIG } from "../src/caijuehub/strategies/sync-magic.strategy.js"
import { defaults } from "../src/config/defaults.js"

// ── 常量和配置（由 caijuehub 驱动）──

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_DIR = projectRoot() ?? resolve(SCRIPT_DIR, "..")

const { PROJECT_NAME, MAGIC_DIRS, EXCLUDE_PATTERNS, LOG_EXTENSIONS, HOOKS, CONFIGS, CONFIG_CHECK, CATEGORIES, VERIFY } = SYNC_MAGIC_CONFIG

/**
 * Hook 来源模式（adapter-rules.toml [hook_source]，2026-08-14 Web 实证）:
 *   self: 独立分发本端 hooks（默认）
 *   claude-import: 跳过 hooks 分发——用户用 Trae 设置「导入 Claude hooks 配置」复用 .claude 产物
 * 注: 仅 tsx 直跑读取（非烘焙产物），无零依赖约束。
 */
function hookSourceMode(): Record<string, string> {
  try {
    const raw = readFileSync(join(PROJECT_DIR, "src", "caijuehub", "adapter-rules.toml"), "utf-8")
    const parsed = parse(raw) as { hook_source?: Record<string, string> }
    return parsed.hook_source ?? {}
  } catch {
    return {}
  }
}

const HOOK_SOURCE = hookSourceMode()

const EXCLUDES = new Set<string>(EXCLUDE_PATTERNS)

// ── 工具函数 ──

/** 生成时间戳备份目录名 */
function timestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("")
}

/** 递归复制目录，支持排除列表与扩展名排除 */
function copyDir(src: string, dest: string, excludeExt?: string[]): void {
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  mkdirSync(dest, { recursive: true })

  cpSync(src, dest, {
    recursive: true,
    filter: (srcPath) => {
      const base = basename(srcPath)
      if (EXCLUDES.has(base)) return false
      if (LOG_EXTENSIONS.some(ext => base.endsWith(ext))) return false
      if (excludeExt?.some(ext => base.endsWith(ext))) return false
      return true
    },
  })
}

/** 备份目录（如果非空）—— syncDir 内部已删除目标，所以 backup 要在 sync 前调用 */
function backupIfNeeded(dir: string, backupRoot: string): void {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir)
  if (entries.length === 0) return

  const backupDest = join(backupRoot, basename(dir))
  let counter = 1
  let finalDest = backupDest
  while (existsSync(finalDest)) {
    finalDest = `${backupDest}_${counter}`
    counter++
  }
  console.log(`   💾 备份 ${dir} → ${finalDest}`)
  mkdirSync(dirname(finalDest), { recursive: true })
  cpSync(dir, finalDest, { recursive: true })
}

// ── 烘焙（占位符替换）──

/** 烘焙 .sh 文件中的动态 MAGIC_DIR 为硬编码值 */
function bakeMagicRefs(targetDir: string, magicDir: string): void {
  _walkFiles(targetDir, ".sh", (filePath) => {
    const content = readFileSync(filePath, "utf-8")
    // 替换 MAGIC_DIR="$(basename ...)" 为 MAGIC_DIR=".xxx"
    const replaced = content.replace(
      /^MAGIC_DIR=".*/m,
      `MAGIC_DIR="${magicDir}"`
    )
    if (replaced !== content) {
      writeFileSync(filePath, replaced, "utf-8")
    }
  })
}

/** 烘焙 .md 文件中的 {{magicDir}} 和 {{projectName}} 占位符 */
function bakeMdPlaceholders(targetDir: string, magicDir: string): void {
  _walkFiles(targetDir, ".md", (filePath) => {
    let content = readFileSync(filePath, "utf-8")
    const original = content
    content = content.replaceAll("{{magicDir}}", magicDir)
    content = content.replaceAll("{{projectName}}", PROJECT_NAME)
    if (content !== original) {
      writeFileSync(filePath, content, "utf-8")
    }
  })
}

/** 递归遍历目录中指定后缀的文件 */
function _walkFiles(
  dir: string,
  ext: string,
  fn: (filePath: string) => void
): void {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!EXCLUDES.has(entry.name)) {
        _walkFiles(fullPath, ext, fn)
      }
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      fn(fullPath)
    }
  }
}

// ── 同步核心 ──

interface SyncOptions {
  /** 源目录 */
  src: string
  /** 目标目录 */
  dest: string
  /** 显示名称 */
  name: string
  /** magic 目录名（传入后会烘焙 hooks），如 ".add" */
  magicDir?: string
  /** 分发时排除的扩展名（hook 分发排除 .ts 源，生成态仅 .sh + .mjs 产物） */
  excludeExt?: string[]
}

function syncDir({ src, dest, name, magicDir, excludeExt }: SyncOptions): void {
  if (!existsSync(src)) {
    console.log(`⚠️  源目录不存在: ${src}`)
    return
  }

  console.log(`🔄 同步 ${name}: ${src} → ${dest}`)
  mkdirSync(dest, { recursive: true })

  // 复制
  copyDir(src, dest, excludeExt)

  // 烘焙
  if (magicDir) {
    console.log(`   🔧 烘焙 MAGIC_DIR → ${magicDir}`)
    bakeMagicRefs(dest, magicDir)
    console.log(
      `   📝 烘焙 .md 占位符（{{magicDir}} → ${magicDir}, {{projectName}} → ${PROJECT_NAME}）`
    )
    bakeMdPlaceholders(dest, magicDir)
  }

  // .sh 文件添加可执行权限（Linux/macOS）
  try {
    _walkFiles(dest, ".sh", (filePath) => {
      try {
        const mode = statSync(filePath).mode
        chmodSync(filePath, mode | 0o111) // ugo+x
      } catch {
        // Windows 上 chmod 无意义，忽略
      }
    })
  } catch {
    // 静默忽略
  }

  console.log(`   ✅ ${name} 同步完成`)
}

/** hooks 引用路径提取：由 caijuehub CONFIG_CHECK 控制面声明（2026-08-18 收拢，脚本零正则硬编码） */
const HOOK_PATH_RE = new RegExp(CONFIG_CHECK.hookPathRe, "g")
const LEGACY_SH_RE = new RegExp(CONFIG_CHECK.legacyShRe, "g")

/** 纯函数：从项目根 package.json 解析项目名（零兜底——缺失即报错） */
function resolveProjectName(projectDir: string): string {
  const pkgPath = join(projectDir, "package.json")
  if (!existsSync(pkgPath)) throw new Error(`package.json 不存在，无法解析 projectName: ${pkgPath}`)
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string }
  if (!pkg.name) throw new Error(`package.json 缺少 name 字段，无法解析 projectName: ${pkgPath}`)
  return pkg.name
}

/**
 * 纯函数：按替换表渲染占位符 {{key}} → value。
 * [2026-09-21 Plan `add-coder-agents-template-and-step3-execution-modes-plan-v1`]
 * **特殊占位符由规则声明**（`sync-magic-rules.toml [replace_specials]` → 生成物 `SYNC_MAGIC_CONFIG.SPECIALS`），
 * 本脚本只按声明取值：project.dir / project.name / add-coder.mcpServerCommand / entry.magic_dir。
 * 未知来源 id 原样返回，随后被 `detectUnresolvedPlaceholders` 抓成违规（不静默）。新增 token 只改规则、不改本脚本。
 */
function renderConfigTemplate(
  content: string,
  replacements: Record<string, string>,
  projectDir: string,
  projectName: string,
  mcpServerCommand: string,
  magicDir: string,
): string {
  const special: Record<string, string> = {
    "project.dir": projectDir,
    "project.name": projectName,
    "add-coder.mcpServerCommand": mcpServerCommand,
    "entry.magic_dir": magicDir,
  }
  const declared = (SYNC_MAGIC_CONFIG as unknown as { SPECIALS?: Record<string, string> }).SPECIALS ?? {}
  let out = content
  for (const [key, rawValue] of Object.entries(replacements)) {
    const token = rawValue.startsWith("$") ? rawValue.slice(1) : null
    const sourceId = token ? declared[token] : undefined
    const value = sourceId ? (special[sourceId] ?? `$UNKNOWN_SOURCE(${sourceId})`) : rawValue
    out = out.split(`{{${key}}}`).join(value)
  }
  return out
}

/** 纯函数：检测未替换占位符残留 {{...}} */
function detectUnresolvedPlaceholders(content: string): string[] {
  return [...content.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0])
}

/** 纯函数：检测 .sh 旧版引用 */
function detectLegacyShRefs(content: string): string[] {
  return [...content.matchAll(LEGACY_SH_RE)].map((m) => m[0])
}

/** 纯函数：提取 command 引用的 hooks 相对路径 */
function extractCommandPaths(content: string): string[] {
  return [...content.matchAll(HOOK_PATH_RE)].map((m) => m[1])
}

/** 纯函数：断言路径全部存在，返回缺失清单 */
function assertFilesExist(paths: string[], projectDir: string): string[] {
  return paths.filter((p) => !existsSync(join(projectDir, p)))
}

/** 配置入口同步（CONFIGS 驱动）：none 原样复制 / replace 渲染后覆盖 + 分发后校验（projectName 从 package.json 实时解析，零兑底） */
function syncConfigs(
  configs: ReadonlyArray<{ src: string; dest: string; name: string; magicDir: string; placeholderPolicy?: string; replacements?: Record<string, string> }>,
  projectDir: string,
): string[] {
  const violations: string[] = []
  const projectName = resolveProjectName(projectDir)
  for (const c of configs) {
    const srcAbs = join(projectDir, c.src)
    const destAbs = join(projectDir, c.dest)
    if (!existsSync(srcAbs)) {
      violations.push(`${c.name}: 真源缺失 ${c.src}`)
      continue
    }
    mkdirSync(dirname(destAbs), { recursive: true })
    if (c.placeholderPolicy === "replace") {
      const rendered = renderConfigTemplate(readFileSync(srcAbs, "utf-8"), c.replacements ?? {}, projectDir, projectName, defaults.mcpServerCommand, c.magicDir)
      const unresolved = detectUnresolvedPlaceholders(rendered)
      if (unresolved.length > 0) {
        violations.push(`${c.name}: 替换后仍有占位符残留 ${unresolved.join(", ")}`)
        continue
      }
      writeFileSync(destAbs, rendered, "utf-8")
    } else {
      cpSync(srcAbs, destAbs, { force: true })
    }
    // 分发后校验：.sh 残留 + 占位符残留 + command 指向存在
    const text = readFileSync(destAbs, "utf-8")
    const shRefs = detectLegacyShRefs(text)
    if (shRefs.length > 0) violations.push(`${c.name}: .sh 残留引用 ${shRefs.length} 处`)
    const missing = assertFilesExist(extractCommandPaths(text), projectDir)
    for (const m of missing) violations.push(`${c.name}: command 指向文件不存在 ${m}`)
    console.log(`   📄 ${c.name}: 已分发 → ${c.dest}`)
  }
  return violations
}
function syncToAllMagicDirs(
  category: string,
  icon: string,
  bake: boolean = true
): void {
  console.log(`\n${icon} 同步 ${category}...`)
  const srcRoot = join(PROJECT_DIR, "templates", "core", category)
  for (const md of MAGIC_DIRS) {
    syncDir({
      src: srcRoot,
      dest: join(PROJECT_DIR, md, category),
      name: `${md} ${category}`,
      magicDir: bake ? md : undefined,
    })
  }
}

// ── Qoder CN 配置同步 ──

function syncQoderCNHooks(): void {
  const qoderCNSettings = join(homedir(), ".qoder-cn", "settings.json")
  if (!existsSync(qoderCNSettings)) {
    console.log(
      "⚠️  Qoder CN: ~/.qoder-cn/settings.json 不存在，跳过（非 Qoder CN 环境或未初始化）"
    )
    return
  }

  console.log("🏷️  Qoder CN: 检测到现有配置，更新 hooks 段...")
  const patchScript = join(SCRIPT_DIR, "patch-qoder-cn-hook-setting.ts")
  try {
    execSync(`tsx "${patchScript}" "${PROJECT_DIR}"`, {
      stdio: "pipe",
      timeout: 10_000,
    })
  } catch {
    console.log("⚠️  tsx 不可用，跳过 Qoder CN 配置同步")
  }
}

// ── 验证 ──

/** 验证同步结果：逐文件比较，忽略 MAGIC_DIR 行差异 */
function verifySync(src: string, dest: string, name: string): void {
  if (!existsSync(src)) {
    console.log(`   ⚠️  ${name}: 源目录不存在 ${src}`)
    return
  }
  if (!existsSync(dest)) {
    console.log(`   ⚠️  ${name}: 目标目录不存在 ${dest}`)
    return
  }

  const diffs = compareDirs(src, dest)
  if (diffs.length === 0) {
    console.log(`   ✅ ${name}: 源与目标完全一致`)
  } else {
    console.log(`   ⚠️  ${name}: 存在差异`)
    for (const d of diffs) {
      console.log(d)
    }
  }
}

/** 递归比较两个目录，返回差异描述列表 */
function compareDirs(src: string, dest: string): string[] {
  const diffs: string[] = []

  const srcEntries = readdirSync(src, { withFileTypes: true })
  const destEntries = readdirSync(dest, { withFileTypes: true })
  const destNames = new Set(destEntries.map((e) => e.name))

  for (const entry of srcEntries) {
    const name = entry.name
    // 跳过排除项
    if (EXCLUDES.has(name)) continue
    if (LOG_EXTENSIONS.some(ext => name.endsWith(ext))) continue
    // 双形态设计内差异: .ts 仅源有（分发排除）、.mjs 仅 dest 有（烘焙产物）
    if (name.endsWith(".ts") || name.endsWith(".mjs")) continue

    const srcPath = join(src, name)
    const destPath = join(dest, name)

    if (!destNames.has(name)) {
      diffs.push(`   - 缺失: ${relative(PROJECT_DIR, destPath)}`)
      continue
    }

    if (entry.isDirectory()) {
      diffs.push(...compareDirs(srcPath, destPath))
    } else if (entry.isFile()) {
      const fileDiff = compareFiles(srcPath, destPath)
      if (fileDiff) {
        diffs.push(fileDiff)
      }
    }
  }

  return diffs
}

/** 比较两个文件，忽略 MAGIC_DIR 行和 {{magicDir}}/{{projectName}} 差异 */
function compareFiles(src: string, dest: string): string | null {
  let srcLines = readFileSync(src, "utf-8").split("\n")
  let destLines = readFileSync(dest, "utf-8").split("\n")

  const normalize = (line: string) => {
    if (/^MAGIC_DIR=/.test(line)) return "<MAGIC_DIR>"
    return line.replaceAll("{{magicDir}}", "<MAGIC_DIR>").replaceAll("{{projectName}}", PROJECT_NAME)
  }

  srcLines = srcLines.map(normalize)
  destLines = destLines.map(normalize)

  if (srcLines.length !== destLines.length) {
    return `   ⚡ ${relative(PROJECT_DIR, src)}: 行数不同 (${srcLines.length} vs ${destLines.length})`
  }

  for (let i = 0; i < srcLines.length; i++) {
    if (srcLines[i] !== destLines[i]) {
      return `   ⚡ ${relative(PROJECT_DIR, src)}:${i + 1}: ${srcLines[i].slice(0, 60)} ↔ ${destLines[i].slice(0, 60)}`
    }
  }

  return null
}

// ── 主流程 ──

function main(): void {
  console.log("🔄 同步 add-coder magic 目录...")

  const backupDirPath = join(PROJECT_DIR, ".backup", timestamp())
  mkdirSync(backupDirPath, { recursive: true })
  console.log(`📦 备份目录: ${backupDirPath}`)

  console.log("\n📁 执行源→目标映射同步...")

  // Hook 同步（由 caijuehub HOOKS 驱动；excludeExt=.ts：生成态仅 .sh + 烘焙产物 .mjs）
  // hook_source=claude-import 的端跳过——用户用 IDE 设置导入 Claude hooks 配置复用 .claude 产物
  for (const hook of HOOKS) {
    const adapterName = hook.magicDir.replace(/^\./, "")
    if (HOOK_SOURCE[adapterName] === "claude-import") {
      console.log(`⏭️  跳过 ${hook.name} 分发（hook_source=claude-import，复用 claude 端产物）`)
      continue
    }
    backupIfNeeded(join(PROJECT_DIR, hook.dest), backupDirPath)
    syncDir({
      src: join(PROJECT_DIR, hook.src),
      dest: join(PROJECT_DIR, hook.dest),
      name: hook.name,
      magicDir: hook.magicDir,
      excludeExt: [".ts"],
    })
  }

  // Hook 烘焙：分发后 TS 源码 → mjs 产物（Plan §3.3 sync 分发时烘焙）
  // 双形态共存：.sh（旧 bash）与 .mjs（新 node）同目录共存至轮次 8
  try {
    execSync(`tsx "${join(SCRIPT_DIR, "hook-bake.ts")}"`, {
      stdio: "pipe",
      timeout: 60_000,
    })
  } catch {
    console.log("⚠️  hook-bake 烘焙失败，请检查 tsx 环境与 hook-bake.ts")
  }

  // Qoder CN 配置（在 qoder hooks 同步之后）
  syncQoderCNHooks()

  // ── 配置入口同步（R4 架构修正 2026-08-18：配置入口分发归 sync-magic；none=原样复制 / replace=占位符渲染后覆盖）──
  console.log("\n📄 同步配置入口...")
  const configViolations = syncConfigs(CONFIGS, PROJECT_DIR)
  for (const v of configViolations) console.error(`   ❌ ${v}`)
  if (configViolations.length > 0) {
    console.error("\n❌ 配置入口校验失败（不静默降级）:")
    for (const v of configViolations) console.error(`   - ${v}`)
    process.exitCode = 2
    return
  }

  // 通用类别同步（由 caijuehub CATEGORIES 驱动）
  for (const cat of CATEGORIES) {
    syncToAllMagicDirs(cat.name, cat.icon, cat.bake)
  }

  // ── 验证（由 caijuehub VERIFY 驱动）──
  console.log("\n🔍 验证同步结果...")
  for (const v of VERIFY) {
    verifySync(join(PROJECT_DIR, v.src), join(PROJECT_DIR, v.dest), v.name)
  }

  console.log("\n🎯 同步完成!")
  console.log("💡 提示: 重启 IDE 以使新的 hook 配置生效")
  // 配置入口链路边界声明（runtime review #2，2026-08-18；R4 后配置入口归 sync-magic 分发）
  console.log("📄 配置入口已由本次 sync 分发（CONFIGS 段，含 settings.json/hooks.json）")
  console.log(`📝 备份保存在: ${backupDirPath}`)
}

main()
