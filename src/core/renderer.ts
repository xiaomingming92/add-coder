import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "smol-toml";
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

// 阈值占位符：直读 caijuehub TOML 真源 [thresholds] 段（P1-1：不新增 [display] 段，transcribe 不动）
// TOML 缺失/解析失败时返回 null，调用方保留占位符并告警（不静默注入 0）
function loadDpsThresholds(): { pass: string; warn: string } | null {
    try {
        const tomlPath = join(
            __dirname,
            "../caijuehub/dps-scoring-rules.toml",
        );
        const doc = parse(readFileSync(tomlPath, "utf-8")) as {
            thresholds?: { pass?: number; warn?: number };
        };
        if (doc.thresholds && typeof doc.thresholds.pass === "number") {
            return {
                pass: String(doc.thresholds.pass),
                warn: String(doc.thresholds.warn ?? doc.thresholds.pass),
            };
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn(
            `[renderer] DPS 阈值 TOML 读取失败，保留 dpsPass/dpsWarn 占位符: ${errorMessage}`,
        );
    }
    return null;
}

export function render(content: string, config: AddCoderConfig): string {
    let result = content;
    for (const [placeholder, key] of Object.entries(PLACEHOLDERS)) {
        const value = config[key] as string;
        result = result.replaceAll(placeholder, value);
    }
    // 阈值占位符注入（直读 TOML 真源；缺失时保留占位符）
    const thresholds = loadDpsThresholds();
    if (thresholds) {
        result = result.replaceAll("{{dpsPass}}", thresholds.pass);
        result = result.replaceAll("{{dpsWarn}}", thresholds.warn);
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
                // 治理文档同时输出到项目根，方便用户查阅
                if (relative(CORE_DIR, full).startsWith("docs/")) {
                    files.set(name, rendered);
                }
            }
        }
    }

    walk(CORE_DIR, "");

    if (dryRun) {
        console.log(`[dry-run] Core templates: ${files.size} files`);
    }

    return files;
}

// 统一适配器渲染：所有 IDE adapter 共用此函数
export function renderAdapterBase(
    config: AddCoderConfig,
    magicPath: string,          // e.g. ".claude" ".qoder" ".vscode"
    githubHooksToRoot: boolean, // VS Code 需将 .github/hooks/ 输出到项目根
    dryRun: boolean,
): Map<string, string> {
    const files = new Map<string, string>();
    const adapterDir = join(TEMPLATES_ROOT, "adapters", magicPath.replace(".", ""));
    const coreHooksLib = join(TEMPLATES_ROOT, "core", "hooks", "lib");

    function walk(dir: string, base: string, targetPrefix?: string) {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                walk(full, join(base, name), targetPrefix);
            } else {
                const content = readFileSync(full, "utf-8");
                const rendered = render(content, config);
                let targetRel: string;
                if (targetPrefix) {
                    targetRel = join(targetPrefix, relative(dir, full));
                } else if (githubHooksToRoot && relative(adapterDir, full).startsWith(".github/")) {
                    targetRel = relative(adapterDir, full); // .github/hooks/ → 项目根
                } else {
                    targetRel = join(magicPath, relative(adapterDir, full));
                }
                files.set(targetRel, rendered);
            }
        }
    }

    walk(adapterDir, "");
    walk(coreHooksLib, "", join(magicPath, "hooks", "lib"));

    if (dryRun) {
        console.log(`[dry-run] ${magicPath} adapter: ${files.size} files`);
    }

    return files;
}