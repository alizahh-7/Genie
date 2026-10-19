"""Live checks against real Qloo for the things offline tests cannot prove. Run from backend/:
    python engine\\live_checks.py            # level 4, extra judge inputs, level 6, (LLM if a key is set)
    python engine\\live_checks.py --level4   # or --extra / --l6 / --llm for just one
Output is printed only (nothing Qloo-related is written to disk except the git-ignored cache)."""
import json
import os
import sys
from pathlib import Path
from wishes import generate_wishes
from reaction import pick_reaction_cards, apply_reactions
from sidebyside import side_by_side
from kit import generate_bedside_kit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qloo_client import QlooClient
from resolve import resolve
from portrait import build_portrait
from agent import run_agent
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

def wishes():
    print("\n=== WISHES (Day 4): Nani end to end ===")
    person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
    facts = [("music", "Lag Jaa Gale"), ("music", "Kishore Kumar"), ("music", "Mohammed Rafi"),
             ("food", "haleem"), ("place", "Charminar"), ("film", "Mughal-e-Azam")]
    c = QlooClient()
    port = build_portrait(person, {"quick_facts": [{"domain": d, "name": n} for d, n in facts]}, client=c)
    out = generate_wishes(port["items"], person, client=c)
    for w in out["wishes"]:
        print(f"\n  [{w['mode']:9s}] {w['title']}   ({w['kind']}, {w['basis']}, maker: {w['maker_type']})")
        print(f"     {w['description']}")
        print(f"     from: {w['source_items']}   tags: {len(w['tags'])}")
        if w["why"]:
            print(f"     why: {w['why']}")
    calls = [l for l in c.log if l["step"] == "wish_discover"]
    print(f"\n  discovery calls: {[l['status'] for l in calls]}   follow_up: {out['follow_up']}")
    print(f"  {len(out['wishes'])} wishes -> {'PASS' if 3 <= len(out['wishes']) <= 5 else 'FAIL'}")
    # raw shape of the insights answer, so we can wire explainability next
    ents = [i["qloo_entity_id"] for i in port["items"] if i["qloo_entity_id"] and not i["qloo_entity_id"].startswith("urn:tag")][:6]
    data, err = c.get("/v2/insights", {"filter.type": "urn:entity:artist", "take": 3,
                                       "feature.explainability": "true",
                                       "signal.interests.entities": ",".join(ents)}, step="probe")
    res = (data or {}).get("results", {})
    print("\n  RAW SHAPE: top-level keys:", list(data.keys()) if data else err)
    print("  results keys:", list(res.keys()) if isinstance(res, dict) else type(res))
    first = (res.get("entities") or [{}])[0] if isinstance(res, dict) else {}
    print("  first entity keys:", list(first.keys()))
    for k in ("query", "explainability", "explain"):
        if k in first:
            print(f"  first entity [{k}]:", json.dumps(first[k], ensure_ascii=False)[:400])
            
def agent():
    print("\n=== AGENT (Day 5): Nani, one call ===")
    person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
    facts = [("music", "Lag Jaa Gale"), ("music", "Kishore Kumar"), ("music", "Mohammed Rafi"),
             ("food", "haleem"), ("place", "Charminar"), ("film", "Mughal-e-Azam")]
    out = run_agent(person, {"quick_facts": [{"domain": d, "name": n} for d, n in facts]})
    for s in out["steps"]:
        calls = f"  [{s['qloo_calls']} Qloo calls, {s['cached']} cached, {s['errors']} errors]" if s["qloo_calls"] is not None else ""
        print(f"  {s['title']:20s} {s['summary']}{calls}")
    print(f"\n  {len(out['items'])} items, {len(out['wishes'])} wishes, timings: {out['timings']}")
    for w in out["wishes"]:
        print(f"   [{w['mode']:9s}] {w['title']}")
    print("  PASS" if out["items"] and 3 <= len(out["wishes"]) <= 5 and out["steps"] else "  FAIL")

def reaction():
    print("\n=== REACTION MODE (Day 6): Nani ===")
    person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
    facts = [("music", "Lag Jaa Gale"), ("music", "Kishore Kumar"), ("music", "Mohammed Rafi"),
             ("food", "haleem"), ("place", "Charminar"), ("film", "Mughal-e-Azam")]
    items = run_agent(person, {"quick_facts": [{"domain": d, "name": n} for d, n in facts]}, use_llm=False)["items"]
    cards = pick_reaction_cards(items)["cards"]
    print("  Cards:")
    for c in cards:
        print(f"   [{c['domain']:5s}] {c['prompt']}")
    taps = [{"name": cards[0]["name"], "domain": cards[0]["domain"], "reaction": "lit_up"}]
    if len(cards) > 1:
        taps.append({"name": cards[1]["name"], "domain": cards[1]["domain"], "reaction": "no_reaction"})
    res = apply_reactions(person, items, taps)
    print(f"\n  {res['message']}")
    print(f"  added: {res['added']}   removed: {res['removed']}   tried: {res['tried']}")
    print(f"  next cards: {[c['name'] for c in res['next']]}")
    print(f"  Qloo calls: {[(l['step'], l['status']) for l in res['qloo_log']]}")
    print("  PASS" if res["items"] and len(res["tried"]) == len(taps) else "  FAIL")
    
def compare():
    print("\n=== SIDE BY SIDE (Day 7): Nani ===")
    person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
    facts = [("music", "Kishore Kumar"), ("music", "Mohammed Rafi"), ("food", "haleem"), ("place", "Charminar")]
    out = side_by_side(person, {"quick_facts": [{"domain": d, "name": n} for d, n in facts]})
    print(f"  Both were given: {out['inputs_given']['favourites']}")
    g = out["generic"]
    print("\n  GENERAL AI" + ("" if g["available"] else f"  ({g['message']})"))
    for w in g["wishes"]:
        print(f"   [{w['mode']:9s}] {w['title']}: {w['description']}")
    print(f"   filtered by the tone rule: {g['filtered']}")
    print("\n  GENIE")
    for w in out["genie"]["wishes"]:
        print(f"   [{w['mode']:9s}] {w['title']}  ({w['basis']}, {len(w['tags'])} taste tags)")
    print(f"\n  Evidence: {out['evidence']}")
    print("  PASS" if out["genie"]["wishes"] and (g["available"] or g["message"]) else "  FAIL")


def kit():
    print("\n=== BEDSIDE KIT (Day 7): Nani ===")
    person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
    facts = [("music", "Lag Jaa Gale"), ("music", "Kishore Kumar"), ("food", "haleem"), ("place", "Charminar")]
    items = run_agent(person, {"quick_facts": [{"domain": d, "name": n} for d, n in facts]}, use_llm=False)["items"]
    k = generate_bedside_kit(person, items)
    print(f"  {k['title']}\n  {k['intro']}\n  {k['playlist']['title']}: {k['playlist']['how_to']}")
    for t in k["playlist"]["tracks"]:
        print(f"   - {t['name']}  ({t['label']})")
    print("  Small changes:")
    for c in k["small_changes"]:
        print(f"   - {c['text']}")
    print("  Visitors:")
    for v in k["visitors"]:
        print(f"   - {v['text']}")
    print(f"  {k['note']}")
    print("  PASS" if k["playlist"]["tracks"] and k["small_changes"] and k["visitors"] else "  FAIL")
    
if run_all or "--level4" in args:
    level4()
if run_all or "--extra" in args:
    extra()
if run_all or "--l6" in args:
    l6()
if run_all or "--llm" in args:
    llm_check()
if run_all or "--wishes" in args:
    wishes()
if run_all or "--agent" in args:
    agent()
if run_all or "--reaction" in args:
    reaction()
if run_all or "--compare" in args:
    compare()
if run_all or "--kit" in args:
    kit()