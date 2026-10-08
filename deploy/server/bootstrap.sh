#!/usr/bin/env bash
# One-time install of KafedraAgent on a server that already runs other projects.
#
#   git clone https://github.com/firdavs244/kafedra.git /opt/kafedra/src
#   bash /opt/kafedra/src/deploy/server/bootstrap.sh
#
# It changes exactly three things, and checks the neighbours before and after:
#   1. /opt/kafedra                      the code, and nothing outside it
#   2. docker compose project `kafedra`  one container on 127.0.0.1:8090,
#                                        capped memory, CPU and processes
#   3. /etc/nginx/sites-available/kafedra-ip.conf (+ its sites-enabled link)
#                                        the bare IP on port 80
#
# Every other site nginx serves is asked for its answer BEFORE the reload and
# AFTER it. If any answer changes, the nginx change is rolled back and the
# script stops - the app container stays up on localhost, harming nothing.
set -euo pipefail

SRC=/opt/kafedra/src
PORT=8090
SITE=/etc/nginx/sites-available/kafedra-ip.conf
LINK=/etc/nginx/sites-enabled/kafedra-ip.conf
COMPOSE="docker compose -f $SRC/deploy/server/docker-compose.yml"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n!! %s\n' "$*" >&2; exit 1; }

say "Preflight"
command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
command -v nginx >/dev/null || die "nginx not found"
free -m | head -2
if ss -ltnH "sport = :$PORT" | grep -q . && ! docker ps --format '{{.Names}}' | grep -qx kafedra-app; then
  die "port $PORT is already taken: $(ss -ltnpH "sport = :$PORT")"
fi
OTHER_DEFAULT=$(grep -lE 'listen[^;]*\b80\b[^;]*default_server' \
  /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null | grep -v kafedra-ip || true)
[ -z "$OTHER_DEFAULT" ] || die "another site already owns the default on port 80 ($OTHER_DEFAULT) - not touching nginx"

# Every named site nginx serves today, and what it answers on port 80.
NAMES=$(grep -hE '^\s*server_name' /etc/nginx/sites-enabled/* 2>/dev/null \
  | sed -E 's/^\s*server_name\s+//; s/;.*//' | tr ' ' '\n' \
  | grep -vE '^(_|~.*|)$' | sort -u || true)
probe() { curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: $1" http://127.0.0.1/ || echo 000; }
declare -A BEFORE
for n in $NAMES; do BEFORE[$n]=$(probe "$n"); done
echo "neighbours before: $(for n in $NAMES; do printf '%s=%s ' "$n" "${BEFORE[$n]}"; done)"

say "Code -> /opt/kafedra"
mkdir -p /opt/kafedra
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --quiet origin main && git -C "$SRC" reset --hard --quiet origin/main
else
  git clone --quiet https://github.com/firdavs244/kafedra.git "$SRC"
fi
install -m 700 "$SRC/deploy/server/deploy.sh" /opt/kafedra/deploy.sh
echo "at $(git -C "$SRC" rev-parse --short HEAD)"

say "App (compose project: kafedra)"
$COMPOSE up -d --build
ok=""
for i in $(seq 1 45); do
  if curl -fsS -m 3 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q "<title>KafedraAgent"; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { $COMPOSE logs --tail 40 app; die "the app did not answer on 127.0.0.1:$PORT within 90s"; }
echo "app answers on 127.0.0.1:$PORT"

say "nginx: bare IP -> app"
install -m 644 "$SRC/deploy/server/nginx-kafedra-ip.conf" "$SITE"
ln -sf "$SITE" "$LINK"
if ! nginx -t 2>&1; then
  rm -f "$LINK"
  die "nginx rejected the new site - link removed, nothing was reloaded"
fi
systemctl reload nginx
sleep 2

changed=""
for n in $NAMES; do
  after=$(probe "$n")
  [ "$after" = "${BEFORE[$n]}" ] || changed="$changed $n:${BEFORE[$n]}->$after"
done
if [ -n "$changed" ]; then
  rm -f "$LINK"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  die "a neighbour answered differently after the reload ($changed) - nginx change ROLLED BACK"
fi
echo "neighbours after:  unchanged"

IP=$(hostname -I | awk '{print $1}')
if curl -fsS -m 10 -H "Host: $IP" http://127.0.0.1/ | grep -q "<title>KafedraAgent"; then
  echo "bare IP serves KafedraAgent"
else
  die "nginx reloaded but http://$IP/ does not show KafedraAgent"
fi

say "Done"
docker stats --no-stream --format '{{.Name}}  mem {{.MemUsage}}  cpu {{.CPUPerc}}' kafedra-app
echo
echo "  Open:   http://$IP/"
echo "  Reset the demo / redeploy:   bash /opt/kafedra/deploy.sh"
echo "  Logs:   docker logs --tail 50 kafedra-app"
echo "  Remove: rm $LINK && systemctl reload nginx && $COMPOSE down"
