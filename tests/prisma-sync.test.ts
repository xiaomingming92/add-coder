/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-06 10:39:13
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-06 10:39:13
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/tests/prisma-sync.test.ts
 * @Description  : 
 */
/**
 * Prisma schema 同步器回归测试（RPT-20260806-01/02/03）
 * 覆盖：enum 注入 / @@ 前插入 / 注释括号完整解析 / 零注入告警
 *
 * 运行: npx vitest run tests/prisma-sync.test.ts（纯文件操作，无 DB 依赖）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseSchemaBlocks, diffPrisma } from "../src/cli/writer.js"
import { injectFieldLines, injectMissingModels } from "../src/cli/commands/sync.js"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prisma-sync-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const write = (name: string, content: string) =>
  writeFileSync(join(dir, name), content, "utf-8")

describe("parseSchemaBlocks（RPT-20260806-03：注释括号截断）", () => {
  it("含 // [{...}] 行内注释的模型块完整提取，不截断", () => {
    const content = `model CollabContract {
  id                 String   @id @default(cuid())
  contractName       String   @unique
  participants       Json     // [{role, platformEntity, boundPlan, planKeyword, description}]
  abilityMatrix      Json?
  stages             Json
  dependencyGraph    String?
  completionCriteria Json?
  status             String   @default("ACTIVE")
  version            Int      @default(1)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([masterPlanName])
}
`
    const blocks = parseSchemaBlocks(content)
    const block = blocks.get("model:CollabContract")
    expect(block).toBeDefined()
    // 注释行与后续字段均保留（旧正则在此截断）
    expect(block!.body).toContain(
      "participants       Json     // [{role, platformEntity, boundPlan, planKeyword, description}]",
    )
    expect(block!.body).toContain("abilityMatrix      Json?")
    expect(block!.body).toContain("completionCriteria Json?")
    expect(block!.body).toContain("@@index([masterPlanName])")
    expect(block!.body.trimEnd().endsWith("}")).toBe(true)
    // fields 提取完整
    const names = block!.fields.map((f) => f.split(":")[0])
    expect(names).toContain("abilityMatrix")
    expect(names).toContain("dependencyGraph")
    expect(names).toContain("completionCriteria")
  })
})

describe("injectFieldLines enum 注入（RPT-20260806-01）", () => {
  it("enum 缺失值注入成功（非 0 计数）", () => {
    const base = `enum HitlType {
  PLAN
  PLAN_REVIEW
  COLLAB_CONTRACT
}
`
    const target = `enum HitlType {
  PLAN
  PLAN_REVIEW
}
`
    write("base.prisma", base)
    write("target.prisma", target)
    const n = injectFieldLines(
      join(dir, "target.prisma"),
      join(dir, "base.prisma"),
      "HitlType",
      ["COLLAB_CONTRACT"],
    )
    expect(n).toBe(1)
    const out = readFileSync(join(dir, "target.prisma"), "utf-8")
    expect(out).toContain("COLLAB_CONTRACT")
  })
})

describe("injectFieldLines @@ 前插入（RPT-20260806-02）", () => {
  it("注入字段位于 @@index 之前", () => {
    const base = `model PlanRecord {
  id           String @id @default(cuid())
  planName     String @unique
  dpsComposite Int?
  dpsSemScore  Int?
}
`
    const target = `model PlanRecord {
  id       String @id @default(cuid())
  planName String @unique
  hitls    HitlRecord[]

  @@index([planName])
}
`
    write("base.prisma", base)
    write("target.prisma", target)
    const n = injectFieldLines(
      join(dir, "target.prisma"),
      join(dir, "base.prisma"),
      "PlanRecord",
      ["dpsComposite:Int?", "dpsSemScore:Int?"],
    )
    expect(n).toBe(2)
    const out = readFileSync(join(dir, "target.prisma"), "utf-8")
    const idxDps = out.indexOf("dpsComposite")
    const idxIdx = out.indexOf("@@index")
    expect(idxDps).toBeGreaterThan(-1)
    expect(idxIdx).toBeGreaterThan(-1)
    expect(idxDps).toBeLessThan(idxIdx)
  })
})

describe("injectMissingModels 注释括号完整注入（RPT-20260806-03）", () => {
  it("含 // {...} 注释的模型完整注入（无截断）", () => {
    const base = `model CollabContract {
  id                 String   @id @default(cuid())
  contractName       String   @unique
  participants       Json     // [{role, platformEntity, boundPlan, planKeyword, description}]
  abilityMatrix      Json?
  stages             Json
  dependencyGraph    String?
  completionCriteria Json?
  status             String   @default("ACTIVE")
  version            Int      @default(1)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([masterPlanName])
}
`
    write("base.prisma", base)
    write("target.prisma", "// 空目标\n")
    const diff = diffPrisma(join(dir, "base.prisma"), join(dir, "target.prisma"))
    expect(diff.missing.length).toBe(1)
    const n = injectMissingModels(join(dir, "target.prisma"), diff.missing)
    expect(n).toBe(1)
    const out = readFileSync(join(dir, "target.prisma"), "utf-8")
    expect(out).toContain("abilityMatrix      Json?")
    expect(out).toContain("completionCriteria Json?")
    expect(out).toContain("@@index([masterPlanName])")
  })
})

describe("零注入告警", () => {
  it("字段已存在时返回 0 且输出告警（不静默）", () => {
    const base = `enum HitlType {
  PLAN
  COLLAB_CONTRACT
}
`
    const target = `enum HitlType {
  PLAN
  COLLAB_CONTRACT
}
`
    write("base.prisma", base)
    write("target.prisma", target)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const n = injectFieldLines(
        join(dir, "target.prisma"),
        join(dir, "base.prisma"),
        "HitlType",
        ["COLLAB_CONTRACT"],
      )
      expect(n).toBe(0)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})
