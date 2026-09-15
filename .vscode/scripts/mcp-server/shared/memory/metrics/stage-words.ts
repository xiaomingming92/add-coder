/*
 * 阶段词识别（Plan §9.1 / Spec §2 §DeterministicRecall）
 *
 * 本模块是**纯函数**：零运行时依赖、零 IO、零 DB。
 * 存在意义：governance Hook（同步 spawn、≤200ms 预算、无 DB 访问权限）需要识别
 * 「现在处于哪个 ADD 阶段」，以便产出确定性召回提示；而真正的召回落点在有 DB 的
 * MCP 工具侧（gate-recall.ts）。两者共用同一份阶段白名单，避免 Hook 与工具侧漂移。
 */

export const RECALL_STAGES = ["plan-start", "spec-start", "dps", "rahs", "handoff"] as const
export type RecallStage = (typeof RECALL_STAGES)[number]

export function isRecallStage(value: string): value is RecallStage {
  return (RECALL_STAGES as readonly string[]).includes(value)
}

export const STAGE_LABEL: Record<RecallStage, string> = {
  "plan-start": "Plan 起草",
  "spec-start": "Spec 起草",
  dps: "DPS 门禁",
  rahs: "RAHS 门禁",
  handoff: "Handoff 交接",
}

/**
 * 阶段词模式。按特异性从高到低排列——先命中者为准（handoff/rahs/dps 比 plan 更具体，
 * 避免「交接 plan」被判成 plan-start）。
 */
const STAGE_PATTERNS: ReadonlyArray<{ stage: RecallStage; re: RegExp }> = [
  { stage: "handoff", re: /handoff|交接(手册|文档|说明)?|交接给/i },
  { stage: "rahs", re: /rahs|注意力漂移|执行健康度/i },
  { stage: "dps", re: /dps|文档质量闸门|质量闸门|门禁(评分|检查)?/i },
  { stage: "spec-start", re: /(生成|写|新建|起草|补)\s*(spec|规格|三元组)|specs?\s*三元组|WHEN-?THEN/i },
  { stage: "plan-start", re: /(生成|写|新建|起草|补)\s*(plan|计划|方案)|plan\s*阶段|规划阶段/i },
]

/** 识别提示词所属的 ADD 阶段；无法判定返回 null（不猜测） */
export function detectRecallStage(prompt: string): RecallStage | null {
  if (!prompt) return null
  for (const { stage, re } of STAGE_PATTERNS) {
    if (re.test(prompt)) return stage
  }
  return null
}

export type RecallModeLike = "off" | "shadow" | "inject"

/**
 * 阶段召回提示文本（Hook 侧输出）。
 * - off：返回 null（不提示、不召回）
 * - shadow：提示可显式调用，并说明 Hook 不注入
 * - inject：提示调用后将注入上下文
 */
export function buildStageRecallHint(
  stage: RecallStage,
  mode: RecallModeLike,
): string | null {
  if (mode === "off") return null
  const label = STAGE_LABEL[stage]
  const tail =
    mode === "shadow"
      ? "（当前 shadow 模式：Hook 不注入上下文，召回结果需显式消费）"
      : "（当前 inject 模式：调用后上下文将被注入）"
  return (
    `[Memory] 检测到${label}阶段 → 建议调用 ` +
    `recall_memory({ stage: "${stage}", query: <本阶段意图>, planKeyword: <Plan 关键词> }) ` +
    `获取受治理的历史上下文（含来源与评分）。${tail}\n`
  )
}
