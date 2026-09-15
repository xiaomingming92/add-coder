#!/usr/bin/env bash
# db-ensure.sh — 容器启动 + 环境准备
# prisma init/copy/push/generate 由 init.ts → injectPrisma() 集中裁决层处理
# 用法: bash db-ensure.sh <engine> <container> [--migrate]
set -euo pipefail

ENGINE="${1:-postgresql}"
CONTAINER="${2:-none}"
DO_MIGRATE="false"
[[ "${3:-}" == "--migrate" ]] && DO_MIGRATE="true"

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
PROJECT_NAME="${PROJECT_NAME:-$(basename "$PROJECT_DIR")}"
DB_USER="${DATABASE_USER:-admin}"
DB_PASS="${DATABASE_PASSWORD:-change-me-in-production}"
DB_PORT="${DATABASE_PORT:-5433}"
DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${PROJECT_NAME}?schema=public"

# ADD 表备份
backup_add_tables() {
  if ! command -v pg_dump > /dev/null 2>&1; then return; fi
  local bak="add-backup-$(date +%Y%m%d_%H%M%S).sql"
  echo ">>> 备份 ADD 表到 $bak ..."
  PGPASSWORD="$DB_PASS" pg_dump -h localhost -p "$DB_PORT" -U "$DB_USER" -d "$PROJECT_NAME" \
    --table=AddUser --table=DevOperation --table=AuditLog --if-exists > "$bak" 2>/dev/null || true
}

# 0. 确保 .env.development 存在
if [ ! -f "$PROJECT_DIR/.env.development" ]; then
  cat > "$PROJECT_DIR/.env.development" <<EOF
DATABASE_URL="${DB_URL}"
DATABASE_USER=${DB_USER}
DATABASE_PASSWORD=${DB_PASS}
DATABASE_PORT=${DB_PORT}
PROJECT_NAME=${PROJECT_NAME}
EOF
  echo ">>> 已创建 .env.development"
fi

# ── SQLite：无需容器 ──
if [ "$ENGINE" = "sqlite" ]; then exit 0; fi

# ── 自行管理 PostgreSQL ──
if [ "$CONTAINER" = "none" ] || [ "$CONTAINER" = "manual" ]; then
  echo ">>> 自行管理 PostgreSQL，跳过容器 ..."
  if [ "$DO_MIGRATE" = "true" ]; then
    backup_add_tables
  fi
  exit 0
fi

# ── 容器模式 ──
COMPOSE_CMD=""
COMPOSE_FILE=""
if [ "$CONTAINER" = "podman" ]; then COMPOSE_CMD="podman-compose"; COMPOSE_FILE="podman-compose.add.yml"
elif [ "$CONTAINER" = "docker" ]; then COMPOSE_CMD="docker-compose"; COMPOSE_FILE="docker-compose.add.yml"
else echo "未知容器: $CONTAINER"; exit 1
fi

echo ">>> 启动 PostgreSQL ($COMPOSE_CMD -f $COMPOSE_FILE up -d) ..."
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d || {
  echo "容器启动失败，请检查 $COMPOSE_CMD 是否已安装或端口是否冲突"
  exit 1
}

# 等待 PostgreSQL 就绪
echo ">>> 等待 PostgreSQL 就绪 ..."
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$DB_USER" > /dev/null 2>&1; then
    echo "PostgreSQL 已就绪"; break
  fi
  sleep 1
  RETRY=$((RETRY + 1))
done
if [ $RETRY -ge $MAX_RETRIES ]; then
  echo "PostgreSQL 启动超时，请检查: $COMPOSE_CMD logs postgres"
  exit 1
fi

if [ "$DO_MIGRATE" = "true" ]; then
  backup_add_tables
fi

# ════ Atlas 声明式同步模块（函数式；消费方日常变更同步入口，与 v2 引擎同源逻辑）════
# 触发：--migrate（init 流程）或宿主手动 `bash db-ensure.sh <engine> <container> --migrate`
# 依赖环境变量：DB_URL / ADD_DATABASE_URL(可选) / ATLAS_DEV_URL / PROJECT_NAME / DATABASE_USER

# ① atlas 可执行解析（三路径：add-coder 包内 → 顶层 .bin → PATH；无则走 npx --no-install）
resolve_atlas_bin() {
  local b
  for b in \
    "$PROJECT_DIR/node_modules/add-coder/node_modules/.bin/atlas" \
    "$PROJECT_DIR/node_modules/.bin/atlas" \
    "$(command -v atlas 2>/dev/null || true)"; do
    [ -n "$b" ] && [ -x "$b" ] && { echo "$b"; return 0; }
  done
  return 1
}

# ② atlas 命令执行器（本地 bin 或 npx --no-install）
atlas_cmd() {
  local bin; bin="$(resolve_atlas_bin || true)"
  if [ -n "$bin" ]; then "$bin" "$@"; else npx --no-install @ariga/atlas "$@"; fi
}

# ③ 目标构造（模式判定：分库=ADD 模型 / 共库=宿主 + 动态 exclude 非 ADD 表）
# 输出全局：TARGET_URL / SCHEMA_TARGET / EXCLUDE_ARGS
build_target() {
  TARGET_URL=""
  SCHEMA_TARGET="prisma/"
  EXCLUDE_ARGS=()
  local tables
  if [ -n "${ADD_DATABASE_URL:-}" ]; then
    TARGET_URL="${ADD_DATABASE_URL//?schema=public/}"
    SCHEMA_TARGET="prisma/add.prisma"
    echo ">>> Atlas 同步（分库模式: ADD 治理模型）..."
  else
    TARGET_URL="${DB_URL//?schema=public/}"
    # 动态 exclude：库中除 ADD 7 表外的全部表（业务表/checkpoint/_prisma_migrations）——Atlas glob 不生效，需 public. 前缀精确名
    tables="$(podman exec "${PROJECT_NAME:-add-project}-postgres" psql -U "${DATABASE_USER:-admin}" -d "${PROJECT_NAME:-add-project}" -tAc "SELECT string_agg('public.' || table_name, ',') FROM information_schema.tables WHERE table_schema='public' AND table_name NOT IN ('AddUser','DevOperation','AuditLog','HitlRecord','PlanRecord','ReviewRecord','CollabContract');" 2>/dev/null || true)"
    [ -n "$tables" ] && EXCLUDE_ARGS=(--exclude "$tables")
    echo ">>> Atlas 同步（共库模式: 仅 ADD 治理表，其余 $(echo "$tables" | tr ',' '\n' | wc -l) 张表排除）..."
  fi
  # Atlas 自身的版本记录 schema 不属于期望态，必须排除，否则 diff 会生成 DROP SCHEMA ... CASCADE
  EXCLUDE_ARGS+=(--exclude atlas_schema_revisions)
  TARGET_URL="${TARGET_URL}?sslmode=disable"
}

# ③.5 raw 对象登记（schema 表达不了的对象：trgm 索引 / 向量层；单一事实源）
#   期望态必须能表达这些对象，否则 diff 把「raw 对象」判成多余并生成 DROP（review 发现 #2）。
#   约束：Atlas dev-url 必须是干净库且具备同名扩展（否则 gin_trgm_ops / vector 类型无法解析）；
#   本项目的 dev 库是一次性沙箱 → 每次 diff 前从 template1 重建（见 prepare_atlas_dev_db）。
RAW_OBJECTS_SQL="prisma/raw-objects.sql"
RAW_OBJECTS_VECTOR_SQL="prisma/raw-objects-vector.sql"

# template1 扩展引导（幂等）：新建库（含 Atlas dev 沙箱库）从 template1 继承扩展——
#   缺扩展时期望态里的 gin_trgm_ops / vector 无法解析，diff 直接报错中止。
#   镜像不含扩展时静默跳过（记忆检索按 fts-only 合法降级，不硬失败）。
ensure_template1_extensions() {
  local c="$1" u="$2"
  podman exec "$c" true >/dev/null 2>&1 || return 0
  podman exec "$c" psql -U "$u" -d template1 -tAc "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null 2>&1 || true
  podman exec "$c" psql -U "$u" -d template1 -tAc "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true
}

# dev 沙箱库准备：DROP + CREATE TEMPLATE template1（template1 内已装 pg_trgm/vector）
prepare_atlas_dev_db() {
  local c="${PROJECT_NAME:-add-project}-dev" u="${ATLAS_DEV_USER:-admin}" d="${ATLAS_DEV_DB:-add-project-dev}"
  podman exec "$c" true >/dev/null 2>&1 || { echo ">>> [dev-url] 容器 $c 不可达，跳过重建（依赖现有 dev 库）"; return 0; }
  ensure_template1_extensions "$c" "$u"
  if [ "${ADD_DB_KEEP_DEV:-}" = "yes" ]; then
    echo ">>> [dev-url] ADD_DB_KEEP_DEV=yes：沿用现有 dev 库"
    return 0
  fi
  podman exec "$c" psql -U "$u" -d postgres -tAc "DROP DATABASE IF EXISTS \"$d\";" >/dev/null 2>&1 || true
  if podman exec "$c" psql -U "$u" -d postgres -tAc "CREATE DATABASE \"$d\" TEMPLATE template1;" >/dev/null 2>&1; then
    echo ">>> [dev-url] 已从 template1 重建沙箱库 $d（干净 + 扩展齐备）"
  else
    echo ">>> [dev-url] 重建 $d 失败，沿用现有库（若解析报错请检查 template1 扩展）"
  fi
}

# 目标库是否具备 pgvector（决定是否把向量段并入期望态）
has_pgvector_in_target() {
  local c="${PROJECT_NAME:-add-project}-postgres" u="${DATABASE_USER:-admin}" d="${PROJECT_NAME:-add-project}" has
  has="$(podman exec "$c" psql -U "$u" -d "$d" -tAc "SELECT 1 FROM pg_available_extensions WHERE name='vector' LIMIT 1;" 2>/dev/null || true)"
  [ "$has" = "1" ]
}

# ④ baseline 生成（同源：Prisma schema SQL + raw 对象登记段，过滤 Prisma 7 ◇ 提示）
generate_baseline() {
  BASELINE_SQL="$(mktemp /tmp/atlas-target.XXXXXX.sql)"
  trap 'rm -f "$BASELINE_SQL"' EXIT
  npx prisma migrate diff --from-empty --to-schema "$SCHEMA_TARGET" --script 2>/dev/null | sed '/^◇/d' > "$BASELINE_SQL"
  if [ -f "$RAW_OBJECTS_SQL" ]; then
    printf '\n-- ===== raw objects registry =====\n' >> "$BASELINE_SQL"
    cat "$RAW_OBJECTS_SQL" >> "$BASELINE_SQL"
  fi
  if has_pgvector_in_target && [ -f "$RAW_OBJECTS_VECTOR_SQL" ]; then
    printf '\n-- ===== raw objects registry (vector) =====\n' >> "$BASELINE_SQL"
    cat "$RAW_OBJECTS_VECTOR_SQL" >> "$BASELINE_SQL"
  fi
}

# ⑤ diff 检测（SQL 语句特征判定：Atlas 无变更时输出 "Schemas are synced..." 非空，不算变更）
# 输出全局 DIFF_SQL；返回 0=有变更 / 1=无变更
run_atlas_diff() {
  DIFF_SQL="$(atlas_cmd schema diff --from "$TARGET_URL" --to "file://$BASELINE_SQL" --dev-url "$ATLAS_DEV_URL" "${EXCLUDE_ARGS[@]}" 2>/dev/null)"
  echo "$DIFF_SQL" | grep -qE "^(CREATE|ALTER|DROP|COMMENT|-- *(Create|Modify|Drop))"
}

# ⑥ apply（双门槛：DROP 守卫 → 交互确认 → apply；任一不通过则跳过）
#   DROP 守卫（Plan 轮 3 前置 / runtime review 发现 #2）：破坏性语句一律拒绝——
#   raw SQL 对象（如 pg_trgm GIN 索引、pgvector 列/索引）无法被 Prisma schema 表达，
#   diff 会误判为「多余对象」并生成 DROP；若放行，索引会被静默删除且不报错。
#   显式放行需人工设 ADD_DB_ALLOW_DROP=yes，并在迁移评审中登记（禁止默认自动放行）。
apply_atlas_diff() {
  echo "=== 待应用 diff SQL（前 60 行）==="
  echo "$DIFF_SQL" | head -60
  local drops
  drops="$(printf '%s\n' "$DIFF_SQL" | grep -nE '^DROP |DROP COLUMN|DROP CONSTRAINT|DROP INDEX|DROP TABLE|DROP TYPE|DROP SCHEMA' || true)"
  if [ -n "$drops" ]; then
    echo "!!! 检测到破坏性语句（DROP），已拒绝应用："
    printf '%s\n' "$drops" | sed 's/^/    /'
    echo "    处置建议："
    echo "      ① 若是无法被 schema 表达的 raw SQL 对象（索引/扩展/向量列）→ 核对登记清单 prisma/raw-objects.sql、prisma/raw-objects-vector.sql；"
    echo "      ② 确需删除时人工执行，并在迁移评审中登记（能力矩阵 §六 已登记同类缺口）。"
    if [ "${ADD_DB_ALLOW_DROP:-}" != "yes" ]; then
      echo "    （如需在评审后放行：ADD_DB_ALLOW_DROP=yes 重新执行）"
      return 1
    fi
    echo "    ⚠️ ADD_DB_ALLOW_DROP=yes 已设置：放行破坏性变更（确认已完成迁移评审）"
  fi
  read -rp "应用以上 schema 变更？[y/N] " ANS
  if [ "$ANS" = "y" ] || [ "$ANS" = "yes" ]; then
    atlas_cmd schema apply --url "$TARGET_URL" --to "file://$BASELINE_SQL" --dev-url "$ATLAS_DEV_URL" "${EXCLUDE_ARGS[@]}"
    echo ">>> Atlas 同步完成"
  else
    echo ">>> 已取消，未应用"
  fi
}

# ⑦ Atlas 同步主流程（探测 → dev-url → 目标 → baseline → diff → apply）
atlas_sync() {
  [ "$ENGINE" = "sqlite" ] && return 0
  # 迁移锁（进程层契约 v2 §6）：多 IDE 并发 init 时仅一个进程执行迁移
  # 非阻塞拿锁（pg_try_advisory_lock），会话级锁——脚本退出连接断开自动释放
  LOCK_KEY="0xADD001"
  LOCKED="$(podman exec "${PROJECT_NAME:-add-project}-postgres" psql -U "${DATABASE_USER:-admin}" -d "${PROJECT_NAME:-add-project}" -tAc "SELECT pg_try_advisory_lock(${LOCK_KEY});" 2>/dev/null || true)"
  if [ "$LOCKED" != "t" ]; then
    echo "!!! 另一个进程正在迁移，请稍后重试"
    return 1
  fi
  if ! atlas_cmd version > /dev/null 2>&1; then
    echo "!!! Atlas 不可用。add-coder sync --patch 可自动安装 @ariga/atlas；或手动: pnpm add -D @ariga/atlas"
    echo "    降级路径: prisma-diff（免 shadow）→ db-push + 强制备份；文档: README「Atlas 数据库同步能力」"
    return 1
  fi
  if [ -z "${ATLAS_DEV_URL:-}" ]; then
    echo "!!! ATLAS_DEV_URL 未配置。请运行 add-coder init（分库引导自动创建 {project}-add-dev 常驻容器并登记）或手动配置"
    return 1
  fi
  ensure_template1_extensions "${PROJECT_NAME:-add-project}-postgres" "${DATABASE_USER:-admin}"
  prepare_atlas_dev_db
  build_target
  generate_baseline
  if run_atlas_diff; then
    apply_atlas_diff
  else
    echo ">>> schema 一致（幂等出口）"
  fi
}

if [ "$DO_MIGRATE" = "true" ]; then
  atlas_sync
fi
