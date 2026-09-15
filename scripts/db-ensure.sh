#!/usr/bin/env bash
# add-coder 自身数据库同步（selfhost-atlas：Atlas 版本化迁移接管）
# 决议演进：prisma migrate dev → Atlas migrate diff/apply（独立目录 + baseline）
# 背景：Atlas 默认扁平 `{ver}_{name}.sql` 格式与 Prisma 子目录 `{ver}_{name}/migration.sql` 不兼容
#       → 官方做法：独立 Atlas 目录 + baseline 迁移（不接管 Prisma 历史，历史文件保留）
# dev-url：常驻独立空库（ATLAS_DEV_URL，零临时容器）——dev-url 本质 = 可重放的独立空库
# raw 对象：pg_trgm GIN 索引 / pgvector 向量表无法被 Prisma schema 表达，必须登记进期望态（见 ③.5）
#          并在 apply 前过 DROP 守卫——否则 diff 判它们「多余」并静默删除（runtime review 发现 #2）
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

# ③.5 raw 对象登记（schema 表达不了的对象：trgm GIN 索引 / 向量层；单一事实源）
#   期望态必须能表达这些对象，否则 diff 把「raw 对象」判成多余并生成 DROP ——
#   实测事故：db:ensure 生成 DROP INDEX ×3 并把 AddMemory/AddMemoryEvidence 的 trgm 索引静默删除。
#   向量段条件拼接：仅当目标库 pg_available_extensions 含 vector 时才并入。
RAW_OBJECTS_SQL="prisma/raw-objects.sql"
RAW_OBJECTS_VECTOR_SQL="prisma/raw-objects-vector.sql"
DB_CONTAINER="${PROJECT_NAME:-add-project}-postgres"

# 目标库是否具备 pgvector（决定是否把向量段并入期望态）
has_pgvector_in_target() {
    local has
    has="$(podman exec "$DB_CONTAINER" psql -U "$DATABASE_USER" -d "${PROJECT_NAME:-add-project}" -tAc "SELECT 1 FROM pg_available_extensions WHERE name='vector' LIMIT 1;" 2>/dev/null || true)"
    [ "$has" = "1" ]
}

# template1 扩展引导（幂等）：新建库（含 Atlas dev 沙箱库）从 template1 继承扩展——
#   缺扩展时期望态里的 gin_trgm_ops / vector 无法解析，diff 直接报错中止。
#   镜像不含扩展时静默跳过（记忆检索按 fts-only 合法降级，不硬失败）。
ensure_template1_extensions() {
    local c="$1" u="$2"
    podman exec "$c" true >/dev/null 2>&1 || return 0
    podman exec "$c" psql -U "$u" -d template1 -tAc "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null 2>&1 || true
    podman exec "$c" psql -U "$u" -d template1 -tAc "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true
}

# dev 沙箱库准备（Atlas dev-url）：DROP + CREATE TEMPLATE template1（template1 内已装 pg_trgm / vector）
# 为什么需要：Atlas 在 dev-url 上回放与清理时会连扩展一起清掉（DROP SCHEMA public CASCADE），
# 之后再解析 raw 对象里的 gin_trgm_ops / vector 会直接报 "does not exist" 并中止 diff；
# 每次 diff 前从 template1 重建最稳（ADD_DB_KEEP_DEV=yes 可跳过，沿用现有 dev 库）。
prepare_atlas_dev_db() {
    local c="${ATLAS_DEV_CONTAINER:-${PROJECT_NAME:-add-project}-shadow}"
    local u="${ATLAS_DEV_USER:-${SHADOW_DB_USER:-$DATABASE_USER}}"
    local d="${ATLAS_DEV_DB:-${SHADOW_DB_NAME:-}}"
    if [ -z "$d" ]; then
        echo ">>> [dev-url] 未识别 dev 库名（ATLAS_DEV_DB / SHADOW_DB_NAME 均未设置），跳过重建"
        return 0
    fi
    if [ "${ADD_DB_KEEP_DEV:-}" = "yes" ]; then
        echo ">>> [dev-url] ADD_DB_KEEP_DEV=yes：沿用现有 dev 库"
        return 0
    fi
    podman exec "$c" true >/dev/null 2>&1 || { echo ">>> [dev-url] 容器 $c 不可达，跳过重建（依赖现有 dev 库）"; return 0; }
    ensure_template1_extensions "$c" "$u"
    podman exec "$c" psql -U "$u" -d postgres -tAc "DROP DATABASE IF EXISTS \"$d\";" >/dev/null 2>&1 || true
    if podman exec "$c" psql -U "$u" -d postgres -tAc "CREATE DATABASE \"$d\" TEMPLATE template1;" >/dev/null 2>&1; then
        echo ">>> [dev-url] 已从 template1 重建沙箱库 $d（干净 + 扩展齐备）"
    else
        echo ">>> [dev-url] 重建 $d 失败，沿用现有库（若解析报错请检查 template1 扩展）"
    fi
}

# 期望态 SQL 生成（Prisma schema SQL + raw 对象登记段）——baseline 与常规 diff 单一入口
generate_expected_sql() {
    local out="$1"
    npx prisma migrate diff --from-empty --to-schema prisma/ --script 2>/dev/null | sed '/^◇/d' > "$out"
    if [ -f "$RAW_OBJECTS_SQL" ]; then
        printf '\n-- ===== raw objects registry =====\n' >> "$out"
        cat "$RAW_OBJECTS_SQL" >> "$out"
    fi
    if has_pgvector_in_target && [ -f "$RAW_OBJECTS_VECTOR_SQL" ]; then
        printf '\n-- ===== raw objects registry (vector) =====\n' >> "$out"
        cat "$RAW_OBJECTS_VECTOR_SQL" >> "$out"
    fi
}

ATLAS_MIG_DIR="$PROJECT_ROOT/prisma/atlas-migrations"
mkdir -p "$ATLAS_MIG_DIR"

# ② 迁移锁（进程层契约 v2 §6）：多 IDE 并发 init 时仅一个进程执行迁移
# 非阻塞拿锁（pg_try_advisory_lock），会话级锁——脚本退出连接断开自动释放，无需 trap
LOCK_KEY="0xADD001"
LOCKED="$(podman exec "$DB_CONTAINER" psql -U "$DATABASE_USER" -d "${PROJECT_NAME:-add-project}" -tAc "SELECT pg_try_advisory_lock(${LOCK_KEY});" 2>/dev/null || true)"
if [ "$LOCKED" != "t" ]; then
    echo "!!! 另一个进程正在迁移，请稍后重试"
    exit 1
fi

# ③ baseline 哨兵：首次切换（容器内 psql 探测 atlas_schema_revisions；宿主机无 psql，用 podman exec）
# 双保险：已有 *_baseline.sql 但 revisions 缺失 → 拒绝自动重生成（防快照重叠）
BASELINE_DONE="$(podman exec "$DB_CONTAINER" psql -U "$DATABASE_USER" -d "${PROJECT_NAME:-add-project}" -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name='atlas_schema_revisions';" 2>/dev/null || true)"
EXISTING_BASELINE="$(ls "$ATLAS_MIG_DIR"/*_baseline.sql 2>/dev/null | head -1 || true)"
if [ -z "$BASELINE_DONE" ] && [ -n "$EXISTING_BASELINE" ]; then
    echo "!!! 检测到已有 baseline 文件但 revisions 缺失——状态可能不一致，请人工检查（拒绝自动重生成）"
    exit 1
fi
if [ -z "$BASELINE_DONE" ]; then
    echo ">>> 首次切换：生成 baseline 迁移（与常规 diff 同源：Prisma schema SQL，不含工具内部表）..."
    prepare_atlas_dev_db
    BASELINE_TARGET="$(mktemp /tmp/atlas-baseline-target.XXXXXX.sql)"
    generate_expected_sql "$BASELINE_TARGET"
    "$ATLAS_BIN" migrate diff baseline \
        --dir "file://$ATLAS_MIG_DIR" \
        --dev-url "$ATLAS_DEV_URL" \
        --to "file://$BASELINE_TARGET"
    rm -f "$BASELINE_TARGET"
    BASELINE_VER="$(ls "$ATLAS_MIG_DIR" | grep '_baseline\.sql$' | head -1 | cut -d'_' -f1)"
    "$ATLAS_BIN" migrate apply --url "$ATLAS_DB_URL" --dir "file://$ATLAS_MIG_DIR" --baseline "$BASELINE_VER"
    echo ">>> baseline 已标记（库结构零改动）"
fi

# ④ 常规同步：schema 变更检测（Prisma schema + raw 对象登记 → 期望态 SQL，过滤 Prisma ◇ 提示）
ensure_template1_extensions "$DB_CONTAINER" "$DATABASE_USER"
prepare_atlas_dev_db
BASELINE_SQL="$(mktemp /tmp/atlas-baseline.XXXXXX.sql)"
trap 'rm -f "$BASELINE_SQL"' EXIT
generate_expected_sql "$BASELINE_SQL"

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
    # DROP 守卫：新生成的迁移含破坏性语句一律拒绝（raw 对象无法被 schema 表达 → diff 误判为多余）
    NEW_MIGRATIONS="$(ls -t "$ATLAS_MIG_DIR"/*.sql | head -n "$((AFTER - BEFORE))")"
    DROPS="$(grep -nE '^DROP |DROP COLUMN|DROP CONSTRAINT|DROP INDEX|DROP TABLE|DROP TYPE|DROP SCHEMA' $NEW_MIGRATIONS 2>/dev/null || true)"
    if [ -n "$DROPS" ]; then
        echo "!!! 新迁移含破坏性语句（DROP），已拒绝应用并撤销生成："
        printf '%s\n' "$DROPS" | sed 's/^/    /'
        echo "    处置：① 核对登记清单 prisma/raw-objects.sql / prisma/raw-objects-vector.sql；"
        echo "          ② 确需删除时人工执行，并在迁移评审中登记。"
        if [ "${ADD_DB_ALLOW_DROP:-}" != "yes" ]; then
            rm -f $NEW_MIGRATIONS
            "$ATLAS_BIN" migrate hash --dir "file://$ATLAS_MIG_DIR" >/dev/null 2>&1 || true
            echo "    （已撤销新迁移文件；评审后如需放行：ADD_DB_ALLOW_DROP=yes 重新执行）"
            exit 1
        fi
        echo "    ⚠️ ADD_DB_ALLOW_DROP=yes 已设置：放行破坏性变更"
    fi
    "$ATLAS_BIN" migrate apply --url "$ATLAS_DB_URL" --dir "file://$ATLAS_MIG_DIR"
else
    echo ">>> schema 一致（幂等出口）"
fi

# ⑤ Prisma Client 生成（与迁移引擎无关，保留）
echo ">>> Prisma generate ..."
npx prisma generate --schema=prisma/

echo ">>> 数据库就绪 ✓（Atlas 版本化迁移，零临时容器）"
