import type { AddCoderConfig } from "../../config/schema";
import { renderAdapterBase } from "../../core/renderer";
import { magicDirFor } from "../../shared/paths.js";

export function renderAdapter(
    config: AddCoderConfig,
    targetDir: string,
    dryRun: boolean,
    magicDir: string,
): Map<string, string> {
    return renderAdapterBase(config, magicDir, magicDir === magicDirFor("vscode"), dryRun);
}
