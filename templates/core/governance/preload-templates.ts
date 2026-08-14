// preload-templates.ts — ADD 模板预读（bash 版 preload-templates.sh 的 TS 同语义实现）
// 用法:
//   preload-templates.ts --index              # 输出模板清单（文件名 + 用途）
//   preload-templates.ts --full               # 输出全部模板全文
//   preload-templates.ts --full --top 5       # 输出前 5 个最常用模板全文
//   preload-templates.ts --full --mark        # 全文输出 + 落 tpl-injected 标记
//
// 被 SessionStart（--index）和 UserPromptSubmit（--full）调用。
// tpl-injected 标记文件用于去重——同会话二次命中时不重复注入。
// 协议层契约（模板预载）: 读 ${magicDir}/templates 本地物化副本；目录/标准模板缺失 fail-fast
//
// 设计范式: OOP 服务类封装（模板表 + 优先级序 + 校验 + 输出模式 + 标记管理单一职责聚合），
// 纯函数负责文本变换（frontmatter 剥离），CLI 入口仅做参数解析与进程语义。

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { findUpSync } from "find-up"

/** 模板元信息（泛型 Record 收敛：文件名 → 用途描述） */
type TemplateRegistry = Readonly<Record<string, string>>

/** 输出模式（--index / --full） */
type OutputMode = "index" | "full"

/** CLI 参数解析结果（结构化，避免散落参数） */
interface CliArgs {
  mode: OutputMode
  top: number
  mark: boolean
}

/** 纯函数：剥离 YAML frontmatter（对齐 bash awk：首行 --- 至下一个 --- 之间的内容跳过） */
function stripFrontmatter(lines: readonly string[]): string[] {
  const out: string[] = []
  let inFm = false
  lines.forEach((line, idx) => {
    if (idx === 0 && line === "---") {
      inFm = true
      return
    }
    if (inFm && line === "---") {
      inFm = false
      return
    }
    if (!inFm) out.push(line)
  })
  return out
}

/** 纯函数：项目 hash（对齐 bash md5sum | cut -c1-8；失败回退 "default"） */
function projectHash(projectDir: string): string {
  try {
    return createHash("md5").update(projectDir).digest("hex").slice(0, 8)
  } catch {
    return "default"
  }
}

/** 纯函数：解析 CLI 参数为结构化 CliArgs */
function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { mode: "index", top: 0, mark: false }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--index":
        args.mode = "index"
        break
      case "--full":
        args.mode = "full"
        break
      case "--top":
        args.top = Number(argv[++i] ?? "0") || 0
        break
      case "--mark":
        args.mark = true
        break
      default:
        break
    }
  }
  return args
}

/**
 * 模板预读服务（OOP 聚合）:
 *   - 模板注册表 + 优先级序（顺序即 --top N 的优先级）
 *   - 目录校验（fail-fast）
 *   - index/full 两种输出模式
 *   - tpl-injected 标记管理（去重）
 */
export class PreloadTemplates {
  private readonly templatesDir: string
  private readonly tplFlag: string

  private static readonly TEMPLATES: TemplateRegistry = Object.freeze({
    "simple-plan-template.md": "需求方案（简单版）：六节结构，元信息+背景+方案+架构+实施+验收",
    "spec-template.md": "功能规格：Why/What Changes/Impact/WHEN-THEN Requirements",
    "tasks-template.md": "任务拆分：Phase→Task→SubTask层级",
    "checklist-template.md": "验收清单：[T]编译期+[R]运行时+ADD规则合规",
    "review-template.md": "方案审查（ADD-9）：问题复现+方案对比+决策结论+影响评估",
    "standard-plan-template.md": "需求方案（标准版）：PLAN元信息+背景+方案+架构+实施Task+验收+关联文档",
    "add-route-template-heavyweight.md": "ADD执行路线图（重型）：每Step验证并更新状态+spec_sync交叉校验",
    "add-route-template.md": "ADD执行路线图（轻量）：标准Step产出检查",
    "handoff-single-round-template.md": "单轮交接：9章节（含恢复上下文审计查询）",
    "handoff-multi-round-template.md": "多轮交接：全局拓扑+每轮13子章节+收敛规则+启动模板",
    "review-implementation-template.md": "实现审查（ADD-10）：格式契约+框架版本+数据模型+E2E curl",
    "review-runtime-template.md": "运行时纠偏（ADD-11）：发现列表+根因分析+流程改进项",
    "prd-standard-template.md": "产品需求文档（新建）：背景目标+用户场景+功能需求+验收标准",
    "prd-incremental-template.md": "产品需求文档（增量）：变更摘要+diff式记录",
    "fix-verification-template.md": "修复验证模板",
    "report-template.md": "代码审查报告模板",
    "runtime-report-template.md": "运行时报告模板",
    "TERMINOLOGY.md": "模板术语速查",
  })

  private static readonly PRIORITY_ORDER: readonly string[] = Object.freeze([
    "simple-plan-template.md",
    "spec-template.md",
    "tasks-template.md",
    "checklist-template.md",
    "review-template.md",
    "standard-plan-template.md",
    "add-route-template-heavyweight.md",
    "add-route-template.md",
    "handoff-single-round-template.md",
    "handoff-multi-round-template.md",
    "review-implementation-template.md",
    "review-runtime-template.md",
    "prd-standard-template.md",
    "prd-incremental-template.md",
    "fix-verification-template.md",
    "report-template.md",
    "runtime-report-template.md",
    "TERMINOLOGY.md",
  ])

  /**
   * 模板目录 find-up 解析（复用 find-up 包，与 src/shared/paths.ts projectRoot 同范式）：
   *   从 startDir 向上找第一个 templates 目录（esbuild bundle 内联，产物零依赖）：
   *     - 产物 <magicDir>/hooks/xxx.mjs → <magicDir>/templates（分发物化）
   *     - 源码 templates/core/governance/preload-templates.ts → templates/core/templates（源码模板）
   *   命中条件：目录含至少一个标准模板（防命中仓库根 templates/ 空壳）；
   *   目录存在但标准模板缺失 = 物化异常 → 返回 null，由 validate() fail-fast（不继续向上找）。
   *   缺陷修复（2026-08-14 Task 5.1）: 原写死 join(dirname, "..", "..", "templates") 固定层级，
   *   产物从 hooks/ 上溯两级到仓库根 templates/（无标准模板）——被 refresh-fixed 反写掩盖，
   *   golden 重抓暴露；改 find-up 锚点查找，层级零漂移。
   */
  private static findTemplatesDir(startDir: string): string | null {
    const hit = findUpSync("templates", { cwd: startDir, type: "directory" })
    if (!hit) return null
    return PreloadTemplates.PRIORITY_ORDER.some((t) => existsSync(join(hit, t))) ? hit : null
  }

  constructor(templatesDir?: string, tplFlag?: string) {
    const startDir = dirname(fileURLToPath(import.meta.url))
    this.templatesDir = templatesDir ?? PreloadTemplates.findTemplatesDir(startDir) ?? join(startDir, "..", "templates")
    this.tplFlag = tplFlag ?? `/tmp/add_tpl_${projectHash(process.env.PROJECT_DIR || process.cwd())}`
  }

  /** 模板目录存在性校验（fail-fast：目录缺失/标准模板全缺 → 抛错，由 CLI 层转 exit 1） */
  validate(): void {
    if (!existsSync(this.templatesDir)) {
      throw new Error(
        `[ADD preload] 模板目录不存在: ${this.templatesDir}（生成态物化缺失，请执行 add-coder sync 后重试）`
      )
    }
    const available = PreloadTemplates.PRIORITY_ORDER.filter((t) =>
      existsSync(join(this.templatesDir, t))
    ).length
    if (available === 0) {
      throw new Error(
        `[ADD preload] 模板目录中未找到 ADD 标准模板: ${this.templatesDir}（缺失清单: ${PreloadTemplates.PRIORITY_ORDER.join(" ")}）`
      )
    }
  }

  /** 读取模板内容（strip frontmatter） */
  readTemplate(file: string): string {
    const path = join(this.templatesDir, file)
    if (!existsSync(path)) return ""
    return stripFrontmatter(readFileSync(path, "utf-8").split("\n")).join("\n")
  }

  /** --index 模式输出（对齐 bash output_index 逐字） */
  index(): string {
    const lines: string[] = ["## ADD 可用模板清单", "", "| # | 模板文件 | 用途 |", "|---|---------|------|"]
    let i = 1
    for (const tmpl of PreloadTemplates.PRIORITY_ORDER) {
      if (existsSync(join(this.templatesDir, tmpl))) {
        lines.push(`| ${i} | ${tmpl} | ${PreloadTemplates.TEMPLATES[tmpl] ?? "模板文件"} |`)
        i++
      }
    }
    return lines.join("\n") + "\n"
  }

  /** --full 模式输出（对齐 bash output_full 逐字） */
  full(top: number): string {
    const lines: string[] = ["## ADD 模板全文内容", ""]
    let count = 0
    for (const tmpl of PreloadTemplates.PRIORITY_ORDER) {
      if (!existsSync(join(this.templatesDir, tmpl))) continue
      count++
      if (top > 0 && count > top) break
      lines.push("---", `### ${tmpl}`, "", this.readTemplate(tmpl), "")
    }
    return lines.join("\n") + "\n"
  }

  isInjected(): boolean {
    return existsSync(this.tplFlag)
  }

  /** 标记模板已注入（tpl-injected 去重：同会话二次命中不重复注入） */
  markInjected(): void {
    try {
      writeFileSync(this.tplFlag, "")
    } catch {
      /* ignore（对齐 bash touch || true） */
    }
  }

  /** CLI 入口：解析参数 → 校验 → 输出；去重命中时 stderr 提示并 exit 0 */
  run(argv: readonly string[]): number {
    const { mode, top, mark } = parseArgs(argv)
    this.validate()
    if (mode === "index") {
      process.stdout.write(this.index())
      return 0
    }
    if (this.isInjected() && !mark) {
      process.stderr.write("[ADD preload] 模板已在本会话注入，跳过重复注入（tpl-injected 标记存在）\n")
      return 0
    }
    process.stdout.write(this.full(top))
    this.markInjected()
    return 0
  }
}

