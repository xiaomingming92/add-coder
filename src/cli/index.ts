#!/usr/bin/env node
import { readFileSync } from "fs";
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { syncCommand } from "./commands/sync";
import { statusCommand } from "./commands/status";
import { stackCommand } from "./commands/stack";

const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

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
    .action(initCommand);

program
    .command("sync")
    .description("增量同步缺失文件（--patch 覆盖已有模板）")
    .option("--adapter <type>", "目标 IDE: claude | qoder | vscode | trae | codex")
    .option("--patch", "覆盖已有模板文件（不碰 plans/specs/reviews）")
    .option("-i, --interactive", "交互式选择要同步的文件")
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

program.parse();