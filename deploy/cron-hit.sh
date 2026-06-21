#!/usr/bin/env bash
# cron-hit.sh — authenticated GET against a local app endpoint, for cron jobs.
#
# Pulls CRON_SECRET from the app's env files the same way Next.js resolves it
# (.env.local takes precedence over .env; first occurrence within a file wins),
# so it stays correct even with duplicate keys. Hits the app directly on
# localhost:3000, bypassing Nginx.
#
# Usage:
#   deploy/cron-hit.sh /api/sync-brands
#   deploy/cron-hit.sh /api/cron/resolve-pending-orders
set -euo pipefail

APP_DIR="/var/www/cymstudio"
ENDPOINT="${1:?usage: cron-hit.sh <endpoint-path>}"
cd "$APP_DIR"

# Resolve the effective CRON_SECRET: .env.local first, then .env; first non-empty value.
SECRET="$(grep -h '^CRON_SECRET=' .env.local .env 2>/dev/null \
  | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//' \
  | awk 'NF{print; exit}')"

if [ -z "${SECRET:-}" ]; then
  echo "$(date -u +%FT%TZ) [cron-hit] ERROR: CRON_SECRET not found in env files" >&2
  exit 1
fi

echo "$(date -u +%FT%TZ) [cron-hit] GET ${ENDPOINT}"
curl -fsS --max-time 600 -H "Authorization: Bearer ${SECRET}" "http://localhost:3000${ENDPOINT}"
echo
