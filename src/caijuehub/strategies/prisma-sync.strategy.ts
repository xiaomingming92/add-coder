// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const SYNC_PRISMA_CONFIG = {
    BASE_SCHEMA: "node_modules/add-coder/templates/core/prisma/add.prisma",
    TARGET_PATTERN: "prisma/add.prisma",
    SYNC_ITEMS: ["model", "enum"],
    ON_MISSING_MODEL: "interactive",
    ON_FIELD_CONFLICT: "interactive",
    ON_MISSING_FIELD: "interactive",
    ON_EXTRA_FIELD: "ignore",
    PROMPT: "add-coder 标准 add.prisma 与消费方 schema 存在差异。",
    POST_SYNC: {
        HEADER: "下一步按你的场景选择迁移命令:",
        FINAL: "npx prisma generate",
        MANAGED_ACTIONS: [
            { label: "开发环境（生成新迁移+同步本地库）", cmd: "npx prisma migrate dev" },
            { label: "生产/CI（只应用已有迁移）", cmd: "npx prisma migrate deploy" },
            { label: "不确定？先查状态", cmd: "npx prisma migrate status" }
        ],
        P3005: { hint: "若报 P3005（库有表但无迁移记录）= 需先基线化:", cmd: "npx prisma migrate resolve --applied <��移名>，再执行 deploy" },
        UNMANAGED_ACTIONS: [
            { label: "首次接入迁移管理（空库）", cmd: "npx prisma migrate dev --name init" },
            { label: "库已有表（db push 建过）", hint: "先手动基线化，再 deploy:", steps: ["npx prisma migrate diff --from-empty --to-schema-datamodel <schema文件> --script", "将输出写入 prisma/migrations/<时间戳>_init/migration.sql", "npx prisma migrate resolve --applied <时间戳>_init"] }
        ],
    },
};
// <<< CAIJUE GENERATED END <<<