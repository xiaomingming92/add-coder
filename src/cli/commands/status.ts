/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-09 08:56:59
 * LastEditors  : xiaomingming wujixmm@gmail.com
 * LastEditTime : 2026-07-16 09:46:41
 * FilePath     : /add-coder/src/cli/commands/status.ts
 * Description  : ADD 模板完整性检查命令 + 宿主适配自检（VS Code 虚拟工具折叠，issue #21）
 */
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { renderCore } from "../../core/renderer";
import type { AddCoderConfig } from "../../config/schema";
import { loadConfig } from "../config-loader";

/**
 * VS Code Copilot Chat 的虚拟工具折叠阈值键（实验设置，number 0–128，默认 128）。
 *
 * 触发线是**所有 MCP 服务器的工具总数** ≥ threshold/2（默认 64）——不是单服务器工具数。
 * 设为 0 ⇒ 阈值 = ∞ ⇒ 折叠整体禁用 ⇒ 全部工具始终直连（需重载 VS Code 窗口生效）。
 *
 * 背景：Issue #21 —— 折叠按字母序把 plan_ / review_ / status_ / update_ 等治理工具族裁掉后，
 * 未激活代理就调用会误报 "currently disabled by the user"，断掉 HITL 审批链与 ADD-7 审计链。
 */
export const VIRTUAL_TOOLS_SETTING_KEY = "github.copilot.chat.virtualTools.threshold";

/** 单个候选设置文件的探测结果 */
export interface VsCodeSettingsCandidate {
    path: string;
    exists: boolean;
    /** 文件中是否出现该键（含取值非数值的情形） */
    hasKey: boolean;
    /** 该键的数值；缺失 / 非数值 → null */
    threshold: number | null;
    /** 文件存在但解析失败（JSONC 非法） */
    parseError?: string;
}

export type VirtualToolsCheckState = "ok" | "missing" | "non-zero";

export interface VirtualToolsCheck {
    state: VirtualToolsCheckState;
    candidates: VsCodeSettingsCandidate[];
}

export interface VirtualToolsCheckInput {
    projectRoot: string;
    platform?: NodeJS.Platform;
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
}

/** 剥离 `//` 行注释与块注释（字符串内的注释标记不误伤） */
function stripJsonComments(text: string): string {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            out += ch;
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            out += ch;
            continue;
        }
        // VS Code settings.json 允许注释与尾随逗号（JSONC）
        if (ch === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i++;
            out += "\n";
            continue;
        }
        if (ch === "/" && text[i + 1] === "*") {
            i += 2;
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
            i++;
            out += " ";
            continue;
        }
        out += ch;
    }
    return out;
}

/** 剥离尾随逗号（字符串内的 `,}` / `,]` 不误伤） */
function stripTrailingCommas(text: string): string {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            out += ch;
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            out += ch;
            continue;
        }
        if (ch === ",") {
            let j = i + 1;
            while (j < text.length && /\s/.test(text[j])) j++;
            if (text[j] === "}" || text[j] === "]") continue;
        }
        out += ch;
    }
    return out;
}

/** 容忍 JSONC（注释 + 尾随逗号）的解析入口；仍非法则抛出 */
export function parseJsonc(text: string): unknown {
    return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}

/** 候选设置文件：工作区级 + 用户级（含 Insiders 变体，按平台构造） */
export function vscodeSettingsCandidates(input: VirtualToolsCheckInput): string[] {
    const platform = input.platform ?? process.platform;
    const home = input.homeDir ?? homedir();
    const env = input.env ?? process.env;
    const variants = ["Code", "Code - Insiders"];

    let userRoots: string[];
    if (platform === "win32") {
        const appData = env.APPDATA || join(home, "AppData", "Roaming");
        userRoots = variants.map((v) => join(appData, v, "User"));
    } else if (platform === "darwin") {
        userRoots = variants.map((v) => join(home, "Library", "Application Support", v, "User"));
    } else {
        userRoots = variants.map((v) => join(home, ".config", v, "User"));
    }

    return [
        join(input.projectRoot, ".vscode", "settings.json"),
        ...userRoots.map((root) => join(root, "settings.json")),
    ];
}

/**
 * 探测 VS Code 虚拟工具折叠开关（**只读，不写任何设置文件**）。
 *
 * 三态：`ok`（任一候选该键 = 0）/ `non-zero`（存在该键但 ≠ 0）/ `missing`（所有候选都无该键）。
 * 解析失败不静默——记入候选的 `parseError` 并让调用方显式输出。
 */
export function checkVsCodeVirtualTools(input: VirtualToolsCheckInput): VirtualToolsCheck {
    const candidates: VsCodeSettingsCandidate[] = vscodeSettingsCandidates(input).map((path) => {
        if (!existsSync(path)) return { path, exists: false, hasKey: false, threshold: null };
        let parsed: unknown;
        try {
            parsed = parseJsonc(readFileSync(path, "utf-8"));
        } catch (e) {
            return {
                path,
                exists: true,
                hasKey: false,
                threshold: null,
                parseError: e instanceof Error ? e.message : String(e),
            };
        }
        if (typeof parsed !== "object" || parsed === null) {
            return { path, exists: true, hasKey: false, threshold: null, parseError: "顶层不是 JSON 对象" };
        }
        const raw = (parsed as Record<string, unknown>)[VIRTUAL_TOOLS_SETTING_KEY];
        if (raw === undefined) return { path, exists: true, hasKey: false, threshold: null };
        return {
            path,
            exists: true,
            hasKey: true,
            threshold: typeof raw === "number" ? raw : null,
        };
    });

    const ok = candidates.some((c) => c.threshold === 0);
    const state: VirtualToolsCheckState = ok ? "ok" : candidates.some((c) => c.hasKey) ? "non-zero" : "missing";
    return { state, candidates };
}

/**
 * 该项目的 MCP 是否落在 VS Code 端 → 决定是否输出本项检查（非 VS Code 项目不输出，避免噪声）。
 *
 * 信号三选一（任一命中即视为 VS Code 端）：
 * ① 配置侧 `magicDir === ".vscode"` 或 `adapters` 含 `vscode`；
 * ② 工作区存在 `.vscode/mcp.json`（VS Code 原生 MCP 配置）；
 * ③ 工作区 `.vscode/settings.json` 含 `mcp` 段或 `github.copilot.chat.*` 设置。
 *
 * 为什么不能只看 ①：`status` 走 `loadConfig(projectRoot)`（不传 configPath），真实项目里
 * `magicDir` 默认是空串 ⇒ 只认配置会让自检对目标用户永不触发；②③ 是"该项目确实把 MCP
 * 接进了 VS Code"的布局证据。
 */
export function isVsCodeTarget(config: AddCoderConfig, projectRoot?: string): boolean {
    if (config.magicDir === ".vscode" || config.adapters.includes("vscode")) return true;

    const root = projectRoot || config.projectRoot;
    if (!root) return false;
    if (existsSync(join(root, ".vscode", "mcp.json"))) return true;

    const settingsPath = join(root, ".vscode", "settings.json");
    if (!existsSync(settingsPath)) return false;
    try {
        const parsed = parseJsonc(readFileSync(settingsPath, "utf-8"));
        if (typeof parsed !== "object" || parsed === null) return false;
        const obj = parsed as Record<string, unknown>;
        if (obj.mcp !== undefined) return true;
        return Object.keys(obj).some((k) => k.startsWith("github.copilot.chat."));
    } catch {
        return false;
    }
}

/** 宿主适配自检输出（建议性：不写文件、不改退出码） */
function printVirtualToolsCheck(config: AddCoderConfig): void {
    const check = checkVsCodeVirtualTools({ projectRoot: config.projectRoot });
    // magicDir 缺省（真实项目 loadConfig 未传 configPath 时为空串）→ 回退 .vscode，保证文档路径可读
    const docPath = join(config.magicDir || ".vscode", "docs", "ADD-governance-vscode-copilot.md");

    const describe = (c: VsCodeSettingsCandidate): string => {
        const where = c.path === join(config.projectRoot, ".vscode", "settings.json") ? "工作区" : "用户级";
        if (!c.exists) return `${where}: ${c.path}（文件不存在）`;
        if (c.parseError) return `${where}: ${c.path}（解析失败: ${c.parseError}）`;
        if (!c.hasKey) return `${where}: ${c.path}（键缺失）`;
        return `${where}: ${c.path}（当前值 ${c.threshold ?? "非数值"}）`;
    };

    if (check.state === "ok") {
        const hit = check.candidates.find((c) => c.threshold === 0);
        console.log(`  ✅ VS Code 虚拟工具折叠已关闭（${hit ? hit.path : VIRTUAL_TOOLS_SETTING_KEY + " = 0"}）`);
        return;
    }

    console.log(`  ⚠️ VS Code 宿主适配：未检测到 "${VIRTUAL_TOOLS_SETTING_KEY}": 0`);
    check.candidates.forEach((c) => console.log(`     - ${describe(c)}`));
    if (check.state === "non-zero") {
        console.log("     该键存在但取值非 0 ⇒ 折叠仍会触发（触发线 = 所有 MCP 服务器工具总数 ≥ 阈值/2，默认 64）");
    }
    console.log("     修复: 在用户级或工作区级 settings.json 加入下面这行，然后「重载 VS Code 窗口」（Developer: Reload Window）");
    console.log(`           "${VIRTUAL_TOOLS_SETTING_KEY}": 0`);
    console.log('     原因: 工具被宿主折叠时，未激活代理就调用会误报 "currently disabled by the user"，');
    console.log("           HITL 审批链（update_hitl/status_hitl）与 ADD-7 审计链（record_dev_operation/query_audit_logs）会同时中断");
    console.log(`     说明: ${docPath}（本项为建议性检查，不会修改你的设置文件）`);
}

export async function statusCommand() {
    const projectRoot = process.cwd();
    const config: AddCoderConfig = await loadConfig(projectRoot);
    config.projectRoot = projectRoot;

    const coreFiles = renderCore(config, true);
    const missing: string[] = [];
    const present: string[] = [];

    for (const [relPath] of coreFiles) {
        if (existsSync(resolve(projectRoot, relPath))) {
            present.push(relPath);
        } else {
            missing.push(relPath);
        }
    }

    console.log("ADD 模板完整性检查:");
    console.log(`  已就位: ${present.length} 文件`);
    if (missing.length > 0) {
        console.log(`  缺失: ${missing.length} 文件`);
        missing.forEach((f) => console.log(`    - ${f}`));
    } else {
        console.log("  所有文件完整。");
    }

    // 宿主适配自检（issue #21）：仅 VS Code 项目输出；建议性，不写文件、不改退出码
    // 置于退出判定**之前**——模板缺失时同样要能看到宿主告警，否则目标用户永远看不到本项
    if (isVsCodeTarget(config, projectRoot)) {
        console.log("");
        console.log("宿主适配自检（VS Code Copilot）:");
        printVirtualToolsCheck(config);
    }

    if (missing.length > 0) {
        // issue #10 补充-6：缺失时非零退出码，CI 门禁可用（语义与调整前一致，仅顺序后移）
        process.exit(1);
    }
}
