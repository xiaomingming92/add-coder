/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-31 15:30:00
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-31 15:30:00
 * @FilePath     : /add-coder/templates/core/scripts/mcp-server/tools/gateway/check_dps.ts
 * @Description  : DPS 闸门 — 四维复合评分 + FFT 自适应权重
 */
import * as z from "zod/v4";
import type { ToolRegistrar } from "../registrar.js";
import { existsSync } from "fs";
import { join, basename } from "path";
import { textResponse, errorResponse } from "../../shared/response.js";
import {
  readFileSafe,
  readdirRecursive,
  PROJECT_ROOT,
  MAGIC_DIR,
} from "../../shared/fs.js";
import { prisma } from "../../shared/prisma.js";
import { cosineSimilarity } from "vector-cosine-similarity";
import { DPS_SCORING_CONFIG as CFG } from "../../shared/dps-scoring.strategy.js";
import {
  tokenize,
  jaccard,
  shannonEntropy,
  dengPenalty,
  fftWeights,
  getEmbeddings,
} from "./helpers.js";

export function registerCheckDps(server: ToolRegistrar) {
  server.registerTool(
    "check_dps",
    {
      description:
        `DPS 闸门。四维复合评分: 语义相关性(TF-IDF/Jaccard) + 信息熵匹配(香农/Deng) + CPM关键路径 + 结构完整度 + FFT自适应权重。DPS >= ${CFG.THRESHOLD_PASS} 可进入 Step 1。`,
      inputSchema: z.object({
        planKeyword: z.string().describe("Plan 文件的关键词"),
      }),
    },
    async (args: Record<string, unknown>, _ctx: unknown) => {
      try {
        const pp = args.planKeyword as string;
        if (!pp) return errorResponse("planKeyword 参数不能为空");
        const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans"),
          specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs"),
          reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews");
        const parts: string[] = [
          `=== DPS：Documentation Precision Score（上游文档质量量化）===`,
          `Plan 关键词: "${pp}"`,
          "",
        ];
        if (!existsSync(plansDir))
          return errorResponse(`plans 目录不存在: ${plansDir}`);

        const apf = (await readdirRecursive(plansDir)).filter(
          (f) => f.endsWith(".md") && !f.includes(".hitl"),
        );
        const pm = apf.find(
          (f) =>
            f.toLowerCase().includes(pp.toLowerCase()) && f.includes("-plan-v"),
        );
        if (!pm)
          return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`);
        const planPath = join(plansDir, pm);
        const pc = await readFileSafe(planPath);
        if (!pc) return errorResponse(`无法读取 Plan 文件: ${pm}`);
        parts.push(`Plan: ${pm}`);

        let sn = basename(pm).replace(/-plan-v\d+\.md$/, ""),
          sc = "";
        if (pc) {
          const sr = pc.match(
            /Spec[:|\s`]+\.?(qoder|claude|add|vscode)\/specs\/([^/`\s]+)/,
          );
          if (sr) sn = sr[2];
        }
        const sp = join(specsDir, sn, "spec.md");
        sc = (await readFileSafe(sp)) || "";
        let rn = "",
          rc = "";
        if (existsSync(reviewsDir)) {
          const rfs = await readdirRecursive(reviewsDir);
          const rkNoVersion = pp.replace(/-plan-v\d+$/i, "");
          rn =
            rfs.find(
              (f) =>
                f.toLowerCase().includes(rkNoVersion.toLowerCase()) &&
                f.includes("-review-v"),
            ) || "";
          if (rn) rc = (await readFileSafe(join(reviewsDir, rn))) || "";
        }
        // ★ 兼容精简版和标准版 Plan：剥离 -plan-vN 后缀匹配 add-route 和 review
        const kwNoVersion = pp.replace(/-plan-v\d+$/i, "");
        let arContent = "";
        const arFile = apf.find(
          (f) =>
            f.toLowerCase().includes(kwNoVersion.toLowerCase()) &&
            f.toLowerCase().includes("add-route"),
        );
        if (arFile)
          arContent = (await readFileSafe(join(plansDir, arFile))) || "";

        // 维度一: 语义相关性
        //   子维度 A: 映射结构 (40%) — 映射表是否存在 + 覆盖行数
        //   子维度 B: 延续性 (60%) — Plan 决策文本 vs Spec §N 内容的 embedding 余弦相似度
        const planTerms = tokenize(pc),
          specTermsRaw = tokenize(sc),
          reviewTerms = tokenize(rc);
        const planMapping = pc.match(/###\s+\d+\.\d+\s+Plan.*?Spec.*?实施映射/);
        let mappingTotal = 0,
          mappingMatched = 0;
        let continuitySum = 0,
          continuityCount = 0;
        // 收集 Plan 决策文本 + Spec 节文本，批量 embedding
        const embedPairs: { planText: string; specText: string }[] = [];
        if (planMapping && sc) {
          const aIdx = pc.indexOf(planMapping[0]);
          const planAfter = pc.slice(aIdx);
          const pRows = planAfter.split("\n").filter((l) => /^\|\s+/.test(l) && l.includes("Spec §"));
          mappingTotal = pRows.length;
          // 提取每行 Plan 决策文本（无 # 列，按位置编号）
          const rowDecisions: { num: string; text: string }[] = [];
          let planRowIdx = 0;
          for (const row of pRows) {
            planRowIdx++;
            const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
            if (cells.length < 4) continue;
            rowDecisions.push({ num: String(planRowIdx), text: cells[0] });
          }
          const specMapping = sc.match(/##\s+Plan.*?Spec.*?映射/);
          if (specMapping) {
            const sIdx = sc.indexOf(specMapping[0]);
            const specAfter = sc.slice(sIdx);
            const tableEnd = specAfter.indexOf("\n---\n");
            const tableSection = tableEnd > 0 ? specAfter.slice(0, tableEnd) : specAfter;
            const sRows = tableSection.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
            for (const row of sRows) {
              const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
              if (cells.length < 2) continue;
              const rowNum = cells[0];
              const sectionRe = new RegExp(`##\\s+${rowNum}\\.\\s`, "i");
              if (sectionRe.test(sc)) {
                mappingMatched++;
                const rd = rowDecisions.find((rd) => rd.num === rowNum);
                if (rd) {
                  const sectionStart = sc.search(sectionRe);
                  const nextSection = sc.slice(sectionStart).search(/\n##\s+\d+\.\s/);
                  const sectionBody = nextSection > 0
                    ? sc.slice(sectionStart, sectionStart + nextSection)
                    : sc.slice(sectionStart);
                  embedPairs.push({ planText: rd.text, specText: sectionBody });
                }
              }
            }
          }
        }
        // 子维度 B: 延续性 — embedding 余弦相似度
        if (embedPairs.length > 0) {
          try {
            const allTexts = embedPairs.flatMap((p) => [p.planText, p.specText]);
            const embeddings = await getEmbeddings(allTexts);
            for (let i = 0; i < embedPairs.length; i++) {
              const planVec = embeddings[i * 2];
              const specVec = embeddings[i * 2 + 1];
              const sim = cosineSimilarity(planVec, specVec);
              continuitySum += sim;
              continuityCount++;
            }
          } catch {
            // embedding 加载失败 → 降级纯结构分
            continuityCount = 0;
          }
        }
        const structSem = mappingTotal > 0 ? (mappingMatched / mappingTotal) * 100 : 0;
        const continuitySem = continuityCount > 0 ? (continuitySum / continuityCount) * 100 : 0;
        let semScore: number;
        if (mappingTotal > 0) {
          semScore = Math.round(structSem * 0.4 + continuitySem * 0.6);
        } else {
          const jacPS = jaccard(planTerms, specTermsRaw);
          semScore = rc
            ? Math.round(jacPS * 100)
            : Math.round(jacPS * 100 * (1 - CFG.SEMANTIC_MISSING_REVIEW_PENALTY));
        }
        parts.push(
          "=== 维度一：语义相关性 ===",
        );
        if (mappingTotal > 0) {
          parts.push(
            `  子维度 A: 映射结构 ${structSem.toFixed(0)}% (${mappingMatched}/${mappingTotal} 行已锚定)`,
            `  子维度 B: 延续性 ${continuitySem.toFixed(0)}% (${continuityCount} 对, 平均余弦 ${continuityCount > 0 ? (continuitySum / continuityCount).toFixed(3) : "-"})`,
            `  分数: ${semScore}/100`,
          );
        } else {
          const jacPS = jaccard(planTerms, specTermsRaw);
          parts.push(
            "  模式: 精简版 Plan（Jaccard 词汇相似度）",
            `  Jaccard(Plan↔Specs):  ${jacPS.toFixed(3)}`,
            `  分数: ${semScore}/100`,
          );
        }

        // 维度二: 信息熵匹配
        const pfreq = new Map<string, number>();
        for (const t of tokenize(pc)) pfreq.set(t, (pfreq.get(t) || 0) + 1);
        const sfreq = new Map<string, number>();
        for (const t of tokenize(sc)) sfreq.set(t, (sfreq.get(t) || 0) + 1);
        const pEntropy = shannonEntropy(pfreq),
          sEntropy = shannonEntropy(sfreq);
        const dPenalty = dengPenalty(pc);
        const entropyGap = sc
          ? Math.abs(pEntropy - sEntropy)
          : CFG.MISSING_SPECS_GAP;
        const entropyScore = sc
          ? Math.round(
              Math.max(
                0,
                100 - entropyGap * CFG.ENTROPY_GAP_MULT - dPenalty * 100,
              ),
            )
          : 0;
        parts.push(
          "=== 维度二：信息熵匹配（香农熵 + Deng 熵）===",
          `  Plan 香农熵: ${pEntropy.toFixed(2)} bits`,
          sc ? `  Specs 香农熵: ${sEntropy.toFixed(2)} bits` : "  Specs 缺失",
          `  Deng 熵惩罚: ${(dPenalty * 100).toFixed(0)}%`,
          `  熵差距: ${entropyGap.toFixed(2)}`,
          `  分数: ${entropyScore}/100`,
        );

        // 维度三: CPM 关键路径
        let cpmScore = 0;
        if (arContent) {
          const tasksContent =
            (await readFileSafe(join(specsDir, sn, "tasks.md"))) || "";
          // 提取 Task 块：兼容精简版（- [ ] Task N: ...）和标准版（### Task X.Y: ...）
          const taskReSimple =
            /- \[[ x]\] Task \d+(?:\.\d+)?: ([^\n]+)([\s\S]*?)(?=- \[[ x]\] Task \d+(?:\.\d+)?:|$)/g;
          const taskDescs: string[] = [];
          let tm: RegExpExecArray | null;
          while ((tm = taskReSimple.exec(tasksContent)) !== null)
            taskDescs.push(tm[1] + (tm[2] || ""));
          // 标准版兼容: ### Task X.Y: 标题后提取描述文本
          if (taskDescs.length === 0) {
            const taskReStd = /###\s+Task\s+(\d+(?:\.\d+)?)\s*[:：]\s*([^\n]+)/g;
            let tms: RegExpExecArray | null;
            while ((tms = taskReStd.exec(tasksContent)) !== null) {
              taskDescs.push(`Task ${tms[1]}: ${tms[2].trim()}`);
            }
          }
          // 业务原子化：Jaccard 计算 Task 间语义重叠，重叠越低越独立
          const totalPairs = (taskDescs.length * (taskDescs.length - 1)) / 2;
          const maxPairs = CFG.CPM_MAX_TASK_PAIRS;
          let totalOverlap = 0,
            pairs = 0;
          if (maxPairs > 0 && totalPairs > maxPairs) {
            // 随机采样避免 O(N²) 爆炸
            const sampled = new Set<number>();
            while (sampled.size < Math.min(maxPairs, totalPairs)) {
              sampled.add(Math.floor(Math.random() * totalPairs));
            }
            const allPairs: [number, number][] = [];
            for (let i = 0; i < taskDescs.length; i++) {
              for (let j = i + 1; j < taskDescs.length; j++) {
                allPairs.push([i, j]);
              }
            }
            for (const idx of sampled) {
              const [a, b] = allPairs[idx];
              totalOverlap += jaccard(
                tokenize(taskDescs[a]),
                tokenize(taskDescs[b]),
              );
              pairs++;
            }
          } else {
            for (let i = 0; i < taskDescs.length; i++) {
              for (let j = i + 1; j < taskDescs.length; j++) {
                totalOverlap += jaccard(
                  tokenize(taskDescs[i]),
                  tokenize(taskDescs[j]),
                );
                pairs++;
              }
            }
          }
          const avgOverlap = pairs > 0 ? totalOverlap / pairs : 0;
          const atomicScore = Math.round(
            (1 - Math.min(avgOverlap * CFG.CPM_OVERLAP_MULT, 1)) * 100,
          );
          // 注意力匹配：任务范围——文件耦合度 + 描述熵，衡量单次 AI 会话负担
          const fileRefs = (arContent.match(/`[^`]+\.(ts|js|sh|md)`/g) || [])
            .length;
          const filePerTask =
            taskDescs.length > 0 ? fileRefs / taskDescs.length : 99;
          const fileScore =
            filePerTask <= CFG.CPM_FILE_LOW
              ? 100
              : filePerTask <= CFG.CPM_FILE_MID
                ? 70
                : 40;
          const taskEntropies = taskDescs.map((d) =>
            shannonEntropy(new Map([...tokenize(d)].map((t) => [t, 1]))),
          );
          const avgTaskEntropy =
            taskEntropies.reduce((a, b) => a + b, 0) /
            (taskEntropies.length || 1);
          const entropyScore =
            avgTaskEntropy < CFG.CPM_ENTROPY_LOW
              ? 100
              : avgTaskEntropy < CFG.CPM_ENTROPY_MID
                ? 75
                : 50;
          const attentionScore = Math.round(
            fileScore * CFG.CPM_ATTENTION_WEIGHTS[0] +
              entropyScore * CFG.CPM_ATTENTION_WEIGHTS[1],
          );
          // 跨 Task 文件隔离: 检测同一文件是否被多个 Task 引用
          const fileTaskMap = new Map<string, number[]>();
          let taskIdx = 0;
          for (const d of taskDescs) {
            taskIdx++;
            const files = d.match(/`[^`]+\.(ts|js|sh|md)`/g) || [];
            for (const f of files) {
              const k = f.toLowerCase();
              if (!fileTaskMap.has(k)) fileTaskMap.set(k, []);
              fileTaskMap.get(k)!.push(taskIdx);
            }
          }
          const sharedFiles = [...fileTaskMap.values()].filter(
            (tasks) => tasks.length > 1,
          ).length;
          const isolationScore =
            fileTaskMap.size > 0
              ? Math.round((1 - sharedFiles / fileTaskMap.size) * 100)
              : 100;
          // 依赖图完整性: 检测表格式「依赖」列 或 内联声明
          const depPattern = /Task\s+(\d+).*?(?:依赖|→)\s*[:：]?\s*(.+)/gi;
          let depDeclared = 0,
            depMatches: RegExpExecArray | null;
          const depRegex = new RegExp(depPattern.source, "gi");
          while ((depMatches = depRegex.exec(arContent)) !== null) {
            const val = depMatches[2].trim();
            if (val && !/^无|none|-|n\/a$/i.test(val)) depDeclared++;
          }
          // 表格式检测: | N | Task | File | 依赖 | Status |
          const tableRows = arContent
            .split("\n")
            .filter((l) => /^\|\s*\d+/.test(l));
          if (depDeclared === 0 && tableRows.length > 0) {
            // 找到「依赖」列索引
            const headerRow = arContent
              .split("\n")
              .find(
                (l) =>
                  l.includes("|") && l.includes("依赖") && l.includes("---"),
              );
            let depCol = -1;
            if (headerRow) {
              const cols = headerRow.split("|").map((c) => c.trim());
              depCol = cols.findIndex((c) => c === "依赖");
            } else {
              // 无表头分隔线，找「依赖」所在行作为列名
              const depHeader = arContent
                .split("\n")
                .find(
                  (l) =>
                    l.includes("依赖") && !l.includes("---") && l.includes("|"),
                );
              if (depHeader)
                depCol = depHeader
                  .split("|")
                  .map((c) => c.trim())
                  .indexOf("依赖");
            }
            if (depCol > 0) {
              for (const row of tableRows) {
                const cols = row
                  .split("|")
                  .map((c) => c.trim())
                  .filter(Boolean);
                const depVal = cols[depCol - 1] || ""; // table rows have leading |, so shift by 1
                if (depVal && !/^无|none|-|n\/a$/i.test(depVal)) depDeclared++;
              }
            }
          }
          const depCoverage =
            taskDescs.length > 0
              ? Math.min(depDeclared / taskDescs.length, 1)
              : 0;
          const depScore = Math.round(
            (depCoverage * CFG.CPM_DEP_WEIGHTS[0] +
              (arContent.includes("Task Dependencies")
                ? CFG.CPM_DEP_WEIGHTS[1]
                : 0)) *
              100,
          );
          cpmScore = Math.round(
            atomicScore * CFG.CPM_SUB_WEIGHTS[0] +
              attentionScore * CFG.CPM_SUB_WEIGHTS[1] +
              depScore * CFG.CPM_SUB_WEIGHTS[2],
          );
          parts.push(
            "=== 维度三：CPM 任务拆分质量 ===",
            `  add-route: ${arFile}`,
            `  Task 数: ${taskDescs.length}`,
            `  业务原子化: Jaccard 平均重叠 ${avgOverlap.toFixed(3)} (独立度 ${atomicScore}%)`,
            `  注意力匹配: ${filePerTask.toFixed(1)}文件/Task(${fileScore}%) + 熵${avgTaskEntropy.toFixed(1)}bits(${entropyScore}%) = ${attentionScore}%`,
            `  依赖完整性: ${depDeclared}/${taskDescs.length} 已声明 (${depScore}%)`,
            `  文件隔离度: ${sharedFiles}/${fileTaskMap.size} 文件被多Task共享 (${isolationScore}%)`,
          );
        } else {
          parts.push(
            "=== 维度三：CPM 关键路径 ===",
            "  add-route 未找到，计 0",
            "  分数: 0/100",
          );
        }

        // 维度四: 结构完整度
        const hasPlaceholders = pc.match(/\{[^}]+\}/g);
        const hasSpecs = !!sc;
        const hasTasks = existsSync(join(specsDir, sn, "tasks.md"));
        const hasChecklist = existsSync(join(specsDir, sn, "checklist.md"));
        let structScore = 100;
        if (hasPlaceholders && hasPlaceholders.length > 0)
          structScore -= CFG.STRUCT_PLACEHOLDER;
        if (!hasSpecs) structScore -= CFG.STRUCT_MISSING_SPECS;
        if (!hasTasks) structScore -= CFG.STRUCT_MISSING_TASKS;
        if (!hasChecklist) structScore -= CFG.STRUCT_MISSING_CHECKLIST;
        let backflowScore = 100;
        if (rc) {
          const rp0p1 = rc
            .split("\n")
            .filter((l) => /^\|\s*\d+\s*\|\s*(P0|P1)\s*\|/.test(l)).length;
          const pb = (pc.match(/\[回流\s*[:：]/g) || []).length;
          if (rp0p1 > 0 && pb < rp0p1)
            backflowScore = Math.round((pb / rp0p1) * 100);
        }
        const structFinal = Math.round(
          structScore * CFG.STRUCT_SUB_WEIGHTS[0] +
            backflowScore * CFG.STRUCT_SUB_WEIGHTS[1],
        );
        parts.push(
          "=== 维度四：结构完整度 ===",
          `  三元组: ${[hasSpecs && "Specs", hasTasks && "Tasks", hasChecklist && "Checklist"].filter(Boolean).join("+") || "缺失"}`,
          `  占位符: ${hasPlaceholders?.length || 0} 个`,
          `  回流: ${backflowScore}/100`,
          `  分数: ${structFinal}/100`,
        );

        // FFT 自适应权重
        const fourScores = [semScore, entropyScore, cpmScore, structFinal];
        let histMatrix: number[][] = [];
        try {
          const history = (await (
            prisma.planRecord as Record<string, (...a: unknown[]) => unknown>
          ).findMany({
            where: { dpsComposite: { not: null } },
            orderBy: { updatedAt: "desc" },
            take: CFG.FFT_HISTORY_LIMIT,
          })) as {
            dpsSemScore: number | null;
            dpsEntropyScore: number | null;
            dpsCpmScore: number | null;
            dpsStructScore: number | null;
          }[];
          for (const h of history) {
            if (
              h.dpsSemScore != null &&
              h.dpsEntropyScore != null &&
              h.dpsCpmScore != null &&
              h.dpsStructScore != null
            ) {
              histMatrix.push([
                h.dpsSemScore,
                h.dpsEntropyScore,
                h.dpsCpmScore,
                h.dpsStructScore,
              ]);
            }
          }
        } catch {
          /* no history */
        }
        const weights = fftWeights(histMatrix);
        const weightLabels = ["语义", "熵", "CPM", "结构"];
        parts.push(
          "=== FFT 自适应权重 ===",
          weightLabels
            .map((l, i) => `  ${l}: ${(weights[i] * 100).toFixed(1)}%`)
            .join("\n"),
          histMatrix.length < CFG.FFT_COLD_START
            ? `  (冷启动: N<${CFG.FFT_COLD_START}, 均权降级)`
            : `  (基于 ${histMatrix.length} 条历史数据)`,
        );

        // DPS 复合
        const dps = Math.round(
          fourScores.reduce((s, v, i) => s + v * weights[i], 0),
        );
        const dpsLabel =
          dps >= CFG.THRESHOLD_PASS
            ? "🟢 PASS"
            : dps >= CFG.THRESHOLD_WARN
              ? "🟡 WARN"
              : "🔴 BLOCKED";
        parts.push(
          "",
          "=== DPS 复合计算 ===",
          ...weightLabels.map(
            (l, i) =>
              `  ${l}: ${fourScores[i]} × ${(weights[i] * 100).toFixed(1)}% = ${(fourScores[i] * weights[i]).toFixed(1)}`,
          ),
          "  ─────────────────────────────────",
          `  DPS = ${dps}  ${dpsLabel}`,
        );
        parts.push(
          "",
          `=== 判定 ===`,
          `  结果: ${dpsLabel}`,
          `  动作: ${dps >= CFG.THRESHOLD_PASS ? "可进入 Step 1" : dps >= CFG.THRESHOLD_WARN ? "回退补齐短板" : "回退细化 Plan 本身"}`,
        );

        // 回写 DPS 四维分到 PlanRecord，供后续 FFT 自适应权重消费
        try {
          const planRec = prisma.planRecord as Record<
            string,
            (...a: unknown[]) => unknown
          >;
          await planRec.updateMany({
            where: { planName: { contains: pp } },
            data: {
              dpsSemScore: semScore,
              dpsEntropyScore: entropyScore,
              dpsCpmScore: cpmScore,
              dpsStructScore: structFinal,
              dpsComposite: dps,
            },
          });
        } catch {
          /* 非阻塞：回写失败不影响 DPS 判定 */
        }

        return textResponse(parts.join("\n"));
      } catch (e) {
        return errorResponse(
          `check_dps 失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
}
