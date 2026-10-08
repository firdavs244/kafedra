#!/usr/bin/env bash
# Redeploy KafedraAgent from GitHub main - and reset the demo while doing it.
#
# The database lives inside the container and is rebuilt from data/manba on
# start, so --force-recreate also returns every login, task and upload to the
# state the presentation expects. Run before a demo, or after someone has
# changed things in it.
#
# Touches nothing outside /opt/kafedra and the `kafedra` compose project.
set -euo pipefail

SRC=/opt/kafedra/src
cd "$SRC"
git fetch --quiet origin main
git reset --hard --quiet origin/main

docker compose -f deploy/server/docker-compose.yml up -d --build --force-recreate

# Wait for the app itself, not for Docker: a started container is not a
# serving one.
for i in $(seq 1 45); do
  if curl -fsS -m 3 http://127.0.0.1:8090/ 2>/dev/null | grep -q "<title>KafedraAgent"; then
    # No `docker image prune` here: on a shared box that would also delete
    # other projects' dangling images. A rebuild leaves ~150 MB behind.
    echo "kafedra: up after $((i * 2))s ($(git rev-parse --short HEAD))"
    exit 0
  fi
  sleep 2
done

echo "kafedra: NOT answering after 90s" >&2
docker compose -f deploy/server/docker-compose.yml logs --tail 50 app >&2
exit 1
