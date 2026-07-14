// >>> CAIJUE GENERATED START >>>
export const PRISMA_CONFIG = {
    onMissing: "ask",
    onExistingAddPrisma: "ask",
    onMigrateFail: "rollback",
    autoGenerate: true,
    migrationName: "add_workflow_init",
    schemaArg: "--schema=prisma/",
    requiresUserModel: false,
};
// <<< CAIJUE GENERATED END <<<

// >>> USER CODE >>>
import { spawnSync } from "child_process";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { ask, detectPm } from "../../lib/utils";

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

function backupAddTables(projectRoot: string): string | null {
    const pgDump = spawnSync("which", ["pg_dump"], { timeout: 2000 });
    if (pgDump.status !== 0) return null;
    const bak = resolve(projectRoot, `add-backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.sql`);
    const r = spawnSync("pg_dump", ["--table=AddUser", "--table=DevOperation", "--table=AuditLog", "--if-exists"], {
        cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
    });
    if (r.stdout.length > 0) {
        writeFileSync(bak, r.stdout, "utf-8");
        console.log(`>>> 备份 ADD 表到 ${bak}`);
        return bak;
    }
    return null;
}

function runPrismaInit(projectRoot: string, provider: string, schemaPath: string): boolean {
    console.log("执行 npx prisma init ...");
    const pm = detectPm(projectRoot);
    const initArgs = pm === "pnpm" ? ["dlx", "prisma", "init", "--datasource-provider", provider]
        : ["prisma", "init", "--datasource-provider", provider];
    const initResult = spawnSync(pm, initArgs, {
        cwd: projectRoot, stdio: "inherit", shell: false,
    });

    if (initResult.status !== 0 || !existsSync(schemaPath)) {
        console.log("prisma init 失败，手动创建 schema.prisma ...");
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
        return false; // migration not done yet
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

    // ── 同步数据库（prisma db push：仅新增，不删数据）──
    if (options.dryRun) { console.log("[dry-run] 将执行 prisma db push"); return true; }
    if (!justInited) copyFileSync(addPrismaTemplate, destPath);

    try {
        ensurePrismaConfig(projectRoot);
        backupAddTables(projectRoot);
        const pm = detectPm(projectRoot);
        const args = pm === "pnpm" ? ["dlx", "prisma", "db", "push"] : ["prisma", "db", "push"];
        if (C.schemaArg) args.push(C.schemaArg);
        console.log(`执行 ${pm} ${args.join(" ")} ...`);
        const r = spawnSync(pm, args, { cwd: projectRoot, stdio: "inherit", shell: false });
        if (r.status !== 0) throw new Error(`prisma db push 退出码: ${r.status}`);
    } catch (err) {
        if (C.onMigrateFail === "keep") { console.log("迁移失败，保留文件"); return true; }
        try { unlinkSync(destPath); } catch { /* ignore */ }
        console.log("已回滚");
        throw new Error(`迁移失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (C.autoGenerate) {
        const pm = detectPm(projectRoot);
        console.log("执行 prisma generate ...");
        spawnSync(pm, pm === "pnpm" ? ["dlx", "prisma", "generate"] : ["prisma", "generate"], { cwd: projectRoot, stdio: "inherit", shell: false });
    }
    console.log("ADD 治理模型已就绪");
    return true;
}
// <<< USER CODE <<<
