import dotenv from "dotenv"
import { dirname, resolve, basename, join } from "path"
import { existsSync, readdirSync } from "fs"
import { resolveProjectRoot } from "./project-root-strategy.js";

const __dirname = import.meta.dirname

// 集中裁决层驱动：PROJECT_ROOT 推导由 project-root-rules.toml → project-root-strategy.ts 定义
export const PROJECT_ROOT = resolveProjectRoot(__dirname)

// find-up 锚点（轮次 3）：向上找含 scripts/mcp-server 结构的目录 = magicDir（不手算层级）
// magicDir 结构探测（轮次 3）：从当前文件位置向上逐级找首个 magic 结构目录（.xxx 且含 scripts/mcp-server）
// —— 命中当前运行副本，多副本共存无歧义，不 hardcode 目录名
export const MAGIC_DIR = process.env.MAGIC_DIR || (() => {
  try {
    let d = __dirname;
    for (;;) {
      const base = basename(d);
      if (base.startsWith(".") && existsSync(join(d, "scripts", "mcp-server"))) return base;
      const parent = dirname(d);
      if (parent === d) break;
      d = parent;
    }
  } catch { /* 探测失败走兜底 */ }
  return basename(resolve(__dirname, "..", "..", "..", ".."));
})()
export const PROJECT_ID = basename(PROJECT_ROOT)

const ENV_CANDIDATES = [".env.development.local", ".env.development", ".env.local", ".env"]
let loaded = false
for (const base of [PROJECT_ROOT, process.cwd()]) {
  if (loaded) break
  for (const f of ENV_CANDIDATES) {
    const p = resolve(base, f)
    if (existsSync(p)) { dotenv.config({ path: p, override: true }); loaded = true; break }
  }
}

export const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL 未设置，请在 .env 中配置数据库连接串")
}
