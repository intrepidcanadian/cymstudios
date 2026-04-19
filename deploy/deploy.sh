#!/bin/bash
# deploy.sh — Run this from your LOCAL machine to deploy to the VPS
#
# Usage:
#   ./deploy/deploy.sh                    # Deploy to production
#   ./deploy/deploy.sh user@1.2.3.4       # Deploy to specific server
#
# Prerequisites:
#   - SSH key added to the VPS
#   - VPS already set up with setup-vps.sh

set -euo pipefail

# Configuration — change these to match your VPS
VPS_USER="root"
VPS_HOST="${1:-your-vps-ip}"  # Pass as argument or edit this
APP_DIR="/var/www/cymstudio"
BRANCH="main"

echo "==> Deploying CYM Studio to ${VPS_USER}@${VPS_HOST}..."

ssh "${VPS_USER}@${VPS_HOST}" bash -s <<'REMOTE'
set -euo pipefail

APP_DIR="/var/www/cymstudio"
cd "$APP_DIR"

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
npm ci --production=false

echo "==> Building..."
# --max-old-space-size=1792: Next 14 production build needs ~1.5GB heap.
#   Vultr's 1.9GB tier OOMs at Node's default heap limit otherwise.
# --dns-result-order=ipv4first: next/font/google fetches fonts at build time;
#   IPv6 resolves on Vultr but connections stall, causing font-download failures.
NODE_OPTIONS="--max-old-space-size=1792 --dns-result-order=ipv4first" npm run build

echo "==> Restarting app..."
pm2 restart cymstudio --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> Done! App is live."
pm2 status
REMOTE

echo "==> Deployment complete!"
