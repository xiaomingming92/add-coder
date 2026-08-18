/**
 * DPS spec 引用解析：从 Plan 头提取 Spec 路径（五端 magic 目录白名单）。
 * 供 check_dps 与单测共用；纯函数，无 IO / 无 env 依赖。
 */
const SPEC_REF_RE =
  /Spec[:|\s`]+\.?(qoder|claude|add|vscode|codex|trae)\/specs\/([^/`\s]+)/;

export interface SpecRef {
  magicDir: string;
  specDir: string;
}

export function extractSpecRef(planContent: string): SpecRef | null {
  const m = planContent.match(SPEC_REF_RE);
  if (!m) return null;
  return { magicDir: m[1], specDir: m[2] };
}
