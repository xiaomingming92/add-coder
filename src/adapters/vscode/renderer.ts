import type { AddCoderConfig } from "../../core/renderer";
import { render } from "../../core/renderer";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_ROOT = join(__dirname, "../templates");
const ADAPTER_DIR = join(TEMPLATES_ROOT, "adapters", "vscode");
const TARGET_MAGIC_PATH = ".vscode";

export function renderAdapter(
    config: AddCoderConfig,
    targetDir: string,
    dryRun: boolean,
): Map<string, string> {
    const files = new Map<string, string>();

    function walk(dir: string, base: string) {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                walk(full, join(base, name));
            } else {
                const content = readFileSync(full, "utf-8");
                const rendered = render(content, config);
                const targetRel = join(TARGET_MAGIC_PATH, relative(ADAPTER_DIR, full));
                files.set(targetRel, rendered);
            }
        }
    }

    walk(ADAPTER_DIR, "");

    if (dryRun) {
        console.log(`[dry-run] VS Code adapter: ${files.size} files`);
    }

    return files;
}