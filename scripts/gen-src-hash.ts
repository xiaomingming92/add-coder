import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { createHash } from "crypto";
import { resolve, relative, join } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const TEMPLATES = join(ROOT, "templates");
if (!existsSync(TEMPLATES)) { console.error("templates/ not found"); process.exit(1); }

function walk(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) files.push(...walk(full));
        else files.push(full);
    }
    return files;
}

const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

const hashMap: Record<string, string> = {};
hashMap["_version"] = PKG.version;
for (const abs of walk(TEMPLATES)) {
    const rel = relative(TEMPLATES, abs);
    if (rel === ".add-coder-src-hash.json") continue;
    hashMap[rel] = createHash("sha256").update(readFileSync(abs, "utf-8")).digest("hex").slice(0, 8);
}

const out = join(TEMPLATES, ".add-coder-src-hash.json");
writeFileSync(out, JSON.stringify(hashMap, null, 2) + "\n", "utf-8");
console.log("gen-src-hash:", Object.keys(hashMap).length, "files");