#!/bin/bash
# setup-vps.sh — Run this ONCE on a fresh VPS to set everything up
#
# Tested on: Ubuntu 22.04 / 24.04 (Hetzner, DigitalOcean, Vultr)
#
# Usage:
#   1. SSH into your VPS:  ssh root@your-vps-ip
#   2. Run this script:    bash setup-vps.sh
#
# What this does:
#   - Installs Node.js 20, Nginx, Certbot
#   - Clones the repo
#   - Builds the app
#   - Sets up PM2 with auto-start on reboot
#   - Configures Nginx reverse proxy
#   - Gets SSL certificate from Let's Encrypt
#
# After setup, deploy updates with:  ./deploy/deploy.sh root@your-vps-ip

set -euo pipefail

# ============================================
# CONFIGURATION — Edit these before running
# ============================================
DOMAIN="cymstudio.com"
REPO_URL="https://github.com/your-username/cymstudio.git"  # Change this
APP_DIR="/var/www/cymstudio"
NODE_VERSION="20"

echo "============================================"
echo "  CYM Studio VPS Setup"
echo "  Domain: ${DOMAIN}"
echo "============================================"

# ============================================
# 1. System updates
# ============================================
echo ""
echo "==> Updating system packages..."
apt update && apt upgrade -y

# ============================================
# 2. Install Node.js
# ============================================
echo ""
echo "==> Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt install -y nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

# ============================================
# 3. Install PM2
# ============================================
echo ""
echo "==> Installing PM2..."
npm install -g pm2

# ============================================
# 4. Install Nginx
# ============================================
echo ""
echo "==> Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# ============================================
# 5. Install Certbot (SSL)
# ============================================
echo ""
echo "==> Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# ============================================
# 6. Clone the repo
# ============================================
echo ""
echo "==> Cloning repository..."
if [ -d "$APP_DIR" ]; then
  echo "Directory $APP_DIR already exists, pulling latest..."
  cd "$APP_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ============================================
# 7. Create .env.local from .env.example
# ============================================
echo ""
if [ ! -f "$APP_DIR/.env.local" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
    echo "==> Created .env.local from .env.example"
    echo "    IMPORTANT: Edit /var/www/cymstudio/.env.local with your actual values!"
  else
    echo "==> WARNING: No .env.example found. Create .env.local manually."
  fi
else
  echo "==> .env.local already exists, skipping."
fi

# ============================================
# 8. Install dependencies and build
# ============================================
echo ""
echo "==> Installing dependencies..."
npm ci --production=false

echo ""
echo "==> Building the app..."
npm run build

# ============================================
# 9. Start with PM2
# ============================================
echo ""
echo "==> Starting app with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root
echo "PM2 will auto-restart the app on reboot."

# ============================================
# 10. Configure Nginx
# ============================================
echo ""
echo "==> Configuring Nginx..."

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# First, set up a temporary HTTP-only config for certbot
cat > /etc/nginx/sites-available/cymstudio <<NGINX_TEMP
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/cymstudio /etc/nginx/sites-enabled/cymstudio
mkdir -p /var/www/certbot

nginx -t && systemctl reload nginx
echo "Nginx configured (HTTP only for now)."

# ============================================
# 11. Get SSL certificate
# ============================================
echo ""
echo "==> Getting SSL certificate..."
echo "    Make sure your DNS A record points ${DOMAIN} to this server's IP!"
echo ""
read -p "    Is DNS configured? (y/n): " dns_ready

if [ "$dns_ready" = "y" ] || [ "$dns_ready" = "Y" ]; then
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --email "admin@${DOMAIN}" --redirect

  # Now copy the full nginx config with SSL
  if [ -f "$APP_DIR/deploy/nginx.conf" ]; then
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/cymstudio
    # Update domain in config
    sed -i "s/cymstudio.com/${DOMAIN}/g" /etc/nginx/sites-available/cymstudio
    nginx -t && systemctl reload nginx
    echo "Full Nginx config with SSL applied."
  fi

  # Auto-renew SSL
  echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" | crontab -
  echo "SSL auto-renewal cron job added."
else
  echo "    Skipping SSL. Run this later:"
  echo "    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
fi

# ============================================
# 12. Firewall
# ============================================
echo ""
echo "==> Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "Firewall enabled (SSH, HTTP, HTTPS)."

# ============================================
# Done!
# ============================================
echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "  Your app is running at:"
echo "    http://${DOMAIN} (or https:// if SSL was set up)"
echo ""
echo "  Static IP: $(curl -s ifconfig.me)"
echo ""
echo "  Next steps:"
echo "    1. Edit .env.local:  nano /var/www/cymstudio/.env.local"
echo "    2. Rebuild:          cd /var/www/cymstudio && npm run build"
echo "    3. Restart:          pm2 restart cymstudio"
echo ""
echo "  Useful commands:"
echo "    pm2 status           — Check app status"
echo "    pm2 logs cymstudio   — View app logs"
echo "    pm2 restart cymstudio — Restart the app"
echo "    nginx -t             — Test nginx config"
echo "============================================"
