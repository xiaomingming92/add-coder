import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { parse } from "smol-toml";
import { findUpSync } from "find-up";
import { projectRoot } from "../../shared/paths.js";
import type { CaijueIndex, RuleGenerator, FieldSpec } from "./types.js";
import { HEADER, GENERATED_MARKER, GENERATED_END } from "./constants.js";
import { createTsConstGenerator } from "./factories.js";
import { GENERATORS } from "./generators/custom.js";
import { SHELL_GENERATORS } from "./generators/shell.js";

const __dirname = import.meta.dirname;
// transcribe 主循环（供应链工厂调度）
function readExistingUserCode(filePath: string): string {
    if (!existsSync(filePath)) return "";
    const content = readFileSync(filePath, "utf-8");
    const idx = content.indexOf(GENERATED_END);
    if (idx === -1) {
        // 没有 GENERATED 标记 → 整个文件视为 USER CODE
        return `\n// >>> USER CODE >>>\n${content}\n// <<< USER CODE <<<\n`;
    }
    // 提取 END 之后的内容 = 用户代码
    const after = content.substring(idx + GENERATED_END.length);
    // 提取已有的 USER CODE 区块
    const ucStart = after.indexOf("// >>> USER CODE >>>");
    if (ucStart === -1) return after.trim() ? `\n// >>> USER CODE >>>\n${after.trim()}\n// <<< USER CODE <<<\n` : "";
    return after.substring(ucStart);
}

export function transcribe(caijueDir?: string, outputRoot?: string) {
    // find-up 锚点（轮次 3）：caijue.toml 所在目录 = caijuehub；magicDir 向上 = 项目根——不手算层级
    const foundCaijue = findUpSync("caijue.toml", { cwd: __dirname, type: "file" });
    const baseDir = caijueDir || (foundCaijue ? dirname(foundCaijue) : __dirname);
    const outRoot = outputRoot || (projectRoot(baseDir) ?? join(baseDir, ".."));

    const caijuePath = join(baseDir, "caijue.toml");
    if (!existsSync(caijuePath)) {
        console.log("caijue.toml 不存在，跳过转录");
        return;
    }

    const index = parse(readFileSync(caijuePath, "utf-8")) as unknown as CaijueIndex;

    for (const entry of index.caijue) {
        const rulesPath = join(baseDir, entry.rules);
        if (!existsSync(rulesPath)) {
            console.log(`跳过 ${entry.id}: 规则文件 ${entry.rules} 不存在`);
            continue;
        }

        // 产线声明式（Task 1.3）：type 决定产线，登记即进线；approval 为审批口子（auto 放行）
        const lineType = entry.line_type ?? entry.type ?? "custom";
        const approval = entry.approval ?? "auto";
        const rules = parse(readFileSync(rulesPath, "utf-8"));

        let gen: RuleGenerator | undefined;
        let shellGen: RuleGenerator | undefined;
        let isJsonOut = false;
        if (lineType === "ts-const") {
            gen = createTsConstGenerator({
                source: entry.rules,
                exportName: entry.export_name ?? "CONFIG",
                fields: (entry.fields ?? []) as FieldSpec[],
            });
        } else if (lineType === "json") {
            gen = GENERATORS[entry.id];
            isJsonOut = true;
        } else if (lineType === "shell") {
            shellGen = SHELL_GENERATORS[entry.id];
        } else {
            gen = GENERATORS[entry.id];
        }

        if (!gen && !shellGen) { console.log(`跳过 ${entry.id}: 无生成器（type=${lineType}）`); continue; }

        // TS/JSON 策略生成（ts-const/json/custom 产线）
        if (gen) {
            const generated = isJsonOut
              ? `${gen(rules)}\n`
              : `${HEADER}${GENERATED_MARKER}\n${gen(rules)}\n${GENERATED_END}`;
            const outPath = join(outRoot, entry.implementation);
            const userCode = isJsonOut ? "" : readExistingUserCode(outPath);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, `${generated}${userCode}`, "utf-8");
            console.log(`生成 ${entry.implementation}（type=${lineType} approval=${approval}）`);
        }

        // Shell 配置生成（shell 产线）
        if (shellGen) {
            const shellContent = shellGen(rules);
            const shellOutPath = join(outRoot, entry.implementation);
            mkdirSync(dirname(shellOutPath), { recursive: true });
            writeFileSync(shellOutPath, shellContent, "utf-8");
            console.log(`生成 ${entry.implementation}（type=${lineType} approval=${approval}）`);
        }
    }
    // 出厂变更审计（Task 2.1 数据底座：规则/产物/审批状态）
    const audit = { ts: new Date().toISOString(), changed: index.caijue.map((e: CaijueIndex["caijue"][number]) => ({ rules: e.rules, implementation: e.implementation, approval: e.approval ?? "auto" })) };
    console.log(`变更审计: ${JSON.stringify(audit)}`);
}

if (process.argv[1] && (process.argv[1].endsWith("transcribe/index.ts") || process.argv[1].endsWith("transcribe/index.js") || process.argv[1].endsWith("transcribe.ts") || process.argv[1].endsWith("transcribe.js"))) {
    transcribe();
}
