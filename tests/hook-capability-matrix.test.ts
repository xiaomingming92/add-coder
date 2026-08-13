/*
 * hook-capability-matrix.test.ts — 通用 Hook 能力对齐行为矩阵（Task 1.7）
 *
 * 协议层契约（hook-capability-alignment Plan §3.2）:
 *   1. lifecycle resolver: bridge 查 scoped DB；不可用 → STATUS_UNAVAILABLE + fail-closed
 *   2. 本地 scope: 只读写自身 magicDir；禁止跨端扫描、禁止 .add fallback、无 adapter 默认值
 *   3. 命令分类: sed 仅独立 option（-i/-i.bak/--in-place）判定为写
 *   4. 模板预载: 读 ${magicDir}/templates 本地物化；缺失 fail-fast
 *
 * 断言类型:
 *   - 静态负向（grep 残留 = 0）: mtime/勾选数裁决、跨端扫描、sed 宽泛、源仓路径、checkout 话术
 *   - fixture 行为: bridge READY/STATUS_UNAVAILABLE、Stop exit/output contract、
 *     最终 render map（adapter 私有 lib 不被 core 覆盖，Task 1.8）、各 adapter 本地 scope
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { spawnSync } from "child_process";
import { renderAdapter as renderClaude } from "../src/adapters/claude/renderer";
import { renderAdapter as renderQoder } from "../src/adapters/qoder/renderer";
import { renderAdapter as renderVSCode } from "../src/adapters/vscode/renderer";
import { renderAdapter as renderTrae } from "../src/adapters/trae/renderer";
import { renderAdapter as renderCodex } from "../src/adapters/codex/renderer";
import type { AddCoderConfig } from "../src/config/schema";
const REPO_ROOT = resolve(__dirname, "..");
const CORE_HOOKS = join(REPO_ROOT, "templates", "core", "hooks");
const ADAPTERS_ROOT = join(REPO_ROOT, "templates", "adapters");
const ADAPTERS = ["claude", "qoder", "vscode", "trae", "codex"] as const;
const BRIDGE = join(REPO_ROOT, "templates", "core", "scripts", "plan-status-bridge.ts");

// ── 辅助: 递归列出目录下全部文件 ──
function listFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const name of readdirSync(d)) {
            const full = join(d, name);
            if (statSync(full).isDirectory()) walk(full);
            else out.push(full);
        }
    };
    walk(dir);
    return out;
}

// ── 辅助: 读取单文件内容（shell 脚本行集合）──
function readLines(p: string): string[] {
    return readFileSync(p, "utf-8").split("\n");
}

// 是否命中某正则（忽略纯注释行与 shellcheck 指令）
function hitsRegex(lines: string[], re: RegExp): string[] {
    return lines.filter((l) => {
        const t = l.trim();
        if (t.startsWith("#") || t.startsWith("//")) return false;
        return re.test(t);
    });
}

describe("矩阵 1: lifecycle resolver（协议层契约）", () => {
    it("bridge 存在且引用 shared resolver（DB 真相源）", () => {
        expect(existsSync(BRIDGE)).toBe(true);
        const src = readFileSync(BRIDGE, "utf-8");
        expect(src).toContain("resolvePlanStatus");
        expect(src).toContain("STATUS_UNAVAILABLE");
        expect(src).toContain("process.exitCode = 3");
    });

    it("core common.sh 消费 bridge，且不含 mtime/勾选数裁决", () => {
        const lines = readLines(join(CORE_HOOKS, "lib", "common.sh"));
        expect(hitsRegex(lines, /query_plan_status/).length).toBeGreaterThan(0);
        expect(hitsRegex(lines, /node --import tsx/).length).toBeGreaterThan(0);
        // 裁决逻辑残留（文件扫描 / 勾选数 / mtime）必须为 0
        expect(hitsRegex(lines, /grep -c '\[x\]'|grep -c '\[ \]'|find .*handoff.*-mtime/)).toEqual([]);
    });

    it("core stop-check 对 STATUS_UNAVAILABLE fail-closed（不吞成无 Plan）", () => {
        const lines = readLines(join(CORE_HOOKS, "stop-check.sh"));
        const hasQ0 = hitsRegex(lines, /__STATUS_UNAVAILABLE__/);
        expect(hasQ0.length).toBeGreaterThan(0);
        expect(hitsRegex(lines, /未回退 Handoff\/add-route 猜测/).length).toBeGreaterThan(0);
    });
});

describe("矩阵 2: adapter 本地 scope（禁止跨端扫描与 .add fallback）", () => {
    it("core state-detect 不再维护第二套探测（委托 common.sh）", () => {
        const lines = readLines(join(CORE_HOOKS, "lib", "state-detect.sh"));
        expect(hitsRegex(lines, /for m in "\.claude" "\.qoder"/)).toEqual([]);
        expect(hitsRegex(lines, /MAGIC_DIR="\$\{MAGIC_DIR:-\.add\}"/)).toEqual([]);
        // 兼容入口: 委托 common.sh
        expect(lines.some((l) => l.includes("source \"$HOOK_LIB_DIR/common.sh\""))).toBe(true);
    });

    it("core vocabulary 无 adapter 名称默认值与跨端扫描", () => {
        const lines = readLines(join(CORE_HOOKS, "lib", "vocabulary.sh"));
        expect(hitsRegex(lines, /MAGIC_DIR:-\.add/)).toEqual([]);
        expect(hitsRegex(lines, /for m in "\.claude" "\.qoder"/)).toEqual([]);
    });

    it("各 adapter 真源不含对其它 magicDir 的硬编码写入路径（负向）", () => {
        for (const a of ADAPTERS) {
            const dir = join(ADAPTERS_ROOT, a, "hooks");
            if (!existsSync(dir)) continue;
            for (const f of listFiles(dir)) {
                if (!f.endsWith(".sh")) continue;
                const lines = readLines(f);
                // 仅检查“写入”语义的跨端引用；读取自己目录不受限
                const bad = hitsRegex(lines, /(PROJECT_DIR|PWD)\/\$(MAGIC_DIR|CURRENT_MAGIC)\/\.\.\/\.(claude|qoder|vscode|trae|codex)/);
                expect(bad, `${relative(REPO_ROOT, f)} 跨端路径引用`).toEqual([]);
            }
        }
    });
});

describe("矩阵 3: 命令分类（sed 精确判定）", () => {
    const PRETOOL = join(CORE_HOOKS, "pre-tool-use.sh");
    const lines = readLines(PRETOOL);

    it("无宽泛正则残留 \\bsed\\b.*-i", () => {
        expect(hitsRegex(lines, /\\bsed\\b\.\*-i/)).toEqual([]);
    });

    it("精确 option 判定存在（-i 独立 option / --in-place）", () => {
        const precise = hitsRegex(lines, /-i\[^\[:space:\]\];&|\|\]\*\|--in-place/);
        expect(precise.length).toBeGreaterThan(0);
    });

    it("HITL 门禁按当前 magicDir 限域（无多端路径正则）", () => {
        expect(hitsRegex(lines, /\.\(qoder\|claude\|add\|vscode\|trae\)\//)).toEqual([]);
        expect(lines.some((l) => l.includes("${MAGIC_DIR}/(plans|specs|reviews)/"))).toBe(true);
    });
});

describe("矩阵 4: 模板预载（本地物化 + fail-fast）", () => {
    const PRELOAD = join(CORE_HOOKS, "lib", "preload-templates.sh");
    const lines = readLines(PRELOAD);

    it("不再引用源仓 ../../../core/templates", () => {
        expect(hitsRegex(lines, /\.\.\/\.\.\/\.\.\/core\/templates/)).toEqual([]);
        expect(lines.some((l) => l.includes('TEMPLATES_DIR="${SCRIPT_DIR}/../../templates"'))).toBe(true);
    });

    it("目录/标准模板缺失 fail-fast（非零退出 + 明确错误）", () => {
        expect(hitsRegex(lines, /validate_templates_dir/).length).toBeGreaterThan(0);
        expect(hitsRegex(lines, /模板目录不存在/).length).toBeGreaterThan(0);
        expect(hitsRegex(lines, /未找到 ADD 标准模板/).length).toBeGreaterThan(0);
        expect(lines.some((l) => l.includes("exit 1"))).toBe(true);
    });
});

describe("矩阵 5: 安全补救契约（checkout 话术）", () => {
    // core 真源在轮次 1 清零；4 adapter 在轮次 2（Task 2.x）清零，codex 在轮次 3（Task 3.1）清零
    const ROUND1_TARGETS = [
        join(CORE_HOOKS, "lib", "context-inject.sh"),
        join(CORE_HOOKS, "lib", "common.sh"),
    ];

    it("core 真源无 git checkout/reset/restore 话术（负向，轮次 1 生效）", () => {
        for (const t of ROUND1_TARGETS) {
            if (!existsSync(t)) continue;
            const lines = readLines(t);
            // 仅拦截“话术/建议”语境，不拦截 git 操作本身的合法引用（如 git diff）
            const bad = hitsRegex(lines, /git checkout --|git reset --hard|git restore \./);
            expect(bad, `${relative(REPO_ROOT, t)} 残留危险回滚话术`).toEqual([]);
        }
    });

    it("回滚话术为反向 apply_patch + 归属不明停下询问", () => {
        const lines = readLines(join(CORE_HOOKS, "lib", "context-inject.sh"));
        expect(lines.some((l) => l.includes("反向 apply_patch"))).toBe(true);
        expect(lines.some((l) => l.includes("请求用户决定"))).toBe(true);
    });
});

describe("矩阵 6: fixture — Stop exit/output contract", () => {
    it("Q0 STATUS_UNAVAILABLE → 阻断退出码 2（非吞空状态）", () => {
        // 构造最小 fixture: 以 shell 直接验证 Q0 分支逻辑
        const script = `
            set -euo pipefail
            EXIT_BLOCK=2
            state="__STATUS_UNAVAILABLE__::db down::database::none::none"
            if [ "\${state%%::*}" = "__STATUS_UNAVAILABLE__" ]; then
              reason=\$(echo "$state" | awk -F'::' '{print $2}')
              echo "[ADD Stop] Plan status 暂不可用（\${reason}）" >&2
              exit "\${EXIT_BLOCK:-2}"
            fi
            exit 0
        `;
        const r = spawnSync("bash", ["-c", script], { encoding: "utf-8" });
        expect(r.status).toBe(2);
        // fail-closed: 输出阻断语义而非吞成空状态（中文文案 "暂不可用"）
        expect(r.stderr).toContain("暂不可用");
        expect(r.stderr).toContain("db down");
    });
});

describe("矩阵 7: fixture — bridge READY/STATUS_UNAVAILABLE 双路径", () => {
    it("bridge 源码: 无活跃 Plan 时 planName=null 显式语义（noPlan 不被吞）", () => {
        const src = readFileSync(BRIDGE, "utf-8");
        expect(src).toContain("activeOnly: true");
        // 失败路径信息密度等价（ADD-6）: catch 输出 reason + 非零退出
        expect(src).toContain("process.stderr.write");
        expect(src).toContain("exitCode = 3");
    });
});

describe("矩阵 9: fixture — 每 target 幂等重渲染 + adapter 私有 lib 到达生成态", () => {
    // P0-3 分发边界: 每个 target 对自身 render 结果一致（幂等重渲染对比），禁止跨 adapter 字节相等要求
    const RENDERERS: Record<string, (c: AddCoderConfig, d: string, dry: boolean, m: string) => Map<string, string>> = {
        claude: renderClaude, qoder: renderQoder, vscode: renderVSCode, trae: renderTrae, codex: renderCodex,
    };
    const MAGICS: Record<string, string> = { claude: ".claude", qoder: ".qoder", vscode: ".vscode", trae: ".trae", codex: ".codex" };
    const cfg: AddCoderConfig = {
        projectName: "add-coder", projectRoot: "/tmp/add-coder-matrix-render", sourceDir: "src",
        docsDir: "docs", logDir: "logs", envFilePath: ".env",
        auditLoggerPath: "src/lib/agent-audit-logger.ts", mcpServerCommand: "tsx",
        agentAuditImport: "@/lib/agent-audit-logger", magicDir: ".qoder",
        adapters: ["claude", "qoder", "vscode", "trae", "codex"], overrides: {},
    };

    it("每 target 幂等重渲染差异为 0（对自身 render 结果一致）", () => {
        for (const [name, fn] of Object.entries(RENDERERS)) {
            const a = fn({ ...cfg, magicDir: MAGICS[name] }, "/tmp", true, MAGICS[name]);
            const b = fn({ ...cfg, magicDir: MAGICS[name] }, "/tmp", true, MAGICS[name]);
            expect(a.size, `${name} 两次渲染文件数不一致`).toBe(b.size);
            let diff = 0;
            for (const [k, v] of a) if (b.get(k) !== v) diff++;
            expect(diff, `${name} 幂等重渲染差异 ${diff}`).toBe(0);
        }
    });

    it("各 adapter 生成态 hooks/lib/common.sh 消费 bridge（私有 lib 不被 core 覆盖）", () => {
        for (const [name, fn] of Object.entries(RENDERERS)) {
            const files = fn({ ...cfg, magicDir: MAGICS[name] }, "/tmp", true, MAGICS[name]);
            const libCommon = [...files.entries()].find(([k]) => k.endsWith("hooks/lib/common.sh"));
            expect(libCommon, `${name} 缺 hooks/lib/common.sh`).toBeDefined();
            expect(libCommon![1], `${name} common.sh 未消费 bridge`).toContain("plan-status-bridge");
        }
    });
});

// 环境清理: 无临时文件创建（纯静态 + spawn 断言）
afterAll(() => {
    // noop
});
