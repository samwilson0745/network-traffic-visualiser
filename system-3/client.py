import os
import time
import random
import socket
import requests

HOSTS = [h.strip() for h in os.environ.get(
    "HOSTS", "example.com,httpbin.org,api.github.com"
).split(",") if h.strip()]
INTERVAL_SECONDS = float(os.environ.get("INTERVAL_SECONDS", "4"))

print(f"[system-3] Mixed traffic generator starting. hosts={HOSTS} interval={INTERVAL_SECONDS}s", flush=True)


def dns_lookup(host):
    try:
        ip = socket.gethostbyname(host)
        print(f"[system-3] DNS {host} -> {ip}", flush=True)
    except socket.gaierror as exc:
        print(f"[system-3] DNS {host} failed: {exc}", flush=True)


def http_request(host, scheme):
    url = f"{scheme}://{host}"
    try:
        resp = requests.get(url, timeout=6)
        print(f"[system-3] {scheme.upper()} {url} -> {resp.status_code} ({len(resp.content)} bytes)", flush=True)
    except requests.RequestException as exc:
        print(f"[system-3] {scheme.upper()} {url} failed: {exc}", flush=True)


while True:
    host = random.choice(HOSTS)
    action = random.choice(["dns", "http", "https"])
    if action == "dns":
        dns_lookup(host)
    else:
        http_request(host, action)
    time.sleep(INTERVAL_SECONDS)
