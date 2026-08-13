import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRegistrar } from "../templates/core/scripts/mcp-server/tools/registrar.js";

interface AuditUpsertArgs {
    where: {
        projectKey_producerAdapterKey_toolName_operationKey: {
            projectKey: string;
            producerAdapterKey: string;
            toolName: string;
            operationKey: string;
        };
    };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
    devFindMany: vi.fn(),
    devUpsert: vi.fn<(args: AuditUpsertArgs) => Promise<Record<string, unknown>>>(),
    userFindUnique: vi.fn(),
    userCreate: vi.fn(),
}));

vi.mock("../templates/core/scripts/mcp-server/shared/prisma.js", () => ({
    prisma: {
        devOperation: {
            findMany: mocks.devFindMany,
            upsert: mocks.devUpsert,
        },
        addUser: {
            findUnique: mocks.userFindUnique,
            create: mocks.userCreate,
        },
    },
}));

vi.mock("../templates/core/scripts/mcp-server/shared/env.js", () => ({
    PROJECT_ID: "audit-test",
    PROJECT_ROOT: "/tmp/audit-test",
    getRuntimeContext: () => ({
        projectRoot: "/tmp/audit-test",
        projectKey: "project-key",
        adapterKey: "codex",
        magicDir: ".codex",
        contextId: "project-key:codex",
    }),
}));

import { registerAuditTools } from "../templates/core/scripts/mcp-server/tools/audit.js";

type ToolHandler = (args: Record<string, string | number | undefined>, ctx: unknown) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
}>;

function handlers(): Map<string, ToolHandler> {
    const registered = new Map<string, ToolHandler>();
    const registrar = {
        registerTool: vi.fn((name: string, _options: unknown, handler: ToolHandler) => {
            registered.set(name, handler);
        }),
    } as unknown as ToolRegistrar;
    registerAuditTools(registrar);
    return registered;
}

const baseArgs = {
    action: "MODIFY",
    targetType: "COMPONENT",
    targetId: "src/example.ts",
    planKeyword: "audit-test",
    beforeState: JSON.stringify({ version: 1 }),
    afterState: JSON.stringify({ version: 2 }),
    reason: "verify states",
};

describe("DevOperation beforeState/afterState 审计闭环", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.userFindUnique.mockResolvedValue({ id: "ai-assistant" });
        mocks.devUpsert.mockImplementation(({ create }) => Promise.resolve({
            id: "operation-1",
            userId: "ai-assistant",
            createdAt: new Date("2026-08-13T00:00:00.000Z"),
            ...create,
        }));
    });

    it.each([
        ["空字符串", ""],
        ["null", "null"],
        ["字符串标量", '"state"'],
        ["数字标量", "1"],
    ])("拒绝 %s 状态", async (_label, invalidState) => {
        const record = handlers().get("record_dev_operation")!;
        const result = await record({ ...baseArgs, beforeState: invalidState }, {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/beforeState\/afterState/);
        expect(mocks.devUpsert).not.toHaveBeenCalled();
    });

    it("把结构化状态原样写入 DB，并在成功回执中回显", async () => {
        const record = handlers().get("record_dev_operation")!;
        const result = await record(baseArgs, {});

        expect(mocks.devUpsert).toHaveBeenCalledOnce();
        const upsert = mocks.devUpsert.mock.calls[0][0];
        expect(upsert.where.projectKey_producerAdapterKey_toolName_operationKey).toMatchObject({
            projectKey: "project-key",
            producerAdapterKey: "codex",
            toolName: "record_dev_operation",
        });
        expect(upsert.create).toMatchObject({
            projectKey: "project-key",
            producerAdapterKey: "codex",
            contextId: "project-key:codex",
            toolName: "record_dev_operation",
            beforeState: { version: 1 },
            afterState: { version: 2 },
        });
        expect(upsert.update).toEqual({});
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('beforeState: {"version":1}');
        expect(result.content[0].text).toContain('afterState: {"version":2}');
    });

    it("query_audit_logs 回显数据库中的 beforeState/afterState", async () => {
        mocks.devFindMany.mockResolvedValue([{
            id: "operation-1",
            userId: "ai-assistant",
            projectKey: "project-key",
            producerAdapterKey: "codex",
            contextId: "project-key:codex",
            toolName: "record_dev_operation",
            operationKey: "operation-key",
            planKeyword: "audit-test",
            action: "MODIFY",
            targetType: "COMPONENT",
            targetId: "src/example.ts",
            beforeState: { version: 1 },
            afterState: { version: 2 },
            reason: "verify states",
            createdAt: new Date("2026-08-13T00:00:00.000Z"),
        }]);
        const query = handlers().get("query_audit_logs")!;
        const result = await query({ targetId: "src/example.ts", limit: 1 }, {});

        expect(result.content[0].text).toContain('beforeState: {"version":1}');
        expect(result.content[0].text).toContain('afterState: {"version":2}');
    });
});
