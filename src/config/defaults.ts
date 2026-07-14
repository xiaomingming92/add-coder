import type { AddCoderConfig } from "./schema";

export const defaults: AddCoderConfig = {
    projectName: "",
    projectRoot: "",
    sourceDir: "src",
    docsDir: "docs",
    logDir: "logs",
    envFilePath: ".env",
    auditLoggerPath: "src/lib/agent-audit-logger.ts",
    mcpServerCommand: "tsx",
    agentAuditImport: "@/lib/agent-audit-logger",
    magicDir: "",
    adapters: [],
    overrides: {},
};