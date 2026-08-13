import type { AddCoderConfig } from "../../config/schema";
import { renderAdapterBase } from "../../core/renderer";
import { magicDirFor } from "../../shared/paths.js";

// 协议层契约（Review P0 #2）: adapter lib 完全自持（includeCoreHooksLib=false），
// 禁止 core hooks/lib 覆盖 adapter 私有实现；与 codex 同模式。
export function renderAdapter(
    config: AddCoderConfig,
    targetDir: string,
    dryRun: boolean,
    magicDir: string,
): Map<string, string> {
    return renderAdapterBase(config, magicDir, magicDir === magicDirFor("vscode"), dryRun, false);
}
