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
};
// <<< CAIJUE GENERATED END <<<
// >>> USER CODE >>>
import { spawnSync } from "child_process";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { resolve } from "path";
import { ask } from "../../lib/utils";

export async function injectPrisma(
    projectRoot: string,
    addPrismaTemplate: string,
    options: { yes?: boolean; force?: boolean; dryRun?: boolean } = {},
): Promise<boolean> {
    const C = PRISMA_CONFIG;
    const prismaDir = resolve(projectRoot, "prisma");
    const schemaPath = resolve(prismaDir, "schema.prisma");
    const destPath = resolve(prismaDir, "add.prisma");

    if (!existsSync(prismaDir) || !existsSync(schemaPath)) {
        if (C.onMissing === "skip") { console.log("跳过：缺少 Prisma"); return true; }
        if (C.onMissing === "ask" && !options.force && !options.yes) {
            const a = await ask("项目缺少 Prisma，是否执行 prisma init？[Y/n] ");
            if (a !== "n" && a !== "no") {
                console.log("执行 npx prisma init ...");
                spawnSync("npx", ["prisma", "init", "--datasource-provider", "postgresql"], { cwd: projectRoot, stdio: "inherit", shell: false });
                // prisma init 生成 .env → 迁移到 .env.development
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
                console.log("请编辑 .env.development 配置 DATABASE_URL，然后重新运行 add-coder init 完成迁移");
                console.log("  可选文件优先级: .env.development.local > .env.development > .env.local > .env");
                // 第一次 init 就注入 User 模型 + 复制 add.prisma
                const schemaContent = readFileSync(schemaPath, "utf-8");
                if (!/model\s+User\s*\{/.test(schemaContent)) {
                    writeFileSync(schemaPath, "model User {\n  id String @id @default(cuid())\n}\n\n" + schemaContent, "utf-8");
                    console.log("已注入 User 模型");
                }
                copyFileSync(addPrismaTemplate, destPath);
                console.log("已复制 add.prisma");
                return true;
            }
        }
        throw new Error("项目缺少 Prisma 配置。ADD 工作流依赖 Prisma + PostgreSQL。");
    }

    if (C.requiresUserModel && !/model\s+User\s*\{/.test(readFileSync(schemaPath, "utf-8"))) {
        const userModel = "model User {\n  id String @id @default(cuid())\n}\n";
        if (options.yes || options.force) {
            const schema = readFileSync(schemaPath, "utf-8");
            writeFileSync(schemaPath, userModel + "\n" + schema, "utf-8");
            console.log("已注入 User 模型到 schema.prisma");
        } else {
            const a = await ask("schema.prisma 缺少 User 模型，是否自动注入？[Y/n] ");
            if (a !== "n" && a !== "no") {
                const schema = readFileSync(schemaPath, "utf-8");
                writeFileSync(schemaPath, userModel + "\n" + schema, "utf-8");
                console.log("已注入 User 模型");
            } else {
                throw new Error("需要 User 模型（id: String），请在 prisma/schema.prisma 中创建后重试。");
            }
        }
    }

    if (existsSync(destPath)) {
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

    if (options.dryRun) { console.log("[dry-run] 将执行 prisma migrate"); return true; }
    copyFileSync(addPrismaTemplate, destPath);
    console.log("已复制 add.prisma");

    try {
        const args = ["prisma", "migrate", "dev", "--name", C.migrationName];
        if (C.schemaArg) args.push(C.schemaArg);
        console.log(`执行 npx ${args.join(" ")} ...`);
        const r = spawnSync("npx", args, { cwd: projectRoot, stdio: "inherit", shell: false });
        if (r.status !== 0) throw new Error(`prisma migrate dev 退出码: ${r.status}`);
    } catch (err) {
        if (C.onMigrateFail === "keep") { console.log("迁移失败，保留文件"); return true; }
        try { unlinkSync(destPath); } catch { /* 文件已不存在 */ }
        console.log("已回滚");
        throw new Error(`迁移失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (C.autoGenerate) {
        console.log("执行 prisma generate ...");
        spawnSync("npx", ["prisma", "generate"], { cwd: projectRoot, stdio: "inherit", shell: false });
    }
    console.log("ADD 治理模型已就绪");
    return true;
}
// <<< USER CODE <<<
