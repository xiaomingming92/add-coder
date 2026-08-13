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
  TARGET_URL="${TARGET_URL}?sslmode=disable"
}

# ④ baseline 生成（同源：Prisma schema SQL，过滤 Prisma 7 ◇ 提示）
generate_baseline() {
  BASELINE_SQL="$(mktemp /tmp/atlas-target.XXXXXX.sql)"
  trap 'rm -f "$BASELINE_SQL"' EXIT
  npx prisma migrate diff --from-empty --to-schema "$SCHEMA_TARGET" --script 2>/dev/null | sed '/^◇/d' > "$BASELINE_SQL"
}

# ⑤ diff 检测（SQL 语句特征判定：Atlas 无变更时输出 "Schemas are synced..." 非空，不算变更）
# 输出全局 DIFF_SQL；返回 0=有变更 / 1=无变更
run_atlas_diff() {
  DIFF_SQL="$(atlas_cmd schema diff --from "$TARGET_URL" --to "file://$BASELINE_SQL" --dev-url "$ATLAS_DEV_URL" "${EXCLUDE_ARGS[@]}" 2>/dev/null)"
  echo "$DIFF_SQL" | grep -qE "^(CREATE|ALTER|DROP|COMMENT|-- *(Create|Modify|Drop))"
}

# ⑥ apply（确认门槛：交互输出 SQL → 确认 → apply；拒绝则跳过）
apply_atlas_diff() {
  echo "=== 待应用 diff SQL（前 60 行）==="
  echo "$DIFF_SQL" | head -60
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
