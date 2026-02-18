#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.prod.yml}"
DUMP_PATH="${2:-/srv/backups/dumps/backup_20260112_151239.dump}"

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

echo "==> Restoring (pg_restore)..."
# Using --no-owner/--no-privileges to avoid role/privilege errors in test restore
docker compose -f "$COMPOSE_FILE" exec -T db pg_restore \
  -U yardena -d yardena_test \
  --clean --if-exists --no-owner --no-privileges \
  /tmp/backup.dump

echo "==> Done. Listing tables:"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U yardena -d yardena_test -c "\\dt"
