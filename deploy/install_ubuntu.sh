#!/usr/bin/env bash
# KafedraAgent'ni Ubuntu/Debian VPS serverga o'rnatish.
# Ishlatish (loyiha papkasi ichidan, root sifatida):
#   sudo bash deploy/install_ubuntu.sh                 # IP orqali ochiladi: http://SERVER_IP
#   sudo bash deploy/install_ubuntu.sh kafedra.uz      # domen + bepul HTTPS sertifikat
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR=/opt/kafedra-agent
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Paketlar o'rnatilmoqda"
apt-get update -y
apt-get install -y python3 nginx rsync
if [ -n "$DOMAIN" ]; then apt-get install -y certbot python3-certbot-nginx; fi

echo "==> Fayllar $APP_DIR ga ko'chirilmoqda"
id -u kafedra >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin kafedra
mkdir -p "$APP_DIR"
rsync -a --delete --exclude '__pycache__' --exclude 'data/kafedra.db' "$SRC_DIR"/ "$APP_DIR"/
chown -R kafedra:kafedra "$APP_DIR"

echo "==> systemd xizmati"
cat > /etc/systemd/system/kafedra-agent.service <<EOF
[Unit]
Description=KafedraAgent Professional 2.0
After=network.target

[Service]
User=kafedra
WorkingDirectory=$APP_DIR
Environment=KA_HOST=127.0.0.1
Environment=KA_PORT=8000
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $APP_DIR/run.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now kafedra-agent
systemctl restart kafedra-agent

echo "==> nginx"
SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/kafedra-agent <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;
    client_max_body_size 15m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/kafedra-agent /etc/nginx/sites-enabled/kafedra-agent
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then ufw allow 'Nginx Full' || true; fi

if [ -n "$DOMAIN" ]; then
  echo "==> HTTPS sertifikat ($DOMAIN)"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
    echo "!! Sertifikat olinmadi: domen DNS'i shu server IP'siga yo'naltirilganini tekshiring, keyin: certbot --nginx -d $DOMAIN"
fi

echo
echo "Tayyor. Birinchi ishga tushishda baholash to'plami bajariladi (~20-30 soniya)."
echo "Holat:   systemctl status kafedra-agent"
echo "Jurnal:  journalctl -u kafedra-agent -f"
echo "Manzil:  http://${DOMAIN:-$(hostname -I | awk '{print $1}')}"
