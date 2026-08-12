/*
 * @Description  : 量化复检层 — 形似义异判定（锚点加权 Jaccard + TF-IDF cosine + RRF + EWMA ±kσ）
 * @File         : templates/core/scripts/mcp-server/tools/gateway/check_doc_similarity.ts
 * @契约          : 消费 v3 Spec §6 jsonl（anchor_hit/struct_score/override）与 quant-events.jsonl（自记录）
 * @回流          : Specs Review P0-1(参照物章节全文)/P0-2(候选集)/P1-5(量纲解耦)/P1-6(校准样本)/P1-7(decide 事件)
 */
import * as z from "zod/v4";
import type { ToolRegistrar } from "../registrar.js";
import { join, basename } from "path";
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../../shared/fs.js";
import { textResponse, errorResponse } from "../../shared/response.js";
import { QUANT_RECHECK_CONFIG as CFG } from "../../shared/quant-recheck.strategy.js";
import { tokenize, jaccard, tfVector } from "./helpers.js";
import { cosineSimilarity } from "vector-cosine-similarity";

// ── 锚点加权 Jaccard（锚点 token ×ANCHOR_WEIGHT，普通 token ×1）──
export function weightedJaccard(a: Set<string>, b: Set<string>, anchors: Set<string>): number {
  const w = (t: string) => (anchors.has(t) ? CFG.ANCHOR_WEIGHT : 1);
  let num = 0, den = 0;
  const all = new Set([...a, ...b]);
  for (const t of all) {
    const wa = a.has(t) ? w(t) : 0;
    const wb = b.has(t) ? w(t) : 0;
    num += Math.min(wa, wb);
    den += Math.max(wa, wb);
  }
  return den > 0 ? num / den : 1;
}

// ── RRF 排名融合（Spec §2 语义：目标文档双路排名和，非候选均值）──
export function rrfScore(candidates: { j: number; t: number }[]): number {
  // 双路排名：分数降序得 rank（并列同 rank）
  const rankBy = (get: (c: { j: number; t: number }) => number) => {
    const sorted = [...candidates].sort((x, y) => get(y) - get(x));
    const ranks = new Map<{ j: number; t: number }, number>();
    sorted.forEach((c, i) => { if (!ranks.has(c)) ranks.set(c, i + 1); });
    return ranks;
  };
  const rj = rankBy((c) => c.j);
  const rt = rankBy((c) => c.t);
  // 目标文档 = 双路综合最优候选（j+t 最高）
  const best = candidates.reduce((a, b) => (a.j + a.t >= b.j + b.t ? a : b));
  // RRF(文档) = 1/(K+rank_j) + 1/(K+rank_t)
  return 1 / (CFG.RRF_K + (rj.get(best) ?? 1)) + 1 / (CFG.RRF_K + (rt.get(best) ?? 1));
}

// ── EWMA ±kσ 阈值（历史复合分序列；冷启动用保守基线）──
export function ewmaThreshold(history: number[]): { mu: number; sigma: number; lower: number } {
  if (history.length < CFG.EWMA_COLD_START) {
    return { mu: CFG.EWMA_BASELINE, sigma: 0, lower: CFG.EWMA_BASELINE };
  }
  let mu = history[0], varEst = 0;
  for (let i = 1; i < history.length; i++) {
    const diff = history[i] - mu;
    mu = CFG.EWMA_LAMBDA * history[i] + (1 - CFG.EWMA_LAMBDA) * mu;
    varEst = CFG.EWMA_LAMBDA * diff * diff + (1 - CFG.EWMA_LAMBDA) * varEst;
  }
  const sigma = Math.sqrt(varEst);
  return { mu, sigma, lower: mu - CFG.EWMA_K * sigma };
}

// ── 模板匹配（R3：目录扫描 + 特征序 + 存在性校验，与守卫注册表同序，不硬编码死模板）──
const TEMPLATE_PATTERNS: [RegExp, string][] = [
  [/add-route.*heavy|heavy.*add-route/, "add-route-template-heavyweight.md"],
  [/add-route/, "add-route-template.md"],
  [/hitl/, "hitl-template.md"],
  [/handoff/, "handoff-multi-round-template.md"],
  [/checklist/, "checklist-template.md"],
  [/fix-verif/, "fix-verification-template.md"],
  [/report.*runtime|runtime.*report/, "runtime-report-template.md"],
  [/report/, "report-template.md"],
  [/tasks/, "tasks-template.md"],
  [/spec/, "spec-template.md"],
  [/prd.*increment|increment.*prd/, "prd-incremental-template.md"],
  [/prd/, "prd-standard-template.md"],
  [/simple.*plan|plan.*simple/, "simple-plan-template.md"],
  [/plan/, "standard-plan-template.md"],
  [/review.*runtime|runtime.*review/, "review-runtime-template.md"],
  [/review.*implement|implement.*review/, "review-implementation-template.md"],
  [/review/, "review-template.md"],
];

async function matchTemplate(templatesDir: string, docPath: string): Promise<string> {
  // 目录扫描可用模板清单（模板增删自动感知，不硬编码）
  const all = (await readdirRecursive(templatesDir)) as string[];
  const tmpls = new Set(all.filter((f) => f.endsWith("-template.md")));
  // 只匹配文件名（basename），避免路径目录词污染（如 reports/ 误命中 report 模板——R4）
  const base = basename(docPath || "");
  const n = base.toLowerCase();
  for (const [re, tmpl] of TEMPLATE_PATTERNS) {
    if (re.test(n) && tmpls.has(tmpl)) return tmpl;
  }
  return "standard-plan-template.md";  // 缺省回退 Plan 模板
}

// ── 判定记录（P1-5：quant-events.jsonl 追加，与 hook-events 量纲解耦）──
function appendQuantEvent(rec: Record<string, unknown>): void {
  try {
    const dir = join(PROJECT_ROOT, MAGIC_DIR, "reports");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "quant-events.jsonl"), `${JSON.stringify(rec)}\n`, "utf-8");
  } catch { /* 旁路：判定不因落盘失败中断 */ }
}

// ── 建议清单（P1-7/Task 2.2：status + event 追加式流转，人类 decide 事件为校准样本）──
function appendSuggestion(rec: Record<string, unknown>): void {
  try {
    const dir = join(PROJECT_ROOT, MAGIC_DIR, "reports");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "quant-suggestions.jsonl"), `${JSON.stringify(rec)}\n`, "utf-8");
  } catch { /* 旁路 */ }
}

export function registerCheckDocSimilarity(server: ToolRegistrar) {
  server.registerTool(
    "check_doc_similarity",
    {
      description:
        `量化复检层：「形似义异」语义判定。锚点加权 Jaccard + TF-IDF cosine 双路相似度，RRF 融合，EWMA ±kσ 自适应阈值。非关键路径调用（Step 3.5/收敛判断时）。`,
      inputSchema: z.object({
        planKeyword: z.string().describe("Plan 文件的关键词"),
        docPath: z.string().optional().describe("目标文档相对路径（缺省取当前活跃 Plan）"),
      }),
    },
    async (args: Record<string, unknown>, _ctx: unknown) => {
      try {
        const pp = args.planKeyword as string;
        if (!pp) return errorResponse("planKeyword 参数不能为空");

        // ── 候选集（P0-2）：模板全部 sections 章节全文（P0-1 参照物粒度）──
        const templatesDir = join(PROJECT_ROOT, MAGIC_DIR, "templates");
        const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans");
        const reportsDir = join(PROJECT_ROOT, MAGIC_DIR, "reports");

        // 定位 Plan（递归扫日期子目录；排除 .hitl.md 提案）
        const planFiles = (await readdirRecursive(plansDir)) as string[];
        const planFile = planFiles.find((f) => f.toLowerCase().includes(pp.toLowerCase()) && f.includes("-plan-v") && !f.endsWith(".hitl.md"));
        if (!planFile) return errorResponse(`未找到匹配的 Plan（关键词: ${pp}）`);
        const planPath = join(plansDir, planFile);
        const planContent = await readFileSafe(planPath) || "";
        const anchorMatch = planContent.match(/anchor\s*[:：]\s*"?([A-Za-z_]+)/);
        const anchor = anchorMatch ? anchorMatch[1] : "plan_track";

        // 读模板文件全文（R3：按文档类型匹配模板，refText = 模板章节全文——P0-1）
        const tmplName = await matchTemplate(templatesDir, String(args.docPath ?? ""));
        const tmplPath = join(templatesDir, tmplName);
        const tmplContent = await readFileSafe(tmplPath) || "";
        const refTokens = tokenize(tmplContent);
        const anchorTokens = new Set([...tokenize(anchor)]);

        // 候选集：模板 sections（按 ## 切分）+ 历史文档抽样
        const sections = tmplContent.split(/^##\s+/m).filter((s) => s.trim().length > 0);
        const candidates = sections.map((sec) => tokenize(sec)).slice(0, 20);
        const docContent = args.docPath
          ? (await readFileSafe(join(PROJECT_ROOT, String(args.docPath))) || "")
          : planContent;
        const docTokens = tokenize(docContent);

        // 双路打分（候选集内）
        const scored = candidates.map((ct) => {
          const j = weightedJaccard(docTokens, ct, anchorTokens);
          const globalTokens = candidates.length >= CFG.IDF_MIN_DOCS ? candidates : [ct];
          const t = cosineSimilarity(tfVector(docTokens, globalTokens), tfVector(ct, globalTokens));
          return { j, t };
        });

        // RRF 融合（候选不足退保守路径）
        const rrf = scored.length >= CFG.RRF_MIN_CANDIDATES ? rrfScore(scored) : Math.min(...scored.map((s) => s.j));

        // EWMA 阈值（P1-5：序列仅量化层复合分）
        let history: number[] = [];
        try {
          const evFile = join(reportsDir, "quant-events.jsonl");
          if (existsSync(evFile)) {
            history = readFileSync(evFile, "utf-8").trim().split("\n")
              .map((l) => { try { return (JSON.parse(l) as { rrf?: number }).rrf ?? NaN; } catch { return NaN; } })
              .filter((v) => Number.isFinite(v)) as number[];
          }
        } catch { /* 冷启动 */ }
        const th = ewmaThreshold(history);
        // 复合判定：RRF 相对排名 ≥ 自适应阈值 且 双路综合绝对匹配达标（双闸门）
        // 绝对闸门用 max(j, t)：真实文档与模板全文 token 重叠天然低（骨架 vs 实例），Jaccard 单路会误杀
        const bestMatch = Math.max(...scored.map((s) => Math.max(s.j, s.t)));
        const absOk = bestMatch >= CFG.MIN_ABS_SIMILARITY;
        const verdict = rrf >= th.lower && absOk ? "PASS" : "WARN_BLOCKED";

        // 判定记录（P1-5/6/7：decide 事件由建议清单人类裁决写入）
        appendQuantEvent({ ts: new Date().toISOString(), planKeyword: pp, jaccard: scored[0]?.j ?? 0, tfidf: scored[0]?.t ?? 0, rrf, ewmaThreshold: th.lower, verdict });

        const suggestion = verdict === "WARN_BLOCKED"
          ? { schemaHint: `${tmplName} anchor=${anchor}`, evidence: `j=${scored[0]?.j.toFixed(3)} t=${scored[0]?.t.toFixed(3)} rrf=${rrf.toFixed(4)}`, suggestion: "review schema 声明松紧（guard-rules.toml）" }
          : null;

        // 建议落盘（P1-7：status=open + event=create；人类 decide 后追加 event=decide + status=closed）
        if (suggestion) {
          appendSuggestion({
            ts: new Date().toISOString(), planKeyword: pp, docPath: args.docPath ?? planFile,
            ...suggestion, status: "open", event: "create",
          });
        }

        return textResponse(
          `=== check_doc_similarity（量化复检）===\n` +
          `Plan: ${planFile}\n` +
          `Jaccard: ${(scored[0]?.j ?? 0).toFixed(3)}（锚点加权 ×${CFG.ANCHOR_WEIGHT}）\n` +
          `TF-IDF: ${(scored[0]?.t ?? 0).toFixed(3)}（候选集 ${scored.length}，IDF 语料锚 ${candidates.length >= CFG.IDF_MIN_DOCS ? "启用" : "退化" }）\n` +
          `RRF: ${rrf.toFixed(4)}（K=${CFG.RRF_K}）\n` +
          `EWMA 阈值: ${th.lower.toFixed(4)}（历史 ${history.length} 条${history.length < CFG.EWMA_COLD_START ? "，冷启动基线" : "，自适应"}）\n` +
          `判定: ${verdict}\n` +
          (suggestion ? `建议: ${JSON.stringify(suggestion)}\n` : "")
        );
      } catch (e) {
        return errorResponse(`check_doc_similarity 异常: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
}
