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
import { selectFiles } from "../../lib/select-files";

export async function writeFiles(
    projectRoot: string,
    files: Map<string, string>,
    options: { yes?: boolean; force?: boolean; dryRun?: boolean } = {},
): Promise<{ created: number; skipped: number; overwritten: number }> {
    const C = WRITER_CONFIG;
    let created = 0, skipped = 0, overwritten = 0;

    // 第一遍：分离新建与冲突文件
    const newFiles = new Map<string, string>();
    const conflicts = new Map<string, string>();
    for (const [relPath, content] of files) {
        const dest = join(projectRoot, relPath);
        if (existsSync(dest)) {
            conflicts.set(relPath, content);
        } else {
            newFiles.set(relPath, content);
        }
    }

    // 处理冲突文件
    let overwriteSet = new Set<string>();
    if (conflicts.size > 0 && !options.dryRun) {
        if (options.force) {
            overwriteSet = new Set(conflicts.keys());
        } else if (options.yes || C.onExisting === "skip") {
            // 全部跳过，不覆盖
        } else {
            // 批量选择
            const selected = await selectFiles(projectRoot, conflicts);
            overwriteSet = new Set(selected.keys());
        }
    }

    // 写入新建文件
    for (const [relPath, content] of newFiles) {
        if (options.dryRun) { console.log(`[dry-run] 新建: ${relPath}`); created++; continue; }
        mkdirSync(dirname(join(projectRoot, relPath)), { recursive: true });
        writeFileSync(join(projectRoot, relPath), content, "utf-8");
        if (relPath.endsWith(".sh") && C.shellChmod) { try { chmodSync(join(projectRoot, relPath), 0o755); } catch { /* ignore */ } }
        created++;
    }

    // 写入选中覆盖的文件
    for (const [relPath, content] of conflicts) {
        if (options.dryRun) { console.log(`[dry-run] ${overwriteSet.has(relPath) ? "覆盖" : "跳过"}: ${relPath}`); created++; continue; }
        if (overwriteSet.has(relPath)) {
            mkdirSync(dirname(join(projectRoot, relPath)), { recursive: true });
            writeFileSync(join(projectRoot, relPath), content, "utf-8");
            if (relPath.endsWith(".sh") && C.shellChmod) { try { chmodSync(join(projectRoot, relPath), 0o755); } catch { /* ignore */ } }
            overwritten++;
        } else {
            skipped++;
        }
    }

    return { created, skipped, overwritten };
}
// <<< USER CODE <<<
