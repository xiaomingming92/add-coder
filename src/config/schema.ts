import { z } from "zod";

export const AdapterEnum = z.enum(["claude", "qoder", "vscode", "auto"]);
export type Adapter = z.infer<typeof AdapterEnum>;

export const AddCoderConfigSchema = z.object({
    projectName: z.string().min(1, "项目名不能为空"),
    projectRoot: z.string().default(""),
    sourceDir: z.string().default("src"),
    docsDir: z.string().default("docs"),
    logDir: z.string().default("logs"),
    envFilePath: z.string().default(".env"),
    auditLoggerPath: z.string().default("src/lib/agent-audit-logger.ts"),
    mcpServerCommand: z.string().default("tsx"),
    agentAuditImport: z.string().default("@/lib/agent-audit-logger"),
    adapters: z.array(AdapterEnum).default(["auto"]),
    overrides: z.record(z.string(), z.string()).default({}),
});

export type AddCoderConfig = z.infer<typeof AddCoderConfigSchema>;