import { DATABASE_URL, PROJECT_ROOT } from "./env.js"
import { join, dirname, resolve as pathResolve } from "path"
import { existsSync } from "fs"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)

// 多路径回退：PROJECT_ROOT 可能因 cwd/沙箱环境算错
const candidates = [
  join(PROJECT_ROOT, "src/generated/prisma/client.ts"),
  join(PROJECT_ROOT, "src/generated/prisma/client.js"),
  join(process.cwd(), "src/generated/prisma/client.ts"),
  join(process.cwd(), "src/generated/prisma/client.js"),
  // 从当前文件位置反推：shared/prisma.ts → 上 4 层到项目根
  (() => { const d = dirname(fileURLToPath(import.meta.url)); const root = pathResolve(d, "..", "..", "..", ".."); return join(root, "src/generated/prisma/client.ts") })(),
  (() => { const d = dirname(fileURLToPath(import.meta.url)); const root = pathResolve(d, "..", "..", "..", ".."); return join(root, "src/generated/prisma/client.js") })(),
]
let prismaClientPath = candidates[0]
for (const p of candidates) { if (existsSync(p)) { prismaClientPath = p; break } }
// 用 createRequire 同步加载，避免 tsx CJS 模式下 top-level await 报错
const prismaModule: Record<string, unknown> = require(prismaClientPath) as Record<string, unknown>
const PrismaClient = (prismaModule.PrismaClient || prismaModule.default) as new (opts?: Record<string, unknown>) => Record<string, unknown>

let adapter: Record<string, unknown> | undefined
if (!DATABASE_URL) throw new Error("DATABASE_URL required")
const url: string = DATABASE_URL
if (url.startsWith("postgresql://") || url.startsWith("postgres://")) {
  try {
    const pg = require("@prisma/adapter-pg") as Record<string, unknown>
    const Pg = pg.PrismaPg as new (opts: Record<string, unknown>) => Record<string, unknown>
    adapter = new Pg({ connectionString: url })
  } catch { /* optional dep */ }
}

export const prisma: Record<string, Record<string, (...a: unknown[]) => unknown>> = new PrismaClient({
  ...(adapter ? { adapter } : {}),
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
}) as Record<string, Record<string, (...a: unknown[]) => unknown>>
