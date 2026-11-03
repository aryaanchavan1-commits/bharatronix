#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Fixing products.badge NULL values..."
export PGPASSWORD="${PG_PASS:-RMsgGUo+6myHh1Vs9bKs+nahbtNyaKAP}"
psql -h 127.0.0.1 -U "${APP_ROLE:-bharatronix_app}" -d "${APP_DB:-bharatronix_db}" -t -A -c "UPDATE products SET badge = '' WHERE badge IS NULL;"
psql -h 127.0.0.1 -U "${APP_ROLE:-bharatronix_app}" -d "${APP_DB:-bharatronix_db}" -t -A -c "SELECT count(*)::int AS null_badges_remaining FROM products WHERE badge IS NULL;"
