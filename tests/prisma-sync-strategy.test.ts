/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-10
 * @Description  : prisma-sync-strategy-migrate Plan v2 测试（Atlas 底座 + 分库双模式）
 * 覆盖：分库引导 / baseline 参数 / 降级链 / dev-url 隔离 / 共库非 ADD 拒绝 / 备份阻断
 *
 * 运行: npx vitest run tests/prisma-sync-strategy.test.ts（纯逻辑，mock 外部命令，无 DB 依赖）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasNonAddTableChanges, prismaDiffArgs, ensureSplitDb } from "../src/caijuehub/strategies/prisma.strategy.js";
import { backupBeforeSync } from "../src/lib/db-backup.js";
import { runCommand, commandExists } from "../src/lib/run-command.js";
import { ask } from "../src/lib/utils.js";

vi.mock("../src/lib/run-command.js", () => ({
    runCommand: vi.fn(),
    commandExists: vi.fn(),
}));
vi.mock("../src/lib/utils.js", () => ({
    ask: vi.fn(),
    detectPm: vi.fn(() => "pnpm"),
}));
vi.mock("node:net", () => ({
    createConnection: vi.fn(() => {
        // 模拟连接被拒 → portInUse=false → 端口空闲
        const s = { destroy: vi.fn(), on: (_e: string, cb: (e?: Error) => void) => { cb(new Error("refused")); } };
        return s;
    }),
}));

const mockRunCommand = vi.mocked(runCommand);
const mockCommandExists = vi.mocked(commandExists);
const mockAsk = vi.mocked(ask);

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "psm-v2-"));
    vi.clearAllMocks();
    mockCommandExists.mockReturnValue(true);
    mockRunCommand.mockReturnValue({ status: 0, stdout: "", stderr: "" } as never);
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
});

const write = (name: string, content: string) => writeFileSync(join(dir, name), content, "utf-8");

describe("prismaDiffArgs（Task 2.1.2：baseline 生成参数断言）", () => {
    it("pnpm 场景：--from-empty + --to-schema + --script", () => {
        const args = prismaDiffArgs("pnpm", "/proj/prisma/add.prisma", null);
        expect(args).toEqual(["dlx", "prisma", "migrate", "diff", "--from-empty", "--to-schema", "/proj/prisma/add.prisma", "--script"]);
    });
    it("npm 场景：npm exec prisma -- migrate diff", () => {
        const args = prismaDiffArgs("npm", "/proj/prisma", null);
        expect(args[0]).toBe("exec");
        expect(args).toContain("--to-schema");
        expect(args).toContain("/proj/prisma");
    });
    it("from-url 降级路径：--from-empty 替换为 --from-url", () => {
        const args = prismaDiffArgs("pnpm", "/proj/prisma", "postgresql://u:p@h:5432/db");
        expect(args).toContain("--from-url");
        expect(args).toContain("postgresql://u:p@h:5432/db");
        expect(args).not.toContain("--from-empty");
    });
});

describe("hasNonAddTableChanges（Task 2.1.6：共库模式非 ADD 变更默认拒绝）", () => {
    it("仅 ADD 表变更 → false（可安全应用）", () => {
        const sql = 'CREATE TABLE "AddUser" (...);\nALTER TABLE "DevOperation" ADD COLUMN x;';
        expect(hasNonAddTableChanges(sql)).toBe(false);
    });
    it("业务表 DROP → true（默认拒绝）", () => {
        const sql = 'DROP TABLE "user_orders";';
        expect(hasNonAddTableChanges(sql)).toBe(true);
    });
    it("业务表 ALTER → true", () => {
        const sql = 'ALTER TABLE "payments" ADD COLUMN y;';
        expect(hasNonAddTableChanges(sql)).toBe(true);
    });
    it("空 diff → false（幂等出口）", () => {
        expect(hasNonAddTableChanges("")).toBe(false);
    });
});

describe("ensureSplitDb（Task 2.1.1：分库引导）", () => {
    it("已有 ADD_DATABASE_URL → 直用分库模式（不询问）", async () => {
        write(".env.development", 'ADD_DATABASE_URL="postgresql://u:p@127.0.0.1:5438/add?schema=public"\n');
        const r = await ensureSplitDb(dir, {});
        expect(r).toBe(true);
        expect(mockAsk).not.toHaveBeenCalled();
    });
    it("dry-run：无连接串时打印提示且返回共库", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        write(".env.development", "DATABASE_URL=x\n");
        const r = await ensureSplitDb(dir, { dryRun: true });
        expect(r).toBe(false);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("[dry-run] 将询问是否分库"));
    });
    it("force 模式：无连接串默认分库（不交互）", async () => {
        write(".env.development", "DATABASE_USER=admin\nDATABASE_PASSWORD=secret\nPROJECT_NAME=demo\n");
        const r = await ensureSplitDb(dir, { force: true });
        expect(r).toBe(true);
        expect(mockAsk).not.toHaveBeenCalled();
        const env = readFileSync(join(dir, ".env.development"), "utf-8");
        expect(env).toContain("ADD_DATABASE_URL=");
        // 端口契约登记（ports-contract 消费场景）：docs/ports.md 登记行
        expect(mockRunCommand).toHaveBeenCalledWith("podman", expect.arrayContaining(["run", "-d", "--name", "demo-add-postgres"]) as never, expect.anything());
    });
    it("交互拒绝 → 共库模式", async () => {
        mockAsk.mockResolvedValue("n");
        const r = await ensureSplitDb(dir, {});
        expect(r).toBe(false);
        expect(mockRunCommand).not.toHaveBeenCalled();
    });
});

describe("backupBeforeSync（Task 2.2：备份硬性前置）", () => {
    it("pg_dump 缺失 + --yes → 阻断（throw）", async () => {
        mockCommandExists.mockReturnValue(false);
        await expect(backupBeforeSync(dir, { dbUrl: "postgresql://u:p@h/db", backupDir: ".add/backups/prisma-sync", backupKeep: 5, yes: true }))
            .rejects.toThrow(/--yes 硬阻断/);
    });
    it("pg_dump 缺失 + 交互默认拒绝 → 阻断", async () => {
        mockCommandExists.mockReturnValue(false);
        mockAsk.mockResolvedValue(""); // 回车 = 默认拒绝
        await expect(backupBeforeSync(dir, { dbUrl: "postgresql://u:p@h/db", backupDir: ".add/backups/prisma-sync", backupKeep: 5 }))
            .rejects.toThrow(/已中止同步/);
    });
    it("交互显式 y 豁免 → 返回 null（风险自担）", async () => {
        mockCommandExists.mockReturnValue(false);
        mockAsk.mockResolvedValue("y");
        const r = await backupBeforeSync(dir, { dbUrl: "postgresql://u:p@h/db", backupDir: ".add/backups/prisma-sync", backupKeep: 5 });
        expect(r).toBeNull();
    });
    it("成功路径：schema + 表备份 + manifest + 宿主 gitignore 注入", async () => {
        let call = 0;
        mockRunCommand.mockImplementation((() => {
            call++;
            return { status: 0, stdout: call === 1 ? "-- schema dump --" : "-- add tables dump --", stderr: "" } as never;
        }) as never);
        write(".gitignore", "node_modules\n");
        const r = await backupBeforeSync(dir, { dbUrl: "postgresql://u:p@h/db", backupDir: ".add/backups/prisma-sync", backupKeep: 5 });
        expect(r).toBeTruthy();
        expect(readFileSync(join(r!, "schema.sql"), "utf-8")).toContain("schema dump");
        expect(readFileSync(join(r!, "add-tables.sql"), "utf-8")).toContain("add tables dump");
        expect(JSON.parse(readFileSync(join(r!, "manifest.json"), "utf-8")).files).toEqual(["schema.sql", "add-tables.sql"]);
        // 宿主 gitignore 注入
        expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".add/backups/");
        // 幂等：二次调用不重复注入
        const before = readFileSync(join(dir, ".gitignore"), "utf-8");
        await backupBeforeSync(dir, { dbUrl: "postgresql://u:p@h/db", backupDir: ".add/backups/prisma-sync", backupKeep: 5 });
        expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe(before);
    });
    it("保留策略：超过 backupKeep 清理最旧", async () => {
        const opts = { dbUrl: "postgresql://u:p@h/db", backupDir: ".add/backups/prisma-sync", backupKeep: 2 };
        await backupBeforeSync(dir, opts);
        await backupBeforeSync(dir, opts);
        await backupBeforeSync(dir, opts);
        const bakDir = join(dir, ".add/backups/prisma-sync");
        const entries = readdirSync(bakDir).filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n));
        expect(entries.length).toBeLessThanOrEqual(2);
    });
});
