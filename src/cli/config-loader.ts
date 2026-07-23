/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-09 08:56:25
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-16 10:19:03
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/src/cli/config-loader.ts
 * @Description  : 配置加载器
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { AddCoderConfigSchema, type AddCoderConfig } from "../config/schema";
import { defaults } from "../config/defaults";

export async function loadConfig(
    projectRoot: string,
    configPath?: string,
    _options?: { yes?: boolean; force?: boolean },
): Promise<AddCoderConfig> {
    let config: Partial<AddCoderConfig> = { ...defaults };

    // 1. 自动检测
    const pkgPath = join(projectRoot, "package.json");
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
            if (pkg.name && !config.projectName) {
                config.projectName = pkg.name;
            }
        } catch { /* ignore */ }
    }

    // 2. 配置文件（add-coder.config.ts）
    if (configPath && existsSync(configPath)) {
        try {
            const userConfig = (await import(configPath)) as { default?: Partial<AddCoderConfig> };
            if (userConfig.default) {
                config = { ...config, ...userConfig.default };
            }
        } catch { /* ignore */ }
    }

    // 3. Zod 校验
    const result = AddCoderConfigSchema.safeParse(config);
    if (!result.success) {
        const errors = result.error.issues
            .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
            .join("\n");
        throw new Error(`配置校验失败:\n${errors}`);
    }

    return result.data;
}