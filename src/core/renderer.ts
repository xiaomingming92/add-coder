import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import type { AddCoderConfig } from "../config/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLACEHOLDERS: Record<string, keyof AddCoderConfig> = {
    "{{projectName}}": "projectName",
    "{{projectRoot}}": "projectRoot",
    "{{sourceDir}}": "sourceDir",
    "{{docsDir}}": "docsDir",
    "{{logDir}}": "logDir",
    "{{envFilePath}}": "envFilePath",
    "{{magicDir}}": "magicDir",
    "{{auditLoggerPath}}": "auditLoggerPath",
    "{{mcpServerCommand}}": "mcpServerCommand",
    "{{agentAuditImport}}": "agentAuditImport",
};

export function render(content: string, config: AddCoderConfig): string {
    let result = content;
    for (const [placeholder, key] of Object.entries(PLACEHOLDERS)) {
        result = result.replaceAll(placeholder, String(config[key]));
    }
    return result;
}

const TEMPLATES_ROOT = join(__dirname, "../templates");
const CORE_DIR = join(TEMPLATES_ROOT, "core");
const CORE_TARGET = ".add";
const SKIP_DIRS = new Set(["prisma"]); // Prisma schema 不进 IDE magic path

export function renderCore(
    config: AddCoderConfig,
    dryRun: boolean,
): Map<string, string> {
    const files = new Map<string, string>();

    function walk(dir: string, base: string) {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                if (!SKIP_DIRS.has(name)) walk(full, join(base, name));
            } else {
                const content = readFileSync(full, "utf-8");
                const rendered = render(content, config);
                const targetRel = join(CORE_TARGET, relative(CORE_DIR, full));
                files.set(targetRel, rendered);
            }
        }
    }

    walk(CORE_DIR, "");

    if (dryRun) {
        console.log(`[dry-run] Core templates: ${files.size} files`);
    }

    return files;
}