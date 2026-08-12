// 类型定义：产线条目 / 规则数据 / 生成器签名
export interface CaijueEntry {
  id: string;
  type: string;
  description: string;
  rules: string;
  implementation: string;
  // 产线声明式（Task 1.3）：type 产线类型 / approval 审批口子 / export_name+fields 字段表
  approval?: string;
  line_type?: string;
  export_name?: string;
  fields?: [string, string, string, string][];
}
export interface CaijueIndex { caijue: CaijueEntry[]; }
export type TomlData = Record<string, unknown>;
export type RuleGenerator = (rules: TomlData) => string;
export type FieldSpec = [tsField: string, section: string, tomlKey: string, type: "num" | "arr" | "str"];
