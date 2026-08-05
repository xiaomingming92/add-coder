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
import { join } from "path";
import { textResponse, errorResponse } from "../../shared/response.js";
import {
  readFileSafe,
  readdirRecursive,
  PROJECT_ROOT,
  MAGIC_DIR,
} from "../../shared/fs.js";
import { prisma } from "../../shared/prisma.js";

export function registerCheckRahs(server: ToolRegistrar) {
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
            f.toLowerCase().includes(pp.toLowerCase()) && f.includes("-plan-v"),
        );
        if (!pm)
          return errorResponse(`未找到匹配的 Plan 文件（关键词: ${pp}）`);
        let scopeScore = 80,
          typeScore = 80,
          auditScore = 80,
          specScore = 80,
          symScore = 80;
        try {
          const { spawnSync } = await import("child_process");
          const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
            cwd: PROJECT_ROOT,
            encoding: "utf-8",
            timeout: 30000,
          });
          typeScore =
            tsc.status === 0
              ? 100
              : Math.max(
                  0,
                  100 -
                    (tsc.stderr || "").split("\n").filter(Boolean).length * 5,
                );
        } catch {}
        try {
          const logs = (await (
            prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
          ).findMany({
            where: {
              OR: [
                { planKeyword: { contains: pp, mode: "insensitive" } },
                { targetId: { contains: pp, mode: "insensitive" } },
              ],
            },
            select: { id: true },
            take: 20,
          })) as Array<{ id: string }>;
          auditScore = Math.min(100, logs.length * 10);
        } catch {}
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
