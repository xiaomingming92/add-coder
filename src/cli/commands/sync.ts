/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-16 10:20:00
 * LastEditors  : xiaomingming wujixmm@gmail.com
 * LastEditTime : 2026-07-16 10:20:00
 * FilePath     : /add-coder/src/cli/commands/sync.ts
 * Description  : ADD 模板增量同步命令
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { renderCore } from "../../core/renderer";
import type { AddCoderConfig } from "../../config/schema";
import { writeFiles } from "../writer";
import { loadConfig } from "../config-loader";

/**
 * @description: 增量同步缺失的 ADD 模板文件，不覆盖已有文件
 * @return {Promise<void>}
 */
export async function syncCommand() {
    const projectRoot = process.cwd();
    const config: AddCoderConfig = await loadConfig(projectRoot);
    config.projectRoot = projectRoot;

    const coreFiles = renderCore(config, false);

    const missing = new Map<string, string>();
    for (const [relPath, content] of coreFiles) {
        if (!existsSync(resolve(projectRoot, relPath))) {
            missing.set(relPath, content);
        }
    }

    if (missing.size === 0) {
        console.log("所有 ADD 模板文件已就位。");
        return;
    }

    const result = await writeFiles(projectRoot, missing, {});
    console.log(`同步完成: 新建 ${result.created}, 跳过 ${result.skipped}`);
}
