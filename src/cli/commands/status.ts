/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-09 08:56:59
 * LastEditors  : xiaomingming wujixmm@gmail.com
 * LastEditTime : 2026-07-16 09:46:41
 * FilePath     : /add-coder/src/cli/commands/status.ts
 * Description  : ADD 模板完整性检查命令
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { renderCore } from "../../core/renderer";
import type { AddCoderConfig } from "../../config/schema";
import { loadConfig } from "../config-loader";

export async function statusCommand() {
    const projectRoot = process.cwd();
    const config: AddCoderConfig = await loadConfig(projectRoot);
    config.projectRoot = projectRoot;

    const coreFiles = renderCore(config, true);
    const missing: string[] = [];
    const present: string[] = [];

    for (const [relPath] of coreFiles) {
        if (existsSync(resolve(projectRoot, relPath))) {
            present.push(relPath);
        } else {
            missing.push(relPath);
        }
    }

    console.log("ADD 模板完整性检查:");
    console.log(`  已就位: ${present.length} 文件`);
    if (missing.length > 0) {
        console.log(`  缺失: ${missing.length} 文件`);
        missing.forEach((f) => console.log(`    - ${f}`));
    } else {
        console.log("  所有文件完整。");
    }
}
