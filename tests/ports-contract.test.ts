/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-10
 * @Description  : 端口契约统一分配器测试（P-2/P-3，决议演进）
 * 覆盖：契约表解析 / 5433 起点分配 / 契约表复用 / 多服务递增 / 跨项目避让 / PORTS_CONFIG
 *
 * 运行: npx vitest run tests/ports-contract.test.ts（mock 外部命令与端口探测，无 DB 依赖）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { parseContractPorts, allocatePortsWithContract } from "../src/lib/ports-contract.js";
import { runCommand, commandExists } from "../src/lib/run-command.js";
import { PORTS_CONFIG } from "../src/caijuehub/strategies/ports.strategy.js";

vi.mock("../src/lib/run-command.js", () => ({
    runCommand: vi.fn(),
    commandExists: vi.fn(),
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

let dir: string;
const SIBLING = join(tmpdir(), "sibling-project");

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ports-contract-"));
    rmSync(SIBLING, { recursive: true, force: true }); // 清理跨项目测试残留，防污染
    vi.clearAllMocks();
    mockCommandExists.mockReturnValue(true);
    mockRunCommand.mockReturnValue({ status: 0, stdout: "", stderr: "" } as never);
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(SIBLING, { recursive: true, force: true });
    vi.restoreAllMocks();
});

const write = (name: string, content: string) => {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf-8");
};

describe("PORTS_CONFIG（P-3 控制面转录）", () => {
    it("start_hint=5433（宿主 5432 后第一顺位）+ 复用/跨项目开关", () => {
        expect(PORTS_CONFIG.pg.startHint).toBe(5433);
        expect(PORTS_CONFIG.pg.scanLimit).toBe(100);
        expect(PORTS_CONFIG.behavior.reuseRegistered).toBe(true);
        expect(PORTS_CONFIG.behavior.readCrossProject).toBe(true);
        expect(PORTS_CONFIG.behavior.onConflict).toBe("ask");
    });
});

describe("parseContractPorts（契约表端口解析）", () => {
    it("提取表格首列数字端口", () => {
        const md = `| 端口 | 服务 |\n|:---:|------|\n| 5432 | 宿主 |\n| 5433 | ADD 库 |\n| 5434 | dev 库 |\n`;
        expect(parseContractPorts(md)).toEqual([5432, 5433, 5434]);
    });
    it("空内容返回空数组", () => {
        expect(parseContractPorts("")).toEqual([]);
    });
});

describe("allocatePortsWithContract（P-2 统一分配器）", () => {
    it("空白仓库：两个服务从 5433 起递增（5433/5434）", async () => {
        const r = await allocatePortsWithContract(dir, [
            { name: "add", containerName: "demo-add-postgres" },
            { name: "dev", containerName: "demo-add-dev" },
        ]);
        expect(r.add).toBe(5433);
        expect(r.dev).toBe(5434);
    });
    it("契约表已有登记 → 复用不重复分配（已登记 5433 → 新服务 5434）", async () => {
        write("docs/ports.md", "| 5433 | PostgreSQL | 已登记 |\n");
        const r = await allocatePortsWithContract(dir, [{ name: "add", containerName: "demo-add-postgres" }]);
        expect(r.add).toBe(5434);
    });
    it("跨项目事实源避让：兄弟项目已占 5433/5434 → 5435", async () => {
        // 父目录下建兄弟项目 docs/ports.md
        mkdirSync(join(SIBLING, "docs"), { recursive: true });
        writeFileSync(join(SIBLING, "docs", "ports.md"), "| 5433 | PG |\n| 5434 | PG |\n", "utf-8");
        const r = await allocatePortsWithContract(dir, [{ name: "add", containerName: "demo-add-postgres" }]);
        expect(r.add).toBe(5435);
    });
    it("分配后登记回契约表（docs/ports.md 追加行）", async () => {
        write("docs/ports.md", "| 端口 | 服务 |\n|:---:|------|\n");
        const r = await allocatePortsWithContract(dir, [{ name: "add", containerName: "demo-add-postgres", envKey: "ADD_DATABASE_URL" }]);
        const content = readFileSync(join(dir, "docs", "ports.md"), "utf-8");
        expect(content).toContain(`| ${r.add} |`);
        expect(content).toContain("demo-add-postgres");
        expect(content).toContain("ADD_DATABASE_URL");
    });
    it("podman 实扫占用：ps 输出 5433 已占用 → 新服务 5434", async () => {
        mockRunCommand.mockImplementation((() => {
            return { status: 0, stdout: "0.0.0.0:5433->5432/tcp\n", stderr: "" } as never;
        }) as never);
        const r = await allocatePortsWithContract(dir, [{ name: "add", containerName: "demo-add-postgres" }]);
        expect(r.add).toBe(5434);
    });
});
