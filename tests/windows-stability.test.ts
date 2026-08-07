/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-07
 * Description  : issue #10 Windows 稳定性修复单测（轮次 1：路径规范化 + hash 全量基线）
 *                轮次 2 runCommand 单测将追加到本文件。
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { normalizeRelPath } from "../src/lib/path-normalize";
import { isUserData, loadHashFile, mergeFullHash, saveHashFile } from "../src/cli/commands/sync";
import { patchGeneratorOutput } from "../src/caijuehub/strategies/prisma.strategy";
import { createHash } from "crypto";

// ── runCommand 测试：mock child_process，验证 win32 .cmd 解析与错误语义 ──
const mocks = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock("child_process", () => ({ spawnSync: mocks.spawnSync }));
import { runCommand, commandExists } from "../src/lib/run-command";

const hash8 = (c: string) => createHash("sha256").update(c).digest("hex").slice(0, 8);

describe("normalizeRelPath（issue #10 P0-3 基础设施）", () => {
    it("Windows 反斜杠路径 → POSIX", () => {
        expect(normalizeRelPath("\\plans\\specs\\spec.md")).toBe("/plans/specs/spec.md");
        expect(normalizeRelPath(".codex\\specs\\a\\spec.md")).toBe(".codex/specs/a/spec.md");
        expect(normalizeRelPath("\\rules\\profiles\\machineserver-profile.md")).toBe("/rules/profiles/machineserver-profile.md");
    });
    it("POSIX 输入幂等", () => {
        expect(normalizeRelPath("plans/specs/spec.md")).toBe("plans/specs/spec.md");
    });
    it("空串不抛错", () => {
        expect(normalizeRelPath("")).toBe("");
    });
});

describe("isUserData PATCH_GUARD（issue #10 P0-3 复现验证）", () => {
    it("Windows 反斜杠保护目录路径全部命中", () => {
        // issue 实测：修改 .codex/specs/... 选 [A] 被覆盖 → 修复后必须命中
        expect(isUserData(".codex\\specs\\add-coder-npm-package\\spec.md")).toBe(true);
        expect(isUserData(".codex\\plans\\add-coder-npm-package\\spec.md")).toBe(true);
        expect(isUserData(".codex\\reviews\\round1.md")).toBe(true);
        expect(isUserData(".qoder\\rules\\profiles\\machineserver-profile.md")).toBe(true);
    });
    it("POSIX 路径保持命中（原行为不回归）", () => {
        expect(isUserData(".qoder/plans/2026-08/07/x.md")).toBe(true);
        expect(isUserData(".qoder/specs/a/spec.md")).toBe(true);
        expect(isUserData(".qoder/reviews/r.md")).toBe(true);
        expect(isUserData(".add/rules/profiles/webapp-profile.md")).toBe(true);
    });
    it("普通模板路径不命中", () => {
        expect(isUserData("\\qoder\\scripts\\mcp-server\\index.ts")).toBe(false);
        expect(isUserData(".qoder/scripts/mcp-server/shared/env.ts")).toBe(false);
        expect(isUserData("\\add\\rules\\project_rules.md")).toBe(false);
    });
    it("无前导目录段的保护路径（如 plans/a.md）按原语义不命中", () => {
        // PATCH_GUARD 语义：/plans/ 须出现在路径中段（含前导目录）；此行为与原实现一致，非回归
        expect(isUserData("plans/a.md")).toBe(false);
        expect(isUserData("reviews/r.md")).toBe(false);
    });
});

describe("mergeFullHash 全量基线（issue #10 P0-2 复现验证）", () => {
    it("300 项旧 hash + 无变更 → 仍 300 项（不缩水）", () => {
        const outHash: Record<string, string> = {};
        for (let i = 0; i < 300; i++) outHash[`templates/file-${i}.md`] = hash8(`content-${i}`);
        const candidates = Array.from({ length: 300 }, (_, i) => ({
            relPath: `templates/file-${i}.md`,
            absPath: `/tmp/file-${i}.md`,
        }));
        const disk = new Map(candidates.map((c, i) => [c.absPath, hash8(`content-${i}`)]));
        const result = mergeFullHash(outHash, candidates, (p) => disk.get(p) ?? null);
        expect(result.size).toBe(300); // 300→1→空 复现链第一步：不缩水
    });

    it("用户 [a] 跳过（磁盘已修改）→ hash 记录用户版本，下一轮不误判冲突", () => {
        const outHash: Record<string, string> = { "templates/a.md": hash8("original") };
        const candidates = [{ relPath: "templates/a.md", absPath: "/tmp/a.md" }];
        const disk = new Map([["/tmp/a.md", hash8("user-modified")]]);
        const result = mergeFullHash(outHash, candidates, (p) => disk.get(p) ?? null);
        expect(result.get("templates/a.md")).toBe(hash8("user-modified"));
    });

    it("Windows 反斜杠 relPath → key 统一 POSIX", () => {
        const outHash: Record<string, string> = { "templates/a.md": hash8("x") };
        const candidates = [{ relPath: "templates\\b.md", absPath: "/tmp/b.md" }];
        const disk = new Map([["/tmp/b.md", hash8("y")]]);
        const result = mergeFullHash(outHash, candidates, (p) => disk.get(p) ?? null);
        expect(result.has("templates/b.md")).toBe(true);
        expect(result.has("templates\\b.md")).toBe(false);
    });

    it("磁盘不存在的候选 → 保留旧 hash 不动", () => {
        const outHash: Record<string, string> = { "templates/a.md": hash8("x"), "templates/gone.md": hash8("old") };
        const candidates = [
            { relPath: "templates/a.md", absPath: "/tmp/a.md" },
            { relPath: "templates/gone.md", absPath: "/tmp/gone.md" },
        ];
        const disk = new Map([["/tmp/a.md", hash8("x")]]);
        const result = mergeFullHash(outHash, candidates, (p) => disk.get(p) ?? null);
        expect(result.get("templates/gone.md")).toBe(hash8("old"));
    });

    it("旧 hash 中用户数据条目（plans/specs）保留", () => {
        const outHash: Record<string, string> = { "plans/a.md": hash8("u"), "templates/a.md": hash8("t") };
        const candidates = [{ relPath: "templates/a.md", absPath: "/tmp/a.md" }];
        const disk = new Map([["/tmp/a.md", hash8("t")]]);
        const result = mergeFullHash(outHash, candidates, (p) => disk.get(p) ?? null);
        expect(result.get("plans/a.md")).toBe(hash8("u")); // 用户数据 hash 不丢
    });
});

describe("loadHashFile 旧 Windows 反斜杠 key 兼容", () => {
    let dir: string;
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), "add-coder-hash-"));
        mkdirSync(join(dir, ".qoder"), { recursive: true });
        // 模拟 Windows 生成的 hash 文件（反斜杠 key）
        writeFileSync(
            join(dir, ".qoder", ".add-coder-hash.json"),
            JSON.stringify({ "templates\\a.md": hash8("x"), "plans/b.md": hash8("y") }, null, 2) + "\n",
            "utf-8",
        );
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("反斜杠 key 读取后统一 POSIX", () => {
        const loaded = loadHashFile(dir, ".qoder");
        expect(loaded["templates/a.md"]).toBe(hash8("x"));
        expect(loaded["templates\\a.md"]).toBeUndefined();
        expect(loaded["plans/b.md"]).toBe(hash8("y"));
    });
    it("损坏文件返回空对象", () => {
        const dir2 = mkdtempSync(join(tmpdir(), "add-coder-hash-bad-"));
        try {
            const loaded = loadHashFile(dir2, ".qoder"); // 无文件
            expect(loaded).toEqual({});
        } finally {
            rmSync(dir2, { recursive: true, force: true });
        }
    });
});

describe("saveHashFile↔loadHashFile 往返（Review-implementation #1 双重 hash 防回归）", () => {
    let dir: string;
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), "add-coder-roundtrip-"));
        mkdirSync(join(dir, ".qoder"), { recursive: true });
        mkdirSync(join(dir, "templates"), { recursive: true });
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("写盘值 == hash8(磁盘内容)，不二次 hash（P0-2 换症状防回归）", () => {
        const diskContent = "file-content-v1";
        const diskPath = join(dir, "templates", "a.md");
        writeFileSync(diskPath, diskContent, "utf-8");
        const outHash = { "plans/u.md": hash8("user-data"), "templates/a.md": hash8("stale") };
        const candidates = [{ relPath: "templates/a.md", absPath: diskPath }];
        const finalHash = mergeFullHash(outHash, candidates, (p) =>
            p === diskPath ? hash8(readFileSync(p, "utf-8")) : null,
        );
        saveHashFile(dir, ".qoder", finalHash);
        const loaded = loadHashFile(dir, ".qoder");
        // 关键断言：写盘值必须等于 hash8(磁盘内容)——若 saveHashFile 二次 hash 则此处不等
        expect(loaded["templates/a.md"]).toBe(hash8(diskContent));
        // 旧 userData 条目原样保留
        expect(loaded["plans/u.md"]).toBe(hash8("user-data"));
        // 下一轮 patch 语义：curH === storedH → same（不误判 conflict）
        expect(hash8(readFileSync(diskPath, "utf-8"))).toBe(loaded["templates/a.md"]);
    });
});

describe("runCommand（issue #10 P0-1 跨端封装）", () => {
    beforeEach(() => mocks.spawnSync.mockReset());

    it("win32 下 npm → 自动追加 .cmd（status=null 完整根因修复）", () => {
        mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "", error: undefined });
        const r = runCommand("npm", ["exec", "prisma", "--", "init"], { platform: "win32" });
        expect(mocks.spawnSync).toHaveBeenCalledWith("npm.cmd", ["exec", "prisma", "--", "init"], expect.any(Object));
        expect(r.status).toBe(0);
    });

    it("POSIX 下 npm 不加 .cmd（Linux 不回归）", () => {
        mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "", error: undefined });
        runCommand("npm", ["--version"], { platform: "linux" });
        expect(mocks.spawnSync).toHaveBeenCalledWith("npm", ["--version"], expect.any(Object));
    });

    it("非 .cmd 族命令（bash/podman）win32 不追加", () => {
        mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "", error: undefined });
        runCommand("bash", ["x.sh"], { platform: "win32" });
        expect(mocks.spawnSync).toHaveBeenCalledWith("bash", ["x.sh"], expect.any(Object));
    });

    it("ENOENT（error 存在）→ 抛「命令不可用」（不再静默 status=null）", () => {
        mocks.spawnSync.mockReturnValue({ status: null, stdout: "", stderr: "", error: new Error("spawn npm ENOENT") });
        expect(() => runCommand("npm", ["view"], { platform: "win32" })).toThrow(/命令不可用: npm/);
    });

    it("status=null 无 error → 返回 null（调用方按失败处理）", () => {
        mocks.spawnSync.mockReturnValue({ status: null, stdout: "", stderr: "", error: undefined });
        const r = runCommand("bash", ["x"], { platform: "win32" });
        expect(r.status).toBeNull();
    });

    it("stderr 保留在返回值（错误信息带出）", () => {
        mocks.spawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "boom", error: undefined });
        const r = runCommand("bash", ["x"], { platform: "linux" });
        expect(r.status).toBe(1);
        expect(r.stderr).toBe("boom");
    });

    it("input 传递 → stdio 切 pipe", () => {
        mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "", error: undefined });
        runCommand("bash", ["g.sh"], { input: "{}" });
        expect(mocks.spawnSync.mock.calls[0][2]).toMatchObject({ input: "{}", stdio: ["pipe", "pipe", "pipe"] });
    });
});

describe("commandExists 双平台（issue #10 P2 #9 which 替代）", () => {
    beforeEach(() => mocks.spawnSync.mockReset());

    it("win32 用 where（Windows 无 which）", () => {
        mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "", error: undefined });
        expect(commandExists("pg_dump", "win32")).toBe(true);
        expect(mocks.spawnSync).toHaveBeenCalledWith("where", ["pg_dump"], expect.any(Object));
    });

    it("POSIX 用 which", () => {
        mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "", error: undefined });
        expect(commandExists("pg_dump", "linux")).toBe(true);
        expect(mocks.spawnSync).toHaveBeenCalledWith("which", ["pg_dump"], expect.any(Object));
    });

    it("命令不存在 → false", () => {
        mocks.spawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "", error: undefined });
        expect(commandExists("nope-cmd", "linux")).toBe(false);
    });
});

describe("patchGeneratorOutput（issue #10 P1-5 / Review P0 #2）", () => {
    it("CLI 生成的 schema（无 output）→ 注入 output", () => {
        const dir = mkdtempSync(join(tmpdir(), "add-coder-schema-"));
        try {
            const schema = join(dir, "schema.prisma");
            writeFileSync(schema, `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "sqlite"\n}\n`, "utf-8");
            patchGeneratorOutput(schema);
            expect(readFileSync(schema, "utf-8")).toContain('output = "../src/generated/prisma"');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("已有 output → 幂等不重复注入", () => {
        const dir = mkdtempSync(join(tmpdir(), "add-coder-schema2-"));
        try {
            const schema = join(dir, "schema.prisma");
            writeFileSync(schema, `generator client {\n  provider = "prisma-client-js"\n  output = "../src/generated/prisma"\n}\n`, "utf-8");
            patchGeneratorOutput(schema);
            const content = readFileSync(schema, "utf-8");
            expect(content.match(/output =/g)!.length).toBe(1);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("无 generator 块（异常）→ 追加标准块", () => {
        const dir = mkdtempSync(join(tmpdir(), "add-coder-schema3-"));
        try {
            const schema = join(dir, "schema.prisma");
            writeFileSync(schema, `datasource db {\n  provider = "sqlite"\n}\n`, "utf-8");
            patchGeneratorOutput(schema);
            expect(readFileSync(schema, "utf-8")).toContain('output = "../src/generated/prisma"');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
