import json
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE = os.environ.get("QLOO_BASE_URL", "https://hackathon.api.qloo.com")
KEY = os.environ.get("QLOO_API_KEY")
SEARCH_PATH = "/search"      # confirm in Qloo's developer guide
KEY_HEADER = "X-Api-Key"     # confirm in Qloo's developer guide

if not KEY:
    raise SystemExit("QLOO_API_KEY is missing in backend/.env")

QUERIES = [
    "Lag Jaa Gale", "Mohammed Rafi", "Lata Mangeshkar", "Ghantasala", "Jagjit Singh",
    "haleem", "Hyderabadi biryani", "Charminar", "Frank Sinatra", "Fairuz",
    "BTS", "Los Panchos", "kimchi jjigae", "Irani chai",
]


def first_list(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for value in data.values():
            found = first_list(value)
            if found is not None:
                return found
    return None


for i, q in enumerate(QUERIES):
    try:
        r = httpx.get(BASE + SEARCH_PATH, params={"query": q},
                      headers={KEY_HEADER: KEY}, timeout=15)
    except Exception as exc:
        print(f"{q}: request failed: {exc}")
        continue
    try:
        data = r.json()
    except Exception:
        print(f"{q}: status {r.status_code}, not JSON: {r.text[:200]}")
        continue
    items = first_list(data) or []
    names = [str(x.get("name")) for x in items[:3] if isinstance(x, dict) and x.get("name")]
    print(f"{q}: status {r.status_code}, {len(items)} results, top: {names}")
    if i == 0:
        print("RAW SAMPLE:", json.dumps(data, indent=1, ensure_ascii=False)[:1800])