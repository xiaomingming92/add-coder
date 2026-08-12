// 出厂质检自动化（Task 2.1）：generate 后自动幂等校验——产物二次生成 diff 为空
// 运行: npm run generate:check
import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const PROD_DIRS = [
  "src/caijuehub/strategies",
  "templates/core/scripts/mcp-server/shared",
  "templates/core/templates",
];

function collect(): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of PROD_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    const entries = readdirRecursive(abs);
    for (const f of entries) {
      if (!f.endsWith(".strategy.ts") && !f.endsWith(".schema.json")) continue;
      const p = join(abs, f);
      out.set(p, createHash("sha256").update(readFileSync(p)).digest("hex"));
    }
  }
  return out;
}

function readdirRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...readdirRecursive(p));
    else out.push(p.replace(dir + "/", ""));
  }
  return out;
}

// 1. 首次 generate（或复用已有产物做基线）
execSync("npm run generate", { stdio: "inherit" });
const before = collect();

// 2. 二次 generate
execSync("npm run generate", { stdio: "inherit" });
const after = collect();

// 3. 对比（幂等：hash 全一致）
let pass = true;
const keys = new Set([...before.keys(), ...after.keys()]);
for (const k of keys) {
  if (before.get(k) !== after.get(k)) {
    pass = false;
    console.log(`✗ 产物不稳定: ${k.replace(ROOT + "/", "")}`);
  }
}
if (keys.size === 0) {
  console.log("⚠️ 未收集到产物（路径检查）");
  process.exit(1);
}
console.log(pass
  ? `✅ 出厂质检通过：${keys.size} 个产物幂等（二次 generate diff 为空）`
  : "⛔ 出厂质检失败：产物不稳定，阻止分发");
process.exit(pass ? 0 : 1);
