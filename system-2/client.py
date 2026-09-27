import os
import time
import random
import requests

TARGETS = [t.strip() for t in os.environ.get(
    "TARGETS", "https://api.github.com,https://httpbin.org/uuid"
).split(",") if t.strip()]
INTERVAL_SECONDS = float(os.environ.get("INTERVAL_SECONDS", "3"))

print(f"[system-2] API consumer starting. targets={TARGETS} interval={INTERVAL_SECONDS}s", flush=True)

while True:
    url = random.choice(TARGETS)
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "network-traffic-visualiser/system-2"})
        print(f"[system-2] GET {url} -> {resp.status_code} ({len(resp.content)} bytes)", flush=True)
    except requests.RequestException as exc:
        print(f"[system-2] GET {url} failed: {exc}", flush=True)
    time.sleep(INTERVAL_SECONDS)
