import { detectIDE as strategyFn } from "../caijuehub/strategies/detect.strategy";
import { resolveAdapters as adapterFn } from "../caijuehub/strategies/adapter.strategy";
import type { Adapter } from "../config/schema";

export function detectIDE(projectRoot: string): Adapter {
    return strategyFn(projectRoot) as Adapter;
}

export function resolveAdapters(target: Adapter): Adapter[] {
    return adapterFn(target) as Adapter[];
}