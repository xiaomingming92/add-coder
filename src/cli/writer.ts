import { writeFiles as strategyFn } from "../caijuehub/strategies/writer.strategy";

export interface WriteOptions { yes?: boolean; force?: boolean; dryRun?: boolean; }

export async function writeFiles(
    projectRoot: string,
    files: Map<string, string>,
    options: WriteOptions = {},
): Promise<{ created: number; skipped: number; overwritten: number }> {
    return strategyFn(projectRoot, files, options);
}