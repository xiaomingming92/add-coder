/*
 * 单元状态解析（Plan rank-calibration Task 2.1.9 / Spec §2.2 + §2.3）
 *
 * 架构约束：单元（Plan 业务闭包）的状态是**既有事实**，必须读出来——不能手填、不能另建状态表。
 *   closed    = add-route 全部产出项 [x] 且存在 ROUND_CLOSED devlog
 *   in-flight = add-route 存在但仍有 [ ]，或缺少 ROUND_CLOSED（并发协议下的飞行中单元）
 *   unknown   = 连 add-route 都没有（§2.3 视为缺制品，样本不可作训练依据）
 *
 * 同时产出**单元引用表**（refs）：报告按单元分层时直接引用这些制品，不复制内容（§2.3）。
 */

export interface UnitRefs {
  planPath?: string
  addRoutePath?: string
  handoffPath?: string
  specsDir?: string
  planRecordId?: string
  roundClosedAuditId?: string
}

export interface UnitState {
  planKeyword: string
  state: "closed" | "in-flight" | "unknown"
  /**
   * 诊断量（**不参与 closed 判定**）：add-route 勾选与事实的差距。
   * 勾选是过程进度，不是收敛证据——用它判 closed 会把"过程"当"结果"。
   */
  documentationLag: { openSteps: number; totalSteps: number; lagging: boolean }
  /** 封口四要素（Spec §2.2：四项合取） */
  evidence: {
    roundClosed: boolean
    handoff: boolean
    acceptance: boolean
    planStatus: boolean
  }
  /** 缺失的既有制品（§2.3：缺证据的单元不可作为训练依据） */
  missingArtifacts: string[]
  refs: UnitRefs
}

export interface UnitStateDeps {
  projectRoot: string
  magicDir: string
  /** 读文件内容（不存在返回 null）；测试注入 */
  readFile?: (absPath: string) => string | null
  /** 列 plans 目录下的文件名（不存在返回 []）；测试注入 */
  listDir?: (absDir: string) => string[]
  /**
   * 列 plans 目录下的**相对路径**（含日期子目录，如 `2026-09/12/x.md`）；生产路径必须用这个 ——
   * ADD 约定制品按 `plans/{YYYY-MM}/{DD}/` 分层，扁平列目录会漏掉全部真实 Plan（2026-09-13 真实单元自检暴露）。
   */
  listFiles?: (absDir: string) => string[]
  /** 是否存在（specs 目录判断）；测试注入 */
  exists?: (absPath: string) => boolean
  /** 查 ROUND_CLOSED devlog（测试注入） */
  findRoundClosed?: (planKeyword: string) => Promise<{ id: string } | null>
  /** 查 PlanRecord（测试注入） */
  findPlanRecord?: (planKeyword: string) => Promise<{
    id: string
    lifecycle?: string
    doneTasks?: number
    totalTasks?: number
  } | null>
}

/** 统计 add-route 产出项勾选情况（只认 `- [ ]` / `- [x]`） */
export function countSteps(content: string): { open: number; total: number } {
  let open = 0
  let total = 0
  for (const line of content.split("\n")) {
    if (/^- \[ \]/.test(line)) {
      open++
      total++
    } else if (/^- \[[xX]\]/.test(line)) {
      total++
    }
  }
  return { open, total }
}

export async function resolveUnitState(
  planKeyword: string,
  deps: UnitStateDeps,
): Promise<UnitState> {
  const plansDir = `${deps.projectRoot}/${deps.magicDir}/plans`
  const specsDirRoot = `${deps.projectRoot}/${deps.magicDir}/specs`
  const listDir = deps.listFiles ?? deps.listDir ?? (() => [])
  const readFile = deps.readFile ?? (() => null)
  const exists = deps.exists ?? (() => false)

  const has = (name: string, must: string[]): boolean =>
    must.every((m) => name.toLowerCase().includes(m.toLowerCase()))

  const files = listDir(plansDir)
  // ★ 匹配基准是 plan **base** 名（去掉 -plan-vN）：兄弟制品不带 plan 段——
  //   Plan=`{base}-plan-v1.md`、add-route=`{base}-add-route-v1.md`、handoff=`{base}-handoff-v1.md`。
  //   用完整 planKeyword 去匹配会漏掉后两者（2026-09-13 真实单元自检暴露）。
  const base = planKeyword.replace(/-plan-v\d+$/i, "")
  const planRel = files.find((f) => has(f, [base, "-plan-v"]) && !f.includes(".hitl"))
  const addRouteRel = files.find((f) => has(f, [base, "add-route"]))
  const handoffRel = files.find((f) => has(f, [base, "handoff"]))

  const refs: UnitRefs = {}
  const missingArtifacts: string[] = []

  if (planRel) refs.planPath = `${deps.magicDir}/plans/${planRel}`
  else missingArtifacts.push("plan")
  if (addRouteRel) refs.addRoutePath = `${deps.magicDir}/plans/${addRouteRel}`
  else missingArtifacts.push("add-route")
  if (handoffRel) refs.handoffPath = `${deps.magicDir}/plans/${handoffRel}`
  else missingArtifacts.push("handoff")

  if (exists(`${specsDirRoot}/${base}`)) refs.specsDir = `${deps.magicDir}/specs/${base}`
  else missingArtifacts.push("specs")

  const [roundClosed, planRecord] = await Promise.all([
    deps.findRoundClosed ? deps.findRoundClosed(planKeyword) : Promise.resolve(null),
    deps.findPlanRecord ? deps.findPlanRecord(planKeyword) : Promise.resolve(null),
  ])
  if (roundClosed) refs.roundClosedAuditId = roundClosed.id
  else missingArtifacts.push("round-closed")
  if (planRecord) refs.planRecordId = planRecord.id
  else missingArtifacts.push("plan-record")

  const addRouteContent = addRouteRel ? (readFile(`${plansDir}/${addRouteRel}`) ?? "") : ""
  const { open, total } = countSteps(addRouteContent)

  // 验收证据：checklist 存在且 [T] 项无未勾选（缺证据的单元不可作训练依据）
  const checklistAbs = refs.specsDir ? `${deps.projectRoot}/${refs.specsDir}/checklist.md` : ""
  const checklistContent = checklistAbs ? (readFile(checklistAbs) ?? "") : ""
  const unverifiedT = (checklistContent.match(/^- \[ \] \[T\]/gm) ?? []).length
  const verifiedT = (checklistContent.match(/^- \[[xX]\] \[T\]/gm) ?? []).length
  const acceptance = unverifiedT + verifiedT > 0 && unverifiedT === 0

  // PlanRecord 状态：存在且进度收敛（done === total 且 total > 0）
  const planStatus =
    !!planRecord && (planRecord.totalTasks ?? 0) > 0 && planRecord.doneTasks === planRecord.totalTasks

  const evidence = {
    roundClosed: !!roundClosed,
    handoff: !!handoffRel,
    acceptance,
    planStatus,
  }

  let state: UnitState["state"]
  if (!addRouteRel && !planRel) state = "unknown"
  else if (evidence.roundClosed && evidence.handoff && evidence.acceptance && evidence.planStatus) {
    state = "closed"
  } else {
    state = "in-flight"
  }

  return {
    planKeyword,
    state,
    documentationLag: { openSteps: open, totalSteps: total, lagging: total > 0 && open > 0 },
    evidence,
    missingArtifacts,
    refs,
  }
}
