import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { injectPrisma as strategyFn } from "../caijuehub/strategies/prisma.strategy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADD_PRISMA_TEMPLATE = resolve(__dirname, "../templates/core/prisma/add.prisma");

export interface PrismaInjectOptions { yes?: boolean; force?: boolean; dryRun?: boolean; }

export async function injectPrisma(projectRoot: string, options: PrismaInjectOptions = {}): Promise<boolean> {
    return strategyFn(projectRoot, ADD_PRISMA_TEMPLATE, options);
}