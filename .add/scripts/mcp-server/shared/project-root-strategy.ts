// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const PROJECT_ROOT_PRIORITY = ["env_var", "dirname_fallback", "cwd_fallback"] as const;
export type ProjectRootTier = (typeof PROJECT_ROOT_PRIORITY)[number];
// <<< CAIJUE GENERATED END <<<
// >>> USER CODE >>>
import { resolve, dirname } from "path"
import { existsSync } from "fs"

function findProjectRoot(fromDir: string): string {
  let d = resolve(fromDir)
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(d, "package.json"))) return d
    const parent = dirname(d)
    if (parent === d) break
    d = parent
  }
  return resolve(fromDir, "..", "..", "..", "..")
}

/** 裁决层消费：按 PROJECT_ROOT_PRIORITY 顺序逐层尝试。 */
export function resolveProjectRoot(__dirname: string): string {
  const resolvers: Record<string, () => string> = {
    env_var:          () => process.env.PROJECT_ROOT || "",
    dirname_fallback: () => resolve(__dirname, "..", "..", "..", ".."),
    cwd_fallback:     () => findProjectRoot(process.cwd()),
  }
  for (const tier of PROJECT_ROOT_PRIORITY) {
    const r = resolvers[tier]?.()
    if (r && r !== "/" && existsSync(resolve(r, ".env.development"))) return r
  }
  return resolve(__dirname, "..", "..", "..", "..")
}
// <<< USER CODE <<<
