/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-09 08:56:25
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-16 10:19:34
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/src/cli/detect.ts
 * @Description  : IDE嗅探
 */
import { detectIDE as strategyFn } from "../caijuehub/strategies/detect.strategy";
import { resolveAdapters as adapterFn } from "../caijuehub/strategies/adapter.strategy";
import type { Adapter } from "../config/schema";

export function detectIDE(projectRoot: string): Adapter | "auto" {
    return strategyFn(projectRoot) as Adapter | "auto";
}

export function resolveAdapters(target: Adapter): Adapter[] {
    return adapterFn(target) as Adapter[];
}