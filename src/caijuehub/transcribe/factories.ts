import type { TomlData, RuleGenerator } from "./types.js";
import { createReader } from "./reader.js";
// 参数化转换工位 + JSON 工厂
export type FieldSpec = [tsField: string, section: string, tomlKey: string, type: "num" | "arr" | "str"];
export function createTsConstGenerator(opts: {
  source: string;
  exportName: string;
  fields: FieldSpec[];
}): RuleGenerator {
  return (rules: TomlData): string => {
    const d = rules as Record<string, Record<string, unknown>>;
    const r = createReader(opts.source, d);
    const lines = opts.fields.map(([ts, section, key, type]) => {
      const v = type === "arr"
        ? `[${r.arr<number>(section, key).join(", ")}]`
        : type === "num"
          ? r.num(section, key)
          : `"${r.str(section, key)}"`;
      return `    ${ts}: ${v},`;
    });
    return `export const ${opts.exportName} = {\n${lines.join("\n")}\n} as const;`;
  };
}

export function genGuardSchema(templateKey: string): RuleGenerator {
  return (rules: unknown): string => {
    const tpl = (rules as Record<string, any>)?.guard_templates?.[templateKey];
    if (!tpl) throw new Error(`guard-rules.toml: guard_templates.${templateKey} 未配置`);
    const sections = (tpl.sections || []).map((s: Record<string, any>) => {
      const out: Record<string, unknown> = { id: s.id, required: s.required ?? false };
      for (const k of ["heading", "anchor", "within", "pattern", "description"]) {
        if (s[k]) out[k] = s[k];
      }
      if (Array.isArray(s.subsections) && s.subsections.length) out.subsections = s.subsections;
      return out;
    });
    const json: Record<string, unknown> = {
      _generated: true,
      _generated_source: "guard-rules.toml",
      template: tpl.template,
      sections,
    };
    if (Array.isArray(tpl.shared_by) && tpl.shared_by.length) json.shared_by = tpl.shared_by;
    if (tpl.placeholders?.items) json.placeholders = tpl.placeholders.items;
    if (tpl.forbidden_terms?.terms) json.forbidden_terms = tpl.forbidden_terms.terms;
    if (tpl.forbidden_terms_note) json.forbidden_terms_note = tpl.forbidden_terms_note;
    return JSON.stringify(json, null, 4);
  };
}
