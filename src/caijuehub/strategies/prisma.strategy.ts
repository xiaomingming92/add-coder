// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const PRISMA_CONFIG = {
    onMissing: "ask",
    onExistingAddPrisma: "ask",
    onMigrateFail: "rollback",
    autoGenerate: true,
    migrationName: "add_workflow_init",
    schemaArg: "--schema=prisma/",
    requiresUserModel: true,
    sync: {
        strategy: "atlas",
        addDatabaseUrl: "",
        atlasDevUrl: "",
        backupDir: ".add/backups/prisma-sync",
        backupKeep: 5,
        backupRequiredForPush: true,
    },
};
// <<< CAIJUE GENERATED END <<<
// >>> USER CODE >>>
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { ask, detectPm } from "../../lib/utils";
import { runCommand, commandExists } from "../../lib/run-command";
import type { RunResult } from "../../lib/run-command";
import { backupBeforeSync } from "../../lib/db-backup";
import { allocatePortsWithContract } from "../../lib/ports-contract";

/** ADD 治理表清单（分库/共库双模式共用；非 ADD 表变更默认拒绝依据） */
const ADD_TABLES = ["AddUser", "DevOperation", "AuditLog", "HitlRecord", "PlanRecord", "ReviewRecord", "CollabContract"];

/** 读取 .env.development 变量值（v2 分库引导） */
function readEnvValue(projectRoot: string, key: string): string {
    const envPath = resolve(projectRoot, ".env.development");
    if (!existsSync(envPath)) return "";
    const m = readFileSync(envPath, "utf-8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m?.[1]?.trim() || "";
}

/** 追加变量到 .env.development（幂等） */
function appendEnvValue(projectRoot: string, key: string, value: string): void {
    const envPath = resolve(projectRoot, ".env.development");
    const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    if (new RegExp(`^${key}=`, "m").test(existing)) return;
    writeFileSync(envPath, `${existing}${existing.endsWith("\n") ? "" : "\n"}${key}=${value}\n`, "utf-8");
}

/** 端口占用检测（与 init.ts portInUse 同逻辑）——已由 ports-contract.ts 统一分配器接管（P-2） */

/**
 * ⓪ init 分库检测与引导（v2）[回流: Review P2 #1]
 * @returns true=分库模式（ADD 治理数据入独立 add 库）/ false=共库模式（宿主库）
 */
export async function ensureSplitDb(projectRoot: string, opts: { force?: boolean; yes?: boolean; dryRun?: boolean }): Promise<boolean> {
    const existing = readEnvValue(projectRoot, "ADD_DATABASE_URL");
    if (existing) {
        console.log("分库模式：检测到 ADD_DATABASE_URL，ADD 治理模型入独立库");
        return true;
    }
    if (opts.dryRun) {
        console.log("[dry-run] 将询问是否分库（独立 ADD 数据库，推荐）");
        return false;
    }
    let choice = "y";
    if (!opts.force && !opts.yes) {
        const a = await ask("是否将 ADD 治理模型放入独立数据库（推荐，隔离业务库）？[Y/n] ");
        if (a === "n" || a === "no") choice = "n";
    }
    if (choice === "n") {
        console.log("共库模式：ADD 治理模型进入宿主库（diff 非 ADD 表变更默认拒绝）");
        return false;
    }
    // [是] 分支：podman 起 {project}-add-postgres（端口走端口契约机制）
    const projectName = readEnvValue(projectRoot, "PROJECT_NAME") || "add-project";
    const dbUser = readEnvValue(projectRoot, "DATABASE_USER") || "admin";
    const dbPass = readEnvValue(projectRoot, "DATABASE_PASSWORD") || "change-me-in-production";
    const dbName = `${projectName}-add`;
    const container = `${projectName}-add-postgres`;
    const port = (await allocatePortsWithContract(projectRoot, [{ name: "add", containerName: `${projectName}-add-postgres`, envKey: "ADD_DATABASE_URL" }])).add;
    console.log(`启动独立 ADD 库容器 ${container}（端口 ${port}）...`);
    const r = runCommand("podman", ["run", "-d", "--name", container, "--restart", "unless-stopped",
        "-e", `POSTGRES_USER=${dbUser}`, "-e", `POSTGRES_PASSWORD=${dbPass}`, "-e", `POSTGRES_DB=${dbName}`,
        "-p", `127.0.0.1:${port}:5432`, "docker.io/postgres:16-alpine"], { timeout: 60000 });
    if (r.status !== 0) {
        throw new Error(`独立 ADD 库容器启动失败（退出码 ${r.status}）: ${r.stderr.trim().slice(0, 200)}`);
    }
    appendEnvValue(projectRoot, "ADD_DATABASE_URL", `postgresql://${dbUser}:${dbPass}@127.0.0.1:${port}/${dbName}?schema=public`);
    // add.prisma datasource 指向 add 库（分库模式）
    const addPrismaPath = resolve(projectRoot, "prisma", "add.prisma");
    if (existsSync(addPrismaPath)) {
        const content = readFileSync(addPrismaPath, "utf-8");
        if (!content.includes("datasource db")) {
            writeFileSync(addPrismaPath, `datasource db {\n  provider = "postgresql"\n  url      = env("ADD_DATABASE_URL")\n}\n\n${content}`, "utf-8");
        }
    }
    console.log(`✅ 已创建独立 ADD 库 ${container}（端口 ${port}），ADD_DATABASE_URL 已写入 .env.development`);
    return true;
}

/** prisma migrate diff 参数（Prisma 7 参数路由：--to-schema vs --to-schema-datamodel） */
export function prismaDiffArgs(pm: string, schemaTo: string, fromUrl: string | null): string[] {
    const base = pm === "pnpm" ? ["dlx", "prisma", "migrate", "diff"] : ["exec", "prisma", "--", "migrate", "diff"];
    // Prisma 7（2025-11+）：--to-schema；≤6.x：--to-schema-datamodel（先探测版本，失败回退旧参数）
    const toFlag = "--to-schema";
    const args = [...base, "--from-empty", toFlag, schemaTo, "--script"];
    if (fromUrl) args.splice(args.indexOf("--from-empty"), 1, "--from-url", fromUrl);
    return args;
}

/**
 * dev-url 常驻（P-1，决议演进）：常驻独立空库（框架原则：可重放的独立空库，任意环境）。
 * 落地：ATLAS_DEV_URL 已有 → 直用；无 → 消费方创建 `{project}-add-dev` 常驻容器（统一分配器取端口并登记，不销毁）；add-coder 自身场景复用已有 shadow 实例转正。
 */
async function provisionDevUrl(projectRoot: string): Promise<string | null> {
    const existing = readEnvValue(projectRoot, "ATLAS_DEV_URL");
    if (existing) return existing;
    if (!commandExists("podman")) return null;
    const projectName = readEnvValue(projectRoot, "PROJECT_NAME") || "add-project";
    const container = `${projectName}-add-dev`;
    // 容器已存在运行中 → 查端口复用（不重建）
    try {
        const ps = runCommand("podman", ["ps", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"]);
        if (ps.stdout.trim()) {
            const portR = runCommand("podman", ["port", container, "5432/tcp"]);
            const pm = portR.stdout.match(/127\.0\.0\.1:(\d{2,5})/);
            if (pm) {
                const url = `postgresql://postgres:postgres@127.0.0.1:${pm[1]}/dev?schema=public`;
                appendEnvValue(projectRoot, "ATLAS_DEV_URL", url);
                return url;
            }
        }
    } catch { /* ignore */ }
    // 创建常驻容器（统一分配器端口 + 登记；不销毁）
    const ports = await allocatePortsWithContract(projectRoot, [{ name: "dev", containerName: container, envKey: "ATLAS_DEV_URL" }]);
    const port = ports.dev;
    const r = runCommand("podman", ["run", "-d", "--name", container, "--restart", "unless-stopped",
        "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_PASSWORD=postgres", "-e", "POSTGRES_DB=dev",
        "-p", `127.0.0.1:${port}:5432`, "docker.io/postgres:16-alpine"], { timeout: 60000 });
    if (r.status !== 0) return null;
    const url = `postgresql://postgres:postgres@127.0.0.1:${port}/dev?schema=public`;
    appendEnvValue(projectRoot, "ATLAS_DEV_URL", url);
    console.log(`✅ 常驻 dev 空库已创建: ${container}（端口 ${port}，不销毁，可随时重置）`);
    return url;
}

/**
 * atlas 可执行解析（依赖自带优先）：add-coder 包作用域 → 消费方根 .bin → PATH 全局
 * file:/registry 安装下 atlas 是 add-coder 的传递依赖，bin 在 node_modules/add-coder/node_modules/.bin/
 */
export function resolveAtlasBin(projectRoot: string): string | null {
    // ① add-coder 包作用域（消费方：node_modules/add-coder/node_modules/.bin/atlas）
    const pkgBin = resolve(projectRoot, "node_modules", "add-coder", "node_modules", ".bin", "atlas");
    if (existsSync(pkgBin)) return pkgBin;
    // ② 消费方根 .bin（直接依赖 @ariga/atlas 时）
    const local = resolve(projectRoot, "node_modules", ".bin", "atlas");
    if (existsSync(local)) return local;
    // ③ PATH 全局
    return commandExists("atlas") ? "atlas" : null;
}

/** diff SQL 中非 ADD 表变更检测（共库模式默认拒绝依据） */
export function hasNonAddTableChanges(diffSql: string): boolean {
    const re = /(?:DROP|ALTER|CREATE)\s+TABLE(?:\s+IF\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(diffSql)) !== null) {
        if (!ADD_TABLES.includes(m[1])) return true;
    }
    return false;
}

/**
 * 共库模式 exclude 列表（动态）：库中除 ADD 7 表外的全部表（含业务表、checkpoint 表、_prisma_migrations）
 * Atlas --exclude 语法：逗号分隔 + public. schema 前缀精确表名（glob/无前缀不生效，v1.3.0 实测）
 */
function buildExcludeArgs(projectRoot: string, splitDb: boolean): string[] {
    if (splitDb) return []; // 分库 add 库只含 ADD 表，无需排除
    const projectName = readEnvValue(projectRoot, "PROJECT_NAME") || "add-project";
    const dbUser = readEnvValue(projectRoot, "DATABASE_USER") || "admin";
    try {
        const r = runCommand("podman", ["exec", `${projectName}-postgres`, "psql", "-U", dbUser, "-d", projectName, "-tAc",
            "SELECT string_agg('public.' || table_name, ',') FROM information_schema.tables WHERE table_schema='public' AND table_name NOT IN ('AddUser','DevOperation','AuditLog','HitlRecord','PlanRecord','ReviewRecord','CollabContract');"], { timeout: 30000 });
        const tables = r.stdout.trim();
        return tables ? ["--exclude", tables] : [];
    } catch {
        return [];
    }
}

/** Atlas 引擎（默认策略）：baseline → diff → 确认 → apply；返回 true=成功 / false=降级 */
async function runAtlasSync(projectRoot: string, targetUrl: string, splitDb: boolean, sync: { atlasDevUrl: string }, opts: { yes?: boolean }): Promise<boolean> {
    const pm = detectPm(projectRoot);
    const schemaTo = splitDb ? resolve(projectRoot, "prisma", "add.prisma") : resolve(projectRoot, "prisma");
    const baselinePath = join(projectRoot, PRISMA_CONFIG.sync.backupDir, "baseline.sql");
    mkdirSync(dirname(baselinePath), { recursive: true });
    // 1. baseline 生成（分库=ADD 模型 / 共库=宿主完整 schema）
    const diffR = runCommand(pm, prismaDiffArgs(pm, schemaTo, null), { cwd: projectRoot, timeout: 60000 });
    if (diffR.status !== 0) { console.warn(`⚠️ baseline 生成失败（${diffR.stderr.trim().slice(0, 150)}），降级 prisma-diff`); return false; }
    writeFileSync(baselinePath, diffR.stdout, "utf-8");
    // 2. dev-url：常驻独立空库（ATLAS_DEV_URL 优先 → 创建 {project}-add-dev 常驻 → 用户自配 → 降级）
    const atlasBin = resolveAtlasBin(projectRoot);
    if (!atlasBin) { console.warn("⚠️ atlas 不可用（依赖未安装或全局缺失）"); return false; }
    let devUrl = await provisionDevUrl(projectRoot);
    if (!devUrl && sync.atlasDevUrl) devUrl = sync.atlasDevUrl;
    if (!devUrl) { console.warn("⚠️ dev-url 不可用（无 podman 且未配置 atlas_dev_url），降级 prisma-diff"); return false; }
    {
        // 3. diff（共库模式排除全部非 ADD 表：业务表、checkpoint 表、_prisma_migrations——2026-08-07 db push 误删事故教训）
        const diffArgs = ["schema", "diff", "--from", targetUrl, "--to", `file://${baselinePath}`, "--dev-url", devUrl, ...buildExcludeArgs(projectRoot, splitDb)];
        const diffSqlR = runCommand(atlasBin, diffArgs, { cwd: projectRoot, timeout: 60000 });
        if (diffSqlR.status !== 0) { console.warn(`⚠️ atlas diff 失败（${diffSqlR.stderr.trim().slice(0, 150)}），降级 prisma-diff`); return false; }
        const diffSql = diffSqlR.stdout;
        // 幂等判断：Atlas 无变更时输出 "Schemas are synced, no changes to be made."（非空）——需检测 SQL 语句特征而非空串
        const hasSql = /(?:^|\n)\s*(?:CREATE|ALTER|DROP|COMMENT|--\s*(?:Create|Modify|Drop))\b/i.test(diffSql);
        if (!hasSql) { console.log("✅ 数据库与目标 schema 一致（幂等出口）"); return true; }
        // 4. 共库模式：非 ADD 表变更默认拒绝
        if (!splitDb && hasNonAddTableChanges(diffSql)) {
            console.error("⛔ 共库模式检测到非 ADD 表变更（默认拒绝）。请人工审核 diff.sql 或选择分库模式。");
            console.error(diffSql.split("\n").slice(0, 30).join("\n"));
            throw new Error("共库模式非 ADD 表变更默认拒绝（可用 --yes 或分库模式绕过）");
        }
        // 5. apply 确认门槛：交互输出 SQL → 确认 → apply；--yes 直通
        if (!opts.yes) {
            console.log("=== 待应用 diff SQL ===");
            console.log(diffSql.split("\n").slice(0, 60).join("\n"));
            const c = await ask("应用以上 schema 变更？[y/N] ");
            if (c !== "y" && c !== "yes") { console.log("已取消，未应用"); return true; }
        }
        const applyArgs = ["schema", "apply", "--url", targetUrl, "--to", `file://${baselinePath}`, "--dev-url", devUrl, ...buildExcludeArgs(projectRoot, splitDb)];
        const applyR = runCommand(atlasBin, applyArgs, { cwd: projectRoot, timeout: 120000 });
        if (applyR.status !== 0) { console.warn(`⚠️ atlas apply 失败（${applyR.stderr.trim().slice(0, 150)}）`); return false; }
        console.log("✅ Atlas schema 同步完成");
        return true;
    }
}

/** prisma-diff 免 shadow 降级路径（--from-url --to-schema --script → db execute） */
function runPrismaDiffSync(projectRoot: string, targetUrl: string, splitDb: boolean): void {
    const pm = detectPm(projectRoot);
    const schemaTo = splitDb ? resolve(projectRoot, "prisma", "add.prisma") : resolve(projectRoot, "prisma");
    const diffPath = join(projectRoot, PRISMA_CONFIG.sync.backupDir, "diff.sql");
    mkdirSync(dirname(diffPath), { recursive: true });
    const r = runCommand(pm, prismaDiffArgs(pm, schemaTo, targetUrl), { cwd: projectRoot, timeout: 60000 });
    if (r.status !== 0) throw new Error(`prisma migrate diff 失败: ${r.stderr.trim().slice(0, 200)}`);
    writeFileSync(diffPath, r.stdout, "utf-8");
    if (!r.stdout.trim()) { console.log("✅ 数据库与目标 schema 一致（幂等出口）"); return; }
    const execArgs = pm === "pnpm" ? ["dlx", "prisma", "db", "execute", "--file", diffPath] : ["exec", "prisma", "--", "db", "execute", "--file", diffPath];
    const e = runCommand(pm, execArgs, { cwd: projectRoot, timeout: 120000 });
    if (e.status !== 0) throw new Error(`prisma db execute 失败: ${e.stderr.trim().slice(0, 200)}`);
    console.log("✅ prisma-diff 同步完成（免 shadow）");
}

/** db-push 显式策略（备份硬性前置已由调用方执行） */
function runDbPush(projectRoot: string): void {
    const pm = detectPm(projectRoot);
    const args = pm === "pnpm" ? ["dlx", "prisma", "db", "push"] : ["exec", "prisma", "--", "db", "push"];
    if (PRISMA_CONFIG.schemaArg) args.push(PRISMA_CONFIG.schemaArg);
    console.log(`执行 ${pm} ${args.join(" ")} ...`);
    const r = runCommand(pm, args, { cwd: projectRoot });
    if (r.status !== 0) throw new Error(`prisma db push 退出码: ${r.status}`);
}

/** 同步主流程（v2）：备份硬性前置 → strategy 分支（atlas / prisma-diff / db-push） */
async function syncDatabase(projectRoot: string, opts: { yes?: boolean }, splitDb: boolean): Promise<void> {
    const sync = PRISMA_CONFIG.sync;
    const targetUrl = splitDb ? (readEnvValue(projectRoot, "ADD_DATABASE_URL") || sync.addDatabaseUrl) : readEnvValue(projectRoot, "DATABASE_URL");
    if (!targetUrl) { console.warn("⚠️ 未找到目标库连接串（分库需 ADD_DATABASE_URL / 共库需 DATABASE_URL），跳过同步"); return; }
    const bak = await backupBeforeSync(projectRoot, { dbUrl: targetUrl, backupDir: sync.backupDir, backupKeep: sync.backupKeep, yes: opts.yes });
    if (bak === null) { console.warn("⚠️ 备份未完成（用户自担风险），继续同步"); }
    if (sync.strategy === "db-push") { runDbPush(projectRoot); return; }
    const atlasBin = resolveAtlasBin(projectRoot);
    if (atlasBin) {
        const ok = await runAtlasSync(projectRoot, targetUrl, splitDb, sync, opts);
        if (ok) return;
    } else {
        console.warn("⚠️ atlas 不可用。add-coder 依赖自带：项目安装 @ariga/atlas（pnpm add -D @ariga/atlas），或 npm 全局安装");
        if (!opts.yes) {
            const a = await ask("继续降级 prisma-diff（免 shadow）？[Y/n] ");
            if (a === "n" || a === "no") throw new Error("已取消同步（atlas 缺失）");
        }
    }
    runPrismaDiffSync(projectRoot, targetUrl, splitDb);
}
function ensurePrismaConfig(projectRoot: string): void {
    const configPath = resolve(projectRoot, "prisma.config.ts");
    // Prisma 7: datasource.url 必须通过 env 函数透传，dotenv/config 读 .env（不存在）→ 改读 .env.development
    writeFileSync(configPath, [
        'import dotenv from "dotenv";',
        'import { existsSync } from "fs";',
        'for (const f of [".env.development.local", ".env.development", ".env.local", ".env"]) {',
        '  if (existsSync(f)) { dotenv.config({ path: f }); break; }',
        '}',
        'import { defineConfig, env } from "prisma/config";',
        'export default defineConfig({',
        '  schema: "prisma",',
        '  datasource: {',
        '    url: env("DATABASE_URL"),',
        '  },',
        '});',
    ].join("\n") + "\n", "utf-8");
}

function runPrismaInit(projectRoot: string, provider: string, schemaPath: string): boolean {
    console.log("执行 prisma init ...");
    const pm = detectPm(projectRoot);
    // issue #10 P0-1：npm 场景必须 npm exec prisma -- init（旧实现 spawnSync("npm", ["prisma", ...]) 在 Windows 下 ENOENT → status=null）
    const initArgs = pm === "pnpm"
        ? ["dlx", "prisma", "init", "--datasource-provider", provider]
        : ["exec", "prisma", "--", "init", "--datasource-provider", provider];
    let initResult: RunResult;
    try {
        initResult = runCommand(pm, initArgs, { cwd: projectRoot });
    } catch (e) {
        console.error(`✗ prisma init 无法执行: ${e instanceof Error ? e.message : String(e)}`);
        initResult = { status: null, stdout: "", stderr: "" };
    }

    if (initResult.status !== 0 || !existsSync(schemaPath)) {
        // Review #3：失败显式说明回退原因（不再静默手动建 schema 假装成功）
        console.error(`⚠️ prisma init 未完成（退出码: ${initResult.status}），回退手动创建 schema.prisma——db push 将验证其可用性`);
        const prismaDir = resolve(projectRoot, "prisma");
        if (!existsSync(prismaDir)) mkdirSync(prismaDir, { recursive: true });
        const content = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${provider}"\n}\n`;
        writeFileSync(schemaPath, content, "utf-8");

        const devEnvPath = resolve(projectRoot, ".env.development");
        if (!existsSync(devEnvPath)) {
            const defaultUrl = provider === "sqlite"
                ? 'DATABASE_URL="file:./data/dev.db"'
                : '# 请编辑为你的数据库连接信息\nDATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public"';
            writeFileSync(devEnvPath, defaultUrl + "\n", "utf-8");
            console.log("已创建 .env.development");
        }
        return false; // init 未成功——db push/generate 将作为最终验收
    }
    return true; // prisma init succeeded, .env created
}

function postInitSetup(projectRoot: string, schemaPath: string, addPrismaTemplate: string, destPath: string): void {
    const envPath = resolve(projectRoot, ".env");
    const devEnvPath = resolve(projectRoot, ".env.development");
    if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        const dbUrl = envContent.match(/DATABASE_URL=.*/);
        if (dbUrl) {
            const existing = existsSync(devEnvPath) ? readFileSync(devEnvPath, "utf-8") : "";
            if (!existing.includes("DATABASE_URL=")) {
                writeFileSync(devEnvPath, `${existing}${existing ? "\n" : ""}${dbUrl[0]}\n`, "utf-8");
            }
            if (existsSync(envPath)) unlinkSync(envPath);
            console.log("已将 DATABASE_URL 迁移到 .env.development");
        }
    }

    copyFileSync(addPrismaTemplate, destPath);
    console.log("已复制 add.prisma");

    // issue #10 P1-5 / Review P0 #2：统一注入 generator output（init 成功+失败路径全覆盖）
    patchGeneratorOutput(schemaPath);
}

/**
 * 统一注入 generator output（issue #10 P1-5 / Review P0 #2）。
 * 无论 prisma init 成功（CLI 生成 schema.prisma，generator 无 output）或失败（fallback 手动 schema），
 * 最终生效 schema 的 generator client 块都必须输出到 src/generated/prisma，与 MCP 模板探测路径对齐。
 * 幂等：已有 output 不重复注入；无 generator 块（异常）时追加标准块。
 */
export function patchGeneratorOutput(schemaPath: string): void {
    if (!existsSync(schemaPath)) return;
    let content = readFileSync(schemaPath, "utf-8");
    const genBlock = content.match(/generator\s+\w+\s*\{[\s\S]*?\}/);
    if (!genBlock) {
        content += `\ngenerator client {\n  provider = "prisma-client-js"\n  output = "../src/generated/prisma"\n}\n`;
        writeFileSync(schemaPath, content, "utf-8");
        console.log("已追加 generator client（含 output → src/generated/prisma）");
        return;
    }
    if (genBlock[0].includes("output")) return; // 幂等
    const patched = genBlock[0].replace(/\}\s*$/, `  output = "../src/generated/prisma"\n}`);
    writeFileSync(schemaPath, content.replace(genBlock[0], patched), "utf-8");
    console.log("已注入 generator output → src/generated/prisma");
}

export async function injectPrisma(
    projectRoot: string,
    addPrismaTemplate: string,
    options: { datasource?: string; yes?: boolean; force?: boolean; dryRun?: boolean } = {},
): Promise<boolean> {
    const C = PRISMA_CONFIG;
    const prismaDir = resolve(projectRoot, "prisma");
    const schemaPath = resolve(prismaDir, "schema.prisma");
    const destPath = resolve(prismaDir, "add.prisma");
    let justInited = false;

    // ── 第一次 init：Prisma 缺失 → 创建 ──
    if (!existsSync(prismaDir) || !existsSync(schemaPath)) {
        if (C.onMissing === "skip") { console.log("跳过：缺少 Prisma"); return true; }

        const shouldInit = options.force || options.yes;
        if (!shouldInit && C.onMissing === "ask") {
            const a = await ask("项目缺少 Prisma，是否执行 prisma init？[Y/n] ");
            if (a === "n" || a === "no") {
                throw new Error("项目缺少 Prisma 配置。ADD 工作流依赖 Prisma + PostgreSQL。");
            }
        } else if (!shouldInit) {
            throw new Error("项目缺少 Prisma 配置。ADD 工作流依赖 Prisma + PostgreSQL。");
        }

        const provider = options.datasource || "postgresql";
        runPrismaInit(projectRoot, provider, schemaPath);
        postInitSetup(projectRoot, schemaPath, addPrismaTemplate, destPath);
        justInited = true;
    }

    // ── add.prisma 处理（首次 init 后跳过交互）──
    if (existsSync(destPath) && !justInited) {
        if (options.dryRun) { console.log("[dry-run] 已有 add.prisma"); return true; }
        const action = options.force ? "overwrite" : options.yes ? "skip" : C.onExistingAddPrisma;
        if (action === "overwrite") { console.log("覆盖已有 add.prisma"); }
        else if (action === "skip") { console.log("跳过"); return true; }
        else {
            const choice = await ask("已有 prisma/add.prisma：[s]跳过 / [o]覆盖 / [d]diff（默认 s）: ");
            if (choice === "o") { console.log("覆盖"); }
            else if (choice === "d") {
                copyFileSync(destPath, destPath + ".bak");
                console.log("=== 当前（已备份）===\n" + readFileSync(destPath, "utf-8"));
                console.log("=== 模板 ===\n" + readFileSync(addPrismaTemplate, "utf-8"));
                if ((await ask("确认覆盖？[y/N] ")) !== "y") { console.log("已跳过"); return true; }
            } else { console.log("已跳过"); return true; }
        }
    }

    // ── 同步数据库（v2：分库引导 + Atlas 引擎/降级链，备份硬性前置）──
    if (options.dryRun) { console.log("[dry-run] 将执行数据库同步（v2 Atlas 引擎）"); return true; }
    if (!justInited) copyFileSync(addPrismaTemplate, destPath);

    try {
        ensurePrismaConfig(projectRoot);
        const splitDb = await ensureSplitDb(projectRoot, options);
        await syncDatabase(projectRoot, { yes: options.yes }, splitDb);
    } catch (err) {
        if (C.onMigrateFail === "keep") { console.log("迁移失败，保留文件"); return true; }
        try { unlinkSync(destPath); } catch { /* ignore */ }
        console.log("已回滚");
        throw new Error(`迁移失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (C.autoGenerate) {
        const pm = detectPm(projectRoot);
        const genArgs = pm === "pnpm"
            ? ["dlx", "prisma", "generate"]
            : ["exec", "prisma", "--", "generate"];
        console.log("执行 prisma generate ...");
        const g = runCommand(pm, genArgs, { cwd: projectRoot });
        // issue #10 P0-1 / Review #3：generate 失败 = Client 缺失 = MCP 不可用，必须显式失败
        if (g.status !== 0) {
            const detail = g.stderr.trim().split("\n").slice(0, 5).join("\n");
            throw new Error(`prisma generate 退出码: ${g.status}${detail ? `\n${detail}` : ""}`);
        }
    }
    console.log("ADD 治理模型已就绪");
    return true;
}
// <<< USER CODE <<<
