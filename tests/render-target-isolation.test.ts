/* Codex 分发隔离：Codex 只渲染自己的 magicDir，不生成其他 adapter 状态目录。 */
import { describe, expect, it } from "vitest";
import { renderAdapter as renderCodexAdapter } from "../src/adapters/codex/renderer";
import { coreTargetsForAdapter, needsClaudeAgentHost, pruneHashToCandidates } from "../src/cli/commands/sync";
import { renderCoreForTargets } from "../src/core/renderer";
import type { AddCoderConfig } from "../src/config/schema";

const config: AddCoderConfig = {
    projectName: "add-coder",
    projectRoot: "/tmp/add-coder-render-isolation",
    sourceDir: "src",
    docsDir: "docs",
    logDir: "logs",
    envFilePath: ".env",
    auditLoggerPath: "src/lib/agent-audit-logger.ts",
    mcpServerCommand: "tsx",
    agentAuditImport: "@/lib/agent-audit-logger",
    magicDir: ".codex",
    adapters: ["codex"],
    overrides: {},
};

describe("core target render isolation", () => {
    const renderFixture = (targetConfig: AddCoderConfig) => new Map([
        [".add/skills/add-paradigm/SKILL.md", `\`${targetConfig.magicDir}/plans/\``],
        [".add/templates/collab-contract-template.md", `\`${targetConfig.magicDir}/hitl/.tongyi-{contractName}\``],
    ]);

    it("Codex 单目标只生成 .codex 的 Plan/Review/HITL 路径", () => {
        const files = renderCoreForTargets(config, false, coreTargetsForAdapter("codex", ".codex"), renderFixture);
        const codexSkill = files.get(".codex/skills/add-paradigm/SKILL.md");
        const codexContract = files.get(".codex/templates/collab-contract-template.md");

        expect([...files.keys()].every((path) => path.startsWith(".codex/"))).toBe(true);
        expect(files.has(".add/skills/add-paradigm/SKILL.md")).toBe(false);
        expect(codexSkill).toContain("`.codex/plans/");
        expect(codexSkill).not.toContain("`.add/plans/");
        expect(codexContract).toContain("`.codex/hitl/.tongyi-{contractName}`");
    });

    it("Codex 不触发 .add 或 Claude Agent Host 分发", () => {
        expect(coreTargetsForAdapter("codex", ".codex")).toEqual([".codex"]);
        expect(needsClaudeAgentHost(["codex"])).toBe(false);
        expect(needsClaudeAgentHost(["vscode"])).toBe(true);
        expect(needsClaudeAgentHost(["trae"])).toBe(true);
    });

    it("Codex hash 基线移除历史 .add/.claude 条目", () => {
        const pruned = pruneHashToCandidates(new Map([
            [".add/hooks/pre-tool-use.sh", "old-add"],
            [".claude/hooks/pre-tool-use.sh", "old-claude"],
            [".codex/hooks/pre-tool-use.sh", "codex"],
            [".agents/skills/add-paradigm/SKILL.md", "agents"],
        ]), [
            ".codex/hooks/pre-tool-use.sh",
            ".agents/skills/add-paradigm/SKILL.md",
        ]);

        expect([...pruned.keys()]).toEqual([
            ".codex/hooks/pre-tool-use.sh",
            ".agents/skills/add-paradigm/SKILL.md",
        ]);
    });

    it("重复目标只生成一份，不改变调用方 config", () => {
        const files = renderCoreForTargets(config, false, [".codex", ".codex"], renderFixture);

        expect(config.magicDir).toBe(".codex");
        expect([...files.keys()].every((path) => path.startsWith(".codex/"))).toBe(true);
    });

    it("Codex adapter 只消费自己的 hooks 真源，core lib 不覆盖", () => {
        const files = renderCodexAdapter(config, config.projectRoot, false, ".codex");
        const common = files.get(".codex/hooks/lib/common.sh");

        expect(common).toBeDefined();
        expect(common).toContain(".codex");
        expect(common).toContain("templates/adapters/codex/hooks/lib/common.sh");
        expect(common).not.toContain("templates/core/hooks/lib/common.sh");
    });
});
