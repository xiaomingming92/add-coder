import { detectIDE as strategyFn } from "../caijuehub/strategies/detect.strategy";
import { resolveAdapters as adapterFn } from "../caijuehub/strategies/adapter.strategy";
import type { Adapter } from "../config/schema";

export function detectIDE(projectRoot: string): Adapter | "auto" {
    return strategyFn(projectRoot) as Adapter | "auto";
}

export function resolveAdapters(target: Adapter): Adapter[] {
    return adapterFn(target) as Adapter[];
}