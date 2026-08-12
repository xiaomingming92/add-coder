#!/usr/bin/env tsx
// patch-qoder-cn-hook-setting.ts
// 将项目级 .qoder/settings.json 的 hook 配置同步到 Qoder CN 用户级 ~/.qoder-cn/settings.json
// 用法: tsx scripts/patch-qoder-cn-hook-setting.ts [projectDir]

import { magicDirFor } from "../src/shared/paths.js";
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join, resolve } from "path"
import { homedir } from "os"

const projectDir = resolve(process.argv[2] ?? ".")
const srcFile = join(projectDir, magicDirFor("qoder"), "settings.json")
const destFile = join(homedir(), ".qoder-cn", "settings.json")

if (!existsSync(srcFile)) {
  console.error(`❌ 源文件不存在: ${srcFile}`)
  process.exit(1)
}
if (!existsSync(destFile)) {
  console.warn(`⚠️  Qoder CN 配置文件不存在: ${destFile}，跳过（非 Qoder CN 环境或未初始化）`)
  process.exit(0)
}

const src = JSON.parse(readFileSync(srcFile, "utf-8"))
const dest = JSON.parse(readFileSync(destFile, "utf-8"))

const hooks: Record<string, unknown> = {}
for (const [event, groups] of Object.entries(src.hooks ?? {})) {
  hooks[event] = (groups as Array<Record<string, unknown>>).map(g => ({
    ...g,
    hooks: (g.hooks as Array<Record<string, unknown>>).map(h => ({
      ...h,
      command: String(h.command).replace(`bash ${magicDirFor("qoder")}/`, `bash ${projectDir}/${magicDirFor("qoder")}/`),
    })),
  }))
}

dest.hooks = hooks
writeFileSync(destFile, JSON.stringify(dest, null, 2), "utf-8")
console.log(`✅ ~/.qoder-cn/settings.json 已更新（${Object.keys(hooks).length} 个事件）`)
