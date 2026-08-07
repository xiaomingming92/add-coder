/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-07
 * Description  : 跨平台子进程统一封装（issue #10 P0-1 完整根因修复）
 *                Windows 下 npm/npx/pnpm/git 均为 .cmd 批处理，spawnSync 直接
 *                调用返回 ENOENT（status=null）→ 统一解析 .cmd + 显式抛错。
 *                本项目所有子进程调用 MUST 走 runCommand 单入口（规范文档强制）。
 */
import { spawnSync } from "child_process";

export interface RunCommandOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeout?: number;
    /** 强制走 shell（默认 false；仅内部构造参数时允许，禁止传用户输入） */
    shell?: boolean;
    /** 平台注入（测试用；默认 process.platform） */
    platform?: NodeJS.Platform;
    /** stdio 透传（如 "inherit" 实时显示输出；默认无 input 时 ignore/pipe/pipe 捕获） */
    stdio?: "inherit";
}

export interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/** Windows 下为 .cmd 批处理的可执行族（CreateProcess 无法直接执行） */
const CMD_EXTENSIONS = ["npm", "npx", "pnpm", "git"];

/**
 * 跨平台同步执行命令。
 * - win32 且命令在 CMD_EXTENSIONS 中 → 显式追加 .cmd（比 shell:true 更可控，无引号注入面）
 * - 命令不存在（ENOENT）→ 抛"命令不可用: {cmd}（平台: ...）"，不再静默 status=null
 * - 返回 status（可能为 null，由调用方按失败处理）
 */
export function runCommand(cmd: string, args: string[], opts: RunCommandOptions = {}): RunResult {
    const platform = opts.platform ?? process.platform;
    const needsCmdExt = platform === "win32" && CMD_EXTENSIONS.includes(cmd) && !opts.shell;
    const effectiveCmd = needsCmdExt ? `${cmd}.cmd` : cmd;
    const r = spawnSync(effectiveCmd, args, {
        cwd: opts.cwd,
        env: opts.env,
        input: opts.input,
        timeout: opts.timeout,
        encoding: "utf-8",
        shell: opts.shell,
        stdio: opts.stdio ?? (opts.input !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]),
    });
    if (r.error) {
        throw new Error(`命令不可用: ${cmd}（平台: ${platform}，${r.error.message}）`);
    }
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * 跨平台命令存在性探测。
 * win32 用 where（which 在 Windows 不存在，issue #10 已知边界），POSIX 用 which。
 */
export function commandExists(cmd: string, platform?: NodeJS.Platform): boolean {
    const p = platform ?? process.platform;
    const probe = p === "win32" ? "where" : "which";
    const r = spawnSync(probe, [cmd], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return !r.error && r.status === 0;
}
