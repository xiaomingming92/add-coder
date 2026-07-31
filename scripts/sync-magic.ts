#!/usr/bin/env tsx
// sync-magic.ts — add-coder 自动同步脚本 (TypeScript 版)
// 根据源→目标映射关系，自动同步 hooks 和 templates 到各 magic 目录
// 使用: tsx scripts/sync-magic.ts 或 npm run sync

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
import { SYNC_MAGIC_CONFIG } from "../src/caijuehub/strategies/sync-magic.strategy.js"

// ── 常量和配置（由 caijuehub 驱动）──

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const PROJECT_DIR = resolve(SCRIPT_DIR, "..")

const { PROJECT_NAME, MAGIC_DIRS, EXCLUDE_PATTERNS, LOG_EXTENSIONS, HOOKS, CATEGORIES, VERIFY } = SYNC_MAGIC_CONFIG

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

/** 递归复制目录，支持排除列表 */
function copyDir(src: string, dest: string): void {
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
    let content = readFileSync(filePath, "utf-8")
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
}

function syncDir({ src, dest, name, magicDir }: SyncOptions): void {
  if (!existsSync(src)) {
    console.log(`⚠️  源目录不存在: ${src}`)
    return
  }

  console.log(`🔄 同步 ${name}: ${src} → ${dest}`)
  mkdirSync(dest, { recursive: true })

  // 复制
  copyDir(src, dest)

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

/** 批量同步到所有 magic 目录（由 caijuehub CATEGORIES 驱动） */
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

  // Hook 同步（由 caijuehub HOOKS 驱动）
  for (const hook of HOOKS) {
    backupIfNeeded(join(PROJECT_DIR, hook.dest), backupDirPath)
    syncDir({
      src: join(PROJECT_DIR, hook.src),
      dest: join(PROJECT_DIR, hook.dest),
      name: hook.name,
      magicDir: hook.magicDir,
    })
  }

  // Qoder CN 配置（在 qoder hooks 同步之后）
  syncQoderCNHooks()

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
  console.log(`📝 备份保存在: ${backupDirPath}`)
}

main()
