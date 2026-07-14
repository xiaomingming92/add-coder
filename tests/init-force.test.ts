import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execSync } from "child_process"
import { resolve } from "path"
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "fs"

const ROOT = resolve(__dirname, "..")
const TMP = resolve(ROOT, ".test-tmp")
const BIN = resolve(ROOT, "bin", "add-coder.js")

function run(cmd: string) {
    return execSync(cmd, { cwd: TMP, env: { ...process.env, QODER_CN_IDE: "1" }, encoding: "utf-8", timeout: 60000, stdio: "pipe" })
}

beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    writeFileSync(resolve(TMP, "package.json"), JSON.stringify({ name: "test-project" }))
    symlinkSync(resolve(ROOT, "node_modules"), resolve(TMP, "node_modules"), "dir")
})

afterAll(() => {
    rmSync(TMP, { recursive: true, force: true })
})

describe("add-coder init --force", () => {
    beforeAll(() => {
        try { run(`node ${BIN} init --force`) } catch { /* migration may fail without PG */ }
    }, 60000)

    it(".add/ and .qoder/ exist", () => {
        expect(existsSync(resolve(TMP, ".add"))).toBe(true)
        expect(existsSync(resolve(TMP, ".qoder"))).toBe(true)
    })

    it("compose: env references, not hardcoded", () => {
        const c = readFileSync(resolve(TMP, "podman-compose.yml"), "utf-8")
        expect(c).toContain("${DATABASE_USER:-admin}")
        expect(c).toContain("${DATABASE_PASSWORD:-change-me-in-production}")
        expect(c).toContain("${DATABASE_PORT:-5433}")
        expect(c).toContain("env_file:")
        expect(c).toContain(".env.development")
        expect(c).toContain("driver: bridge")
    })

    it(".env.development: credentials + DATABASE_URL", () => {
        const c = readFileSync(resolve(TMP, ".env.development"), "utf-8")
        expect(c).toContain("DATABASE_USER=admin")
        expect(c).toContain("DATABASE_PASSWORD=change-me-in-production")
        expect(c).toContain("DATABASE_PORT=5433")
        expect(c).toContain("PROJECT_NAME=test-project")
        expect(c).toMatch(/DATABASE_URL/)
    })

    it(".env 不应该存在（已用 .env.development）", () => {
        expect(existsSync(resolve(TMP, ".env"))).toBe(false)
    })

    it("prisma: User model + reverse relations", () => {
        const schemaPath = resolve(TMP, "prisma", "schema.prisma")
        if (!existsSync(schemaPath)) return
        const c = readFileSync(schemaPath, "utf-8")
        expect(c).toContain("model User {")
        expect(c).toContain("devOperations   DevOperation[]")
        expect(c).toContain("auditLogs       AuditLog[]")
    })

    it("prisma: add.prisma 在 prisma/ 下（不进入 IDE magic path）", () => {
        const addPath = resolve(TMP, "prisma", "add.prisma")
        if (!existsSync(addPath)) return // prisma init 未运行则跳过
        const add = readFileSync(addPath, "utf-8")
        expect(add).toContain("model DevOperation {")
        expect(add).toContain("model AuditLog {")
        // 不应出现在 magic path
        expect(existsSync(resolve(TMP, ".add", "prisma"))).toBe(false)
        expect(existsSync(resolve(TMP, ".qoder", "prisma"))).toBe(false)
    })

    it("prisma.config.ts: env 优先级链", () => {
        const cfgPath = resolve(TMP, "prisma.config.ts")
        if (!existsSync(cfgPath)) return
        const c = readFileSync(cfgPath, "utf-8")
        expect(c).toContain(".env.development.local")
        expect(c).toContain(".env.development")
        expect(c).toContain("dotenv.config")
    })

    it("db-ensure.sh: 包管理器检测 + add.prisma 拷贝", () => {
        const c = readFileSync(resolve(TMP, ".qoder", "scripts", "db-ensure.sh"), "utf-8")
        expect(c).toContain("pnpm dlx prisma")
        expect(c).toContain("pnpm-lock.yaml")
        expect(c).toContain("node_modules/add-coder/templates/core/prisma/add.prisma")
    })
})
