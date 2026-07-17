/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-17 18:26:20
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-17 18:26:21
 * @FilePath     : /add-coder/src/adapters/codex/renderer.ts
 * @Description  : 
 */
/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-17 18:26:20
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-17 18:26:21
 * @FilePath     : /add-coder/src/adapters/codex/renderer.ts
 * @Description  : 
 */
import type { AddCoderConfig } from "../../config/schema";
import { renderAdapterBase } from "../../core/renderer";

export function renderAdapter(
    config: AddCoderConfig,
    targetDir: string,
    dryRun: boolean,
    magicDir: string,
): Map<string, string> {
    return renderAdapterBase(config, magicDir, magicDir === ".vscode", dryRun);
}
