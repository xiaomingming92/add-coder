import dotenv from "dotenv"
import { dirname, resolve, basename } from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"
import { resolveProjectRoot } from "./project-root-strategy.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 裁决层驱动：PROJECT_ROOT 推导由 project-root-rules.toml → project-root-strategy.ts 定义
export const PROJECT_ROOT = resolveProjectRoot(__dirname)

export const MAGIC_DIR = process.env.MAGIC_DIR || basename(resolve(__dirname, "..", "..", ".."))
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
