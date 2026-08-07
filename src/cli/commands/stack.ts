/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Description  : add-coder stack 命令 — 技术栈约束 profile 管理（D6）
 *                 list: 内置注册表 + 自定义 + 当前标记
 *                 set <name>: 校验 → saveStack → 重渲染 profile/引用行 → 更新 hash
 *                 show: 当前 stack + profile 路径 + 更新时间
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { renderCore, saveStack, loadStack, loadProfileRegistry } from "../../core/renderer";
import { defaults } from "../../config/defaults";
import { detectIDE } from "../detect";
import { normalizeRelPath } from "../../lib/path-normalize";
import type { AddCoderConfig } from "../../config/schema";

const MAGIC_DIR_MAP: Record<string, string> = { claude: ".claude", qoder: ".qoder", vscode: ".vscode", trae: ".trae", codex: ".codex" };
const HASH_OUTPUT_FILE = ".add-coder-hash.json";

function hash8(c: string) { return createHash("sha256").update(c).digest("hex").slice(0, 8); }

/** 解析 magicDir：adapter 名 → 带点目录（与 init.ts 一致） */
function resolveMagicDir(projectRoot: string, specified?: string): string {
    if (specified) {
        if (!MAGIC_DIR_MAP[specified]) throw new Error(`未知 adapter: ${specified}`);
        return MAGIC_DIR_MAP[specified];
    }
    const detected = detectIDE(projectRoot);
    const adapter = detected !== "auto" ? detected : "qoder";
    return MAGIC_DIR_MAP[adapter];
}

/** 项目侧自定义 profile 清单：{magicDir}/rules/profiles/*.md 中不在注册表内的文件 */
function listCustomProfiles(projectRoot: string, magicDir: string, registryNames: Set<string>): string[] {
    const dir = resolve(projectRoot, magicDir, "rules", "profiles");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".md") && !registryNames.has(f.replace(/-profile\.md$/, "")))
        .sort();
}

/** 校验 profile 名：内置注册表命中 或 项目侧自定义文件存在 */
function profileExists(projectRoot: string, magicDir: string, name: string): boolean {
    const registry = loadProfileRegistry();
    if (registry.some((p) => p.name === name)) return true;
    return existsSync(resolve(projectRoot, magicDir, "rules", "profiles", `${name}-profile.md`));
}

export function stackCommand(
    sub: string | undefined,
    name: string | undefined,
    options: { adapter?: string; clear?: boolean } = {},
) {
    const projectRoot = process.cwd();
    const magicDir = resolveMagicDir(projectRoot, options.adapter);
    const registry = loadProfileRegistry();

    if (options.clear) {
        saveStack(projectRoot, magicDir, "");
        console.log(`已清除技术栈设置（${magicDir}/stack.json → 中性）`);
        return;
    }

    if (sub === "list" || !sub) {
        const current = loadStack(projectRoot, magicDir);
        console.log("技术栈 profile 列表:");
        console.log("  内置（注册表）:");
        for (const p of registry) {
            const mark = p.name === current ? "  ← 当前" : "";
            console.log(`    ${p.name} — ${p.description}${mark}`);
        }
        const custom = listCustomProfiles(projectRoot, magicDir, new Set(registry.map((p) => p.name)));
        if (custom.length > 0) {
            console.log("  自定义（项目侧）:");
            for (const c of custom) {
                const name = c.replace(/-profile\.md$/, "");
                const mark = name === current ? "  ← 当前" : "";
                console.log(`    ${name}${mark}`);
            }
        }
        if (!current) console.log("\n当前: 未设置（不施加任何技术栈假设）");
        return;
    }

    if (sub === "show") {
        const current = loadStack(projectRoot, magicDir);
        if (!current) {
            console.log("技术栈: 未设置（中性，无技术栈假设）");
            return;
        }
        const profilePath = resolve(projectRoot, magicDir, "rules", "profiles", `${current}-profile.md`);
        const stat = existsSync(profilePath) ? readFileSync(profilePath, "utf-8").length : 0;
        console.log(`技术栈: ${current}`);
        console.log(`profile 文件: ${profilePath}${existsSync(profilePath) ? ` (${stat} 字符)` : "（缺失）"}`);
        try {
            const raw = JSON.parse(readFileSync(resolve(projectRoot, magicDir, "stack.json"), "utf-8")) as { updatedAt?: string };
            if (raw.updatedAt) console.log(`更新时间: ${raw.updatedAt}`);
        } catch { /* ignore */ }
        return;
    }

    if (sub === "set") {
        if (!name) {
            console.log("用法: add-coder stack set <name>（内置: " + registry.map((p) => p.name).join(" | ") + "，或自定义 profile 名）");
            return;
        }
        applyStack(projectRoot, magicDir, name);
        return;
    }

    console.log(`未知子命令: ${sub}（可用: list / set <name> / show / --clear）`);
}

/** 构造渲染配置：projectName 从 package.json 推断，其余用默认值（不依赖 add-coder 配置文件） */
function buildConfig(projectRoot: string, magicDir: string, stack: string): AddCoderConfig {
    const config: AddCoderConfig = {
        ...defaults,
        projectName: "add-project",
        projectRoot,
        magicDir,
        stack,
    };
    try {
        const pkgPath = resolve(projectRoot, "package.json");
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
            if (pkg.name) config.projectName = pkg.name;
        }
    } catch { /* ignore */ }
    return config;
}

/** 应用技术栈：校验 → 写 stack.json → 重渲染 project_rules.md + profile（.add + magicDir 双路径）→ 更新 hash */
function applyStack(projectRoot: string, magicDir: string, name: string) {
    if (!profileExists(projectRoot, magicDir, name)) {
        const registry = loadProfileRegistry();
        console.error(`✗ profile 不存在: ${name}`);
        console.error(`  内置: ${registry.map((p) => p.name).join(" | ")}（或自定义: ${magicDir}/rules/profiles/{name}-profile.md）`);
        process.exit(1);
    }

    const config = buildConfig(projectRoot, magicDir, name);

    saveStack(projectRoot, magicDir, name);

    // 重渲染 stack 相关文件（project_rules.md 引用行 + profile），只写与 stack 相关的部分
    const coreFiles = renderCore(config, false);
    const stackRelated = new Map<string, string>();
    for (const [relPath, content] of coreFiles) {
        // Windows 渲染路径为反斜杠，先 normalize 再匹配（issue #10 P1-4）
        const rp = normalizeRelPath(relPath);
        if (rp.includes("/rules/profiles/") || rp.endsWith("/rules/project_rules.md")) {
            stackRelated.set(rp, content);
        }
    }

    const hashMap: Record<string, string> = {};
    try {
        Object.assign(hashMap, JSON.parse(readFileSync(resolve(projectRoot, magicDir, HASH_OUTPUT_FILE), "utf-8")) as Record<string, string>);
    } catch { /* 无 hash 文件则新建 */ }

    let written = 0;
    for (const [relPath, content] of stackRelated) {
        for (const t of [".add", magicDir]) {
            const targetPath = resolve(projectRoot, relPath.replace(/^\.add/, t));
            mkdirSync(join(targetPath, ".."), { recursive: true });
            writeFileSync(targetPath, content, "utf-8");
            hashMap[relPath.replace(/^\.add/, t)] = hash8(content);
            written++;
        }
    }

    // 写后断言（issue #10 P1-4）：profile 文件与 project_rules.md 引用必须实际写入，否则返回失败
    const fail = (msg: string): never => { console.error(`✗ stack set 失败: ${msg}`); process.exit(1); };
    const registry = loadProfileRegistry();
    const isBuiltin = registry.some((p) => p.name === name);
    const profilePathMagic = resolve(projectRoot, magicDir, "rules", "profiles", `${name}-profile.md`);
    const profilePathAdd = resolve(projectRoot, ".add", "rules", "profiles", `${name}-profile.md`);
    const projectRulesPath = resolve(projectRoot, magicDir, "rules", "project_rules.md");
    const projectRulesContent = existsSync(projectRulesPath) ? readFileSync(projectRulesPath, "utf-8") : "";
    if (written === 0) fail(`未渲染任何 stack 相关文件（${name}）——Windows 路径匹配失效遗留问题`);
    if (isBuiltin && !existsSync(profilePathAdd)) fail(`profile 未写入 .add: ${profilePathAdd}`);
    if (!existsSync(profilePathMagic)) fail(`profile 未写入 ${magicDir}: ${profilePathMagic}`);
    if (!projectRulesContent.includes("**当前技术栈**") || !projectRulesContent.includes(name)) fail(`project_rules.md 未包含 ${name} 引用`);

    writeFileSync(resolve(projectRoot, magicDir, HASH_OUTPUT_FILE), JSON.stringify(hashMap, null, 2) + "\n", "utf-8");

    console.log(`✅ 技术栈已设置为 ${name}`);
    console.log(`   ${magicDir}/stack.json → ${name}`);
    console.log(`   ${magicDir}/rules/profiles/${name}-profile.md ${existsSync(resolve(projectRoot, magicDir, "rules", "profiles", `${name}-profile.md`)) ? "已就位" : "（自定义 profile，项目侧文件）"}`);
    console.log(`   project_rules.md 引用行已更新 + hash 已刷新（${written} 个文件）`);
}
