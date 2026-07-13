import { detectIDE, resolveAdapters } from "../detect";
import { loadConfig } from "../config-loader";
import { writeFiles } from "../writer";
import { renderCore } from "../../core/renderer";
import { renderAdapter as renderClaude } from "../../adapters/claude/renderer";
import { renderAdapter as renderQoder } from "../../adapters/qoder/renderer";
import { renderAdapter as renderVSCode } from "../../adapters/vscode/renderer";
import { injectPrisma } from "../prisma-injector";
import type { Adapter } from "../../config/schema";

interface InitOptions {
    adapter?: string;
    config?: string;
    yes?: boolean;
    force?: boolean;
    dryRun?: boolean;
}

const ADAPTER_RENDERERS: Record<string, (config: any, targetDir: string, dryRun: boolean) => Map<string, string>> = {
    claude: renderClaude,
    qoder: renderQoder,
    vscode: renderVSCode,
};

export async function initCommand(options: InitOptions) {
    const projectRoot = process.cwd();

    // ① 检测 IDE
    const specified = options.adapter && options.adapter !== "auto" ? options.adapter as Adapter : null;
    const target = specified || detectIDE(projectRoot);
    console.log(`检测到 IDE: ${target}${specified ? " (--adapter)" : " (自动)"}`);

    // ② 加载配置
    const config = await loadConfig(projectRoot, options.config, { yes: options.yes, force: options.force });
    config.projectRoot = projectRoot;

    // ③ Prisma 注入（硬阻断：无 Prisma 则 ADD MCP 工具链不可用，不部署模板）
    if (!options.dryRun) {
        await injectPrisma(projectRoot, { yes: options.yes, force: options.force, dryRun: options.dryRun });
    }

    // ④ 渲染 core 模板 → 输出到 .add/
    const coreFiles = renderCore(config, !!options.dryRun);
    console.log(`Core 模板: ${coreFiles.size} 文件`);

    // ④b core 内容同步到 .qoder/ .claude/（IDE 只认自身 magic path）
    const CORE_TARGETS = [".add", ".qoder", ".claude"];
    const allFiles = new Map<string, string>();
    for (const [relPath, content] of coreFiles) {
        for (const target of CORE_TARGETS) {
            const targetPath = relPath.replace(/^\.add/, target);
            if (!allFiles.has(targetPath)) {
                allFiles.set(targetPath, content);
            }
        }
    }

    // ⑤ 渲染 adapter 模板
    const adapters = resolveAdapters(target);

    for (const adapter of adapters) {
        const renderFn = ADAPTER_RENDERERS[adapter];
        if (renderFn) {
            const adapterFiles = renderFn(config, projectRoot, !!options.dryRun);
            for (const [path, content] of adapterFiles) {
                allFiles.set(path, content);
            }
            console.log(`${adapter} adapter: ${adapterFiles.size} 文件`);
        }
    }

    // ⑥ 写入
    const result = await writeFiles(projectRoot, allFiles, {
        yes: options.yes,
        force: options.force,
        dryRun: options.dryRun,
    });

    // ⑦ 摘要
    console.log(`\n完成: 新建 ${result.created}, 跳过 ${result.skipped}, 覆盖 ${result.overwritten}`);
    if (!options.dryRun) {
        console.log("提示: 重启 IDE 以加载 hook 配置");
    }
}