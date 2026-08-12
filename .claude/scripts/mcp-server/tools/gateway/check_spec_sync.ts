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
        // 多版本（-plan-vN）共存时取版本号最高者：活跃 Plan 优先，避免评分旧版（2026-08-12 修复，同 check_dps R9）
        let planMatch: string | undefined = planFiles
          .filter(
            (f) =>
              f.toLowerCase().includes(kw.toLowerCase()) && f.includes("-plan-v"),
          )
          .sort((a, b) => {
            const va = parseInt(a.match(/-plan-v(\d+)/)?.[1] ?? "0", 10);
            const vb = parseInt(b.match(/-plan-v(\d+)/)?.[1] ?? "0", 10);
            return vb - va;
          })[0];
        if (!planMatch)
          planMatch = planFiles.find((f) =>
            f.toLowerCase().includes(kw.toLowerCase()),
          );
        if (!planMatch)
          return errorResponse(`未找到匹配的 Plan 文件（关键词: ${kw}）`);
        lines.push(`Plan: ${planMatch}`);

        // 定位 add-route 文件
        const kwNoVersion = kw.replace(/-plan-v\d+$/i, "");
        const arFile = planFiles.find(
          (f) =>
            f.toLowerCase().includes(kwNoVersion.toLowerCase()) &&
            f.toLowerCase().includes("add-route"),
        );
        if (!arFile) {
          lines.push("add-route: 未找到", "");
          lines.push("💡 提示：tasks.md/checklist.md 进度请用 plan_track 或 plan_status 查询");
        } else {
          lines.push(`add-route: ${arFile}`);
          const arContent = (await readFileSafe(join(plansDir, arFile))) || "";
          // 提取 add-route 附录文件清单
          const appendixFiles = (arContent.match(/`[^`]+\.(ts|js|sh|md|tsx|json)`/g) || [])
            .map((f: string) => f.replace(/`/g, ""));
          lines.push(`附录文件: ${appendixFiles.length} 个`);

          // git diff 变更文件（win32 下 git 为 .cmd → runCommand 自动解析，issue #10 跨端修复）
          let diffFiles: string[] = [];
          try {
            const diff = runCommand("git", ["diff", "--name-only"], {
              cwd: PROJECT_ROOT,
              timeout: 5000,
            });
            diffFiles = diff.stdout.trim().split("\n").filter(Boolean);
          } catch {
            lines.push("Git diff: 无法获取");
          }
          lines.push(`Git diff: ${diffFiles.length} 个变更文件`);

          // 交叉比对
          if (appendixFiles.length > 0 && diffFiles.length > 0) {
            const appendixSet = new Set(appendixFiles.map((f: string) => f.toLowerCase()));
            // 豁免 sync 自动生成产物（mirror 副本 + 备份）——非本 Plan 实施文件（2026-08-12 修复）
            const isSyncGenerated = (lf: string) =>
              lf.startsWith(".qoder/") ||
              lf.startsWith(".claude/") ||
              lf.startsWith(".vscode/") ||
              lf.startsWith(".add/") ||
              lf.startsWith(".backup/");
            const unmatched = diffFiles.filter(
              (f: string) =>
                !isSyncGenerated(f.toLowerCase()) &&
                !appendixSet.has(f.toLowerCase()),
            );
            if (unmatched.length > 0) {
              lines.push(`⚠️ ${unmatched.length} 个文件在 git diff 中但不在 add-route 附录中:`);
              unmatched.forEach((f: string) => lines.push(`  - ${f}`));
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
