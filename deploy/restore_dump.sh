#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.prod.yml}"
DUMP_PATH="${2:-/srv/backups/dumps/backup_20260112_151239.dump}"

POSTGRES_USER="${POSTGRES_USER:-yardena}"
POSTGRES_DB="${POSTGRES_DB:-yardena_test}"

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Dump not found: $DUMP_PATH" >&2
  exit 1
fi

echo "==> Starting DB container..."
docker compose -f "$COMPOSE_FILE" up -d db

DB_CID="$(docker compose -f "$COMPOSE_FILE" ps -q db)"
if [[ -z "$DB_CID" ]]; then
  echo "DB container not found" >&2
  exit 1
fi

echo "==> Copying dump into container..."
docker cp "$DUMP_PATH" "${DB_CID}:/tmp/backup.dump"

echo "==> Checking dump readability with current pg_restore..."
docker compose -f "$COMPOSE_FILE" exec -T db pg_restore -l /tmp/backup.dump > /dev/null

echo "==> Restoring (pg_restore)..."
# --clean/--if-exists: replace objects
# --no-owner/--no-privileges: avoid role/privilege errors
docker compose -f "$COMPOSE_FILE" exec -T db pg_restore   -U "$POSTGRES_USER" -d "$POSTGRES_DB"   --clean --if-exists --no-owner --no-privileges   /tmp/backup.dump

echo "==> Done. Tables:"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"
