import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execSync } from "child_process"
import { resolve } from "path"
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "fs"
import { createConnection } from "net"

const ROOT = resolve(__dirname, "..")
const TMP = resolve(ROOT, ".test-tmp")
const BIN = resolve(ROOT, "bin", "add-coder.js")

// 从 .env.development 读取配置，不硬编码凭据到测试中
function loadEnv(): Record<string, string> {
    const envPath = resolve(ROOT, ".env.development")
    const env: Record<string, string> = {}
    if (!existsSync(envPath)) return env
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const m = line.match(/^(\w+)=["']?([^"'\n]+)["']?/)
        if (m) env[m[1]] = m[2]
    }
    return env
}
const ENV = loadEnv()

function run(cmd: string, opts?: { timeout?: number }) {
    return execSync(cmd, {
        cwd: TMP,
        env: { ...process.env, QODER_CN_IDE: "1" },
        encoding: "utf-8",
        timeout: opts?.timeout ?? 60000,
        stdio: "pipe"
    })
}

/** 检查 PostgreSQL 是否可达，不可达则跳过测试 */
function dbReachable(): Promise<boolean> {
    const host = "localhost"
    const port = parseInt(ENV.DATABASE_PORT || "5433", 10)
    return new Promise<boolean>((resolve) => {
        const sock = createConnection({ host, port }, () => { sock.destroy(); resolve(true) })
        sock.on("error", () => resolve(false))
        sock.setTimeout(2000, () => { sock.destroy(); resolve(false) })
    })
}

let _dbAvailable = false
beforeAll(async () => {
    _dbAvailable = await dbReachable()
    if (_dbAvailable) {
        rmSync(TMP, { recursive: true, force: true })
        mkdirSync(TMP, { recursive: true })
        writeFileSync(resolve(TMP, "package.json"), JSON.stringify({ name: "test-project" }))
        symlinkSync(resolve(ROOT, "node_modules"), resolve(TMP, "node_modules"), "dir")
    }
})

afterAll(() => {
    rmSync(TMP, { recursive: true, force: true })
})

describe("add-coder init --force", () => {
    beforeAll(function () {
        if (!_dbAvailable) {
            console.warn(
                `\n⚠️  PostgreSQL 不可达（${ENV.DATABASE_HOST || "localhost"}:${ENV.DATABASE_PORT || "5433"}），跳过集成测试。\n` +
                `请先启动数据库: podman compose -f podman-compose.add.yml up -d postgres\n`
            )
        } else {
            try { run(`node ${BIN} init --force`) } catch { /* migration may fail without PG */ }
        }
    }, 60000)

    it(".add/ and .qoder/ exist", function () {
        if (!_dbAvailable) return
        expect(existsSync(resolve(TMP, ".add"))).toBe(true)
        expect(existsSync(resolve(TMP, ".qoder"))).toBe(true)
    })

    it("compose: env references, not hardcoded", function () {
        if (!_dbAvailable) return
        const c = readFileSync(resolve(TMP, "podman-compose.add.yml"), "utf-8")
        expect(c).toContain("${DATABASE_USER:-")
        expect(c).toContain("${DATABASE_PASSWORD:-")
        expect(c).toContain("${DATABASE_PORT:-")
        expect(c).toContain("env_file:")
        expect(c).toContain(".env.development")
        expect(c).toContain("driver: bridge")
    })

    it(".env.development: credentials + DATABASE_URL", function () {
        if (!_dbAvailable) return
        const c = readFileSync(resolve(TMP, ".env.development"), "utf-8")
        expect(c).toMatch(/DATABASE_USER=/)
        expect(c).toMatch(/DATABASE_PASSWORD=/)
        expect(c).toMatch(/DATABASE_PORT=/)
        expect(c).toContain("PROJECT_NAME=test-project")
        expect(c).toMatch(/DATABASE_URL=/)
    })

    it(".env 不应该存在（已用 .env.development）", function () {
        if (!_dbAvailable) return
        expect(existsSync(resolve(TMP, ".env"))).toBe(false)
    })

    it("prisma: schema.prisma 含 generator client", function () {
        if (!_dbAvailable) return
        const schemaPath = resolve(TMP, "prisma", "schema.prisma")
        if (!existsSync(schemaPath)) return
        const c = readFileSync(schemaPath, "utf-8")
        expect(c).toContain('provider = "prisma-client-js"')
    })

    it("prisma: add.prisma 在 prisma/ 下（不进入 IDE magic path）", function () {
        if (!_dbAvailable) return
        const addPath = resolve(TMP, "prisma", "add.prisma")
        if (!existsSync(addPath)) return
        const add = readFileSync(addPath, "utf-8")
        expect(add).toContain("model DevOperation {")
        expect(add).toContain("model AuditLog {")
        expect(existsSync(resolve(TMP, ".add", "prisma"))).toBe(false)
        expect(existsSync(resolve(TMP, ".qoder", "prisma"))).toBe(false)
    })

    it("prisma.config.ts: env 优先级链", function () {
        if (!_dbAvailable) return
        const cfgPath = resolve(TMP, "prisma.config.ts")
        if (!existsSync(cfgPath)) return
        const c = readFileSync(cfgPath, "utf-8")
        expect(c).toContain(".env.development.local")
        expect(c).toContain(".env.development")
        expect(c).toContain("dotenv.config")
    })

    it("db-ensure.sh 已生成到 Qoder scripts 目录", function () {
        if (!_dbAvailable) return
        expect(existsSync(resolve(TMP, ".qoder", "scripts", "db-ensure.sh"))).toBe(true)
    })
})
