import { createInterface } from "readline";
import { existsSync } from "fs";
import { resolve } from "path";

export function ask(q: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((r) => { rl.question(q, (a) => { rl.close(); r(a.trim().toLowerCase()); }); });
}

export function detectPm(projectRoot: string): "pnpm" | "npm" {
    return existsSync(resolve(projectRoot, "pnpm-lock.yaml")) ? "pnpm" : "npm";
}
