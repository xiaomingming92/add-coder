/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-10 12:12:12
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-10 12:12:13
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/src/lib/db-backup.ts
 * @Description  : 
 */
/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-10
 * Description  : 数据库同步备份前置模块（prisma-sync-strategy-migrate Plan v2）
 *                语义：硬性前置——备份失败（含 pg_dump 缺失）时 --yes 模式阻断、交互模式默认拒绝
 *                备份内容：全库 schema-only + ADD 三表含数据 + manifest
 *                保留策略：时间戳目录，保留 backup_keep 份（删最旧）
 *                目标库：分库模式 = add 库（ADD_DATABASE_URL）/ 共库模式 = 宿主库（DATABASE_URL）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { runCommand, commandExists } from "./run-command";
import { ask } from "./utils";

export interface BackupOptions {
    /** 目标库连接串（分库=add 库 / 共库=宿主库） */
    dbUrl: string;
    /** 备份目录（相对项目根），如 .add/backups/prisma-sync */
    backupDir: string;
    /** 保留份数 */
    backupKeep: number;
    /** --yes 模式：备份失败硬阻断（不可豁免） */
    yes?: boolean;
    /** 数据源（sqlite 时复制 .db 文件替代 pg_dump） */
    datasource?: "postgresql" | "sqlite";
}

export interface BackupManifest {
    createdAt: string;
    dbUrl: string;
    files: string[];
    riskAccepted?: boolean;
}

const ADD_TABLES = ["AddUser", "DevOperation", "AuditLog", "HitlRecord", "PlanRecord", "ReviewRecord", "CollabContract"];

/** 宿主 .gitignore 运行时注入（幂等）：忽略 .add/backups/（v1 Task 1.4.2 宿主模板替代实现） */
export function ensureGitignoreRule(projectRoot: string): void {
    const gitignorePath = resolve(projectRoot, ".gitignore");
    if (!existsSync(gitignorePath)) return;
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(".add/backups/")) return;
    writeFileSync(gitignorePath, `${content}${content.endsWith("\n") ? "" : "\n"}\n# add-coder 数据库同步备份\n.add/backups/\n`, "utf-8");
    console.log("📋 已注入宿主 .gitignore: .add/backups/");
}

/**
 * 备份硬性前置：全库 schema + ADD 表含数据。
 * @returns 备份目录绝对路径；用户拒绝自担风险时 throw（阻断同步）；接受时返回 null（调用方记 riskAccepted）
 */
export async function backupBeforeSync(projectRoot: string, opts: BackupOptions): Promise<string | null> {
    const dir = resolve(projectRoot, opts.backupDir);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const bakDir = join(dir, ts);
    ensureGitignoreRule(projectRoot);

    // sqlite 数据源：复制 .db 文件替代 pg_dump（v1 设计保留）
    if (opts.datasource === "sqlite" || opts.dbUrl.startsWith("file:")) {
        const dbFile = opts.dbUrl.replace(/^file:/, "");
        if (!existsSync(dbFile)) return handleBackupFailure(opts, `sqlite 文件不存在: ${dbFile}`);
        mkdirSync(bakDir, { recursive: true });
        const copy = join(bakDir, "dev.db");
        writeFileSync(copy, readFileSync(dbFile), "utf-8");
        writeFileSync(join(bakDir, "manifest.json"), JSON.stringify({ createdAt: ts, dbUrl: opts.dbUrl, files: ["dev.db"] } satisfies BackupManifest, null, 2), "utf-8");
        console.log(`✅ 备份完成: ${bakDir}`);
        pruneBackups(dir, opts.backupKeep);
        return bakDir;
    }

    if (!commandExists("pg_dump")) {
        return handleBackupFailure(opts, "pg_dump 未安装（postgresql-client 缺失）");
    }

    mkdirSync(bakDir, { recursive: true });
    const schemaFile = join(bakDir, "schema.sql");
    const tablesFile = join(bakDir, "add-tables.sql");

    // 全库 schema-only（不含数据，防误删结构的回滚依据）
    const r1 = runCommand("pg_dump", ["--schema-only", "--no-owner", `--dbname=${opts.dbUrl}`], { timeout: 60000 });
    if (r1.status !== 0) {
        return handleBackupFailure(opts, `pg_dump schema 失败: ${r1.stderr.trim().split("\n").slice(0, 3).join(" | ")}`);
    }
    writeFileSync(schemaFile, r1.stdout, "utf-8");

    // ADD 治理表含数据
    const r2 = runCommand("pg_dump", ["--no-owner", "--if-exists", `--dbname=${opts.dbUrl}`, ...ADD_TABLES.map((t) => `--table=${t}`)], { timeout: 60000 });
    if (r2.status !== 0) {
        return handleBackupFailure(opts, `pg_dump ADD 表失败: ${r2.stderr.trim().split("\n").slice(0, 3).join(" | ")}`);
    }
    writeFileSync(tablesFile, r2.stdout, "utf-8");

    writeFileSync(join(bakDir, "manifest.json"), JSON.stringify({ createdAt: ts, dbUrl: opts.dbUrl, files: ["schema.sql", "add-tables.sql"] } satisfies BackupManifest, null, 2), "utf-8");
    console.log(`✅ 备份完成: ${bakDir}`);
    pruneBackups(dir, opts.backupKeep);
    return bakDir;
}

/**
 * 备份失败处理：--yes 硬阻断；交互模式仅显式"自担风险"可继续（默认拒绝）。
 * @returns null 表示用户显式接受自担风险（调用方继续，manifest 记 riskAccepted）
 */
async function handleBackupFailure(opts: BackupOptions, reason: string): Promise<string | null> {
    if (opts.yes) {
        throw new Error(`⛔ 备份失败（--yes 硬阻断，同步中止）: ${reason}`);
    }
    const a = await ask(`\n⚠️ 备份失败（${reason}）。自担风险继续同步？[y/N] `);
    if (a !== "y" && a !== "yes") {
        throw new Error(`备份失败，已中止同步: ${reason}`);
    }
    console.warn("⚠️ 用户接受自担风险继续（manifest 记 riskAccepted）");
    return null;
}

/** 清理旧备份，保留最近 backupKeep 份 */
function pruneBackups(dir: string, backupKeep: number): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir)
        .filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n))
        .sort();
    const excess = entries.length - backupKeep;
    for (let i = 0; i < excess; i++) {
        rmSync(join(dir, entries[i]), { recursive: true, force: true });
        console.log(`🧹 清理旧备份: ${entries[i]}`);
    }
}
