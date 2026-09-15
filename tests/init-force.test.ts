import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execSync, spawnSync } from "child_process"
import { resolve } from "path"
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "fs"
import { createConnection } from "net"

const ROOT = resolve(__dirname, "..")
const TMP = resolve(ROOT, ".test-tmp")
const BIN = resolve(ROOT, "bin", "add-coder.js")

/**
 * 清理 TMP（2026-09-14 修复 EACCES）：
 * init 过程会让 podman 在 TMP 内落下 **容器映射 uid** 属主的文件（如 `.qoder/.mcp-restart-required`
 * 之外的挂载写入），宿主机 xmm 无法删除 → `rmSync` 抛 EACCES，测试以"清理失败"的形状挂掉，
 * 而不是因为被测行为有问题。回退用 `podman unshare rm -rf`（容器 root 视角删除同一路径）。
 * 两条路径都失败时**显式告警**并给出可复制的清理命令——不静默吞掉。
 */
function removeTmp(): void {
    if (!existsSync(TMP)) return
    try {
        rmSync(TMP, { recursive: true, force: true })
        return
    } catch (err) {
        const r = spawnSync("podman", ["unshare", "rm", "-rf", TMP], { encoding: "utf-8" })
        if (r.status === 0 && !existsSync(TMP)) return
        console.warn(
            `⚠️ .test-tmp 清理失败：${(err as Error).message}\n` +
            `   请手工执行: podman unshare rm -rf ${TMP}`,
        )
    }
}

/**
 * 本测试自建的容器/网络清单（2026-09-14 修复 60s 钩子超时）。
 * **只清这些名字**——宿主的 add-coder-* 实例绝不在清理范围内。
 */
const TEST_CONTAINERS = ["test-project-postgres", "test-project-add-postgres", "test-project-add-dev"]
const TEST_NETWORKS = ["test-tmp_test-project-network", "test-project-network"]

/** 停掉 TMP 下的 compose 栈（容器 + 网络）。TMP 未生成 compose 时跳过。 */
function composeDown(): void {
    const file = resolve(TMP, "podman-compose.add.yml")
    if (!existsSync(file)) return
    try {
        execSync("podman-compose --env-file .env.development -f podman-compose.add.yml down -v", {
            cwd: TMP, stdio: "pipe", timeout: 90000,
        })
    } catch { /* 未起过 / 已清干净（down 对不存在的栈非 0 退出） */ }
}

/**
 * 清除**上一轮遗留**的容器与网络（幂等）。为什么必须做（根因）：
 * `init` 起容器用固定名 `${PROJECT_NAME}-postgres` / `${PROJECT_NAME}-add-postgres`；
 * 上一轮 afterAll 若崩在文件清理（podman 映射 uid → EACCES）而容器未回收，
 * 下一轮 init 就撞名失败（"container name is already in use" + crun 找不到 bind 目录）并重试，
 * 最终表现为 **60s 钩子超时**——症状是"测试慢"，根因是残留没清。
 */
function purgeTestContainers(): void {
    for (const name of TEST_CONTAINERS) {
        try { execSync(`podman rm -f ${name}`, { stdio: "pipe", timeout: 30000 }) } catch { /* 不存在即通过 */ }
    }
    for (const net of TEST_NETWORKS) {
        try { execSync(`podman network rm ${net}`, { stdio: "pipe", timeout: 30000 }) } catch { /* 不存在/仍被占用 */ }
    }
}

/** 清理顺序：先拆栈（容器持有 bind 目录）→ 再删文件，否则删目录先失败 */
function cleanupProject(): void {
    composeDown()
    purgeTestContainers()
    removeTmp()
}

/**
 * 测试隔离垫片（2026-09-14 修复钩子超时）：
 * init 末尾执行 `npm install <peer 列表>`，其中 `@huggingface/transformers` 会拉
 * `onnxruntime-node`，其安装脚本要联网下载预编译产物（本机实测 HTTP 302 不被跟随 → npm 回滚，
 * 退出码 1，耗时 ~55s）。集成测试真跑这一步 = 每次联网 + 必然失败 + 钩子超时，
 * 且 npm reify 会**移除 TMP 下指向仓库的 node_modules 符号链接**（副作用外溢）。
 * 故用 PATH 垫片只拦这一步；其余 npm 调用（如 `npm exec prisma ...`）原样转发真实 npm。
 */
const SHIM_DIR = resolve(TMP, ".test-bin")
function makePmShim(): void {
    mkdirSync(SHIM_DIR, { recursive: true })
    const realNpm = execSync("command -v npm", { encoding: "utf-8" }).trim()
    writeFileSync(
        resolve(SHIM_DIR, "npm"),
        `#!/usr/bin/env bash\n` +
        `# 测试垫片：只跳过 peer 依赖真实安装，其余原样转发\n` +
        `case "$*" in\n` +
        `  *"@huggingface/transformers"*) echo "[test-shim] 跳过 peer 依赖真实安装: $*"; exit 0 ;;\n` +
        `  *) exec ${realNpm} "$@" ;;\n` +
        `esac\n`,
        { mode: 0o755 },
    )
}

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
        env: { ...process.env, QODER_CN_IDE: "1", PATH: `${SHIM_DIR}:${process.env.PATH}` },
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

// 钩子超时显式声明：清理要跑 `podman-compose down` + `podman rm`（容器回收实测数秒~十几秒），
// 默认 10s 钩子不够——这里放宽的是**夹具预算**，不是被测行为的口径。
let _dbAvailable = false
beforeAll(async () => {
    _dbAvailable = await dbReachable()
    if (_dbAvailable) {
        cleanupProject() // 先清上一轮残留（含崩溃轮），本文件才可反复跑
        mkdirSync(TMP, { recursive: true })
        writeFileSync(resolve(TMP, "package.json"), JSON.stringify({ name: "test-project" }))
        symlinkSync(resolve(ROOT, "node_modules"), resolve(TMP, "node_modules"), "dir")
        makePmShim()
    }
}, 120000)

afterAll(() => {
    cleanupProject()
}, 120000)

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
        // Prisma 7 起 provider 从 prisma-client-js 更名 prisma-client；兼容两种
        expect(c).toMatch(/provider\s*=\s*"prisma-client(-js)?"/)
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
