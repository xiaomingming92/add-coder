import { createInterface } from "readline";

export function ask(q: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((r) => { rl.question(q, (a) => { rl.close(); r(a.trim().toLowerCase()); }); });
}
