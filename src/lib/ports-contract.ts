/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-10 11:12:37
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-10 11:12:38
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/src/lib/ports-contract.ts
 * @Description  : 
 */
/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-10
 * Description  : 端口契约检查/生成共享模块（add-coder-ports-contract Plan）
 *                真源模板：templates/core/templates/ports.example.md（含 {{projectName}} 占位符）
 *                语义：只补缺不覆盖——docs/ports.md 已存在则零打扰跳过
 *                失败路径：模板缺失 catch warn 不阻断（与模型预下载降级边界一致）
 *                调用方：add-coder init（deployDocs 前）/ add-coder sync（默认+--patch 分支）
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { resolve, basename } from "path";
import { render } from "../core/renderer";
import { PORTS_CONFIG } from "../caijuehub/strategies/ports.strategy.js";
import { runCommand, commandExists } from "./run-command";
import { createConnection } from "net";
import type { AddCoderConfig } from "../config/schema";

/** 包内端口契约示例模板相对路径（dist 单文件 bundle：dirname=dist → ../templates = 包根/templates） */
const PORTS_EXAMPLE_REL = "../templates/core/templates/ports.example.md";

/**
 * 检查用户项目 docs/ports.md 是否存在，缺失则从包内 example 渲染生成。
 * @param projectRoot 用户项目根目录
 * @param config ADD 配置（projectName 用于渲染占位符）
 * @param dryRun 预览模式：仅打印提示不写盘
 */
export function ensurePortsContract(projectRoot: string, config: AddCoderConfig, dryRun = false): void {
    const target = resolve(projectRoot, "docs", "ports.md");
    // 只补缺不覆盖：已存在 → 零打扰跳过（用户修改永不丢失）
    if (existsSync(target)) return;

    let content: string;
    try {
        content = readFileSync(resolve(import.meta.dirname, PORTS_EXAMPLE_REL), "utf-8");
    } catch {
        console.warn(`⚠️ 端口契约模板缺失（跳过生成 docs/ports.md）: ${PORTS_EXAMPLE_REL}`);
        return;
    }

    // projectName 兜底：render() 对 undefined 占位符会替换为字面 "undefined"（Review P1 #2）
    const pn = config.projectName || "add-project";
    const rendered = render(content, { ...config, projectName: pn });

    if (dryRun) {
        console.log("[dry-run] 将生成 docs/ports.md");
        return;
    }

    mkdirSync(resolve(projectRoot, "docs"), { recursive: true });
    writeFileSync(target, rendered, "utf-8");
    console.log("✅ 已生成端口契约 docs/ports.md（请按项目实际登记端口，示例状态列勿直接提交）");
}

// ════════════════ 统一端口分配器（P-2，决议演进）════════════════

/** 待分配的服务（统一分配器输入） */
export interface PortService {
    name: string;
    containerName: string;
    /** 环境变量名（登记时写入配置位置列） */
    envKey?: string;
}

/** 端口占用检测（与 init.ts portInUse 同逻辑） */
function portInUse(port: number): Promise<boolean> {
    return new Promise((r) => {
        const s = createConnection({ port, host: "127.0.0.1" }, () => { s.destroy(); r(true); });
        s.on("error", () => r(false));
    });
}

/** 解析契约表 markdown 表格首列的数字端口 */
export function parseContractPorts(content: string): number[] {
    const out: number[] = [];
    const re = /^\|\s*(\d{2,5})\s*\|/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) out.push(parseInt(m[1], 10));
    return out;
}

/** 读本地契约表已登记端口 */
function readRegisteredPorts(projectRoot: string): Set<number> {
    const p = resolve(projectRoot, "docs", "ports.md");
    if (!existsSync(p)) return new Set();
    return new Set(parseContractPorts(readFileSync(p, "utf-8")));
}

/** 读跨项目事实源（父目录下所有项目的 docs/ports.md，避免兄弟项目撞车） */
function readCrossProjectPorts(projectRoot: string): Set<number> {
    const ports = new Set<number>();
    const parent = resolve(projectRoot, "..");
    let names: string[] = [];
    try {
        names = readdirSync(parent, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name !== basename(projectRoot))
            .map((d) => d.name);
    } catch { return ports; }
    for (const name of names) {
        const p = resolve(parent, name, "docs", "ports.md");
        if (existsSync(p)) {
            parseContractPorts(readFileSync(p, "utf-8")).forEach((x) => ports.add(x));
        }
    }
    return ports;
}

/** podman ps 实扫真实占用端口（非空白仓库既有容器） */
function scanPodmanPorts(): Set<number> {
    const ports = new Set<number>();
    if (!commandExists("podman")) return ports;
    try {
        const r = runCommand("podman", ["ps", "--format", "{{.Ports}}"]);
        // 主机端口在 -> 之前："0.0.0.0:5433->5432/tcp" → 捕获 5433（容器内 5432 不参与避让）
        const re = /(\d{1,5})->\d{1,5}\/tcp/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(r.stdout)) !== null) ports.add(parseInt(m[1], 10));
    } catch { /* ignore */ }
    return ports;
}

/** 登记端口到本地契约表（存在时追加行） */
function registerPort(projectRoot: string, port: number, svc: PortService): void {
    const contract = resolve(projectRoot, "docs", "ports.md");
    if (!existsSync(contract)) return;
    const env = svc.envKey ? ` \`${svc.envKey}\`` : "";
    const line = `| ${port} | PostgreSQL（${svc.containerName}） | ${svc.name}（add-coder 自动登记） | 🟢 使用中 | .env.development${env} |\n`;
    writeFileSync(contract, readFileSync(contract, "utf-8") + line, "utf-8");
    console.log(`📋 端口契约登记: ${port}（${svc.containerName}）→ docs/ports.md`);
}

/**
 * 统一端口分配器（P-2）：为一批服务一次性分配端口并登记契约表。
 * 分配依据：本地契约表（复用）→ 跨项目事实源（避让）→ podman 实扫（真实占用）→ 从 start_hint 起扫空闲。
 * 禁止各模块自行分散扫描端口。
 */
export async function allocatePortsWithContract(projectRoot: string, services: PortService[]): Promise<Record<string, number>> {
    const cfg = PORTS_CONFIG;
    const used = new Set<number>();
    // ① 本地契约表已登记（复用）
    readRegisteredPorts(projectRoot).forEach((p) => used.add(p));
    // ② 跨项目事实源（避让兄弟项目）
    if (cfg.behavior.readCrossProject) readCrossProjectPorts(projectRoot).forEach((p) => used.add(p));
    // ③ podman 实扫（非空白仓库真实占用）
    scanPodmanPorts().forEach((p) => used.add(p));
    // ④ 从 start_hint 起扫描真实空闲
    const result: Record<string, number> = {};
    for (const svc of services) {
        let port = 0;
        for (let p = cfg.pg.startHint; p < cfg.pg.startHint + cfg.pg.scanLimit; p++) {
            if (used.has(p)) continue;
            if (await portInUse(p)) { used.add(p); continue; }
            port = p;
            break;
        }
        if (!port) throw new Error(`端口契约分配失败: ${cfg.pg.startHint}-${cfg.pg.startHint + cfg.pg.scanLimit} 无空闲端口（${svc.name}）`);
        used.add(port);
        result[svc.name] = port;
        registerPort(projectRoot, port, svc);
    }
    return result;
}
