/*
 * 路径解析统一层（供应链工厂化轮次 3 治本基座）
 * 目标：全项目路径嗅探点收敛——项目根/配置目录只在此处解析一次
 * 原则：
 *   - magicDir 真源 = caijuehub 产线（adapter-rules.toml [magic_path] → 生成 MAGIC_DIR_MAP），
 *     本层消费产出，绝不写候选列表/hardcode
 *   - projectRoot 用 find-up 包（sindresorhus 维护）「magicDir 锚点向上查找」——层级变动零漂移
 *   - here() 用 Node 22 原生 import.meta.dirname——无 fileURLToPath 样板
 */
import { findUpSync } from "find-up";
import { join, dirname } from "path";
import { MAGIC_DIR_MAP } from "../caijuehub/strategies/adapter.strategy.js";
import { detectIDE } from "../cli/detect.js";

export { MAGIC_DIR_MAP };

/** 分发 mirror 目录（.add 为固定分发目标，与 sync-magic-rules.toml MAGIC_DIRS 同源约定） */
export const ADD_DIR = ".add";

/** 指定 adapter 的 magicDir（消费 caijuehub 真源，替代各命令重复定义） */
export function magicDirFor(adapter: string): string {
  const m = MAGIC_DIR_MAP[adapter];
  if (!m) throw new Error(`未知 adapter: ${adapter}`);
  return m;
}

/** 当前文件所在目录（Node 22 原生，ESM 兼容） */
export function here(): string {
  return import.meta.dirname;
}

/** magicDir 配置源：env 优先 → 当前 IDE（detectIDE）对应 → 探测遍历 → 兜底 */
export function resolveMagicDir(cwd?: string): string {
  const fromEnv = process.env.MAGIC_DIR;
  if (fromEnv) return fromEnv;
  const base = cwd ?? here();
  // 当前 IDE 对应的 magicDir 优先（消费 caijuehub 产线真源 MAGIC_DIR_MAP，不写候选列表）
  const ide = detectIDE(base) as string;
  if (ide !== "auto") {
    const m = MAGIC_DIR_MAP[ide];
    if (m && findUpSync(m, { cwd: base, type: "directory" })) return m;
  }
  // 探测遍历（无 IDE 环境兜底）
  for (const magic of Object.values(MAGIC_DIR_MAP)) {
    const hit = findUpSync(magic, { cwd: base, type: "directory" });
    if (hit) return magic;
  }
  return MAGIC_DIR_MAP.qoder; // 兜底（与 sync 分发默认一致）
}

/** 项目根：以 magicDir 为锚点向上查找（find-up 包，层级零漂移；返回锚点所在项目根） */
export function projectRoot(cwd?: string): string | null {
  const magic = resolveMagicDir(cwd);
  const hit = findUpSync(magic, { cwd: cwd ?? here(), type: "directory" });
  return hit ? dirname(hit) : null;
}

/** 便捷：项目根 + magicDir 组合路径 */
export function magicPath(...segments: string[]): string | null {
  const root = projectRoot();
  if (!root) return null;
  return join(root, resolveMagicDir(), ...segments);
}

/** 便捷：项目根 + 相对路径 */
export function projectPath(...segments: string[]): string | null {
  const root = projectRoot();
  if (!root) return null;
  return join(root, ...segments);
}
