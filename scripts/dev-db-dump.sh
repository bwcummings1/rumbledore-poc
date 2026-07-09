#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_URL:-postgres://rumbledore:rumbledore@localhost:5440/rumbledore}"
backup_dir="${RUMBLEDORE_BACKUP_DIR:-$HOME/rumbledore-db-backups}"
retention_days="${RUMBLEDORE_BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="${backup_dir}/rumbledore-${timestamp}.dump"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but was not found on PATH" >&2
  exit 1
fi

mkdir -p "$backup_dir"
pg_dump --format=custom --no-owner --no-acl --file "$output" "$database_url"

if [[ "$retention_days" =~ ^[0-9]+$ ]] && [[ "$retention_days" -gt 0 ]]; then
  find "$backup_dir" -type f -name 'rumbledore-*.dump' -mtime +"$retention_days" -delete
fi

echo "Wrote dev database backup: $output"
