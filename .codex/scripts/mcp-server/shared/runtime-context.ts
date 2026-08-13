import { createHash } from "crypto"
import { realpathSync } from "fs"
import { isAbsolute, relative, resolve } from "path"

export const ADAPTER_MAGIC_DIR = Object.freeze({
  add: ".add",
  claude: ".claude",
  codex: ".codex",
  qoder: ".qoder",
  trae: ".trae",
  vscode: ".vscode",
} as const)

export type AdapterKey = keyof typeof ADAPTER_MAGIC_DIR
export type AdapterMagicDir = (typeof ADAPTER_MAGIC_DIR)[AdapterKey]

export interface RuntimeContextKey {
  projectKey: string
  adapterKey: AdapterKey
  projectRoot: string
  magicDir: AdapterMagicDir
  contextId: string
}

const MAGIC_DIR_ADAPTER = new Map<AdapterMagicDir, AdapterKey>(
  Object.entries(ADAPTER_MAGIC_DIR).map(([adapterKey, magicDir]) => [magicDir, adapterKey as AdapterKey]),
)

export function adapterKeyFromMagicDir(magicDir: string): AdapterKey {
  const adapterKey = MAGIC_DIR_ADAPTER.get(magicDir as AdapterMagicDir)
  if (!adapterKey) {
    throw new Error(`未知 ADD adapter magicDir: ${magicDir}`)
  }
  return adapterKey
}

export function canonicalProjectRoot(projectRoot: string): string {
  if (!projectRoot.trim()) throw new Error("PROJECT_ROOT 不能为空")
  return realpathSync.native(resolve(projectRoot))
}

export function projectKeyFromRoot(projectRoot: string): string {
  const canonicalRoot = canonicalProjectRoot(projectRoot)
  return createHash("sha256").update(`add-project\0${canonicalRoot}`).digest("hex")
}

export function createRuntimeContext(projectRoot: string, magicDir: string): Readonly<RuntimeContextKey> {
  const adapterKey = adapterKeyFromMagicDir(magicDir)
  const canonicalRoot = canonicalProjectRoot(projectRoot)
  const projectKey = projectKeyFromRoot(canonicalRoot)
  return Object.freeze({
    projectKey,
    adapterKey,
    projectRoot: canonicalRoot,
    magicDir: ADAPTER_MAGIC_DIR[adapterKey],
    contextId: `${projectKey}:${adapterKey}`,
  })
}

export function runtimeScopeRoot(context: RuntimeContextKey): string {
  return resolve(context.projectRoot, context.magicDir)
}

export function isPathInRuntimeScope(context: RuntimeContextKey, candidatePath: string): boolean {
  const scopeRoot = runtimeScopeRoot(context)
  const absoluteCandidate = isAbsolute(candidatePath) ? resolve(candidatePath) : resolve(context.projectRoot, candidatePath)
  const scopedRelative = relative(scopeRoot, absoluteCandidate)
  return scopedRelative === "" || (!scopedRelative.startsWith("..") && !isAbsolute(scopedRelative))
}

export function assertPathInRuntimeScope(context: RuntimeContextKey, candidatePath: string): string {
  const absoluteCandidate = isAbsolute(candidatePath) ? resolve(candidatePath) : resolve(context.projectRoot, candidatePath)
  if (!isPathInRuntimeScope(context, absoluteCandidate)) {
    throw new Error(`路径越出当前 ADD adapter scope: ${absoluteCandidate}（scope=${runtimeScopeRoot(context)}）`)
  }
  return absoluteCandidate
}
