import os

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE = os.environ.get("QLOO_BASE_URL", "https://hackathon.api.qloo.com")
KEY = os.environ.get("QLOO_API_KEY")
if not KEY:
    raise SystemExit("QLOO_API_KEY is missing in backend/.env")

QUERIES = [
    "Lag Jaa Gale", "Lag Jaa Gale Lata Mangeshkar", "Ghantasala", "Ghantasala singer",
    "haleem", "Hyderabadi cuisine", "Charminar", "Irani chai",
]

for q in QUERIES:
    r = httpx.get(BASE + "/search", params={"query": q},
                  headers={"X-Api-Key": KEY}, timeout=15)
    print(f"\n{q} (status {r.status_code})")
    for x in r.json().get("results", [])[:5]:
        types = ", ".join(t.replace("urn:entity:", "") for t in x.get("types", []))
        print(f"  {x.get('name')} | {types} | {len(x.get('tags', []))} tags")