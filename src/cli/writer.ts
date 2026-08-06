import { writeFiles as strategyFn } from "../caijuehub/strategies/writer.strategy";
import { SYNC_PRISMA_CONFIG } from "../caijuehub/strategies/prisma-sync.strategy";
import { existsSync, readFileSync } from "fs";

export interface WriteOptions { yes?: boolean; force?: boolean; dryRun?: boolean; }

export async function writeFiles(
    projectRoot: string,
    files: Map<string, string>,
    options: WriteOptions = {},
): Promise<{ created: number; skipped: number; overwritten: number }> {
    return strategyFn(projectRoot, files, options);
}

// ═══════════════ Prisma schema diff ═══════════════

export interface FieldConflict {
    fieldName: string;
    baseDef: string;
    targetDef: string;
}

export interface FieldDiff {
    type: string;
    name: string;
    /** 同名字段、定义不同 → 冲突 */
    conflicts: FieldConflict[];
    /** 基准有、消费方无 → 可补充 */
    missingFields: string[];
    /** 消费方特有 → 忽略 */
    extraFields: string[];
}

export interface PrismaDiffResult {
    hasDiff: boolean;
    baseSchema: string;
    targetPath: string;
    missing: { type: string; name: string; body: string; fields: string[] }[];
    fieldDiffs: FieldDiff[];
}

export interface SchemaBlock {
  type: "model" | "enum";
  name: string;
  /** 完整块原文（含注释行），供 injectMissingModels 原样注入 */
  body: string;
  /** model: "fieldName:fieldType"；enum: 值行（trim 后） */
  fields: string[];
}

/**
 * 解析 Prisma schema 提取 model/enum 定义块（包括整个 block 原文）。
 * 行级扫描实现：剥离行内 `//` 注释后做括号深度计数，
 * 避免注释中的 `{`/`}` 截断块边界（RPT-20260806-03）。
 */
export function parseSchemaBlocks(content: string): Map<string, SchemaBlock> {
  const blocks = new Map<string, SchemaBlock>();
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].match(/^(model|enum)\s+(\w+)\s*\{/);
    if (!head) {
      i++;
      continue;
    }
    const type = head[1] as "model" | "enum";
    const name = head[2];
    const bodyLines: string[] = [lines[i]];
    let depth = 1;
    let j = i + 1;
    while (j < lines.length && depth > 0) {
      const line = lines[j];
      bodyLines.push(line);
      // 剥离行内注释后再计数括号，避免 `// [{...}]` 中的括号干扰
      const commentless = line.split("//")[0];
      for (const ch of commentless) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      j++;
    }
    const body = bodyLines.join("\n");
    const inner = bodyLines.slice(1, -1).join("\n");
    let fields: string[] = [];
    if (type === "enum") {
      // enum 值：每行去掉注释（// 与 # 兼容）并 trim
      fields = inner.split("\n")
        .map((l) => l.replace(/\/\/.*$/, "").replace(/#.*$/, "").trim())
        .filter((l) => l.length > 0);
    } else {
      // model 字段：提取 fieldName fieldType 前缀
      const fieldRegex = /^\s*(\w+)\s+(\w+(?:\([^)]*\))?(?:\[\])?\??)/gm;
      let fm;
      while ((fm = fieldRegex.exec(inner)) !== null) {
        fields.push(`${fm[1]}:${fm[2]}`);
      }
    }
    blocks.set(`${type}:${name}`, { type, name, body, fields });
    i = j;
  }
  return blocks;
}

/**
 * diff Prisma schema：对比 add-coder 基准 vs 消费方目标。
 * 返回消费方缺失的 model/enum，不检测已有差异。
 */
export function diffPrisma(basePath: string, targetPath: string): PrismaDiffResult {
    const baseContent = existsSync(basePath) ? readFileSync(basePath, "utf-8") : "";
    const targetContent = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";

    if (!baseContent) return { hasDiff: false, baseSchema: basePath, targetPath, missing: [], fieldDiffs: [] };

    const baseBlocks = parseSchemaBlocks(baseContent);
    const targetBlocks = parseSchemaBlocks(targetContent);

    const missing: { type: string; name: string; body: string; fields: string[] }[] = [];
    const fieldDiffs: FieldDiff[] = [];
    const types = SYNC_PRISMA_CONFIG.SYNC_ITEMS;

    for (const [key, block] of baseBlocks) {
        if (!types.includes(block.type)) continue;

        if (!targetBlocks.has(key)) {
            missing.push(block);
        } else {
            const target = targetBlocks.get(key)!;

            // 按字段名比较
            const baseByName = new Map<string, string>();
            for (const f of block.fields) {
                const [name] = f.split(":");
                baseByName.set(name, f);
            }
            const targetByName = new Map<string, string>();
            for (const f of target.fields) {
                const [name] = f.split(":");
                targetByName.set(name, f);
            }

            const conflicts: FieldConflict[] = [];
            const missingFields: string[] = [];
            const extraFields: string[] = [];

            for (const [name, baseDef] of baseByName) {
                if (targetByName.has(name)) {
                    const targetDef = targetByName.get(name)!;
                    if (baseDef !== targetDef) {
                        conflicts.push({ fieldName: name, baseDef, targetDef });
                    }
                } else {
                    missingFields.push(baseDef);
                }
            }

            for (const [name, targetDef] of targetByName) {
                if (!baseByName.has(name)) {
                    extraFields.push(targetDef);
                }
            }

            if (conflicts.length > 0 || missingFields.length > 0 || extraFields.length > 0) {
                fieldDiffs.push({ type: block.type, name: block.name, conflicts, missingFields, extraFields });
            }
        }
    }

    const hasDiff = missing.length > 0 || fieldDiffs.length > 0;
    return { hasDiff, baseSchema: basePath, targetPath, missing, fieldDiffs };
}

/**
 * 格式化 diff 结果供 interactive 确认。
 */
export function formatPrismaDiff(result: PrismaDiffResult): string {
    if (!result.hasDiff) return "add.prisma 与消费方 schema 无差异。";
    const lines = [
        `${SYNC_PRISMA_CONFIG.PROMPT}`,
        ``,
        `基准: ${result.baseSchema}`,
        `目标: ${result.targetPath}`,
    ];
    if (result.missing.length > 0) {
        lines.push(``, `以下 ${result.missing.length} 项在消费方缺失:`);
        for (const m of result.missing) {
            const f = m.fields.length > 0 ? `(${m.fields.length} 字段)` : "";
            lines.push(`  + ${m.type} ${m.name} ${f}`);
        }
    }
    if (result.fieldDiffs.length > 0) {
        lines.push(``, `以下 ${result.fieldDiffs.length} 项存在字段差异:`);
        for (const d of result.fieldDiffs) {
            lines.push(`  Δ ${d.type} ${d.name}:`);
            for (const c of d.conflicts) {
                lines.push(`    ! ${c.fieldName}: 基准"${c.baseDef}" ≠ 消费方"${c.targetDef}"`);
            }
            for (const f of d.missingFields) {
                lines.push(`    + ${f} (基准有，消费方无)`);
            }
            for (const f of d.extraFields) {
                lines.push(`    - ${f} (消费方特有，忽略)`);
            }
        }
    }
    return lines.join("\n");
}