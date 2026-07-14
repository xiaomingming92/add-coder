#!/usr/bin/env bash
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

echo ">>> Prisma migrate ..."
npx prisma migrate dev --schema=prisma/

echo ">>> Prisma generate ..."
npx prisma generate --schema=prisma/

echo ">>> 数据库就绪 ✓"
