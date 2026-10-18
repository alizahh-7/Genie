import os
import httpx
from dotenv import load_dotenv
load_dotenv()

BASE = os.environ.get("QLOO_API_URL", "https://hackathon.api.qloo.com")
KEY = os.environ.get("QLOO_API_KEY")
if not KEY:
    raise SystemExit("QLOO_API_KEY is missing in backend/.env")

for q in ["hindi", "bollywood", "telugu", "tollywood", "tamil", "urdu", "ghazal", "korean", "k-pop", "arabic"]:
    r = httpx.get(BASE + "/v2/tags", params={"filter.query": q},
                  headers={"X-Api-Key": KEY}, timeout=15)
    print(f"\n{q} (status {r.status_code})")
    if r.status_code != 200:
        continue
    res = r.json().get("results", {})
    tags = res.get("tags", []) if isinstance(res, dict) else res
    for t in tags[:8]:
        print(f"  {t.get('id')} | {t.get('name')} | {t.get('type')} | pop={t.get('popularity')}")