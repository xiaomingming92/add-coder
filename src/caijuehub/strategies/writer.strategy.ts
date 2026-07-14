// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const WRITER_CONFIG = {
    onExisting: "ask",
    jsonMerge: "deep",
    shellChmod: true,
};
// <<< CAIJUE GENERATED END <<<
// >>> USER CODE >>>
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { ask } from "../../lib/utils";

export async function writeFiles(
    projectRoot: string,
    files: Map<string, string>,
    options: { yes?: boolean; force?: boolean; dryRun?: boolean } = {},
): Promise<{ created: number; skipped: number; overwritten: number }> {
    const C = WRITER_CONFIG;
    let created = 0, skipped = 0, overwritten = 0;
    let skipAll = false;

    for (const [relPath, content] of files) {
        const dest = join(projectRoot, relPath);
        if (options.dryRun) { console.log(`[dry-run] ${existsSync(dest) ? "覆盖" : "新建"}: ${relPath}`); created++; continue; }

        if (existsSync(dest)) {
            if (options.force) { overwritten++; }
            else if (options.yes || skipAll || C.onExisting === "skip") { skipped++; continue; }
            else {
                const choice = await ask(`文件已存在 ${relPath}：[s]跳过 / [o]覆盖 / [a]全部跳过（默认 s）: `);
                if (choice === "a") { skipAll = true; skipped++; continue; }
                if (choice !== "o" && choice !== "overwrite") { skipped++; continue; }
                overwritten++;
            }
        } else { created++; }

        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, content, "utf-8");
        if (relPath.endsWith(".sh") && C.shellChmod) { try { chmodSync(dest, 0o755); } catch { /* ignore */ } }
    }
    return { created, skipped, overwritten };
}
// <<< USER CODE <<<
