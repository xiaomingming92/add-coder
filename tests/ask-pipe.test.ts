// 管道模式 ask 测试（RPT-02/#16 + RPT-04/#17 + RPT-06/#19）
// 验证：非 TTY 多问顺序消费 / EOF 不挂起 / 队列空返回默认 / **永不 EOF 的管道也不挂起**。
import { PassThrough, Readable } from "stream";
import { describe, expect, it } from "vitest";
import { collectPipeAnswers, takePipeAnswer } from "../src/lib/utils.js";

async function consume(input: string, count = 3): Promise<string[]> {
    const queue = await collectPipeAnswers(Readable.from([input]));
    return Array.from({ length: count }, () => takePipeAnswer(queue));
}

describe("ask 非 TTY 管道队列", () => {
    it("按输入顺序把三行分配给三次询问", async () => {
        await expect(consume("y\nn\ny\n")).resolves.toEqual(["y", "n", "y"]);
    });

    it("输入行不足时遇到 EOF 不挂起，剩余询问返回空串", async () => {
        await expect(consume("n\n")).resolves.toEqual(["n", "", ""]);
    });

    it("空输入 EOF 立即完成", async () => {
        await expect(consume("")).resolves.toEqual(["", "", ""]);
    });

    it("答案在消费时统一 trim 和转小写", async () => {
        await expect(consume(" YES \n No \n", 2)).resolves.toEqual(["yes", "no"]);
    });

    it("管道永不 EOF 且无输入 → 宽限期到即按默认结队（不永久挂起）", async () => {
        // 根因回归（2026-09-14）：execSync/spawn(stdio:"pipe") 的 stdin 不主动关闭，
        // 旧实现死等 'end' → add-coder init 在备份确认处无输出挂起（实测 >75s）。
        const neverEnds = new PassThrough();
        const started = Date.now();
        const queue = await collectPipeAnswers(neverEnds, 50);
        neverEnds.end();
        expect(takePipeAnswer(queue)).toBe("");
        expect(Date.now() - started).toBeLessThan(2000);
    });

    it("永不 EOF 但已写入答案 → 取到答案后按宽限收尾", async () => {
        const p = new PassThrough();
        const pending = collectPipeAnswers(p, 50);
        p.write("y\n");
        const queue = await pending; // 不 end()，靠宽限收尾
        expect(takePipeAnswer(queue)).toBe("y");
        p.end();
    });
});
