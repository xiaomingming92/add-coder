/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-31 15:30:00
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-31 15:30:00
 * @FilePath     : /add-coder/templates/core/scripts/mcp-server/tools/gateway/check_add_route_completeness.ts
 * @Description  : ADD 范式守卫工具：扫描 add-route 文件的 Step 完成度
 */
import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import { existsSync } from "fs";
import { join } from "path";
import { textResponse, errorResponse } from "../../shared/response.js";
import {
  readFileSafe,
  readdirRecursive,
  PROJECT_ROOT,
  MAGIC_DIR,
} from "../../shared/fs.js";

export function registerCheckAddRouteCompleteness(server: McpServer) {
  server.registerTool(
    "check_add_route_completeness",
    {
      description:
        "ADD 范式守卫工具：扫描 add-route 文件的 Step 完成度。统计 add-route 中每个 Step 的 [ ] 和 [x] 勾选项数量，返回逐 Step 完成率及整体状态。",
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
        const allFiles = await readdirRecursive(plansDir);
        const arFile = allFiles.find(
          (f) =>
            f.toLowerCase().includes(pp.toLowerCase()) &&
            f.includes("add-route"),
        );
        if (!arFile)
          return errorResponse(`未找到匹配的 add-route 文件（关键词: ${pp}）`);
        const content = await readFileSafe(join(plansDir, arFile));
        if (!content) return errorResponse("add-route 文件无法读取");
        const steps: Record<string, { checked: number; unchecked: number }> =
          {};
        let cur = "";
        let tc = 0,
          tu = 0;
        for (const l of content.split("\n")) {
          const sm = l.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/);
          if (sm) {
            cur = sm[1];
            steps[cur] = { checked: 0, unchecked: 0 };
            continue;
          }
          const cm = l.match(/^\s*-\s+\[([ xX])\]\s/);
          if (cm) {
            tc++;
            if (cm[1] === "x" || cm[1] === "X") {
              tu++;
              if (cur) steps[cur].checked++;
            } else {
              if (cur) steps[cur].unchecked++;
            }
          }
        }
        const parts = [
          `=== add-route Step 完成度扫描 ===`,
          `文件: ${MAGIC_DIR}/plans/${arFile}`,
          `整体: ${tu}/${tc} (${tc > 0 ? Math.round((tu / tc) * 100) : 0}%)`,
          "",
        ];
        for (const [s, st] of Object.entries(steps))
          parts.push(
            `  Step ${s}: ${st.unchecked === 0 ? "✅" : "⬜"} ${st.checked}/${st.checked + st.unchecked}`,
          );
        if (tc === 0) parts.push("  ⚠️ 未检测到 checkbox");
        else if (tc === tu)
          parts.push("", "✅ 所有 Step 产出项全部 [x]，add-route 完整闭环");
        else parts.push("", "⚠️ 存在未勾选的 Step 产出项，需继续执行");
        return textResponse(parts.join("\n"));
      } catch (e) {
        return errorResponse(
          `add-route 完成度扫描失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
}
