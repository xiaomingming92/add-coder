import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AddCoderConfig {
    projectName: string;
    projectRoot: string;
    sourceDir: string;
    docsDir: string;
    logDir: string;
    envFilePath: string;
    magicDir: string;
    auditLoggerPath: string;
    mcpServerCommand: string;
    agentAuditImport: string;
}

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
        result = result.replaceAll(placeholder, config[key]);
    }
    return result;
}

const TEMPLATES_ROOT = join(__dirname, "../templates");
const CORE_DIR = join(TEMPLATES_ROOT, "core");
const CORE_TARGET = ".add";

export function renderCore(
    config: AddCoderConfig,
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