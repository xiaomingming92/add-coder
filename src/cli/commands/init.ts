import { detectIDE, resolveAdapters } from "../detect";
import { loadConfig } from "../config-loader";
import { writeFiles } from "../writer";
import { renderCore } from "../../core/renderer";
import { renderAdapter as renderClaude } from "../../adapters/claude/renderer";
import { renderAdapter as renderQoder } from "../../adapters/qoder/renderer";
import { renderAdapter as renderVSCode } from "../../adapters/vscode/renderer";
import { ask, detectPm } from "../../lib/utils";
import { injectPrisma } from "../prisma-injector";
import type { Adapter } from "../../config/schema";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { createConnection } from "net";

interface InitOptions { adapter?: string; config?: string; force?: boolean; dryRun?: boolean; }
interface DbChoice { engine: "postgresql" | "sqlite" | "manual"; container?: "podman" | "docker" | "manual"; user?: string; password?: string; port?: string; reuseExisting?: boolean; }

const ADAPTER_RENDERERS: Record<string, (config: any, targetDir: string, dryRun: boolean) => Map<string, string>> = {
    claude: renderClaude, qoder: renderQoder, vscode: renderVSCode,
};
const MAGIC_DIR_MAP: Record<string, string> = { claude: ".claude", qoder: ".qoder", vscode: ".vscode" };

// ════════════════════ helpers ════════════════════

async function resolveAdapter(projectRoot: string, specified?: string): Promise<Adapter> {
    if (specified) {
        if (!MAGIC_DIR_MAP[specified]) throw new Error(`未知 adapter: ${specified}`);
        console.log(`目标 IDE: ${specified} (--adapter)`);
        return specified as Adapter;
    }
    const detected = detectIDE(projectRoot);
    if (detected !== "auto") { console.log(`检测到 IDE: ${detected} (自动)`); return detected as Adapter; }
    console.log("未检测到 IDE 环境");
    const a = (await ask("请选择目标 IDE: [1] Qoder  [2] Claude  [3] VS Code → ")).trim();
    if (a === "1" || a === "qoder") return "qoder";
    if (a === "2" || a === "claude") return "claude";
    if (a === "3" || a === "vscode") return "vscode";
    console.log("输入无法识别，默认 qoder"); return "qoder";
}

async function resolveDbEngine(force: boolean): Promise<DbChoice> {
    if (force) { console.log("数据库引擎: PostgreSQL (--force 默认)"); return { engine: "postgresql", container: "podman" }; }
    console.log(["", "数据库引擎:", "  [1] PostgreSQL (推荐)", "  [2] SQLite — 零依赖", "  [3] 自行管理"].join("\n"));
    const a = (await ask("请选择 [1/2/3] → ")).trim();
    if (a === "2" || a === "sqlite") return { engine: "sqlite" };
    if (a === "3" || a === "manual") return { engine: "manual" };
    if (a !== "" && a !== "1" && !a.startsWith("postgres")) console.log("输入无法识别，默认 PostgreSQL");
    return { engine: "postgresql" };
}

async function resolveContainer(force: boolean): Promise<"podman" | "docker" | "manual"> {
    if (force) return "podman";
    console.log(["", "容器运行时:", "  [1] podman (推荐)", "  [2] docker", "  [3] 自行管理"].join("\n"));
    const a = (await ask("请选择 [1/2/3] → ")).trim();
    if (a === "2" || a === "docker") return "docker";
    if (a === "3" || a === "manual") return "manual";
    if (a !== "" && a !== "1" && a !== "podman") console.log("输入无法识别，默认 podman");
    return "podman";
}

function portInUse(port: number): Promise<boolean> {
    return new Promise((r) => {
        const s = createConnection({ port, host: "127.0.0.1" }, () => { s.destroy(); r(true); });
        s.on("error", () => r(false));
    });
}

function hasPgIsready(): boolean {
    // 优先用容器内置的 pg_isready
    try {
        const containers = spawnSync("podman", ["ps", "--filter", "publish=5433", "--format", "{{.Names}}"], { timeout: 3000 });
        const name = containers.stdout.toString().trim().split("\n")[0];
        if (name && spawnSync("podman", ["exec", name, "pg_isready", "--version"], { timeout: 2000 }).status === 0) return true;
    } catch { /* ignore */ }
    return spawnSync("which", ["pg_isready"], { timeout: 2000 }).status === 0;
}

function testPostgresConnection(port: string, user: string, password: string, dbName: string): boolean {
    if (!hasPgIsready()) {
        console.log("  ⚠️  无法验证凭据（容器未运行且 pg_isready 未安装），信任输入");
        return true;
    }
    // 优先用容器内的 pg_isready，不行再用宿主机
    const containers = spawnSync("podman", ["ps", "--filter", "publish=5433", "--format", "{{.Names}}"], { timeout: 3000 });
    const containerName = containers.stdout.toString().trim().split("\n")[0];
    const args = containerName
        ? ["exec", containerName, "pg_isready", "-U", user, "-d", dbName]
        : ["-h", "localhost", "-p", port, "-U", user, "-d", dbName];
    const cmd = containerName ? "podman" : "pg_isready";
    const r = spawnSync(cmd, args, {
        timeout: 5000,
        env: containerName ? process.env : { ...process.env, PGPASSWORD: password },
    });
    return r.status === 0;
}

async function resolveDbCredentials(force: boolean) {
    const d = { user: "admin", password: "change-me-in-production", port: "5433" };
    if (force) return d;

    console.log("", "数据库凭据（回车使用预设值）：");

    let port = (await ask(`DATABASE_PORT [${d.port}]: `)).trim() || d.port;
    while (true) {
        const portNum = parseInt(port);
        if (!isNaN(portNum) && await portInUse(portNum)) {
            console.log(`\n⚠️  端口 ${port} 已被占用`);
            const choice = (await ask("  [1] 换端口  [2] 连接已有实例（输入其用户/密码）→ ")).trim();
            if (choice === "2") {
                const existingUser = (await ask(`  用户: `)).trim() || "admin";
                const existingPass = (await ask(`  密码: `)).trim() || "change-me-in-production";
                const testDb = (await ask(`  测试数据名 (默认 postgres): `)).trim() || "postgres";
                const ok = testPostgresConnection(port, existingUser, existingPass, testDb);
                if (ok) {
                    console.log(`  ✅ 连接成功`);
                    return { user: existingUser, password: existingPass, port, reuseExisting: true };
                } else {
                    console.log(`  ❌ 连接失败，请检查凭据`);
                }
            }
        } else {
            break;
        }
        port = (await ask(`DATABASE_PORT: `)).trim() || d.port;
    }

    return { user: (await ask(`DATABASE_USER [${d.user}]: `)).trim() || d.user, password: (await ask(`DATABASE_PASSWORD [${d.password}]: `)).trim() || d.password, port };
}

function composeContent(projectName: string): string {
    return `services:\n  postgres:\n    image: docker.io/postgres:16-alpine\n    container_name: \${PROJECT_NAME:-${projectName}}-postgres\n    restart: unless-stopped\n    ports:\n      - "127.0.0.1:\${DATABASE_PORT:-5433}:5432"\n    volumes:\n      - ./data/postgres/\${PROJECT_NAME:-${projectName}}:/var/lib/postgresql/data\n    env_file:\n      - .env.development\n    environment:\n      POSTGRES_USER: \${DATABASE_USER:-admin}\n      POSTGRES_PASSWORD: \${DATABASE_PASSWORD:-change-me-in-production}\n      POSTGRES_DB: \${PROJECT_NAME:-${projectName}}\n      TZ: "Asia/Shanghai"\n    networks:\n      - \${PROJECT_NAME:-${projectName}}-network\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U \${DATABASE_USER:-admin} -d \${PROJECT_NAME:-${projectName}}"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\nnetworks:\n  \${PROJECT_NAME:-${projectName}}-network:\n    driver: bridge\n`;
}

function patchDatabaseUrl(projectRoot: string, projectName: string | undefined, dbUser: string | undefined, dbPass: string | undefined, dbPort: string | undefined, dryRun: boolean): void {
    const devEnvPath = resolve(projectRoot, ".env.development");
    if (!existsSync(devEnvPath) || !dbUser || !dbPass || !dbPort || !projectName) return;
    if (dryRun) { console.log("[dry-run] 将更新 DATABASE_URL"); return; }
    const content = readFileSync(devEnvPath, "utf-8");
    const url = `DATABASE_URL="postgresql://${dbUser}:${dbPass}@localhost:${dbPort}/${projectName}?schema=public"`;
    const updated = content.replace(/^DATABASE_URL=.*/m, url);
    if (updated !== content) { writeFileSync(devEnvPath, updated, "utf-8"); console.log("已更新 DATABASE_URL"); }
}

function writeSqliteExportScript(projectRoot: string, dryRun: boolean): void {
    const scriptsDir = resolve(projectRoot, "scripts");
    const scriptPath = resolve(scriptsDir, "export-db.ts");
    const content = `import { PrismaClient } from "@prisma/client";\nimport { writeFileSync, mkdirSync, existsSync } from "fs";\nimport { resolve } from "path";\n\nconst prisma = new PrismaClient();\nconst EXPORTS_DIR = resolve(process.cwd(), "data/exports");\n\nasync function main() {\n    if (!existsSync(EXPORTS_DIR)) mkdirSync(EXPORTS_DIR, { recursive: true });\n    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);\n    const auditLogs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });\n    const devOps = await prisma.devOperation.findMany({ orderBy: { createdAt: "desc" } });\n    writeFileSync(resolve(EXPORTS_DIR, \`audit-export-\${ts}.json\`), JSON.stringify({ exportedAt: new Date().toISOString(), auditLogs: { count: auditLogs.length, rows: auditLogs }, devOperations: { count: devOps.length, rows: devOps } }, null, 2), "utf-8");\n    console.log(\`已导出 \${auditLogs.length} AuditLog + \${devOps.length} DevOperation\`);\n    await prisma.\\$disconnect();\n}\n\nmain().catch((e) => { console.error(e); process.exit(1); });\n`;
    if (dryRun) { console.log(`[dry-run] 将写入 ${scriptPath}`); return; }
    if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(scriptPath, content, "utf-8"); console.log("已生成 scripts/export-db.ts");
}

function injectDbExportScript(projectRoot: string, dryRun: boolean): void {
    const pkgPath = resolve(projectRoot, "package.json");
    if (!existsSync(pkgPath)) return;
    if (dryRun) { console.log("[dry-run] 将注入 db:export"); return; }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (!pkg.scripts) pkg.scripts = {};
    if (!pkg.scripts["db:export"]) { pkg.scripts["db:export"] = "npx tsx scripts/export-db.ts"; writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8"); console.log("已在 package.json 注入 db:export"); }
}

// ════════════════════ 主流程 ════════════════════

export async function initCommand(options: InitOptions) {
    const projectRoot = process.cwd();

    // ① IDE 检测
    const target = await resolveAdapter(projectRoot, options.adapter);
    const magicDir = MAGIC_DIR_MAP[target];

    // ② 加载配置
    const config = await loadConfig(projectRoot, options.config, { force: options.force });
    config.projectRoot = projectRoot;
    config.magicDir = magicDir;

    // ③ 数据库引擎 + 容器 + 凭据
    const db = await resolveDbEngine(!!options.force);
    if (db.engine === "postgresql") {
        db.container = await resolveContainer(!!options.force);
        if (db.container && db.container !== "manual") {
            Object.assign(db, await resolveDbCredentials(!!options.force));
        }
    }

    // ── 阶段 A：写 compose / env（复用已有实例只写 env）──
    if (db.engine === "postgresql" && db.container && db.container !== "manual") {
        if (!db.reuseExisting) {
            const composeName = db.container === "podman" ? "podman-compose.yml" : "docker-compose.yml";
            const composePath = resolve(projectRoot, composeName);
            if (!options.dryRun && (!existsSync(composePath) || options.force)) {
                writeFileSync(composePath, composeContent(config.projectName || "add-project"), "utf-8");
                console.log(`已创建 ${composeName}`);
            }
        }
        const devEnvPath = resolve(projectRoot, ".env.development");
        if (!options.dryRun && existsSync(devEnvPath)) {
            const existing = readFileSync(devEnvPath, "utf-8");
            if (!/^DATABASE_USER=/m.test(existing)) {
                writeFileSync(devEnvPath, existing + `\nDATABASE_USER=${db.user || "admin"}\nDATABASE_PASSWORD=${db.password || "change-me-in-production"}\nDATABASE_PORT=${db.port || "5433"}\nPROJECT_NAME=${config.projectName || "add-project"}\n`, "utf-8");
                console.log("已将凭据追加到 .env.development");
            }
        }
    }

    // ── 阶段 B：模板渲染 + 写入（db-ensure.sh 此时落盘）──
    const coreFiles = renderCore(config, !!options.dryRun);
    console.log(`Core 模板: ${coreFiles.size} 文件`);

    const CORE_TARGETS = [".add", magicDir];
    const allFiles = new Map<string, string>();
    for (const [relPath, content] of coreFiles) {
        for (const t of CORE_TARGETS) {
            const targetPath = relPath.replace(/^\.add/, t);
            if (!allFiles.has(targetPath)) allFiles.set(targetPath, content);
        }
    }

    for (const adapter of resolveAdapters(target)) {
        const renderFn = ADAPTER_RENDERERS[adapter];
        if (renderFn) {
            const adapterFiles = renderFn(config, projectRoot, !!options.dryRun);
            for (const [p, c] of adapterFiles) allFiles.set(p, c);
            console.log(`${adapter} adapter: ${adapterFiles.size} 文件`);
        }
    }

    const result = await writeFiles(projectRoot, allFiles, { force: options.force, dryRun: options.dryRun });

    // ── 阶段 C：数据库部署 ──
    if (db.engine === "postgresql" && db.container && db.container !== "manual") {
        if (!options.dryRun) {
            const dbScript = resolve(projectRoot, magicDir, "scripts", "db-ensure.sh");
            const dbEnv = { ...process.env, DATABASE_USER: db.user, DATABASE_PASSWORD: db.password, DATABASE_PORT: db.port, PROJECT_NAME: config.projectName };
            const mode = db.reuseExisting ? "manual" : db.container;
            console.log(db.reuseExisting ? "复用已有 PostgreSQL ..." : `部署数据库 (${db.container}) ...`);
            spawnSync("bash", [dbScript, "postgresql", mode, "--migrate"], { cwd: projectRoot, stdio: "inherit", env: dbEnv });
            try {
                await injectPrisma(projectRoot, { force: !!options.force });
            } catch (e) { console.log(`Prisma 同步失败: ${e instanceof Error ? e.message : String(e)}`); }
        }
    }

    if (db.engine === "postgresql" && db.container === "manual") {
        if (!options.dryRun) {
            const dbScript = resolve(projectRoot, magicDir, "scripts", "db-ensure.sh");
            if (existsSync(dbScript)) spawnSync("bash", [dbScript, "postgresql", "manual"], { cwd: projectRoot, stdio: "inherit" });
            console.log(["", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "ADD 模板已就位。在完成以下操作前 MCP 不可用：", "", "1. 编辑 .env.development，配置 DATABASE_URL", "2. 重新运行 add-coder init 完成迁移", "", `⚠️  非 PG 数据库需编辑 ${magicDir}/scripts/mcp-server.ts 手动配 Prisma 7 adapter`, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"].join("\n"));
        }
    }

    if (db.engine === "manual") {
        if (!options.dryRun) {
            console.log(["", "Prisma 支持的 datasource: postgresql / mysql / sqlite / sqlserver / cockroachdb", "自行 prisma init + 编辑 .env.development，重新 run init 完成迁移。", "", `⚠️ Prisma 7 adapter 需手动配 → ${magicDir}/scripts/mcp-server.ts`].join("\n"));
        }
    }

    if (db.engine === "sqlite") {
        writeSqliteExportScript(projectRoot, !!options.dryRun);
        injectDbExportScript(projectRoot, !!options.dryRun);
        if (!options.dryRun) {
            try {
                await injectPrisma(projectRoot, { force: !!options.force, datasource: "sqlite" });
            } catch (e) { console.log(`SQLite 同步失败: ${e instanceof Error ? e.message : String(e)}`); }
        }
    }

    // ── 阶段 D：部署 docs 项目文档（模板 grounding 文档）──
    if (!options.dryRun) {
        const pn = config.projectName || "add-project";
        const docsBase = resolve(projectRoot, "docs", pn, "knowledge");
        const groundingSrc = resolve(import.meta.dirname!, "../templates/core/templates");
        for (const d of ["00-需求", "01-架构", "02-规范"]) {
            const srcDir = resolve(groundingSrc, d);
            const destDir = resolve(docsBase, d);
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
            if (!existsSync(srcDir)) continue;
            for (const f of readdirSync(srcDir)) {
                const src = resolve(srcDir, f);
                const dest = resolve(destDir, f);
                if (existsSync(dest)) continue; // 不覆盖已有文件
                try { copyFileSync(src, dest); } catch { /* skip */ }
            }
        }
    }

    // ── 阶段 E：摘要 ──
    console.log(`\n完成: 新建 ${result.created}, 跳过 ${result.skipped}, 覆盖 ${result.overwritten}`);

    if (!options.dryRun) {
        if (db.engine === "sqlite") console.log("数据备份: npm run db:export → data/exports/");

        const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname!, "../package.json"), "utf-8"));
        const peerNames = Object.keys(pkg.peerDependencies || {});
        if (peerNames.length > 0) {
            console.log(`\n安装 peer 依赖 (${peerNames.join(" ")}) ...`);
            const pm = detectPm(projectRoot);
            spawnSync(pm, pm === "pnpm" ? ["add", ...peerNames] : ["install", ...peerNames], { cwd: projectRoot, stdio: "inherit" });
        }
        if (db.engine !== "manual" && (db.engine !== "postgresql" || db.container !== "manual")) {
            console.log("提示: 重启 IDE 以加载 hook 配置");
        }
    }
}
