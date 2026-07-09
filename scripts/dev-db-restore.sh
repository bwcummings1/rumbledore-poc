#!/usr/bin/env bash
set -euo pipefail

dump_path="${1:-}"
database_url="${DATABASE_URL:-postgres://rumbledore:rumbledore@localhost:5440/rumbledore}"

if [[ -z "$dump_path" ]]; then
  echo "Usage: pnpm db:restore /path/to/rumbledore-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

if [[ ! -f "$dump_path" ]]; then
  echo "Backup file not found: $dump_path" >&2
  exit 2
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required but was not found on PATH" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-acl --dbname "$database_url" "$dump_path"
echo "Restored dev database backup: $dump_path"
