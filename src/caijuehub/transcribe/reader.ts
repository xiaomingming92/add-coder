// 共享质检工位：统一校验（缺键/类型，错误带料号）
// ── 共享质检工位（供应链工厂化 Task 1.1：统一校验，错误带料号）──
export type Reader = {
  required: (section: string, key: string) => unknown;
  arr: <T = unknown>(section: string, key: string) => T[];
  num: (section: string, key: string) => number;
  str: (section: string, key: string) => string;
};

export function createReader(source: string, d: Record<string, Record<string, unknown>>): Reader {
  const required = (section: string, key: string) => {
    const v = d[section]?.[key];
    if (v === undefined) throw new Error(`${source}: [${section}] ${key} 未配置`);
    return v;
  };
  return {
    required,
    arr: <T = unknown>(section: string, key: string) => {
      const v = required(section, key);
      if (!Array.isArray(v)) throw new Error(`${source}: [${section}] ${key} 必须是数组`);
      return v as T[];
    },
    num: (section, key) => {
      const v = required(section, key);
      if (typeof v !== "number") throw new Error(`${source}: [${section}] ${key} 必须是数字`);
      return v;
    },
    str: (section, key) => {
      const v = required(section, key);
      if (typeof v !== "string") throw new Error(`${source}: [${section}] ${key} 必须是字符串`);
      return v;
    },
  };
}
