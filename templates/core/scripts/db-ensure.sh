#!/usr/bin/env bash
# db-ensure.sh — 容器启动 + 环境准备
# prisma init/copy/push/generate 由 init.ts → injectPrisma() 裁决层处理
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
if [ "$CONTAINER" = "podman" ]; then COMPOSE_CMD="podman-compose"
elif [ "$CONTAINER" = "docker" ]; then COMPOSE_CMD="docker-compose"
else echo "未知容器: $CONTAINER"; exit 1
fi

echo ">>> 启动 PostgreSQL ($COMPOSE_CMD up -d) ..."
$COMPOSE_CMD up -d || {
  echo "容器启动失败，请检查 $COMPOSE_CMD 是否已安装或端口是否冲突"
  exit 1
}

# 等待 PostgreSQL 就绪
echo ">>> 等待 PostgreSQL 就绪 ..."
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if $COMPOSE_CMD exec -T postgres pg_isready -U "$DB_USER" > /dev/null 2>&1; then
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
