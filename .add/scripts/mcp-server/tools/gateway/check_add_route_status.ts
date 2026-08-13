/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-31 15:30:00
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-31 15:30:00
 * @FilePath     : /add-coder/templates/core/scripts/mcp-server/tools/gateway/check_add_route_status.ts
 * @Description  : ADD 范式守卫工具：交叉校验 add-route 文件
 */
import * as z from "zod/v4";
import type { ToolRegistrar } from "../registrar.js";
import { join } from "path";
import { textResponse, errorResponse } from "../../shared/response.js";
import {
  readFileSafe,
  readdirRecursive,
  PROJECT_ROOT,
  MAGIC_DIR,
} from "../../shared/fs.js";
import { prisma } from "../../shared/prisma.js";
import { getRuntimeContext } from "../../shared/env.js";

function scanCheckboxes(content: string) {
  let t = 0,
    c = 0,
    u = 0;
  const inc: string[] = [];
  const ss: Array<{
    step: string;
    checked: number;
    unchecked: number;
  }> = [];
  let cs = "";
  for (const l of content.split("\n")) {
    const sm = l.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/);
    if (sm) {
      if (cs && (c > 0 || u > 0))
        ss.push({ step: cs, checked: c, unchecked: u });
      cs = sm[1];
      c = 0;
      u = 0;
      continue;
    }
    const cm = l.match(/^\s*-\s+\[([ xX])\]\s/);
    if (cm) {
      t++;
      if (cm[1] === "x" || cm[1] === "X") c++;
      else {
        u++;
        if (cs && !inc.includes(cs)) inc.push(cs);
      }
    }
  }
  if (cs && (c > 0 || u > 0))
    ss.push({ step: cs, checked: c, unchecked: u });
  return {
    total: t,
    checked: c,
    unchecked: u,
    incomplete: inc,
    statuses: ss,
  };
}

export function registerCheckAddRouteStatus(server: ToolRegistrar) {
  const runtimeContext = getRuntimeContext();
  server.registerTool(
    "check_add_route_status",
    {
      description: `ADD 范式守卫工具：交叉校验 add-route 文件的审计日志记录与文件系统存在性，并扫描文件内容统计 Step 完成度。\n必须在 Plan 进入 Handoff 或 Step 3 前调用。\n\n返回状态:\n- 'normal' — 审计日志有记录、文件存在、Step 全部闭环\n- 'warn_step_incomplete' — 文件存在但存在未勾选的 Step 产出项\n- 'file_missing' — 审计日志有记录但文件不存在\n- 'never_generated' — 审计日志无记录且文件不存在，禁止进入 Step 3`,
      inputSchema: z.object({
        planKeyword: z.string().describe("Plan 文件的关键词"),
      }),
    },
    async (args: Record<string, unknown>, _ctx: unknown) => {
      try {
        const planKeyword = args.planKeyword as string;
        if (!planKeyword) return errorResponse("planKeyword 参数不能为空");
        const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans");
        let auditHasRecord = false;
        const auditRecords: Array<{
          action: string;
          targetId: string;
          createdAt: Date;
        }> = [];
        try {
          const logs = await (
            prisma.auditLog as Record<string, (...a: unknown[]) => unknown>
          ).findMany({
            where: {
              projectKey: runtimeContext.projectKey,
              producerAdapterKey: runtimeContext.adapterKey,
              // 按当前 Plan 精准定位：targetId 同时含 planKeyword 与 add-route（与文件匹配语义一致）
              AND: [
                { targetId: { startsWith: `${MAGIC_DIR}/` } },
                { targetId: { contains: planKeyword, mode: "insensitive" } },
                { targetId: { contains: "add-route", mode: "insensitive" } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          }) as Array<{ targetId?: string; reason?: string; action: string; createdAt: Date }>;
          const pl = planKeyword.toLowerCase();
          for (const l of logs) {
            const ti = (l.targetId || "").toLowerCase();
            const r = (l.reason || "").toLowerCase();
            if (
              (ti.includes("add-route") && ti.includes(pl)) ||
              (r.includes("add-route") && r.includes(pl))
            ) {
              auditHasRecord = true;
              auditRecords.push({
                action: l.action,
                targetId: l.targetId || "unknown",
                createdAt: l.createdAt,
              });
            }
          }
        } catch {
          /* empty */
        }
        // 补查 DevOperation 表（record_dev_operation 写入通道；R10 修复，2026-08-12 用户拍板不另立 Plan，本 Plan 内闭环）
        try {
          const devLogs = await (
            prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
          ).findMany({
            where: {
              projectKey: runtimeContext.projectKey,
              producerAdapterKey: runtimeContext.adapterKey,
              // 按当前 Plan 精准定位（AND：planKeyword + add-route），命中集天然为当前 Plan 的 add-route 记录
              AND: [
                { targetId: { startsWith: `${MAGIC_DIR}/` } },
                { targetId: { contains: planKeyword, mode: "insensitive" } },
                { targetId: { contains: "add-route", mode: "insensitive" } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }) as Array<{
            targetId?: string;
            reason?: string;
            action: string;
            createdAt: Date;
          }>;
          const pl = planKeyword.toLowerCase();
          for (const l of devLogs) {
            const ti = (l.targetId || "").toLowerCase();
            const r = (l.reason || "").toLowerCase();
            if (
              (ti.includes("add-route") && ti.includes(pl)) ||
              (r.includes("add-route") && r.includes(pl))
            ) {
              auditHasRecord = true;
              auditRecords.push({
                action: l.action,
                targetId: l.targetId || "unknown",
                createdAt: l.createdAt,
              });
            }
          }
        } catch {
          /* empty */
        }
        let fileExists = false;
        const matchedFiles: string[] = [];
        try {
          const entries = await readdirRecursive(plansDir);
          for (const e of entries) {
            const el = e.toLowerCase();
            if (
              el.includes("add-route") &&
              el.includes(planKeyword.toLowerCase())
            ) {
              fileExists = true;
              matchedFiles.push(e);
            }
          }
        } catch {
          /* empty */
        }
        const parts = [
          `=== ADD 守卫：add-route 存在性交叉校验 ===`,
          `Plan 关键词: "${planKeyword}"`,
          `预期路径: ${MAGIC_DIR}/plans/{需求域名}-{核心内容}-add-route-v1.md`,
          "",
        ];
        if (auditHasRecord && fileExists) {
          const sc = scanCheckboxes(
            (await readFileSafe(join(plansDir, matchedFiles[0]))) || "",
          );
          const ok = sc.unchecked === 0;
          parts.push(
            `状态: ${ok ? "✅ normal" : "⚠️ warn_step_incomplete"}`,
            ok ? "操作: 继续执行后续流程" : "操作: ⚠️ 存在未闭环 Step",
            "",
          );
          parts.push("=== 审计记录 ===");
          for (const r of auditRecords.slice(0, 5))
            parts.push(
              `  [${r.createdAt.toISOString()}] ${r.action} → ${r.targetId}`,
            );
          parts.push("");
          parts.push("=== 匹配文件 ===");
          for (const f of matchedFiles) parts.push(`  ${MAGIC_DIR}/plans/${f}`);
          parts.push("", "=== Step 完成度扫描 ===");
          if (sc.total === 0) parts.push("  ⚠️ 未检测到 checkbox");
          else {
            const rate = Math.round((sc.checked / sc.total) * 100);
            parts.push(`  整体: ${sc.checked}/${sc.total} (${rate}%)`);
            for (const s of sc.statuses)
              parts.push(
                `  Step ${s.step}: ${s.unchecked === 0 ? "✅" : "⬜"} ${s.checked}/${s.checked + s.unchecked}`,
              );
            if (sc.incomplete.length > 0) {
              parts.push("", `  ⚠️ 未闭环 Step: ${sc.incomplete.join(", ")}`);
            }
          }
          return textResponse(parts.join("\n"));
        }
        if (auditHasRecord && !fileExists) {
          parts.push(
            "状态: ❌ file_missing — add-route 文件丢失",
            "操作: 中断推理，询问用户原因",
            "",
            "审计日志显示 add-route 曾经存在但文件系统中找不到。",
            "",
            "=== 审计记录 ===",
          );
          for (const r of auditRecords.slice(0, 5))
            parts.push(
              `  [${r.createdAt.toISOString()}] ${r.action} → ${r.targetId}`,
            );
          return errorResponse(parts.join("\n"));
        }
        if (!auditHasRecord && !fileExists) {
          parts.push(
            "状态: ❌ never_generated — add-route 文件从未生成",
            "操作: 禁止进入 Step 3，强制回退至 Step 0.5",
            "",
            `在 ${MAGIC_DIR}/plans/ 下未找到包含 "${planKeyword}" 和 "add-route" 的文件。`,
            "",
            "=== 必须执行的步骤 ===",
            "1. 回退到 Step 0.5",
            '2. 调用 get_add_template({ template: "add-route-template" })',
            "3. 按模板填充",
            `4. 保存为 ${MAGIC_DIR}/plans/{需求域名}-{核心内容}-add-route-v1.md`,
            "5. 调用 record_dev_operation 记录",
            "6. 重新调用本工具验证",
          );
          return errorResponse(parts.join("\n"));
        }
        const scW = scanCheckboxes(
          (await readFileSafe(join(plansDir, matchedFiles[0]))) || "",
        );
        const wOk = scW.unchecked === 0;
        parts.push(
          `状态: ⚠️ warn${scW.total > 0 && !wOk ? "_step_incomplete" : ""} — 文件存在但审计日志无记录`,
          "操作: 允许继续，但建议补记录",
          "",
          "=== 匹配文件 ===",
        );
        for (const f of matchedFiles) parts.push(`  ${MAGIC_DIR}/plans/${f}`);
        if (scW.total > 0) {
          parts.push(
            "",
            "=== Step 完成度扫描 ===",
            `  整体: ${scW.checked}/${scW.total} (${Math.round((scW.checked / scW.total) * 100)}%)`,
          );
          if (scW.incomplete.length > 0)
            parts.push(`  ⚠️ 未闭环 Step: ${scW.incomplete.join(", ")}`);
        }
        parts.push("", "=== 建议 ===", "1. 调用 record_dev_operation 补记录");
        if (scW.incomplete.length > 0)
          parts.push("2. 调用 check_add_route_completeness 获取详细清单");
        return textResponse(parts.join("\n"));
      } catch (e) {
        return errorResponse(
          `add-route 存在性校验失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
}
