#!/usr/bin/env bash
# One-time install of KafedraAgent on a server that already runs other projects.
#
#   git clone https://github.com/firdavs244/kafedra.git /opt/kafedra/src
#   bash /opt/kafedra/src/deploy/server/bootstrap.sh
#
# Result: http://<SERVER_IP>:8080/
#
# What it changes - and nothing else:
#   1. /opt/kafedra                      the code
#   2. docker compose project `kafedra`  two containers (app + its own nginx),
#                                        one published port: 8080
# What it never touches: /etc/nginx, the bare IP on port 80/443, the firewall,
# and every container that is not part of the `kafedra` project.
#
# The neighbours are checked before and after: what the bare IP answers, and
# which other containers are running. If either differs afterwards the script
# says so loudly.
set -euo pipefail

SRC=/opt/kafedra/src
PORT=8080
COMPOSE="docker compose -f $SRC/deploy/server/docker-compose.yml"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n!! %s\n' "$*" >&2; exit 1; }
bare_ip() { curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' http://127.0.0.1/ || echo "000"; }
others() { docker ps --format '{{.Names}} {{.Status}}' | grep -v '^kafedra-' | sed -E 's/ (Up|Restarting).*/ \1/' | sort; }

say "Preflight"
command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
free -m | head -2
if ss -ltnH "sport = :$PORT" | grep -q . && ! docker ps --format '{{.Names}}' | grep -qx kafedra-proxy; then
  die "port $PORT is already taken: $(ss -ltnpH "sport = :$PORT")"
fi
BARE_BEFORE=$(bare_ip)
OTHERS_BEFORE=$(others)
echo "bare IP answers:  $BARE_BEFORE"
echo "other containers: $(echo "$OTHERS_BEFORE" | wc -l) running"

say "Code -> /opt/kafedra"
mkdir -p /opt/kafedra
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --quiet origin main && git -C "$SRC" reset --hard --quiet origin/main
else
  git clone --quiet https://github.com/firdavs244/kafedra.git "$SRC"
fi
install -m 700 "$SRC/deploy/server/deploy.sh" /opt/kafedra/deploy.sh
echo "at $(git -C "$SRC" rev-parse --short HEAD)"

say "Containers (compose project: kafedra)"
$COMPOSE up -d --build
ok=""
for i in $(seq 1 45); do
  if curl -fsS -m 3 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q "<title>KafedraAgent"; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { $COMPOSE logs --tail 40; die "KafedraAgent did not answer on :$PORT within 90s"; }
echo "KafedraAgent answers on :$PORT"

say "Neighbours"
BARE_AFTER=$(bare_ip)
OTHERS_AFTER=$(others)
[ "$BARE_AFTER" = "$BARE_BEFORE" ] || die "the bare IP answered '$BARE_BEFORE' before and '$BARE_AFTER' now"
[ "$OTHERS_AFTER" = "$OTHERS_BEFORE" ] || die "other containers changed:
$(diff <(echo "$OTHERS_BEFORE") <(echo "$OTHERS_AFTER") || true)"
echo "bare IP unchanged ($BARE_AFTER), other containers unchanged"

say "Done"
docker stats --no-stream --format '{{.Name}}  mem {{.MemUsage}}  cpu {{.CPUPerc}}' kafedra-app kafedra-proxy
IP=$(hostname -I | awk '{print $1}')
echo
echo "  Open:   http://$IP:$PORT/"
echo "  Reset the demo / redeploy:   bash /opt/kafedra/deploy.sh"
echo "  Logs:   docker logs --tail 50 kafedra-app"
echo "  Remove: $COMPOSE down && rm -rf /opt/kafedra"
