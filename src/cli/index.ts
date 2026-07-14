#!/usr/bin/env node
import { readFileSync } from "fs";
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { syncCommand } from "./commands/sync";
import { statusCommand } from "./commands/status";

const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

const program = new Command();

program
    .name("add-coder")
    .description("初始化 ADD 范式工作流模板")
    .version(version);

program
    .command("init")
    .description("初始化 ADD 模板到当前项目")
    .option("--adapter <type>", "目标 IDE: claude | qoder | vscode")
    .option("--config <path>", "指定配置文件路径")
    .option("--force", "覆盖已有文件，不交互")
    .option("--dry-run", "预览模式，不实际写入")
    .action(initCommand);

program
    .command("sync")
    .description("增量同步缺失文件")
    .action(syncCommand);

program
    .command("status")
    .description("检查 ADD 模板完整性")
    .action(statusCommand);

program.parse();