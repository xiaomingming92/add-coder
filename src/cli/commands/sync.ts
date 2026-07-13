import { existsSync } from "fs";
import { resolve } from "path";
import { renderCore } from "../../core/renderer";
import { writeFiles } from "../writer";
import { loadConfig } from "../config-loader";

export async function syncCommand() {
    const projectRoot = process.cwd();
    const config = await loadConfig(projectRoot);
    config.projectRoot = projectRoot;

    const coreFiles = renderCore(config, false);

    // 只同步缺失文件
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

    const result = await writeFiles(projectRoot, missing, { yes: true });
    console.log(`同步完成: 新建 ${result.created}, 跳过 ${result.skipped}`);
}