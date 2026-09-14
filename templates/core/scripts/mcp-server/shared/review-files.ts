/*
 * 审查文档命名识别（纯函数；2026-09-14 从 tools/review.ts 抽出）
 *
 * 抽出原因：① 纯函数不该和 prisma/工具注册绑在一起（拖进来就要求 DB 依赖，测试得打 mock）；
 * ② 仓库里并存两套命名，识别规则需要被用例直接钉住：
 *    - `{planPrefix}-review-v1.md`（历史）
 *    - `{planPrefix}-plan-v1-review.md`（create_hitl 的占位路径落点／现行）
 *    旧匹配要求包含 `-review-`（review 后必须紧跟连字符），会把后一整类漏掉。
 */
import { basename } from "path"

/** 从文件列表里挑出审查文档（.md 且文件名含 review，大小写不敏感） */
export function pickReviewFiles(files: readonly string[]): string[] {
  return files.filter((f) => f.endsWith(".md") && basename(f).toLowerCase().includes("review"))
}

/** 从审查文件名推导 planName 前缀（两种命名都要剥干净） */
export function derivePlanNameFromReviewFile(file: string): string {
  return basename(file, ".md")
    .replace(/-review-(implementation|runtime).*$/, "") // 变体后缀
    .replace(/-review.*$/, "")                          // 普通 review 后缀（含 -review-v1 / -review）
}
