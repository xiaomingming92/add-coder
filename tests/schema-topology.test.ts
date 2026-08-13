import { mkdtemp, mkdir, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, describe, expect, it } from "vitest"
import {
  formatSchemaTopology,
  loadPrismaSchemaTopology,
} from "../templates/core/scripts/mcp-server/shared/schema-topology.js"

const roots: string[] = []
async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "add-schema-topology-"))
  roots.push(root)
  await mkdir(join(root, "prisma"))
  for (const [file, content] of Object.entries(files)) await writeFile(join(root, "prisma", file), content)
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe("Prisma schema topology", () => {
  it("单库聚合整个 schema folder，入口 0 模型也能找到业务与 ADD 模型", async () => {
    const root = await project({
      "schema.prisma": 'generator client { provider = "prisma-client" }\ndatasource db { provider = "postgresql" }\n',
      "main.prisma": "model Farm {\n  id String @id\n}\n",
      "add.prisma": "model PlanRecord {\n  id String @id\n  planName String\n}\n",
    })
    const topology = await loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: false, view: "all" })
    expect(topology.mode).toBe("single")
    expect(topology.files.map(file => file.file)).toEqual(["add.prisma", "main.prisma", "schema.prisma"])
    expect(topology.models.map(model => model.name)).toEqual(["PlanRecord", "Farm"])
    expect(topology.models.every(model => model.boundary === "shared")).toBe(true)
    expect(formatSchemaTopology(topology, root)).toContain("schema.prisma [shared] models=0")
  })

  it("分库 business/add/all 视图保留数据库边界", async () => {
    const root = await project({
      "schema.prisma": 'datasource db { provider = "mysql" }\n',
      "business.prisma": "model User {\n  id Int @id\n}\n",
      "add.prisma": "model PlanRecord {\n  id String @id\n}\n",
    })
    const business = await loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: true, view: "business" })
    const add = await loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: true, view: "add" })
    const all = await loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: true, view: "all" })
    expect(business.models.map(model => model.name)).toEqual(["User"])
    expect(business.models[0].boundary).toBe("business")
    expect(add.models.map(model => model.name)).toEqual(["PlanRecord"])
    expect(add.models[0].boundary).toBe("add")
    expect(all.models.map(model => [model.name, model.boundary])).toEqual([["PlanRecord", "add"], ["User", "business"]])
  })

  it("选择视图有 Prisma 文件但 0 模型时 fail closed 并给出扫描清单", async () => {
    const root = await project({
      "schema.prisma": 'datasource db { provider = "postgresql" }\n',
      "add.prisma": "model PlanRecord {\n  id String @id\n}\n",
    })
    await expect(loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: true, view: "business" }))
      .rejects.toThrow(/0 个模型.*schema\.prisma/)
  })

  it("同名模型跨文件或跨库时 fail closed 并列出来源", async () => {
    const root = await project({
      "main.prisma": "model User {\n  id Int @id\n}\n",
      "add.prisma": "model User {\n  id String @id\n}\n",
    })
    await expect(loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: true, view: "all" }))
      .rejects.toThrow(/模型冲突.*add\.prisma\[add\].*main\.prisma\[business\]/)
  })

  it("模型正文和来源来自实际声明文件", async () => {
    const root = await project({
      "schema.prisma": 'generator client { provider = "prisma-client" }\n',
      "main.prisma": "model Farm {\n  id String @id\n  name String\n}\n",
    })
    const topology = await loadPrismaSchemaTopology({ projectRoot: root, splitDatabase: false })
    const farm = topology.models.find(model => model.name === "Farm")
    expect(farm?.sourceFile).toBe("main.prisma")
    expect(farm?.body).toContain("name String")
  })
})
