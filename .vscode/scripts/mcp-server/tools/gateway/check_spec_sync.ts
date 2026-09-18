/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-31 17:00:00
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-31 17:00:00
 * @FilePath     : /add-coder/templates/core/scripts/mcp-server/tools/gateway/check_spec_sync.ts
 * @Description  : ADD 文档-代码交叉校验工具（精简版）—— git diff ↔ add-route 文件清单一致性。
 *                 tasks.md/checklist.md 进度由 plan_track 在 PlanRecord 中维护，此处不再重复扫描。
 */
import * as z from "zod/v4";
import type { ToolRegistrar } from "../registrar.js";
import { MAGIC_PREFIXES } from "../../shared/fs.js";
import { existsSync } from "fs";
import { join, basename } from "path";
import { textResponse, errorResponse } from "../../shared/response.js";
import {
  readFileSafe,
  readdirRecursive,
  PROJECT_ROOT,
  MAGIC_DIR,
} from "../../shared/fs.js";
import { runCommand } from "../../shared/run-command.js";
import {
  attributeToOtherPlans,
  extractAppendixFiles,
  parseArtifactName,
  resolvePlanArtifact,
  splitGitPathList,
} from "./plan-resolve.js";

export function registerCheckSpecSync(server: ToolRegistrar) {
  server.registerTool(
    "check_spec_sync",
    {
      description:
        "ADD 文档-代码交叉校验工具（精简版）。比对 git diff 变更文件与 add-route 附录文件清单，报告不一致。tasks.md/checklist.md 扫描已由 plan_track 接管，本工具不再重复。",
      inputSchema: z.object({
        planKeyword: z.string().describe("Plan 文件的关键词"),
      }),
    },
    async (args: Record<string, unknown>, _ctx: unknown) => {
      try {
        const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans");
        const lines: string[] = [
          "=== check_spec_sync 文档-代码交叉校验（精简版）===",
          "",
        ];
        if (!existsSync(plansDir))
          return errorResponse(`plans 目录不存在: ${plansDir}`);
        const planFiles = (await readdirRecursive(plansDir)).filter((f) =>
          f.endsWith(".md"),
        );
        const kw = args.planKeyword as string;
        // 版本配对解析（单一真源 plan-resolve）：Plan 取最高版本且排除 .hitl 提案；
        // add-route 与 Plan 同目录同版本优先 —— 旧实现"去版本取首个匹配"永远命中 v1（2026-09-18 修复）
        const { plan, artifact: ar } = resolvePlanArtifact(planFiles, kw, "add-route");
        if (!plan)
          return errorResponse(`未找到匹配的 Plan 文件（关键词: ${kw}）`);
        lines.push(`Plan: ${plan.file}${plan.version > 0 ? ` (v${plan.version})` : ""}`);

        if (!ar) {
          lines.push("add-route: 未找到", "");
          lines.push("💡 提示：tasks.md/checklist.md 进度请用 plan_track 或 plan_status 查询");
        } else {
          lines.push(
            `add-route: ${ar.file}${ar.version > 0 ? ` (v${ar.version})` : ""} 〔配对依据: ${ar.via}〕`,
          );
          if (ar.warning) lines.push(`⚠️ ${ar.warning}`);
          const arContent = (await readFileSafe(join(plansDir, ar.file))) || "";
          // 提取 add-route 附录文件清单（toml 纳入：sync-magic-rules.toml 等控制面文件，2026-08-18 修复）
          // sql/prisma 纳入（2026-09-16 修复）：原生 DDL 与 schema 是常见交付物，此前不在白名单 →
          // 附录里明明登记了 `.../sqlite-fts5.sql` 仍被判"不在附录中"（假告警）。
          const appendixFiles = extractAppendixFiles(arContent);
          lines.push(`附录文件: ${appendixFiles.length} 个`);

          // git diff 变更文件（win32 下 git 为 .cmd → runCommand 自动解析，issue #10 跨端修复）
          let diffFiles: string[] = [];
          try {
            // -z（NUL 分隔）下 git 永不加引号/八进制转义 —— 比 core.quotepath=false 更硬：
            // 后者在路径含特殊字符时仍可能加引号，而带引号的 `".codex/..."` 既躲过 magic 前缀豁免，
            // 也与附录里的真实路径比不中（2026-09-18 修复：check_spec_sync / check_rahs 同源）
            const diff = runCommand(
              "git",
              ["-c", "core.quotepath=false", "diff", "--name-only", "-z"],
              { cwd: PROJECT_ROOT, timeout: 5000 },
            );
            diffFiles = splitGitPathList(diff.stdout);
          } catch {
            lines.push("Git diff: 无法获取");
          }
          lines.push(`Git diff: ${diffFiles.length} 个变更文件`);

          // 交叉比对
          if (appendixFiles.length > 0 && diffFiles.length > 0) {
            const appendixSet = new Set(appendixFiles.map((f: string) => f.toLowerCase()));
            // 豁免 sync 自动生成产物（mirror 副本 + 备份）——非本 Plan 实施文件（2026-08-12 修复）
            const isSyncGenerated = (lf: string) =>
              MAGIC_PREFIXES.some((p) => lf.startsWith(`${p}/`));
            const unmatched = diffFiles.filter(
              (f: string) =>
                !isSyncGenerated(f.toLowerCase()) &&
                !appendixSet.has(f.toLowerCase()),
            );
            if (unmatched.length > 0) {
              // 工作区常有多个 Plan 同时在飞 —— 先分摊归属，把"其它 Plan 已登记"从本 Plan 的
              // 未登记噪声里摘出来（按日期新者优先读，全部命中即提前结束）
              const otherRoutes = planFiles
                .filter((f) => {
                  const parsed = parseArtifactName(f, "add-route");
                  return parsed !== null && f !== ar.file;
                })
                .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
              const { owners, unowned } = await attributeToOtherPlans(
                unmatched,
                otherRoutes,
                (rel) => readFileSafe(join(plansDir, rel)),
              );
              if (unowned.length > 0) {
                lines.push(`⚠️ ${unowned.length} 个文件在 git diff 中但不在本 Plan 附录中:`);
                unowned.forEach((f: string) => lines.push(`  - ${f}`));
              } else {
                lines.push("✅ 本 Plan 附录已覆盖全部非其它 Plan 的变更文件");
              }
              if (owners.size > 0) {
                lines.push(
                  "",
                  `ℹ️ ${owners.size} 个文件属于其它 Plan 已登记的交付物（本 Plan 不判定）:`,
                );
                for (const { file, route } of owners.values()) {
                  lines.push(`  - ${file} ← ${route}`);
                }
              }
            } else {
              lines.push("✅ git diff 变更文件全部在 add-route 附录中");
            }
          }
          lines.push("");
          lines.push("💡 tasks.md/checklist.md 进度请用 plan_track 或 plan_status 查询");
        }
        return textResponse(lines.join("\n"));
      } catch (e) {
        return errorResponse(
          `check_spec_sync 失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
}
