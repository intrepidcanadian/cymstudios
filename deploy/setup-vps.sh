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
#   - Creates a dedicated 'cymapp' user (non-root)
#   - Installs Node.js 20, Nginx, Certbot, fail2ban
#   - Clones the repo
#   - Builds the app
#   - Sets up PM2 with auto-start on reboot (as cymapp user)
#   - Configures Nginx reverse proxy
#   - Gets SSL certificate from Let's Encrypt
#   - Hardens SSH and enables firewall
#
# After setup, deploy updates with:  ./deploy/deploy.sh root@your-vps-ip

set -euo pipefail

# ============================================
# CONFIGURATION — Edit these before running
# ============================================
DOMAIN="cymstudio.app"
REPO_URL="https://github.com/your-username/cymstudio.git"  # Change this
APP_DIR="/var/www/cymstudio"
APP_USER="cymapp"
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
# 2. Create dedicated app user (non-root)
# ============================================
echo ""
echo "==> Creating app user '${APP_USER}'..."
if id "${APP_USER}" &>/dev/null; then
  echo "    User ${APP_USER} already exists."
else
  useradd --system --create-home --shell /bin/bash "${APP_USER}"
  echo "    User ${APP_USER} created."
fi

# ============================================
# 3. Install Node.js
# ============================================
echo ""
echo "==> Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt install -y nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

# ============================================
# 4. Install PM2
# ============================================
echo ""
echo "==> Installing PM2..."
npm install -g pm2

# ============================================
# 5. Install Nginx
# ============================================
echo ""
echo "==> Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# ============================================
# 6. Install Certbot (SSL)
# ============================================
echo ""
echo "==> Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# ============================================
# 7. Install and configure fail2ban
# ============================================
echo ""
echo "==> Installing fail2ban..."
apt install -y fail2ban

# Configure fail2ban for SSH brute-force protection
cat > /etc/fail2ban/jail.local <<'FAIL2BAN'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
banaction = ufw

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 3600

[nginx-http-auth]
enabled  = true
port     = http,https
filter   = nginx-http-auth
logpath  = /var/log/nginx/error.log
maxretry = 5
bantime  = 1800

[nginx-limit-req]
enabled  = true
port     = http,https
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
bantime  = 600
FAIL2BAN

systemctl enable fail2ban
systemctl restart fail2ban
echo "fail2ban installed and configured."

# ============================================
# 8. Enable automatic security updates
# ============================================
echo ""
echo "==> Enabling automatic security updates..."
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades || true

# ============================================
# 9. Clone the repo
# ============================================
echo ""
echo "==> Cloning repository..."
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR" ]; then
  echo "Directory $APP_DIR already exists, pulling latest..."
  cd "$APP_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# Set ownership to app user
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

# ============================================
# 10. Create .env.local from .env.example
# ============================================
echo ""
if [ ! -f "$APP_DIR/.env.local" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
    # Restrict permissions — only the app user can read
    chmod 600 "$APP_DIR/.env.local"
    chown "${APP_USER}:${APP_USER}" "$APP_DIR/.env.local"
    echo "==> Created .env.local from .env.example (mode 600)"
    echo "    IMPORTANT: Edit /var/www/cymstudio/.env.local with your actual values!"
  else
    echo "==> WARNING: No .env.example found. Create .env.local manually."
  fi
else
  # Ensure existing .env.local has restrictive permissions
  chmod 600 "$APP_DIR/.env.local"
  chown "${APP_USER}:${APP_USER}" "$APP_DIR/.env.local"
  echo "==> .env.local already exists, permissions secured."
fi

# ============================================
# 11. Install dependencies and build (as app user)
# ============================================
echo ""
echo "==> Installing dependencies..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npm ci --production=false"

echo ""
echo "==> Building the app..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && npm run build"

# ============================================
# 12. Start with PM2 (as app user, NOT root)
# ============================================
echo ""
echo "==> Starting app with PM2 as user '${APP_USER}'..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pm2 start ecosystem.config.js"
sudo -u "${APP_USER}" bash -c "pm2 save"

# Set up PM2 to auto-start on boot as the app user
env PATH=$PATH:/usr/bin pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}"
echo "PM2 will auto-restart the app on reboot (as ${APP_USER})."

# ============================================
# 13. Configure Nginx
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
# 14. Get SSL certificate
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

  # Auto-renew SSL (merge-safe: preserve any existing crontab entries)
  ( crontab -l 2>/dev/null | grep -v 'certbot renew'; \
    echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" ) | crontab -
  echo "SSL auto-renewal cron job added."
else
  echo "    Skipping SSL. Run this later:"
  echo "    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
fi

# ============================================
# 14b. App cron jobs (catalogue sync + stuck-order resolver)
# ============================================
echo ""
echo "==> Installing app cron jobs..."
chmod +x "$APP_DIR/deploy/cron-hit.sh"
# Merge-safe: drop our previous entries (marked with CYM-CRON) then re-add.
( crontab -l 2>/dev/null | grep -v 'CYM-CRON'; \
  echo "0 4 * * * $APP_DIR/deploy/cron-hit.sh /api/sync-brands >> /var/log/cym-sync-brands.log 2>&1 # CYM-CRON sync-brands"; \
  echo "*/15 * * * * $APP_DIR/deploy/cron-hit.sh /api/cron/resolve-pending-orders >> /var/log/cym-resolve-orders.log 2>&1 # CYM-CRON resolve-orders" \
) | crontab -
echo "App cron jobs added: brands sync (daily 04:00), order resolver (every 15 min)."

# ============================================
# 15. Firewall
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
echo "  App user:  ${APP_USER} (non-root)"
echo ""
echo "  Security:"
echo "    - fail2ban active (SSH brute-force protection)"
echo "    - Automatic security updates enabled"
echo "    - .env.local restricted to ${APP_USER} (mode 600)"
echo "    - App runs as unprivileged user"
echo ""
echo "  Next steps:"
echo "    1. Edit .env.local:  sudo -u ${APP_USER} nano ${APP_DIR}/.env.local"
echo "    2. Rebuild:          sudo -u ${APP_USER} bash -c 'cd ${APP_DIR} && npm run build'"
echo "    3. Restart:          sudo -u ${APP_USER} pm2 restart cymstudio"
echo ""
echo "  Useful commands:"
echo "    sudo -u ${APP_USER} pm2 status           — Check app status"
echo "    sudo -u ${APP_USER} pm2 logs cymstudio   — View app logs"
echo "    sudo -u ${APP_USER} pm2 restart cymstudio — Restart the app"
echo "    sudo fail2ban-client status sshd          — Check fail2ban"
echo "    nginx -t                                  — Test nginx config"
echo "============================================"
