// review-checklist-guard.ts — 验收 Review 模式：checklist 质量检查（治理逻辑层，Task 4.1 收敛）
// bash 版 review-checklist.sh 的 TS 同语义实现（源自 qoder 私有 lib，R2 回流收敛 core）；
// 输入: handoff 路径 + add_route 路径；输出: 质量问题清单文本（逐字对齐 bash）。
// 参数化: specRoot（qoder: .qoder/specs；其余端按协议注入）+ PROJECT_DIR。

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { tryResolveMagicDir } from "./common.js"

/** 从 checklist 提取全部 [x] 行（对齐 bash grep '\[x\]'） */
function checkedLines(content: string): string[] {
  return content.split("\n").filter((l) => l.includes("[x]"))
}

/** 定位 spec 目录下的 checklist/tasks（对齐 bash 目录优先 + find fallback） */
function locateSpecFile(specRoot: string, planKw: string, name: string): string {
  const specDir = join(specRoot, planKw)
  const direct = join(specDir, name)
  if (existsSync(direct)) return direct
  // fallback: 搜索（对齐 bash find .qoder/specs -name ... -path "*${plan_kw}*"）
  if (existsSync(specRoot)) {
    for (const dir of readdirSync(specRoot)) {
      if (!dir.includes(planKw)) continue
      const cand = join(specRoot, dir, name)
      if (existsSync(cand)) return cand
    }
  }
  return direct
}

/**
 * spec 目录默认定位（治理层中立——禁止偏爱任何 adapter）:
 *   <projectDir>/<magicDir>/specs（magicDir 唯一解析链推导）；推导失败 → ""（fail-closed）。
 *   adapter 协议差异（如 qoder 显式 .qoder/specs）由调用方显式传参，不下沉到治理层默认值。
 */
function defaultSpecRoot(): string {
  const projectDir = process.env.PROJECT_DIR || process.cwd()
  const magicDir = tryResolveMagicDir()
  return magicDir ? join(projectDir, magicDir, "specs") : ""
}

/**
 * checklist 质量检查（逐字对齐 bash review-checklist.sh）。
 * 返回: 问题清单文本（无问题时为 "  ✅ Review: checklist 质量检查通过"）。
 * Step 0 准入失败时返回 "  ❌ Step 0 未完成:..."（调用方 exit 1 语义由 CLI 层执行）。
 */
export function checkReviewQuality(handoff: string, addRoute: string, specRoot?: string): string {
  if (handoff === "") return ""
  const projectDir = process.env.PROJECT_DIR || process.cwd()
  const planKw = basename(handoff).replace(/-handoff.*$/, "")
  const root = specRoot ?? defaultSpecRoot()
  const checklist = locateSpecFile(root, planKw, "checklist.md")
  const tasksFile = locateSpecFile(root, planKw, "tasks.md")

  let issues = ""

  // ── 0. Step 0 准入: ADD 核心文档存在性（BLOCKING）──
  let missingDocs = ""
  if (!existsSync(handoff)) {
    missingDocs += " Handoff"
  } else {
    const h = readFileSync(handoff, "utf-8")
    let hSections = 0
    if (h.includes("spec 文件")) hSections++
    if (h.includes("你要改的文件")) hSections++
    if (h.includes("验证标准")) hSections++
    if (h.includes("完成后记录 ADD-7 审计")) hSections++
    if (hSections < 4) missingDocs += ` Handoff(缺章节:${hSections}/4)`
  }
  if (!existsSync(addRoute)) {
    missingDocs += " add-route"
  } else {
    const ar = readFileSync(addRoute, "utf-8")
    if (!ar.includes("Task 映射表") && !ar.includes("文件清单")) {
      missingDocs += " add-route(缺Task映射/文件清单)"
    }
  }
  if (!existsSync(checklist)) {
    missingDocs += " checklist"
  } else {
    const cl = readFileSync(checklist, "utf-8")
    if (!cl.includes("[T]")) missingDocs += " checklist(无[T]项)"
  }
  if (!existsSync(tasksFile)) {
    missingDocs += " tasks"
  } else {
    const tk = readFileSync(tasksFile, "utf-8")
    if (!/Task|\[ \]/.test(tk)) missingDocs += " tasks(无Task项)"
  }
  if (missingDocs !== "") {
    return `  ❌ Step 0 未完成:${missingDocs.trim().replace(/ /g, ", ")} 文件缺失。回退 Step 0.5/Step 1 补建后再进入代码实现。`
  }

  // ── 1-4. checklist 质量 ──
  if (existsSync(checklist) && existsSync(tasksFile)) {
    const cl = readFileSync(checklist, "utf-8")
    const clChecked = checkedLines(cl).length
    const clOpen = (cl.match(/\[ \]/g) || []).length
    const tkChecked = (readFileSync(tasksFile, "utf-8").match(/\[x\]/g) || []).length

    if (clOpen > 0) {
      issues += `  ⚠️ checklist 有 ${clOpen} 项未勾选\n`
    }

    // 2. [T] 项是否都有 [x]
    const tItems = (cl.match(/\[T\]/g) || []).length
    const tChecked = checkedLines(cl).filter((l) => l.includes("[T]")).length
    if (tItems > tChecked) {
      issues += `  ⚠️ [T] 编译期验证: ${tChecked}/${tItems} 通过\n`
    }

    // 3. 证据缺失检测：[x] 但缺 — 证据: 标记
    let noEvidence = 0
    for (const line of checkedLines(cl)) {
      if (/—\s*证据:\s*\S/.test(line)) continue
      if (/npx|tsc|vitest|grep|✅|cmq[0-9a-z]{10}|18\/18|exit.*0/.test(line)) continue
      noEvidence++
    }
    if (noEvidence > 0) {
      issues += `  ❌ ${noEvidence} 项 [x] 缺少验收证据（需附 — 证据: tsc/vitest/grep/审计ID 等）\n`
    }

    // 4. 审计链
    const withAudit = checkedLines(cl).filter((l) => /cmq[a-z0-9]{10,}/.test(l)).length
    const fakeAudit = checkedLines(cl).filter((l) => /cmq\.\.\.|cmqxxx|审计.*cmq\.\./.test(l)).length
    if (fakeAudit > 0) {
      issues += `  ❌ ${fakeAudit} 项 [x] 使用了占位符审计ID（cmq.../cmqxxx），必须调 record_dev_operation 获取真实 cuid 后替换\n`
    }
    const withEvidence = checkedLines(cl).filter((l) =>
      /tsc|vitest|npx|grep|✅|验证|确认|compgen|审计.*cmq[a-z0-9]{10}/.test(l)
    ).length
    if (withEvidence > 0 && withAudit === 0) {
      issues += `  📎 初验: ${withEvidence}/${clChecked} 项有证据但未写审计 ID（需调 record_dev_operation 落库）\n`
    } else if (withAudit > 0 && withAudit < clChecked) {
      issues += `  📎 复验: ${withAudit}/${clChecked} 项引用审计 ID。${withEvidence}/${clChecked} 项有证据。证据一致则不需追写 devlog日志(走mcp)\n`
    }
  }

  // 5. add-route Step 闭环
  if (existsSync(addRoute)) {
    const ar = readFileSync(addRoute, "utf-8")
    const arOpen = (ar.match(/\[ \]/g) || []).length
    if (arOpen > 0) {
      issues += `  ⚠️ add-route ${arOpen} Step 未闭环\n`
    }
  }

  // 6. handoff 审计表同步
  if (existsSync(handoff) && existsSync(checklist)) {
    const h = readFileSync(handoff, "utf-8")
    const cl = readFileSync(checklist, "utf-8")
    const cuids = [...new Set(cl.match(/cmq[a-z0-9]{10,}/g) || [])]
    const newCuids = cuids.filter((c) => !h.includes(c))
    if (newCuids.length > 0) {
      issues += `  ❌ handoff 审计表未同步: ${newCuids.length} 个 cuid 在 checklist 中存在但 handoff 中缺失（需更新 handoff ADD-7 表 + query_audit_logs 命令）\n`
    }
  }

  if (issues === "") {
    return "  ✅ Review: checklist 质量检查通过"
  }
  return `  📋 Review 发现问题:\n${issues}`
}

/**
 * ReviewChecklist 服务类（OOP 封装，Task 5.1 继承体系）:
 *   run() = 检查 + 输出 + exit 语义（Step 0 准入失败 → exit 1，对齐 bash 原文）。
 *   specRoot 缺省 = 治理层中立推导（<projectDir>/<magicDir>/specs）；adapter 显式传参覆盖。
 */
export class ReviewChecklistGuard {
  private readonly specRoot: string | undefined

  constructor(specRoot?: string) {
    this.specRoot = specRoot
  }

  /** 主入口：返回 exit code（0 放行 / 1 Step 0 准入失败） */
  run(handoff: string, addRoute: string): number {
    if (handoff === "") return 0
    const out = checkReviewQuality(handoff, addRoute, this.specRoot)
    process.stdout.write(out + "\n")
    // Step 0 准入失败 → exit 1（对齐 bash）
    if (out.startsWith("  ❌ Step 0 未完成")) return 1
    return 0
  }
}
