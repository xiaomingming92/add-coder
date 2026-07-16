/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-08 17:39:03
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-16 10:20:23
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/src/cli/prisma-injector.ts
 * @Description  : prisma注入
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { injectPrisma as strategyFn } from "../caijuehub/strategies/prisma.strategy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADD_PRISMA_TEMPLATE = resolve(__dirname, "../templates/core/prisma/add.prisma");

export interface PrismaInjectOptions { datasource?: string; yes?: boolean; force?: boolean; dryRun?: boolean; }

export async function injectPrisma(projectRoot: string, options: PrismaInjectOptions = {}): Promise<boolean> {
    return strategyFn(projectRoot, ADD_PRISMA_TEMPLATE, options);
}