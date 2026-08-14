/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-31 15:30:00
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-31 15:30:00
 * @FilePath     : /add-coder/templates/core/scripts/mcp-server/tools/gateway/check_rahs.ts
 * @Description  : RAHS 闸门（Runtime Architecture Health Score）
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
import { runCommand } from "../../shared/run-command.js";
import { getRuntimeContext } from "../../shared/env.js";

export function registerCheckRahs(server: ToolRegistrar) {
  const runtimeContext = getRuntimeContext();
  server.registerTool(
    "check_rahs",
    {
      description:
        "RAHS 闸门（Runtime Architecture Health Score）。检查范围保真度、类型安全、审计完整度等。RAHS >= 90 通过。",
      inputSchema: z.object({
        planKeyword: z.string().describe("Plan 文件的关键词"),
      }),
    },
    async (args: Record<string, unknown>, _ctx: unknown) => {
      try {
        const pp = args.planKeyword as string;
        if (!pp) return errorResponse("planKeyword 参数不能为空");
        const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans");
        if (!existsSync(plansDir))
          return errorResponse(`plans 目录不存在: ${plansDir}`);
        const apf = (await readdirRecursive(plansDir)).filter((f) =>
          f.endsWith(".md"),
        );
        const pm = apf.find(
          (f) =>
            f.toLowerCase().includes(pp.toLowerCase()) &&
            f.includes("-plan-v") &&
            !f.includes(".hitl"),
        );
        if (!pm)
          return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`);
        let scopeScore = 80,
          typeScore = 80,
          auditScore = 80,
          specScore = 80,
          symScore = 80;
        try {
          // win32 下 npx 为 .cmd → runCommand 自动解析（issue #10 跨端修复）
          const tsc = runCommand("npx", ["tsc", "--noEmit"], {
            cwd: PROJECT_ROOT,
            timeout: 30000,
          });
          typeScore =
            tsc.status === 0
              ? 100
              : Math.max(
                  0,
                  100 - tsc.stderr.split("\n").filter(Boolean).length * 5,
                );
        } catch { /* type check is best-effort */ }
        try {
          const logs = (await (
            prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
          ).findMany({
            where: {
              projectKey: runtimeContext.projectKey,
              producerAdapterKey: runtimeContext.adapterKey,
              OR: [
                { planKeyword: { contains: pp, mode: "insensitive" } },
                { targetId: { contains: pp, mode: "insensitive" } },
              ],
            },
            select: { id: true },
            take: 20,
          })) as Array<{ id: string }>;
          auditScore = Math.min(100, logs.length * 10);
        } catch { /* audit score remains conservative */ }
        // ── 范围保真度 / Spec 合规 / 阶段对称性：从静态基线改为动态计算（修复：
        //    三个维度原为固定 80，任何 Plan 的 RAHS 上限 88 永远无法通过）──
        try {
          const arFile = apf.find(
            (f) =>
              f.toLowerCase().includes(pp.toLowerCase()) &&
              f.toLowerCase().includes("add-route"),
          );
          if (arFile) {
            const arContent =
              (await readFileSafe(join(plansDir, arFile))) || "";
            const checks = arContent.match(/^- \[[ x]\]/gm) || [];
            const done = checks.filter((c) => c.includes("[x]")).length;
            // 阶段对称性：add-route Step 产出项勾选率（Handoff/Report Closure 等
            //    条件项未勾选时按比例折算，不阻塞）
            symScore = checks.length > 0
              ? Math.max(70, Math.round((done / checks.length) * 100))
              : 70;
          }
        } catch { /* add-route progress unavailable */ }
        try {
          // Spec 合规：checklist [T] 项勾选率（[R] 运行时项不计入）
          const specDir = join(PROJECT_ROOT, MAGIC_DIR, "specs");
          // spec 目录名可能带 -vN 版本后缀：优先带版本匹配，回退不带版本 [Task 1.8 修复]
          const rahsPlanBase = basename(pm, ".md").replace(/-plan-v\d+$/i, "");
          const rahsVersionSuffix = /-plan-(v\d+)$/i.exec(basename(pm, ".md"))?.[1] ?? "";
          const rahsCandidates = rahsVersionSuffix
            ? [`${rahsPlanBase}-${rahsVersionSuffix}`, rahsPlanBase]
            : [rahsPlanBase];
          const planContent = (await readFileSafe(join(plansDir, pm))) || "";
          const rahsSpecRef = planContent.match(/specs\/([^/`\s]+)/);
          if (rahsSpecRef) rahsCandidates.push(rahsSpecRef[1]);
          const sn =
            rahsCandidates.find((d) => existsSync(join(specDir, d))) ??
            rahsCandidates[0];
          const clPath = join(specDir, sn, "checklist.md");
          if (existsSync(clPath)) {
            const cl = (await readFileSafe(clPath)) || "";
            const tItems = cl.match(/^- \[[ x]\] \[T\]/gm) || [];
            const tDone = tItems.filter((c) => c.includes("[x]")).length;
            specScore = tItems.length > 0
              ? Math.max(70, Math.round((tDone / tItems.length) * 100))
              : 70;
          }
        } catch { /* checklist progress unavailable */ }
        try {
          // 范围保真度：git diff 变更文件与 add-route 附录清单匹配率
          const arFile = apf.find(
            (f) =>
              f.toLowerCase().includes(pp.toLowerCase()) &&
              f.toLowerCase().includes("add-route"),
          );
          if (arFile) {
            const arContent =
              (await readFileSafe(join(plansDir, arFile))) || "";
            const appendix = (
              arContent.match(/`[^`]+\.(ts|js|sh|md|tsx|json|yml|yaml)`/g) ||
              []
            ).map((f: string) => f.replace(/`/g, "").toLowerCase());
            const diff = runCommand("git", ["diff", "--name-only"], {
              cwd: PROJECT_ROOT,
              timeout: 5000,
            });
            const diffFiles = diff.stdout
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((f: string) => f.toLowerCase());
            if (appendix.length > 0 && diffFiles.length > 0) {
              const matched = diffFiles.filter((f) =>
                appendix.some((a) => f === a || f.endsWith(`/${a}`)),
              ).length;
              scopeScore = Math.max(70, Math.round((matched / diffFiles.length) * 100));
            }
          }
        } catch { /* git scope evidence unavailable */ }
        const parts = [
          "=== RAHS：Runtime Architecture Health Score ===",
          `Plan 关键词: "${pp}"`,
          "",
          `=== 维度 ===`,
          `  范围保真度: ${scopeScore}/100`,
          `  类型安全: ${typeScore}/100`,
          `  审计完整度: ${auditScore}/100`,
          `  Spec 合规: ${specScore}/100`,
          `  阶段对称性: ${symScore}/100`,
          "",
        ];
        const rahs = Math.round(
          (scopeScore + typeScore + auditScore + specScore + symScore) / 5,
        );
        parts.push(
          `=== RAHS = ${rahs}  ${rahs >= 90 ? "🟢 PASS" : rahs >= 70 ? "🟡 WARN" : "🔴 BLOCKED"} ===`,
        );
        if (rahs < 70) parts.push("  动作: 注意力漂移严重，返工回退");
        return textResponse(parts.join("\n"));
      } catch (e) {
        return errorResponse(
          `check_rahs 失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
}
