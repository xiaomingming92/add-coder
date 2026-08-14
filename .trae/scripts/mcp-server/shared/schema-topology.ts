import { readdir, readFile } from "fs/promises"
import { basename, join, relative } from "path"

export type SchemaView = "business" | "add" | "all"
export type SchemaTopologyMode = "single" | "split"
export type SchemaBoundary = "shared" | "business" | "add"

export interface PrismaDeclaration {
  kind: "model" | "enum"
  name: string
  sourcePath: string
  sourceFile: string
  boundary: SchemaBoundary
  body: string
  fieldCount: number
}

export interface PrismaSchemaFile {
  path: string
  file: string
  boundary: SchemaBoundary
  declarations: PrismaDeclaration[]
}

export interface PrismaSchemaTopology {
  mode: SchemaTopologyMode
  view: SchemaView
  schemaRoot: string
  files: PrismaSchemaFile[]
  models: PrismaDeclaration[]
  enums: PrismaDeclaration[]
}

function extractBlock(source: string, braceIndex: number): string {
  let depth = 1
  let cursor = braceIndex + 1
  while (depth > 0 && cursor < source.length) {
    if (source[cursor] === "{") depth += 1
    if (source[cursor] === "}") depth -= 1
    cursor += 1
  }
  if (depth !== 0) throw new Error("Prisma declaration 花括号未闭合")
  return source.slice(braceIndex, cursor)
}

export function parsePrismaDeclarations(
  source: string,
  sourcePath: string,
  boundary: SchemaBoundary,
): PrismaDeclaration[] {
  const declarations: PrismaDeclaration[] = []
  const declarationRegex = /^\s*(model|enum)\s+(\w+)\s*\{/gm
  let match: RegExpExecArray | null
  while ((match = declarationRegex.exec(source)) !== null) {
    const braceIndex = source.indexOf("{", match.index)
    const body = extractBlock(source, braceIndex)
    const kind = match[1] as "model" | "enum"
    declarations.push({
      kind,
      name: match[2],
      sourcePath,
      sourceFile: basename(sourcePath),
      boundary,
      body,
      fieldCount: kind === "model"
        ? body.split("\n").filter(line => {
            const trimmed = line.trim()
            return trimmed.length > 0 && trimmed !== "{" && trimmed !== "}" && !trimmed.startsWith("//") && !trimmed.startsWith("@@")
          }).length
        : 0,
    })
  }
  return declarations
}

function boundaryFor(file: string, mode: SchemaTopologyMode): SchemaBoundary {
  if (mode === "single") return "shared"
  return file === "add.prisma" ? "add" : "business"
}

function includedInView(file: string, view: SchemaView): boolean {
  if (view === "all") return true
  return view === "add" ? file === "add.prisma" : file !== "add.prisma"
}

export async function loadPrismaSchemaTopology(input: {
  projectRoot: string
  splitDatabase: boolean
  view?: SchemaView
}): Promise<PrismaSchemaTopology> {
  const schemaRoot = join(input.projectRoot, "prisma")
  const mode: SchemaTopologyMode = input.splitDatabase ? "split" : "single"
  const view = input.view ?? "all"
  let names: string[]
  try {
    names = (await readdir(schemaRoot)).filter(file => file.endsWith(".prisma")).sort()
  } catch {
    throw new Error(`未找到 Prisma schema 目录: ${schemaRoot}`)
  }
  if (names.length === 0) throw new Error(`Prisma schema 目录中没有 *.prisma: ${schemaRoot}`)

  const selected = names.filter(file => includedInView(file, view))
  if (selected.length === 0) {
    throw new Error(`Schema view=${view} 没有可扫描文件；mode=${mode}；全部文件=${names.join(", ")}`)
  }
  const files: PrismaSchemaFile[] = []
  for (const file of selected) {
    const path = join(schemaRoot, file)
    const boundary = boundaryFor(file, mode)
    const source = await readFile(path, "utf8")
    files.push({ path, file, boundary, declarations: parsePrismaDeclarations(source, path, boundary) })
  }
  const declarations = files.flatMap(file => file.declarations)
  const models = declarations.filter(item => item.kind === "model")
  const enums = declarations.filter(item => item.kind === "enum")
  if (models.length === 0) {
    throw new Error(
      `Schema 诊断: 检测到 ${files.length} 个 Prisma 文件但 view=${view} 解析为 0 个模型；` +
      `mode=${mode}；扫描=${files.map(file => relative(input.projectRoot, file.path)).join(", ")}`,
    )
  }

  const byName = new Map<string, PrismaDeclaration[]>()
  for (const model of models) {
    const key = model.name.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), model])
  }
  const conflicts = [...byName.entries()].filter(([, entries]) => entries.length > 1)
  if (conflicts.length > 0) {
    const details = conflicts.map(([name, entries]) =>
      `${name}: ${entries.map(entry => `${relative(input.projectRoot, entry.sourcePath)}[${entry.boundary}]`).join(", ")}`,
    )
    throw new Error(`Schema 模型冲突（fail closed）: ${details.join("; ")}`)
  }

  return { mode, view, schemaRoot, files, models, enums }
}

export function formatSchemaTopology(topology: PrismaSchemaTopology, projectRoot: string): string {
  const lines = [
    "=== Prisma Schema 拓扑 ===",
    `mode: ${topology.mode}`,
    `view: ${topology.view}`,
    `databaseBoundaries: ${topology.mode === "single" ? "shared (business + ADD 同库)" : "business, add (分库；all 仅汇总展示，不代表可跨库 join)"}`,
    `scannedFiles: ${topology.files.length}`,
  ]
  for (const file of topology.files) {
    lines.push(`  - ${relative(projectRoot, file.path)} [${file.boundary}] models=${file.declarations.filter(item => item.kind === "model").length}`)
  }
  lines.push("", `模型 (${topology.models.length} 个):`)
  for (const model of topology.models) {
    lines.push(`  ${model.name} (${model.fieldCount} 字段) — ${relative(projectRoot, model.sourcePath)} [${model.boundary}]`)
  }
  if (topology.enums.length > 0) {
    lines.push("", `枚举 (${topology.enums.length} 个):`)
    for (const item of topology.enums) lines.push(`  ${item.name} — ${relative(projectRoot, item.sourcePath)} [${item.boundary}]`)
  }
  return lines.join("\n")
}
