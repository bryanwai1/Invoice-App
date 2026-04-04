#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Invoice App — One-Command Deploy Script
#  Works on: Ubuntu 20.04+, Debian 11+, any server with sudo access
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/YOUR/REPO/main/deploy.sh | bash
#  Or locally:
#    chmod +x deploy.sh && ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-/opt/invoice-app}"
DOMAIN="${DOMAIN:-}"       # e.g. invoice.mydomain.com  (leave blank for IP-only)
EMAIL="${EMAIL:-}"         # e.g. me@email.com          (for Let's Encrypt SSL)

# ── Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Invoice App — Cloud Deployment Script  ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# ── 1. Install Docker if missing
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  success "Docker installed"
else
  success "Docker already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
fi

# ── 2. Install Docker Compose plugin if missing
if ! docker compose version &>/dev/null 2>&1; then
  info "Installing Docker Compose plugin..."
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-plugin
  success "Docker Compose installed"
else
  success "Docker Compose ready"
fi

# ── 3. Clone or update repo
if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$APP_DIR/.git" ]]; then
    info "Updating existing repo..."
    git -C "$APP_DIR" pull
  else
    info "Cloning repo to $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
  fi
  cd "$APP_DIR"
else
  # Running from inside the repo already
  APP_DIR="$(pwd)"
  info "Using current directory: $APP_DIR"
fi

# ── 4. Setup .env if missing
if [[ ! -f backend/.env ]]; then
  info "Creating backend/.env from example..."
  cp backend/.env.example backend/.env

  # Auto-detect public IP
  PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "your-server-ip")

  if [[ -n "$DOMAIN" ]]; then
    FRONTEND_URL="https://$DOMAIN"
  else
    FRONTEND_URL="http://$PUBLIC_IP"
    warn "No domain set. App will be accessible at http://$PUBLIC_IP"
    warn "Set DOMAIN=yourdomain.com to enable HTTPS."
  fi

  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=$FRONTEND_URL|" backend/.env

  warn "Edit backend/.env to set your company details:"
  echo "   nano $APP_DIR/backend/.env"
fi

# ── 5. Configure domain in docker-compose if provided
if [[ -n "$DOMAIN" ]]; then
  sed -i "s|FRONTEND_URL=http://localhost|FRONTEND_URL=https://$DOMAIN|" docker-compose.yml
fi

# ── 6. Build and start
info "Building and starting containers (this may take a few minutes)..."
docker compose build --no-cache
docker compose up -d

success "Containers started!"
docker compose ps

# ── 7. Optional: SSL with Let's Encrypt
if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
  echo ""
  info "Setting up HTTPS with Let's Encrypt for $DOMAIN..."

  if ! command -v certbot &>/dev/null; then
    sudo apt-get install -y certbot
  fi

  # Stop nginx temporarily to get cert
  docker compose stop frontend

  sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive

  # Copy certs into ssl/ folder for nginx
  mkdir -p ssl
  sudo cp /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ssl/
  sudo cp /etc/letsencrypt/live/"$DOMAIN"/privkey.pem ssl/
  sudo chown "$USER:$USER" ssl/*.pem

  # Patch nginx to use HTTPS
  cat > frontend/nginx-ssl.conf <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / { try_files \$uri \$uri/ /index.html; }

    location /api/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }

    location /pdfs/ {
        proxy_pass http://backend:3001;
        proxy_set_header Host \$host;
    }

    location /socket.io/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

  cp frontend/nginx-ssl.conf frontend/nginx.conf
  docker compose build frontend
  docker compose up -d

  # Auto-renew cron
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $APP_DIR/docker-compose.yml restart frontend") | crontab -
  success "HTTPS configured! Auto-renewal cron added."
fi

# ── 8. Firewall
if command -v ufw &>/dev/null; then
  info "Opening firewall ports 80 and 443..."
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow 22/tcp
fi

# ── Summary
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "your-server-ip")
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Deployment Complete!                    ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ -n "$DOMAIN" ]]; then
  echo -e "   App URL:   ${BLUE}https://$DOMAIN${NC}"
else
  echo -e "   App URL:   ${BLUE}http://$PUBLIC_IP${NC}"
fi
echo ""
echo "   Next steps:"
echo "   1. Visit the app URL in your browser"
echo "   2. Go to Settings → fill in your company details"
echo "   3. Go to WhatsApp → scan the QR code"
echo "   4. Start creating invoices!"
echo ""
echo "   Useful commands:"
echo "   • View logs:    docker compose logs -f"
echo "   • Restart:      docker compose restart"
echo "   • Update app:   git pull && docker compose up -d --build"
echo "   • Backup data:  docker compose cp backend:/app/data ./backup"
echo ""
