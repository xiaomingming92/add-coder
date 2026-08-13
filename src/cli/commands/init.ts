/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-15 17:09:32
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-17 16:02:01
 * @FilePath     : /add-coder/src/cli/commands/init.ts
 * @Description  : init流程核心
 */
import { detectIDE, resolveAdapters } from "../detect";
import { magicDirFor, ADD_DIR } from "../../shared/paths.js";
import { loadConfig } from "../config-loader";
import { writeFiles } from "../writer";
import { renderCoreForTargets, saveStack } from "../../core/renderer";
import { renderAdapter as renderClaude } from "../../adapters/claude/renderer";
import { renderAdapter as renderQoder } from "../../adapters/qoder/renderer";
import { renderAdapter as renderVSCode } from "../../adapters/vscode/renderer";
import { renderAdapter as renderTrae } from "../../adapters/trae/renderer";
import { renderAdapter as renderCodex } from "../../adapters/codex/renderer";
import { ask, detectPm } from "../../lib/utils";
import { injectPrisma } from "../prisma-injector";
import type { Adapter, AddCoderConfig } from "../../config/schema";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname, join as pathJoin } from "path";
import { homedir } from "os";
import { createConnection } from "net";
import { runCommand, commandExists } from "../../lib/run-command";
import { ensureEmbeddingModel } from "../../lib/model-predownload";
import { ensurePortsContract } from "../../lib/ports-contract";

interface InitOptions { adapter?: string; config?: string; force?: boolean; dryRun?: boolean; stack?: string; skipModel?: boolean; printMcpConfig?: boolean; writeUserConfig?: boolean; }
interface DbChoice { engine: "postgresql" | "sqlite" | "manual"; container?: "podman" | "docker" | "manual"; user?: string; password?: string; port?: string; reuseExisting?: boolean; }
interface PackageJsonShape { scripts?: Record<string, string> }

const ADAPTER_RENDERERS: Record<string, (config: AddCoderConfig, targetDir: string, dryRun: boolean, magicDir: string) => Map<string, string>> = {
    claude: renderClaude, qoder: renderQoder, vscode: renderVSCode, trae: renderTrae, codex: renderCodex,
};

function coreTargetsForAdapter(target: Adapter, magicDir: string): string[] {
    return target === "codex" ? [magicDir] : [ADD_DIR, magicDir];
}

function needsClaudeAgentHost(adapters: readonly string[]): boolean {
    return adapters.includes("vscode") || adapters.includes("trae");
}

// ════════════════════ 上下文 — 全流程共享状态 ════════════════════

interface InitContext {
    projectRoot: string;
    options: InitOptions;
    target: Adapter;
    magicDir: string;
    config: AddCoderConfig;
    db: DbChoice;
    stack: string;
}

// ════════════════════ 主流程 ════════════════════

/**
 * @description: ADD 项目初始化主命令
 *   prepare → writeComposeEnv → renderAndWrite → deployDatabase → deployDocs → finalize
 */
export async function initCommand(options: InitOptions) {
    // Codex MCP 配置输出（--print-mcp-config / --write-user-config）：
    // 轻量查询动作，在完整 init 流程之前处理（避免 DB 交互），处理完即返回
    if (options.printMcpConfig || options.writeUserConfig) {
        await handleCodexMcpConfig(options);
        return;
    }
    const ctx = await prepare(options);
    writeComposeEnv(ctx);
    // 技术栈状态落盘（D7/D4）：非 dry-run 时写 stack.json（渲染与状态一致）
    if (!options.dryRun) {
        saveStack(ctx.projectRoot, ctx.magicDir, ctx.stack);
        if (ctx.stack) console.log(`技术栈状态已写入 ${ctx.magicDir}/stack.json → ${ctx.stack}`);
    } else if (ctx.stack) {
        console.log(`[dry-run] 将写入 ${ctx.magicDir}/stack.json → ${ctx.stack}`);
    }
    const result = await renderAndWrite(ctx);
    // issue #10 P0-1：数据库部署失败必须传播到 finalize（非零退出码 + "治理模型未就绪"）
    const dbFail = await deployDatabase(ctx);
    // 端口契约检查（add-coder-ports-contract Plan）：在 deployDocs 前独立调用，
    // dry-run 提示不被 deployDocs 首行 return 吞掉（Review P1 #1）；只补缺不覆盖
    ensurePortsContract(ctx.projectRoot, ctx.config, !!options.dryRun);
    deployDocs(ctx);
    finalize(ctx, result, dbFail);
    // embedding 模型预下载（model-predownload Plan）：非 dry-run；skip 也打印状态（Review P2 #5）；失败 warn 不阻断（降级边界）
    if (!options.dryRun) {
        try {
            const r = await ensureEmbeddingModel({ skip: options.skipModel });
            console.log(`模型预下载: ${r.status}${r.model ? ` (${r.model})` : ""}`);
        } catch (e) {
            console.warn(`⚠️ 模型预下载失败（不影响主流程，首次 DPS 调用会自动补下载）: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

// ════════════════════ Codex MCP 配置输出（--print-mcp-config / --write-user-config） ════════════════════

/**
 * @description: 渲染并输出 Codex config.toml 片段。轻量模式：仅 loadConfig（无 DB 交互）→ 渲染 → 输出/写入。
 * @param {InitOptions} options - CLI 选项
 */
async function handleCodexMcpConfig(options: InitOptions): Promise<void> {
    const projectRoot = process.cwd();
    const magicDir = magicDirFor(options.adapter ?? "codex");
    const config = await loadConfig(projectRoot, options.config, { force: true });
    config.projectRoot = projectRoot;
    config.magicDir = magicDir;

    const files = renderCodex(config, projectRoot, !!options.dryRun, magicDir);
    const tomlEntry = [...files.entries()].find(
        ([rel]) => rel.endsWith("config.toml.example") || rel.endsWith("config.toml"),
    );
    if (!tomlEntry) {
        console.error("✗ config.toml 渲染产物缺失（检查 templates/adapters/codex/config.toml.example）");
        process.exit(1);
    }
    const toml = tomlEntry[1];

    if (options.printMcpConfig) {
        console.log("\n# 将以下片段粘贴到 ~/.codex/config.toml（或使用 --write-user-config 自动写入）");
        console.log(toml);
    }

    if (options.writeUserConfig) {
        const userConfigPath = pathJoin(homedir(), ".codex", "config.toml");
        if (options.dryRun) {
            console.log(`[dry-run] 将写入 ${userConfigPath}`);
            return;
        }
        if (existsSync(userConfigPath) && readFileSync(userConfigPath, "utf-8").includes("mcp_servers.add_coder")) {
            console.log(`⚠️ ${userConfigPath} 已存在 mcp_servers.add_coder 配置，跳过（避免重复）`);
            return;
        }
        const answer = await ask(`写入 ${userConfigPath}？（y/N） → `);
        if (answer.trim().toLowerCase() !== "y") {
            console.log("已取消写入");
            return;
        }
        if (existsSync(userConfigPath)) {
            const backup = `${userConfigPath}.bak-${Date.now()}`;
            copyFileSync(userConfigPath, backup);
            console.log(`已备份原配置 → ${backup}`);
        }
        mkdirSync(dirname(userConfigPath), { recursive: true });
        writeFileSync(userConfigPath, `\n${toml}`, { flag: "a" });
        console.log(`✅ 已写入 ${userConfigPath}，重启 Codex 生效`);
    }
}

// ════════════════════ helpers ════════════════════

/**
 * @description: 解析目标 IDE 适配器，支持手动指定或自动检测
 * @param {string} projectRoot - 项目根目录路径
 * @param {string} [specified] - 手动指定的 adapter 名称
 * @return {Promise<Adapter>} 解析后的 IDE 适配器
 */
async function resolveAdapter(projectRoot: string, specified?: string): Promise<Adapter> {
    if (specified) {
        if (!magicDirFor(specified)) throw new Error(`未知 adapter: ${specified}`);
        console.log(`目标 IDE: ${specified} (--adapter)`);
        return specified as Adapter;
    }
    const detected = detectIDE(projectRoot);
    if (detected !== "auto") { console.log(`检测到 IDE: ${detected} (自动)`); return detected; }
    console.log("未检测到 IDE 环境");
    const a = (await ask("请选择目标 IDE: [1] Qoder  [2] Claude  [3] VS Code  [4] Trae  [5] Codex → ")).trim();
    if (a === "1" || a === "qoder") return "qoder";
    if (a === "2" || a === "claude") return "claude";
    if (a === "3" || a === "vscode") return "vscode";
    if (a === "4" || a === "trae") return "trae";
    if (a === "5" || a === "codex") return "codex";
    console.log("输入无法识别，默认 qoder"); return "qoder";
}

/**
 * @description: 交互式选择数据库引擎
 * @param {boolean} force - 强制模式，跳过交互直接使用 PostgreSQL
 * @return {Promise<DbChoice>} 数据库引擎选择结果
 */
async function resolveDbEngine(force: boolean): Promise<DbChoice> {
    if (force) { console.log("数据库引擎: PostgreSQL (--force 默认)"); return { engine: "postgresql", container: "podman" }; }
    console.log(["", "数据库引擎:", "  [1] PostgreSQL (推荐)", "  [2] SQLite — 零依赖", "  [3] 自行管理"].join("\n"));
    const a = (await ask("请选择 [1/2/3] → ")).trim();
    if (a === "2" || a === "sqlite") return { engine: "sqlite" };
    if (a === "3" || a === "manual") return { engine: "manual" };
    if (a !== "" && a !== "1" && !a.startsWith("postgres")) console.log("输入无法识别，默认 PostgreSQL");
    return { engine: "postgresql" };
}

/**
 * @description: 交互式选择容器运行时
 * @param {boolean} force - 强制模式，默认 podman
 * @return {Promise<"podman" | "docker" | "manual">} 容器运行时
 */
async function resolveContainer(force: boolean): Promise<"podman" | "docker" | "manual"> {
    if (force) return "podman";
    console.log(["", "容器运行时:", "  [1] podman (推荐)", "  [2] docker", "  [3] 自行管理"].join("\n"));
    const a = (await ask("请选择 [1/2/3] → ")).trim();
    if (a === "2" || a === "docker") return "docker";
    if (a === "3" || a === "manual") return "manual";
    if (a !== "" && a !== "1" && a !== "podman") console.log("输入无法识别，默认 podman");
    return "podman";
}

/**
 * @description: 检测本地端口是否被占用
 * @param {number} port - 待检测端口号
 * @return {Promise<boolean>} true 表示端口已占用
 */
function portInUse(port: number): Promise<boolean> {
    return new Promise((r) => {
        const s = createConnection({ port, host: "127.0.0.1" }, () => { s.destroy(); r(true); });
        s.on("error", () => r(false));
    });
}

/**
 * @description: 检测系统是否安装了 pg_isready 工具
 * @return {boolean} true 表示可用
 */
function hasPgIsready(): boolean {
    // 优先用容器内置的 pg_isready
    try {
        const containers = runCommand("podman", ["ps", "--filter", "publish=5433", "--format", "{{.Names}}"], { timeout: 3000 });
        const name = containers.stdout.toString().trim().split("\n")[0];
        if (name && runCommand("podman", ["exec", name, "pg_isready", "--version"], { timeout: 2000 }).status === 0) return true;
    } catch { /* ignore */ }
    // Windows 无 which → commandExists（win32: where）（issue #10 已知边界）
    return commandExists("pg_isready");
}

/**
 * @description: 使用 pg_isready 验证 PostgreSQL 连接凭据
 * @param {string} port - 数据库端口
 * @param {string} user - 数据库用户名
 * @param {string} password - 数据库密码
 * @param {string} dbName - 数据库名称
 * @return {boolean} true 表示连接成功
 */
function testPostgresConnection(port: string, user: string, password: string, dbName: string): boolean {
    if (!hasPgIsready()) {
        console.log("  ⚠️  无法验证凭据（容器未运行且 pg_isready 未安装），信任输入");
        return true;
    }
    try {
        // 优先用容器内的 pg_isready，不行再用宿主机
        const containers = runCommand("podman", ["ps", "--filter", "publish=5433", "--format", "{{.Names}}"], { timeout: 3000 });
        const containerName = containers.stdout.toString().trim().split("\n")[0];
        const args = containerName
            ? ["exec", containerName, "pg_isready", "-U", user, "-d", dbName]
            : ["-h", "localhost", "-p", port, "-U", user, "-d", dbName];
        const cmd = containerName ? "podman" : "pg_isready";
        const r = runCommand(cmd, args, {
            timeout: 5000,
            env: containerName ? undefined : { ...process.env, PGPASSWORD: password },
        });
        return r.status === 0;
    } catch {
        return false;
    }
}

/**
 * @description: 交互式收集数据库凭据（用户/密码/端口），支持端口冲突处理和已有实例复用
 * @param {boolean} force - 强制模式，使用默认凭据
 * @return {Promise<{ user: string; password: string; port: string; reuseExisting?: boolean }>} 数据库凭据
 */
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

/**
 * @description: 生成 podman/docker compose 配置文件内容
 * @param {string} projectName - 项目名称
 * @return {string} YAML 格式的 compose 内容
 */
function composeContent(projectName: string): string {
    return `services:\n  postgres:\n    image: docker.io/postgres:16-alpine\n    container_name: \${PROJECT_NAME:-${projectName}}-postgres\n    restart: unless-stopped\n    ports:\n      - "127.0.0.1:\${DATABASE_PORT:-5433}:5432"\n    volumes:\n      - ./data/postgres/\${PROJECT_NAME:-${projectName}}:/var/lib/postgresql/data\n    env_file:\n      - .env.development\n    environment:\n      POSTGRES_USER: \${DATABASE_USER:-admin}\n      POSTGRES_PASSWORD: \${DATABASE_PASSWORD:-change-me-in-production}\n      POSTGRES_DB: \${PROJECT_NAME:-${projectName}}\n      TZ: "Asia/Shanghai"\n    networks:\n      - \${PROJECT_NAME:-${projectName}}-network\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U \${DATABASE_USER:-admin} -d \${PROJECT_NAME:-${projectName}}"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\nnetworks:\n  \${PROJECT_NAME:-${projectName}}-network:\n    driver: bridge\n`;
}

function _patchDatabaseUrl(projectRoot: string, projectName: string | undefined, dbUser: string | undefined, dbPass: string | undefined, dbPort: string | undefined, dryRun: boolean): void {
    const devEnvPath = resolve(projectRoot, ".env.development");
    if (!existsSync(devEnvPath) || !dbUser || !dbPass || !dbPort || !projectName) return;
    if (dryRun) { console.log("[dry-run] 将更新 DATABASE_URL"); return; }
    const content = readFileSync(devEnvPath, "utf-8");
    const url = `DATABASE_URL="postgresql://${dbUser}:${dbPass}@localhost:${dbPort}/${projectName}?schema=public"`;
    const updated = content.replace(/^DATABASE_URL=.*/m, url);
    if (updated !== content) { writeFileSync(devEnvPath, updated, "utf-8"); console.log("已更新 DATABASE_URL"); }
}

/**
 * @description: 写入 SQLite 数据库导出脚本到 scripts 目录
 * @param {string} projectRoot - 项目根目录
 * @param {boolean} dryRun - 预览模式，不实际写入
 * @return {void}
 */
function writeSqliteExportScript(projectRoot: string, dryRun: boolean): void {
    const scriptsDir = resolve(projectRoot, "scripts");
    const scriptPath = resolve(scriptsDir, "export-db.ts");
    const content = `import { PrismaClient } from "@prisma/client";\nimport { writeFileSync, mkdirSync, existsSync } from "fs";\nimport { resolve } from "path";\n\nconst prisma = new PrismaClient();\nconst EXPORTS_DIR = resolve(process.cwd(), "data/exports");\n\nasync function main() {\n    if (!existsSync(EXPORTS_DIR)) mkdirSync(EXPORTS_DIR, { recursive: true });\n    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);\n    const auditLogs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });\n    const devOps = await prisma.devOperation.findMany({ orderBy: { createdAt: "desc" } });\n    writeFileSync(resolve(EXPORTS_DIR, \`audit-export-\${ts}.json\`), JSON.stringify({ exportedAt: new Date().toISOString(), auditLogs: { count: auditLogs.length, rows: auditLogs }, devOperations: { count: devOps.length, rows: devOps } }, null, 2), "utf-8");\n    console.log(\`已导出 \${auditLogs.length} AuditLog + \${devOps.length} DevOperation\`);\n    await prisma.\\$disconnect();\n}\n\nmain().catch((e) => { console.error(e); process.exit(1); });\n`;
    if (dryRun) { console.log(`[dry-run] 将写入 ${scriptPath}`); return; }
    if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(scriptPath, content, "utf-8"); console.log("已生成 scripts/export-db.ts");
}

/**
 * @description: 在 package.json 中注入 db:export 脚本命令
 * @param {string} projectRoot - 项目根目录
 * @param {boolean} dryRun - 预览模式，不实际写入
 * @return {void}
 */
function injectDbExportScript(projectRoot: string, dryRun: boolean): void {
    const pkgPath = resolve(projectRoot, "package.json");
    if (!existsSync(pkgPath)) return;
    if (dryRun) { console.log("[dry-run] 将注入 db:export"); return; }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJsonShape;
    if (!pkg.scripts) pkg.scripts = {};
    if (!pkg.scripts["db:export"]) { pkg.scripts["db:export"] = "npx tsx scripts/export-db.ts"; writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8"); console.log("已在 package.json 注入 db:export"); }
}

// ════════════════════ 阶段: prepare ════════════════════

/**
 * @description: 技术栈申报（D7）：--stack 优先 → 交互提问 → 默认不设置（中性）
 * @param {InitOptions} options - init 选项
 * @return {Promise<string>} 技术栈 profile 名，空串 = 不设置
 */
async function resolveStack(options: InitOptions): Promise<string> {
    if (options.stack) {
        console.log(`技术栈约束: ${options.stack} (--stack)`);
        return options.stack;
    }
    if (options.force) return "";
    console.log(["", "技术栈约束（可选）:", "  [1] 不设置（中性，推荐）", "  [2] webapp", "  [3] machineserver", "  [4] 自定义（输入 profile 名）"].join("\n"));
    const a = (await ask("请选择 [1/2/3/4] → ")).trim();
    if (a === "2" || a === "webapp") return "webapp";
    if (a === "3" || a === "machineserver") return "machineserver";
    if (a === "4" || a === "custom") {
        const name = (await ask("自定义 profile 名（需已在 .qoder/rules/profiles/ 存在）: ")).trim();
        return name || "";
    }
    return ""; // 回车 / 1 → 不设置
}

async function prepare(options: InitOptions): Promise<InitContext> {
    const projectRoot = process.cwd();
    const target = await resolveAdapter(projectRoot, options.adapter);
    const magicDir = magicDirFor(target);

    const config = await loadConfig(projectRoot, options.config, { force: options.force });
    config.projectRoot = projectRoot;
    config.magicDir = magicDir;

    const stack = await resolveStack(options);
    config.stack = stack;

    const db = await resolveDbEngine(!!options.force);
    if (db.engine === "postgresql") {
        db.container = await resolveContainer(!!options.force);
        if (db.container && db.container !== "manual") {
            Object.assign(db, await resolveDbCredentials(!!options.force));
        }
    }

    return { projectRoot, options, target, magicDir, config, db, stack };
}

// ════════════════════ 阶段 A: compose / env ════════════════════

function writeComposeEnv(ctx: InitContext): void {
    const { projectRoot, options, config, db } = ctx;
    if (db.engine !== "postgresql" || !db.container || db.container === "manual") return;

    if (!db.reuseExisting) {
        const composeName = db.container === "podman" ? "podman-compose.add.yml" : "docker-compose.add.yml";
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
            writeFileSync(devEnvPath, existing +
                `\nDATABASE_USER=${db.user || "admin"}\n` +
                `DATABASE_PASSWORD=${db.password || "change-me-in-production"}\n` +
                `DATABASE_PORT=${db.port || "5433"}\n` +
                `PROJECT_NAME=${config.projectName || "add-project"}\n`, "utf-8");
            console.log("已将凭据追加到 .env.development");
        }
    }
}

// ════════════════════ 阶段 B: 模板渲染 + 写入 ════════════════════

async function renderAndWrite(ctx: InitContext) {
    const { projectRoot, options, magicDir, config, target } = ctx;
    const dry = !!options.dryRun;

    const coreTargets = coreTargetsForAdapter(target, magicDir);
    const allFiles = renderCoreForTargets(config, dry, coreTargets);
    console.log(`Core 模板: ${allFiles.size} 个并列目标文件`);

    const resolved = resolveAdapters(target);
    for (const adapter of resolved) {
        const renderFn = ADAPTER_RENDERERS[adapter];
        if (renderFn) {
            const adapterMagicDir = magicDirFor(adapter);
            const adapterFiles = renderFn(
                { ...config, magicDir: adapterMagicDir },
                projectRoot,
                dry,
                adapterMagicDir,
            );
            for (const [p, c] of adapterFiles) allFiles.set(p, c);
            console.log(`${adapter} adapter: ${adapterFiles.size} 文件`);
        }
    }

    if (needsClaudeAgentHost(resolved)) {
        const claudeMagicDir = magicDirFor("claude");
        const claudeFiles = renderClaude(
            { ...config, magicDir: claudeMagicDir },
            projectRoot,
            dry,
            claudeMagicDir,
        );
        for (const [p, c] of claudeFiles) allFiles.set(p, c);
        console.log(`claude adapter (via Agent Host): ${claudeFiles.size} 文件`);
    }

    // 确保空目录存在（reviews/ 等运行时产出目录）
    const reviewTargets = target === "codex" ? [magicDir] : [ADD_DIR, magicDir];
    for (const d of reviewTargets) {
        const reviewsDir = resolve(projectRoot, d, "reviews")
        if (!existsSync(reviewsDir)) {
            if (dry) { console.log(`[dry-run] 将创建 ${reviewsDir}/`); }
            else { mkdirSync(reviewsDir, { recursive: true }) }
        }
    }

    if (!dry) {
        const hashMap: Record<string, string> = {};
        let npmVer = "";
        try { npmVer = (JSON.parse(readFileSync(resolve(projectRoot, "node_modules", "add-coder", "templates", ".add-coder-src-hash.json"), "utf-8")) as Record<string, string>)._version ?? ""; } catch { /* ignore */ }
        for (const [rp, c] of allFiles) {
            hashMap[rp] = createHash("sha256").update(c).digest("hex").slice(0, 8);
        }
        const hashOut = resolve(projectRoot, magicDir, ".add-coder-hash.json");
        writeFileSync(hashOut, JSON.stringify(hashMap, null, 2) + "\n", "utf-8");
        if (npmVer) { writeFileSync(resolve(projectRoot, magicDir, ".add-coder-version"), npmVer + "\n", "utf-8"); }
        console.log(`hash: ${Object.keys(hashMap).length} entries → ${magicDir}/.add-coder-hash.json`);
    }

    return await writeFiles(projectRoot, allFiles, { force: options.force, dryRun: options.dryRun });
}

// ════════════════════ 阶段 C: 数据库部署 ════════════════════

async function deployDatabase(ctx: InitContext): Promise<string | null> {
    const { projectRoot, options, magicDir, config, db } = ctx;
    if (options.dryRun) return null;

    // issue #10 P0-1：任一部署环节失败 → 返回失败原因，finalize 非零退出 + "治理模型未就绪"
    let fail: string | null = null;

    if (db.engine === "postgresql" && db.container && db.container !== "manual") {
        const dbScript = resolve(projectRoot, magicDir, "scripts", "db-ensure.sh");
        const dbEnv = { ...process.env, DATABASE_USER: db.user, DATABASE_PASSWORD: db.password, DATABASE_PORT: db.port, PROJECT_NAME: config.projectName };
        const mode = db.reuseExisting ? "manual" : db.container;
        console.log(db.reuseExisting ? "复用已有 PostgreSQL ..." : `部署数据库 (${db.container}) ...`);
        // bash 依赖（Windows 无 bash 时 runCommand 抛"命令不可用"→ 纳入失败检测；bash 替代为 P2）
        // stdio: "inherit" 保持原实时输出（Review-implementation #2 输出被吞修复）
        try {
            const bashRun = runCommand("bash", [dbScript, "postgresql", mode, "--migrate"], { cwd: projectRoot, env: dbEnv, stdio: "inherit" });
            if (bashRun.status !== 0) fail = `db-ensure.sh 退出码: ${bashRun.status}${bashRun.stderr ? `\n${bashRun.stderr.trim().split("\n").slice(0, 5).join("\n")}` : ""}`;
        } catch (e) { fail = e instanceof Error ? e.message : String(e); }
        try {
            await injectPrisma(projectRoot, { force: !!options.force });
        } catch (e) { fail = `Prisma 同步失败: ${e instanceof Error ? e.message : String(e)}`; }
    }

    if (db.engine === "postgresql" && db.container === "manual") {
        const dbScript = resolve(projectRoot, magicDir, "scripts", "db-ensure.sh");
        if (existsSync(dbScript)) {
            try {
                const bashRun = runCommand("bash", [dbScript, "postgresql", "manual"], { cwd: projectRoot, stdio: "inherit" });
                if (bashRun.status !== 0) fail = `db-ensure.sh 退出码: ${bashRun.status}${bashRun.stderr ? `\n${bashRun.stderr.trim().split("\n").slice(0, 5).join("\n")}` : ""}`;
            } catch (e) { fail = e instanceof Error ? e.message : String(e); }
        }
        console.log(["", "━".repeat(30), "ADD 模板已就位。在完成以下操作前 MCP 不可用：", "",
            "1. 编辑 .env.development，配置 DATABASE_URL", "2. 重新运行 add-coder init 完成迁移", "",
            `⚠️  非 PG 数据库需编辑 ${magicDir}/scripts/mcp-server.ts 手动配 Prisma 7 adapter`, "━".repeat(30)].join("\n"));
    }

    if (db.engine === "manual") {
        console.log(["", "Prisma 支持的 datasource: postgresql / mysql / sqlite / sqlserver / cockroachdb",
            "自行 prisma init + 编辑 .env.development，重新 run init 完成迁移。", "",
            `⚠️ Prisma 7 adapter 需手动配 → ${magicDir}/scripts/mcp-server.ts`].join("\n"));
    }

    if (db.engine === "sqlite") {
        writeSqliteExportScript(projectRoot, false);
        injectDbExportScript(projectRoot, false);
        try {
            await injectPrisma(projectRoot, { force: !!options.force, datasource: "sqlite" });
        } catch (e) { fail = `SQLite 同步失败: ${e instanceof Error ? e.message : String(e)}`; }
    }

    return fail;
}

// ════════════════════ 阶段 D: 文档落地 ════════════════════

function deployDocs(ctx: InitContext): void {
    const { projectRoot, options, config } = ctx;
    if (options.dryRun) return;

    const pn = config.projectName || "add-project";
    const docsBase = resolve(projectRoot, "docs", pn, "knowledge");
    const groundingSrc = resolve(import.meta.dirname, "../templates/core/templates");
    for (const d of ["00-需求", "01-架构", "02-规范"]) {
        const srcDir = resolve(groundingSrc, d);
        const destDir = resolve(docsBase, d);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        if (!existsSync(srcDir)) continue;
        for (const f of readdirSync(srcDir)) {
            const src = resolve(srcDir, f);
            const dest = resolve(destDir, f);
            if (existsSync(dest)) continue;
            try { copyFileSync(src, dest); } catch { /* skip */ }
        }
    }
}

// ════════════════════ 阶段 E: 摘要 + 依赖安装 ════════════════════

function finalize(ctx: InitContext, result: { created: number; skipped: number; overwritten: number }, dbFail: string | null): void {
    const { projectRoot, options, db } = ctx;

    if (options.dryRun) {
        console.log(`\n完成: 新建 ${result.created}, 跳过 ${result.skipped}, 覆盖 ${result.overwritten}`);
        return;
    }

    if (db.engine === "sqlite") console.log("数据备份: npm run db:export → data/exports/");

    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf-8")) as { peerDependencies?: Record<string, string> };
    const peerNames = Object.keys(pkg.peerDependencies || {});
    if (peerNames.length > 0) {
        console.log(`\n安装 peer 依赖 (${peerNames.join(" ")}) ...`);
        const pm = detectPm(projectRoot);
        const installArgs = pm === "pnpm" ? ["add", ...peerNames] : ["install", ...peerNames];
        try {
            const ir = runCommand(pm, installArgs, { cwd: projectRoot });
            if (ir.status !== 0) console.warn(`⚠️ peer 依赖安装失败（退出码: ${ir.status}），后续 MCP 启动可能报错`);
        } catch (e) { console.warn(`⚠️ peer 依赖安装失败: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (db.engine !== "manual" && (db.engine !== "postgresql" || db.container !== "manual")) {
        console.log("提示: 重启 IDE 以加载 hook 配置");
    }

    // issue #10 P0-1：数据库部署失败 → 明确"治理模型未就绪" + 非零退出码
    // Review-implementation #3："完成"打印必须在失败检查之后（失败时不输出误导性"完成"）
    if (dbFail) {
        console.error(`\n✗ 治理模型未就绪: ${dbFail}`);
        console.error("  请按错误提示修复后重新运行 add-coder init。");
        process.exit(1);
    }
    console.log(`\n完成: 新建 ${result.created}, 跳过 ${result.skipped}, 覆盖 ${result.overwritten}`);
}
