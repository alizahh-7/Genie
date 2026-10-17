"""Re-runs the 40 coverage inputs through resolve() (the real ladder). Run from backend/:
    python engine\\coverage_run.py
Writes engine/_coverage/coverage_v3.csv (git-ignored). Takes ~2-4 min uncached, seconds when cached."""
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coverage_test_v2 import TESTS
from qloo_client import QlooClient
from resolve import resolve

c = QlooClient()
rows, levels = [], Counter()
for text, domain, hint in TESTS:
    d = "film" if domain == "tv" else domain
    r = resolve(text, d, hint=hint or None, client=c)
    levels[r["resolution_level"]] += 1
    rows.append({"input": text, "domain": domain, "found": r["found"], "level": r["resolution_level"],
                 "matched": r["entity"]["name"] if r["entity"] else "", "via": r.get("matched_via") or "",
                 "tags": len(r["tags"]), "my_review": ""})
    print(f"{text:26s} L{r['resolution_level']} {'OK ' if r['found'] else 'MISS'} -> {rows[-1]['matched']} {('(via ' + rows[-1]['via'] + ')') if rows[-1]['via'] else ''}")
out = Path(__file__).resolve().parent / "_coverage"
out.mkdir(exist_ok=True)
with (out / "coverage_v3.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
found = sum(r["found"] for r in rows)
print(f"\nResolved: {found}/{len(rows)} = {found / len(rows):.0%}   by level: {dict(sorted(levels.items()))}")
print("Open the CSV and fill my_review by hand (right / wrong / suspicious).")