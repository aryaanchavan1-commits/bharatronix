#!/usr/bin/env bash
# Run this on the VPS to fix the products.badge NOT NULL migration failure.
set -euo pipefail

APP_DIR="$HOME/bharatronix/bharatronix-erp-e-commerce-site"
cd "$APP_DIR"

# Use the app role that matches your .env / .env.local DATABASE_URL.
APP_ROLE="${APP_ROLE:-bharatronix_app}"
APP_DB="${APP_DB:-bharatronix_db}"

# Read DATABASE_URL from .env.local if present, otherwise fall back to env.
if [[ -f .env.local ]]; then
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2- || true)"
fi
: "${DATABASE_URL:=${DATABASE_URL:-postgresql://${APP_ROLE}@127.0.0.1:5432/${APP_DB}}}"

echo "Using DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/.*://' | sed 's/:.*/:*****/')"

# Suppress psql password prompt by feeding it via PGPASSWORD.
# If .env.local has a password, prefer it; otherwise assume trust/local socket.
if [[ -f .env.local ]]; then
  PG_PASS="$(grep -m1 '^DATABASE_URL=' .env.local | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p' || true)"
fi
: "${PG_PASS:=${PG_PASS:-}}"

if [[ -n "$PG_PASS" ]]; then
  export PGPASSWORD="$PG_PASS"
  PSQL_CMD="psql -h 127.0.0.1 -U $APP_ROLE -d $APP_DB"
else
  PSQL_CMD="psql -U $APP_ROLE -d $APP_DB"
fi

$PSQL_CMD -t -A -c "SELECT current_database(), current_user();"

echo "Backing up existing badge values (nulls only)..."
$PSQL_CMD -c "UPDATE products SET badge = '' WHERE badge IS NULL;"

echo "Confirming no NULL badges remain..."
$PSQL_CMD -t -A -c "SELECT count(*)::int AS null_badges_remaining FROM products WHERE badge IS NULL;"
