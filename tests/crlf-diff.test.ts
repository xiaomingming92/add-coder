// CRLF 归一化测试（RPT-05/#15）：CRLF 下 enum 不误报，LF 行为不回归。
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffPrisma } from "../src/cli/writer.js";

const schema = `enum ContractRole {
  MASTER
  SUB
}

model User {
  id   Int    @id
  role String
}
`;

describe("diffPrisma CRLF 归一化", () => {
    let dir: string;
    let base: string;
    let target: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "crlf-test-"));
        base = join(dir, "base.prisma");
        target = join(dir, "target.prisma");
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("CRLF 双文件不会误报 enum 缺失", () => {
        writeFileSync(base, schema.replace(/\n/g, "\r\n"));
        writeFileSync(target, schema.replace(/\n/g, "\r\n"));

        const result = diffPrisma(base, target);

        expect(result.hasDiff).toBe(false);
        expect(result.missing).toEqual([]);
    });

    it("CRLF 目标缺少 enum 时仍能正确报告", () => {
        writeFileSync(base, schema.replace(/\n/g, "\r\n"));
        writeFileSync(target, "model User {\n  id Int @id\n}\n".replace(/\n/g, "\r\n"));

        const result = diffPrisma(base, target);

        expect(result.missing.some((item) => item.name === "ContractRole")).toBe(true);
    });

    it("LF 双文件行为不回归", () => {
        writeFileSync(base, schema);
        writeFileSync(target, schema);

        expect(diffPrisma(base, target).hasDiff).toBe(false);
    });

    it("连续两次 diff 结果幂等", () => {
        writeFileSync(base, schema);
        writeFileSync(target, schema);

        expect(diffPrisma(base, target)).toEqual(diffPrisma(base, target));
    });
});
