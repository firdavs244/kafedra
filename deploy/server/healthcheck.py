"""Container healthcheck that also HEALS.

Docker marks a container "unhealthy" and does nothing else - it never restarts
one for that. A server that is alive but no longer answering would stay that
way until someone noticed, which during a demo week is the worst case.

Three attempts, five seconds each, so a single slow moment (the evaluation run
takes 20-30 s) is not mistaken for a hang. If all three fail, PID 1 (tini, from
`init: true`) gets SIGTERM, the app exits, and `restart: unless-stopped` brings
up a fresh one.
"""
import os
import signal
import sys
import time
import urllib.request

for attempt in range(3):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/", timeout=5) as r:
            if r.status == 200:
                sys.exit(0)
    except Exception:
        pass
    time.sleep(3)

print("healthcheck: no answer in 3 attempts, restarting", file=sys.stderr)
os.kill(1, signal.SIGTERM)
sys.exit(1)
