import { parse } from "smol-toml";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CaijueEntry {
    id: string;
    type: string;
    description: string;
    status: string;
    implementation: string;
    inputs?: string[];
    outputs?: string[];
}

export interface CaijueIndex {
    caijue: CaijueEntry[];
}

export function loadCaijue(): CaijueIndex {
    const builtinPath = join(__dirname, "caijue.toml");
    const builtinToml = readFileSync(builtinPath, "utf-8");
    return parse(builtinToml) as unknown as CaijueIndex;
}