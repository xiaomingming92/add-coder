#!/usr/bin/env bash
# add-coder 自身数据库同步（selfhost-atlas：Atlas 版本化迁移接管）
# 决议演进：prisma migrate dev → Atlas migrate diff/apply（独立目录 + baseline）
# 背景：Atlas 默认扁平 `{ver}_{name}.sql` 格式与 Prisma 子目录 `{ver}_{name}/migration.sql` 不兼容
#       → 官方做法：独立 Atlas 目录 + baseline 迁移（不接管 Prisma 历史，历史文件保留）
# dev-url：常驻独立空库（ATLAS_DEV_URL，零临时容器）——dev-url 本质 = 可重放的独立空库
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 加载 .env.development
if [ -f .env.development ]; then
    set -a && source .env.development && set +a
else
    echo "!!! .env.development 不存在，请先 cp .env.development.example .env.development"
    exit 1
fi

# ① atlas 探测：项目内 bin 优先（依赖自带 @ariga/atlas）→ PATH 全局
ATLAS_BIN="$PROJECT_ROOT/node_modules/.bin/atlas"
if [ ! -x "$ATLAS_BIN" ]; then
    ATLAS_BIN="$(command -v atlas || true)"
fi
if [ -z "$ATLAS_BIN" ]; then
    echo "!!! atlas 不可用。add-coder 依赖自带：pnpm add -D @ariga/atlas（或 npm install @ariga/atlas）"
    exit 1
fi

# ② URL 处理：DATABASE_URL 去 Prisma 的 schema 参数 + 本地 PG 无 SSL 需 sslmode=disable
ATLAS_DB_URL="$(echo "$DATABASE_URL" | sed 's/?schema=public//')"
ATLAS_DB_URL="${ATLAS_DB_URL}?sslmode=disable"

# dev-url：ATLAS_DEV_URL 优先（常驻 dev 空库，可随时重置）
if [ -z "${ATLAS_DEV_URL:-}" ]; then
    echo "!!! ATLAS_DEV_URL 未配置（.env.development）。请配置常驻 dev 空库连接串"
    exit 1
fi

ATLAS_MIG_DIR="$PROJECT_ROOT/prisma/atlas-migrations"
mkdir -p "$ATLAS_MIG_DIR"

# ③ baseline 哨兵：首次切换（容器内 psql 探测 atlas_schema_revisions；宿主机无 psql，用 podman exec）
# 双保险：已有 *_baseline.sql 但 revisions 缺失 → 拒绝自动重生成（防快照重叠）
DB_CONTAINER="${PROJECT_NAME:-add-project}-postgres"
BASELINE_DONE="$(podman exec "$DB_CONTAINER" psql -U "$DATABASE_USER" -d "${PROJECT_NAME:-add-project}" -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name='atlas_schema_revisions';" 2>/dev/null || true)"
EXISTING_BASELINE="$(ls "$ATLAS_MIG_DIR"/*_baseline.sql 2>/dev/null | head -1 || true)"
if [ -z "$BASELINE_DONE" ] && [ -n "$EXISTING_BASELINE" ]; then
    echo "!!! 检测到已有 baseline 文件但 revisions 缺失——状态可能不一致，请人工检查（拒绝自动重生成）"
    exit 1
fi
if [ -z "$BASELINE_DONE" ]; then
    echo ">>> 首次切换：生成 baseline 迁移（与常规 diff 同源：Prisma schema SQL，不含工具内部表）..."
    BASELINE_TARGET="$(mktemp /tmp/atlas-baseline-target.XXXXXX.sql)"
    npx prisma migrate diff --from-empty --to-schema prisma/ --script 2>/dev/null | sed '/^◇/d' > "$BASELINE_TARGET"
    "$ATLAS_BIN" migrate diff baseline \
        --dir "file://$ATLAS_MIG_DIR" \
        --dev-url "$ATLAS_DEV_URL" \
        --to "file://$BASELINE_TARGET"
    rm -f "$BASELINE_TARGET"
    BASELINE_VER="$(ls "$ATLAS_MIG_DIR" | grep '_baseline\.sql$' | head -1 | cut -d'_' -f1)"
    "$ATLAS_BIN" migrate apply --url "$ATLAS_DB_URL" --dir "file://$ATLAS_MIG_DIR" --baseline "$BASELINE_VER"
    echo ">>> baseline 已标记（库结构零改动）"
fi

# ④ 常规同步：schema 变更检测（Prisma schema → baseline SQL，过滤 Prisma ◇ 提示）
BASELINE_SQL="$(mktemp /tmp/atlas-baseline.XXXXXX.sql)"
trap 'rm -f "$BASELINE_SQL"' EXIT
npx prisma migrate diff --from-empty --to-schema prisma/ --script 2>/dev/null | sed '/^◇/d' > "$BASELINE_SQL"

BEFORE="$(ls "$ATLAS_MIG_DIR"/*.sql 2>/dev/null | wc -l)"
# 变更检测：目录迁移累计状态 vs 同源目标（baseline 即不含内部表，天然一致，无需 exclude）
if ! "$ATLAS_BIN" migrate diff sync \
    --dir "file://$ATLAS_MIG_DIR" \
    --dev-url "$ATLAS_DEV_URL" \
    --to "file://$BASELINE_SQL"; then
    echo "!!! atlas migrate diff 失败（见上方输出），中止同步"
    exit 1
fi
AFTER="$(ls "$ATLAS_MIG_DIR"/*.sql 2>/dev/null | wc -l)"

if [ "$AFTER" -gt "$BEFORE" ]; then
    echo ">>> schema 变更检测：应用新迁移 ..."
    "$ATLAS_BIN" migrate apply --url "$ATLAS_DB_URL" --dir "file://$ATLAS_MIG_DIR"
else
    echo ">>> schema 一致（幂等出口）"
fi

# ⑤ Prisma Client 生成（与迁移引擎无关，保留）
echo ">>> Prisma generate ..."
npx prisma generate --schema=prisma/

echo ">>> 数据库就绪 ✓（Atlas 版本化迁移，零临时容器）"
