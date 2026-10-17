"""
Genie - Qloo coverage test v2 (Umaima)
======================================
Put this file in:  Genie2/backend/engine/    (create the engine folder if it is not there)
Run from:          Genie2/backend/           (so that .env is found)

    python engine/coverage_test_v2.py --probe     # 1) look at raw responses first
    python engine/coverage_test_v2.py             # 2) full 40-input coverage test

Needs:  pip install requests python-dotenv
Key:    QLOO_API_KEY in backend/.env   (never paste the key anywhere else)

Outputs go to backend/engine/_coverage/ . That folder holds Qloo data, so it must be
in .gitignore (add the line:  _coverage/ ). Never commit it to the public repo.
"""
import csv
import difflib
import json
import os
import sys
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

KEY = os.environ.get("QLOO_API_KEY")
BASE = os.environ.get("QLOO_API_URL", "https://hackathon.api.qloo.com").rstrip("/")
OUT = Path(__file__).resolve().parent / "_coverage"
OUT.mkdir(exist_ok=True)

TYPES = {  # domain -> /search "types" values to try, in order
    "music": ["urn:entity:artist"],
    "film": ["urn:entity:movie"],
    "tv": ["urn:entity:tv_show"],
    "place": ["urn:entity:place", "urn:entity:destination"],
}

# (input, domain, level-3 fallback query or "")   level 3 = search the artist instead of the song
TESTS = [
    ("Ghantasala", "music", ""), ("Butta Bomma", "music", "Armaan Malik"),
    ("Naatu Naatu", "music", "M. M. Keeravani"), ("S. P. Balasubrahmanyam", "music", ""),
    ("Lag Jaa Gale", "music", "Lata Mangeshkar"), ("Mohammed Rafi", "music", ""),
    ("Lata Mangeshkar", "music", ""), ("Kishore Kumar", "music", ""),
    ("Mughal-e-Azam", "film", ""),
    ("Mehdi Hassan", "music", ""), ("Jagjit Singh", "music", ""), ("Begum Akhtar", "music", ""),
    ("Ilaiyaraaja", "music", ""), ("A. R. Rahman", "music", ""),
    ("Why This Kolaveri Di", "music", "Dhanush"),
    ("Queen", "music", ""), ("Hotel California", "music", "Eagles"),
    ("The Beatles", "music", ""), ("Elvis Presley", "music", ""),
    ("BTS", "music", ""), ("BLACKPINK", "music", ""), ("Crash Landing on You", "tv", ""),
    ("Fairuz", "music", ""), ("Umm Kulthum", "music", ""), ("Shakira", "music", ""),
    ("haleem", "food", ""), ("Hyderabadi biryani", "food", "biryani"),
    ("masala dosa", "food", "dosa"), ("ramen", "food", ""), ("tacos", "food", ""),
    ("irani chai", "food", "chai"),
    ("Charminar", "place", ""), ("Marina Beach", "place", ""), ("Goa", "place", ""),
    ("Kyoto", "place", ""), ("Jeju Island", "place", ""), ("Tirupati", "place", ""),
    ("Sholay", "film", ""), ("Titanic", "film", ""), ("Mayabazar", "film", ""),
]


def get(path, params, raw_log=None):
    """GET with the key in the X-Api-Key header. 404 means 'no results', not an error."""
    for attempt in range(3):
        try:
            r = requests.get(BASE + path, params=params, headers={"X-Api-Key": KEY}, timeout=20)
        except requests.RequestException as e:
            time.sleep(1 + attempt)
            last = f"network: {type(e).__name__}"
            continue
        if r.status_code == 200:
            data = r.json()
            if raw_log is not None:
                raw_log.append({"path": path, "params": params, "response": data})
            return data, None
        if r.status_code == 404:
            return {}, "no results"
        last = f"HTTP {r.status_code}"
        if r.status_code in (400, 401, 403):
            break
        time.sleep(1 + attempt)
    return None, last


def as_list(data):
    """Find the list of hits wherever the response keeps it (shape is confirmed on the first run)."""
    if not isinstance(data, (dict, list)):
        return []
    if isinstance(data, list):
        return data
    res = data.get("results", data)
    if isinstance(res, list):
        return res
    if isinstance(res, dict):
        for k in ("entities", "tags", "results", "items"):
            if isinstance(res.get(k), list):
                return res[k]
    for k in ("entities", "tags"):
        if isinstance(data.get(k), list):
            return data[k]
    return []


def name_of(hit):
    return str(hit.get("name") or hit.get("title") or "")


def id_of(hit):
    return str(hit.get("entity_id") or hit.get("id") or "")


def best(query, hits):
    top, score = None, 0.0
    for h in hits[:8]:
        n = name_of(h).lower()
        s = difflib.SequenceMatcher(None, query.lower(), n).ratio()
        if query.lower() in n and len(query) >= 4:
            s = max(s, 0.8)
        if s > score:
            top, score = h, s
    return top, score


def lookup(query, domain, raw_log):
    """Returns (hit, score, kind, error)."""
    if domain == "food":
        data, err = get("/v2/tags", {"filter.query": query}, raw_log)
        if data is None:
            return None, 0, "tag", err
        hit, s = best(query, as_list(data))
        return (hit, s, "tag", None) if s >= 0.75 else (None, s, "tag", err)
    for t in TYPES.get(domain, []):
        data, err = get("/search", {"query": query, "types": t, "take": 5}, raw_log)
        if data is None:
            return None, 0, t, err
        hit, s = best(query, as_list(data))
        if s >= 0.75:
            return hit, s, t, None
    return None, 0, "-", None


def run_tests():
    raw, rows = [], []
    for i, (text, domain, l3) in enumerate(TESTS, 1):
        hit, s, kind, err = lookup(text, domain, raw)
        status, matched, eid = "not_found", "", ""
        if err and err != "no results":
            status = f"error ({err})"
        elif hit:
            status, matched, eid = "found", name_of(hit), id_of(hit)
        elif l3:
            h2, s2, kind2, err2 = lookup(l3, domain, raw)
            if h2:
                status, matched, eid = "found_via_level3", name_of(h2), id_of(h2)
        rows.append({"input": text, "domain": domain, "status": status, "match_score": round(s, 2),
                     "matched_name": matched, "entity_or_tag_id": eid, "level3_query": l3,
                     "my_review": "", "notes": ""})
        print(f"[{i:02d}/{len(TESTS)}] {text:26s} {domain:6s} -> {status}")
        time.sleep(0.25)
    with (OUT / "coverage_results.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    (OUT / "coverage_raw.json").write_text(json.dumps(raw[:12], indent=2, ensure_ascii=False), encoding="utf-8")

    ok = [r for r in rows if r["status"].startswith("found")]
    print(f"\nResolved (exact or via level 3): {len(ok)}/{len(rows)} = {len(ok) / len(rows):.0%}   (pass mark 70%)")
    for d in sorted({r['domain'] for r in rows}):
        sub = [r for r in rows if r["domain"] == d]
        print(f"  {d:6s} {sum(r['status'].startswith('found') for r in sub)}/{len(sub)}")
    print(f"\nReview every row in {OUT / 'coverage_results.csv'} by hand (auto-match can be wrong).")


def probe():
    """Prints trimmed raw responses so you can see the real shapes. Never prints the key."""
    raw = []
    steps = [
        ("1. search artist 'Queen'", "/search", {"query": "Queen", "types": "urn:entity:artist", "take": 3}),
        ("2. tag search 'haleem'", "/v2/tags", {"filter.query": "haleem"}),
        ("3. search place 'Charminar'", "/search", {"query": "Charminar", "types": "urn:entity:place", "take": 3}),
    ]
    first_artist_id = None
    for title, path, params in steps:
        data, err = get(path, params, raw)
        print(f"\n=== {title}  (error: {err})")
        print(json.dumps(data, indent=2, ensure_ascii=False)[:1800])
        if path == "/search" and params["query"] == "Queen" and data:
            hits = as_list(data)
            first_artist_id = id_of(hits[0]) if hits else None
    if first_artist_id:
        params = {"filter.type": "urn:entity:artist", "signal.interests.entities": first_artist_id,
                  "signal.location.query": "Hyderabad", "signal.demographics.age": "55_and_older",
                  "feature.explainability": "true", "take": 3}
        data, err = get("/v2/insights", params, raw)
        print(f"\n=== 4. insights: artists liked by people who like that artist, Hyderabad, 55+ (error: {err})")
        print(json.dumps(data, indent=2, ensure_ascii=False)[:2500])
    (OUT / "probe_raw.json").write_text(json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nFull raw responses saved to {OUT / 'probe_raw.json'} (git-ignored).")


if __name__ == "__main__":
    if not KEY:
        sys.exit("QLOO_API_KEY not found. Add it to backend/.env (QLOO_API_KEY=...).")
    probe() if "--probe" in sys.argv else run_tests()