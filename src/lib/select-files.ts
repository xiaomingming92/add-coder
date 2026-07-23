/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-23
 * FilePath     : /add-coder/src/lib/select-files.ts
 * Description  : 交互式文件选择器 — 清单勾选 + git-diff 风格改动计数
 */
import { createInterface, emitKeypressEvents } from "readline";
import { readFileSync } from "fs";
import { resolve } from "path";

export interface FileItem {
    path: string;
    status: "new" | "overwrite";
    /** 新增行数（new）或变动行数（overwrite） */
    lines: number;
}

function diffLines(oldText: string, newText: string): number {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    let changes = 0;
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
        if (oldLines[i] !== newLines[i]) changes++;
    }
    return changes;
}

function statusIcon(item: FileItem): string {
    return item.status === "new" ? `\x1b[32m+${item.lines}\x1b[0m 行 (新建)` : `\x1b[33m~${item.lines}\x1b[0m 行 (覆盖)`;
}

function renderList(items: FileItem[], selected: Set<number>, startIdx: number, height: number): string {
    let out = `\n📋 待处理文件 (${items.length} 个):\n\n`;
    const endIdx = Math.min(startIdx + height, items.length);
    for (let i = startIdx; i < endIdx; i++) {
        const item = items[i];
        const mark = selected.has(i) ? "\x1b[32m[✓]\x1b[0m" : "[ ]";
        const num = String(i + 1).padStart(String(items.length).length, " ");
        const path = item.path.length > 55 ? "..." + item.path.slice(-52) : item.path.padEnd(55, " ");
        out += `  ${mark} ${num}. ${path} ${statusIcon(item)}\n`;
    }
    if (items.length > height) {
        out += `\n  ── ${startIdx + 1}-${endIdx} / ${items.length} (↑↓ 滚动) ──\n`;
    }
    out += `\n命令: [a]全选 [n]取消全选 [1-${items.length}]切换 [↑↓]滚动 [Enter]确认 [q]退出\n`;
    return out;
}

/**
 * @description: 交互式文件选择器 — 展示文件列表 + 改动计数，支持键盘操作
 * @param {string} projectRoot - 项目根目录
 * @param {Map<string, string>} files - 待处理文件映射 (relPath → content)
 * @return {Promise<Map<string, string>>} 用户选中的文件子集
 */
export async function selectFiles(
    projectRoot: string,
    files: Map<string, string>,
): Promise<Map<string, string>> {
    const items: FileItem[] = [];
    for (const [relPath, content] of files) {
        const absPath = resolve(projectRoot, relPath);
        try {
            const existing = readFileSync(absPath, "utf-8");
            items.push({ path: relPath, status: "overwrite", lines: diffLines(existing, content) });
        } catch {
            items.push({ path: relPath, status: "new", lines: content.split("\n").length });
        }
    }

    const selected = new Set<number>(items.map((_, i) => i));
    const VISIBLE = Math.min(items.length, 12);
    let scrollIdx = 0;

    // 隐藏光标
    process.stdout.write("\x1b[?25l");

    emitKeypressEvents(process.stdin);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const input = process.stdin;

    function draw() {
        // 清屏并移到顶部
        process.stdout.write("\x1b[2J\x1b[H");
        process.stdout.write(renderList(items, selected, scrollIdx, VISIBLE));
    }

    draw();

    return new Promise((resolve) => {
        input.on("keypress", (_char: string | undefined, key: { name: string }) => {
            if (!key) return;

            if (key.name === "up") {
                scrollIdx = Math.max(0, scrollIdx - 1);
            } else if (key.name === "down") {
                scrollIdx = Math.min(items.length - VISIBLE, scrollIdx + 1);
            } else if (key.name === "return") {
                rl.close();
            } else {
                return; // 非方向键/回车，交给 line 事件
            }
            draw();
        });

        rl.on("line", (input: string) => {
            const trimmed = input.trim().toLowerCase();
            if (trimmed === "q" || trimmed === "quit") {
                rl.close();
            } else if (trimmed === "a") {
                items.forEach((_, i) => selected.add(i));
            } else if (trimmed === "n") {
                selected.clear();
            } else {
                // 尝试按数字切换
                const num = parseInt(trimmed, 10);
                if (!isNaN(num) && num >= 1 && num <= items.length) {
                    const idx = num - 1;
                    if (selected.has(idx)) selected.delete(idx);
                    else selected.add(idx);
                }
            }
            draw();
        });

        rl.on("close", () => {
            // 恢复光标
            process.stdout.write("\x1b[?25h");
            // 清屏
            process.stdout.write("\x1b[2J\x1b[H");

            const result = new Map<string, string>();
            let idx = 0;
            for (const [relPath, content] of files) {
                if (selected.has(idx)) result.set(relPath, content);
                idx++;
            }
            resolve(result);
        });
    });
}
