"""Quick check of a deployed Genie API (about 1 minute). Run it after every deploy.
    python post_deploy_check.py https://genie-ld8p.onrender.com
    python post_deploy_check.py https://genie-ld8p.onrender.com --origin https://your-app.vercel.app
    python post_deploy_check.py https://genie-ld8p.onrender.com --viewer-token <sample hospice viewer token>
It creates two demo people with /demo/start (fictional, spends no Qloo quota), reads them back, and deletes them.
It never prints tokens. For the full end-to-end run use judge_test.py."""
import sys, requests

a = sys.argv[1:]
BASE = next((x for x in a if x.startswith("http")), "http://127.0.0.1:8000").rstrip("/")
def opt(name): return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else None
ORIGIN, VIEWER = opt("--origin"), opt("--viewer-token")
S = requests.Session(); results = []

def check(name, ok, note=""):
    results.append(ok); print(("  ok   " if ok else "  FAIL ") + name + (f"   [{note}]" if note and not ok else ""))
    return ok
def get(path, **kw): return S.get(BASE + path, timeout=120, **kw)

print(f"Checking {BASE}\n")
try:
    r = get("/health/db")                                  # also wakes a sleeping free host
    check("API and database answer", r.status_code == 200, r.text[:80])
except requests.RequestException as e:
    check("API reachable", False, str(e)[:80]); sys.exit(1)
check("notices endpoint answers", get("/meta/notices").status_code == 200)

if ORIGIN:
    o = ORIGIN.rstrip("/")
    check("origin has no trailing slash", o == ORIGIN, "ALLOWED_ORIGINS must match exactly, no trailing slash")
    r = S.options(BASE + "/demo/personas", headers={"Origin": o, "Access-Control-Request-Method": "GET"}, timeout=60)
    allow = r.headers.get("access-control-allow-origin", "")
    check("CORS allows the frontend origin", allow in (o, "*"), f"server said {allow!r}; fix ALLOWED_ORIGINS on Render")

pers = get("/demo/personas")
check("two demo people are listed", pers.status_code == 200 and isinstance(pers.json(), list) and len(pers.json()) >= 2)

for idx in (0, 1):
    name = f"demo person {idx}"
    r = S.post(BASE + "/demo/start", json={"persona": idx}, timeout=120)
    if not check(f"{name}: /demo/start works", r.status_code == 200 and "person_id" in r.json(), f"HTTP {r.status_code} {r.text[:80]}"):
        continue
    pid = r.json()["person_id"]
    try:
        items = get(f"/persons/{pid}/portrait").json().get("items", [])
        check(f"{name}: portrait has items", len(items) >= 3, f"{len(items)} items")
        check(f"{name}: top_tags present", any("top_tags" in i for i in items), "backend should send top_tags")
        wishes = get(f"/persons/{pid}/wishes").json()
        check(f"{name}: 3 to 5 wishes", 3 <= len(wishes) <= 5, f"{len(wishes)} wishes")
        disc = [w for w in wishes if w.get("kind") == "discovery"]
        check(f"{name}: discovery wish names its item", all(w.get("discovered") for w in disc) if disc else True, "discovered missing")
        logs = get(f"/persons/{pid}/agent-log").json()
        agent = next((l for l in logs if l.get("step") == "agent"), None)
        rows = ((agent or {}).get("log") or {}).get("qloo_log") or []
        check(f"{name}: agent replay stored", agent is not None)
        check(f"{name}: every Qloo call row has a friendly label", bool(rows) and all(x.get("label") for x in rows),
              "stored demo log predates labels: ask the backend owner to regenerate it")
        c = S.post(BASE + f"/persons/{pid}/wish-book/compile", timeout=120)
        check(f"{name}: Wish Book compiles", c.status_code == 200, f"HTTP {c.status_code}")
        book = get(f"/persons/{pid}/wish-book")
        content = (book.json().get("content") if book.status_code == 200 else None) or {}
        voices = content.get("voices") or []
        check(f"{name}: Wish Book has family voices", len(voices) >= 3, f"{len(voices)} voices; run demo_memories.sql in Supabase")
        check(f"{name}: Wish Book has wishes and portrait", bool(content.get("wishes")) and bool(content.get("portrait")))
    finally:
        S.delete(BASE + f"/persons/{pid}", timeout=60)

if VIEWER:
    base = f"/org-portal/{VIEWER}"
    r = get(base + "/")
    ok = check("viewer link opens the sample organisation", r.status_code == 200, f"HTTP {r.status_code}")
    if ok:
        check("viewer role is viewer", (r.json().get("member") or {}).get("role") == "viewer")
        check("dashboard answers", get(base + "/dashboard").status_code == 200)
        w = S.post(BASE + base + "/cases", json={"first_name": "Test", "consent_confirmed": True, "consent_by": "the person"}, timeout=60)
        check("a viewer cannot create a story (403)", w.status_code == 403, f"HTTP {w.status_code}")

bad = results.count(False)
print(f"\n{len(results) - bad} passed, {bad} failed")
print("\nBy hand: submit an organisation application and a Wish Maker application with real-looking details,\n"
      "and check that every emailed link opens the deployed site, not localhost.\n"
      "If links say localhost: set FRONTEND_URL on Render. If the browser shows a CORS error: fix ALLOWED_ORIGINS.")
sys.exit(1 if bad else 0)