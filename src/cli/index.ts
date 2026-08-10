#!/usr/bin/env node
import { readFileSync } from "fs";
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { syncCommand } from "./commands/sync";
import { statusCommand } from "./commands/status";
import { stackCommand } from "./commands/stack";
import { ensureEmbeddingModel } from "../lib/model-predownload";

const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

/**
 * model:download 命令（model-predownload Plan）：主入口，失败严格抛错非零退出。
 * 成功输出状态 + 缓存位置 + generate 一致性提示（Review P2 #4）。
 */
async function modelDownloadCommand(options: { force?: boolean }) {
    try {
        const r = await ensureEmbeddingModel({ force: options.force });
        console.log(`模型预下载: ${r.status}${r.model ? ` (${r.model})` : ""}`);
        if (r.cacheDir) console.log(`缓存位置: ${r.cacheDir}`);
        // Review P2 #4：运行时 DPS 配置以 generate 产物为准（提示不阻断）
        console.log("提示: 运行时 DPS 使用的模型配置以 `add-coder generate` 生成的配置为准");
    } catch (e) {
        console.error(`模型预下载失败: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }
}

const program = new Command();

program
    .name("add-coder")
    .description("初始化 ADD 范式工作流模板")
    .version(version);

program
    .command("init")
    .description("初始化 ADD 模板到当前项目")
    .option("--adapter <type>", "目标 IDE: claude | qoder | vscode | trae | codex")
    .option("--config <path>", "指定配置文件路径")
    .option("--force", "覆盖已有文件，不交互")
    .option("--dry-run", "预览模式，不实际写入")
    .option("--stack <name>", "技术栈约束 profile 名（如 machineserver，可选）")
    .option("--skip-model", "跳过 embedding 模型预下载")
    .option("--print-mcp-config", "Codex: stdout 输出 config.toml 片段（不写盘，不初始化项目）")
    .option("--write-user-config", "Codex: 显式确认后写入 ~/.codex/config.toml（先备份）")
    .action(initCommand);

program
    .command("sync")
    .description("增量同步缺失文件（--patch 覆盖已有模板）")
    .option("--adapter <type>", "目标 IDE: claude | qoder | vscode | trae | codex")
    .option("--patch", "覆盖已有模板文件（不碰 plans/specs/reviews）")
    .option("-i, --interactive", "交互式选择要同步的文件")
    .option("--model", "检测到缺失时下载 embedding 模型")
    .action(syncCommand);

program
    .command("status")
    .description("检查 ADD 模板完整性")
    .action(statusCommand);

program
    .command("stack")
    .description("管理技术栈约束 profile（list / set <name> / show / --clear）")
    .argument("[sub]", "list | set | show")
    .argument("[name]", "set <name>: profile 名（内置或自定义）")
    .option("--adapter <type>", "目标 IDE: claude | qoder | vscode | trae | codex")
    .option("--clear", "清除技术栈设置（中性）")
    .action((sub: string | undefined, name: string | undefined, options: { adapter?: string; clear?: boolean }) =>
        stackCommand(sub, name, options),
    );

program
    .command("model:download")
    .description("预下载 embedding 模型（首次 DPS 调用会自动下载，本命令提前拉取）")
    .option("--force", "强制重新下载（即使缓存已存在）")
    .action(modelDownloadCommand);

program.parse();