"""Live checks against real Qloo for the things offline tests cannot prove. Run from backend/:
    python engine\\live_checks.py            # level 4, extra judge inputs, level 6, (LLM if a key is set)
    python engine\\live_checks.py --level4   # or --extra / --l6 / --llm for just one
Output is printed only (nothing Qloo-related is written to disk except the git-ignored cache)."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qloo_client import QlooClient
from resolve import resolve
from portrait import build_portrait
import llm

args = set(sys.argv[1:])
run_all = not args


def level4():
    print("\n=== LEVEL 4: thin portraits (era + place) ===")
    people = [
        ({"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}, "70s Hindi, Hyderabad"),
        ({"first_name": "Appa", "birth_year": 1950, "region": "Chennai", "language": "Telugu"}, "Telugu, Chennai"),
        ({"first_name": "Minji", "birth_year": 1992, "region": "Seoul", "language": "Korean"}, "Korean, Seoul, no language tag"),
    ]
    for person, label in people:
        c = QlooClient()
        out = build_portrait(person, {"quick_facts": []}, client=c)
        calls = [l for l in c.log if l["step"] == "era_place"]
        print(f"\n{label}: {len(out['items'])} items, {len(calls)} insights calls ({[l['status'] for l in calls]})")
        for it in out["items"]:
            print(f"   L{it['resolution_level']} {it['domain']:6s} {it['name']}  tags={len(it['tags'])}")
        if not out["items"]:
            print("   NOTHING returned: level 4 does not work for this person. Paste this output back.")


def extra():
    print("\n=== EXTRA judge-style inputs (spelling, misses, odd input) ===")
    cases = [("Ghulam Ali", "music"), ("Descendants of the Sun", "film"), ("Mugal e Azam", "film"),
             ("Elton John", "music"), ("Fairouz", "music"), ("Aayega Aanewala", "music"), ("pesarattu", "food"),
             ("haleem biriyani", "food"), ("Hussain Sagar", "place"), ("Edinburgh", "place"),
             ("Kumbakonam filter coffee", "food"), ("a", "music")]
    c = QlooClient()
    for name, dom in cases:
        r = resolve(name, dom, client=c)
        m = r["entity"]["name"] if r["entity"] else "-"
        print(f"  {name:26s} {dom:6s} -> L{r['resolution_level']} {'OK  ' if r['found'] else 'MISS'} {m} {('(via ' + r['matched_via'] + ')') if r['matched_via'] else ''}")
    print("\nCheck by eye: no crash, misses are L5 (honest), spelling variants land at L1/L2, wrong matches are flagged in docs/coverage-report.md.")


def l6():
    print("\n=== LEVEL 6: simulated API failure (bad key) ===")
    c = QlooClient()
    c.key = "invalid-key-for-test"
    r = resolve("level six test name xyzzy", "music", client=c, use_llm=False)
    ok = (not r["found"]) and r["resolution_level"] == 6
    print(f"  level={r['resolution_level']} found={r['found']} log={c.log[-1]['status']}  ->  {'PASS' if ok else 'FAIL'}")


def llm_check():
    print("\n=== LLM ===")
    if not os.environ.get("LLM_API_KEY"):
        print("  LLM_API_KEY not set: skipped. (Engine still works with built-in aliases.)")
        return
    a = llm.suggest_alternates("Why This Kolaveri Di", "music", "Hyderabad", "Hindi")
    print("  alternates/parent:", a)
    llm._down_until = 0.0
    e = llm.extract_items("She loved Rafi sahab's songs and Mughal-e-Azam, and Nani's haleem at Eid near Charminar.", None)
    print("  extracted:", e)
    print("  PASS" if a and e else "  FAIL: check LLM_API_KEY / LLM_MODEL")


if run_all or "--level4" in args:
    level4()
if run_all or "--extra" in args:
    extra()
if run_all or "--l6" in args:
    l6()
if run_all or "--llm" in args:
    llm_check()