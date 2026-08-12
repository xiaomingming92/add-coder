import { ADD_DIR } from "../shared/paths.js";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, relative, dirname } from "path";
import { parse } from "smol-toml";
import type { AddCoderConfig } from "../config/schema";

const __dirname = import.meta.dirname;

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

// 技术栈 profile 占位符（D5）：{{stackName}} / {{stackProfile}} / {{stackReferenceLine}}
// {{stackReferenceLine}}: 按需生成引用行（设置/中性两态），避免占位符中性文本被拼进路径
function renderStackPlaceholders(result: string, config: AddCoderConfig): string {
    const stackName = config.stack || "未设置";
    const stackProfile = config.stack ? `${config.stack}-profile.md` : "未设置";
    let refLine: string;
    if (config.stack) {
        refLine = [
            `本项目的技术栈约束由 \`${config.magicDir}/rules/profiles/${stackProfile}\` 定义（由 \`add-coder stack set\` 管理）。`,
            `- **当前技术栈**: \`${stackName}\`（${stackProfile} 已生效，AI 必须遵守其中全部约束）`,
        ].join("\n");
    } else {
        refLine = [
            "本项目的技术栈未设置，不施加任何技术栈假设。",
            "AI 必须通过 `get_project_context` 读取项目实际代码推断真实技术栈，禁止套用模板或案例中的默认技术栈。",
            "（可用 `add-coder stack set <name>` 启用技术栈约束）",
        ].join("\n");
    }
    return result
        .replaceAll("{{stackReferenceLine}}", refLine)
        .replaceAll("{{stackName}}", stackName)
        .replaceAll("{{stackProfile}}", stackProfile);
}

// 阈值占位符：直读 caijuehub TOML 真源 [thresholds] 段（P1-1：不新增 [display] 段，transcribe 不动）
// TOML 缺失/解析失败时返回 null，调用方保留占位符并告警（不静默注入 0）
function loadDpsThresholds(): { pass: string; warn: string } | null {
    try {
        // 多路径回退：源码模式(src/core→src/caijuehub) / dist 单文件模式(dist→dist/caijuehub) / 包根模式
        const candidates = [
            join(__dirname, "../caijuehub/dps-scoring-rules.toml"),
            join(__dirname, "caijuehub/dps-scoring-rules.toml"),
            join(__dirname, "../../caijuehub/dps-scoring-rules.toml"),
        ];
        const tomlPath = candidates.find(existsSync);
        if (!tomlPath) {
            throw new Error(`候选路径均不存在: ${candidates.join(" | ")}`);
        }
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
    // 技术栈占位符注入（无 stack → 中性文本）
    result = renderStackPlaceholders(result, config);
    return result;
}

const TEMPLATES_ROOT = join(__dirname, "../templates");
const CORE_DIR = join(TEMPLATES_ROOT, "core");
const CORE_TARGET = ADD_DIR;
const SKIP_DIRS = new Set(["prisma", "profiles"]); // Prisma schema 不进 IDE magic path; profiles 按 stack 按需注入

interface ProfileEntry {
    name: string;
    description: string;
    file: string;
}

// 读取 profile 注册表（D3）：templates/core/rules/profiles/index.toml
export function loadProfileRegistry(): ProfileEntry[] {
    try {
        const tomlPath = join(CORE_DIR, "rules", "profiles", "index.toml");
        if (!existsSync(tomlPath)) return [];
        const doc = parse(readFileSync(tomlPath, "utf-8")) as {
            profile?: ProfileEntry[];
        };
        return doc.profile || [];
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn(`[renderer] profile 注册表读取失败: ${errorMessage}`);
        return [];
    }
}

// 读 stack.json（D4）：缺失/损坏 → ""（未设置，中性，不阻断）
export function loadStack(projectRoot: string, magicDir: string): string {
    try {
        const p = join(projectRoot, magicDir, "stack.json");
        if (!existsSync(p)) return "";
        const doc = JSON.parse(readFileSync(p, "utf-8")) as { stack?: unknown };
        return typeof doc.stack === "string" ? doc.stack : "";
    } catch {
        return "";
    }
}

// 写 stack.json（D4/D6）
export function saveStack(projectRoot: string, magicDir: string, stack: string): void {
    const dir = join(projectRoot, magicDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, "stack.json"),
        JSON.stringify({ stack, updatedAt: new Date().toISOString() }, null, 2),
        "utf-8",
    );
}

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

    // profile 按需注入（D5）：命中注册表且 stack 非空 → 输出到 .add/rules/profiles/（调用方展开到 magicDir）
    if (config.stack) {
        const registry = loadProfileRegistry();
        const profile = registry.find((p) => p.name === config.stack);
        if (profile) {
            const src = join(CORE_DIR, "rules", "profiles", profile.file);
            if (existsSync(src)) {
                const rendered = render(readFileSync(src, "utf-8"), config);
                files.set(join(ADD_DIR, "rules", "profiles", profile.file), rendered);
            }
        }
        // 注册表未命中：视为自定义 profile（项目侧已有文件），模板不输出
    }

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