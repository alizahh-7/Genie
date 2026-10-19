"""Run the demo personas through the engine twice. Pass 2 must be fast (cache warm).
    python engine\\prewarm_run.py
"""
import os, sys, time
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND, ".env"))

from engine import run_agent, side_by_side, generate_bedside_kit, pick_reaction_cards
from engine.personas import PERSONAS

BAD = ("timeout", "network", "no key")


def bad_status(s):
    s = str(s)
    return s in BAD or s.startswith("HTTP")


def one_pass(label, hot_limit_ms=None):
    print(f"\n=== {label} ===")
    ok = True
    for name, spec in PERSONAS.items():
        p, i = spec["person"], spec["inputs"]
        t0 = time.time()
        r = run_agent(p, i)
        t1 = time.time()
        c = side_by_side(p, i)
        t2 = time.time()
        kit = generate_bedside_kit(p, r["items"])
        cards = pick_reaction_cards(r["items"], tried=[])
        t3 = time.time()

        levels = Counter(it.get("resolution_level") for it in r["items"])
        errs = [x for x in r["qloo_log"] if bad_status(x.get("status"))]
        weak = [it["name"] for it in r["items"]
                if it.get("source_label") == "told" and it.get("resolution_level", 0) >= 5]
        generic_ok = bool(c.get("generic", {}).get("available"))
        total_ms = int((t3 - t0) * 1000)

        print(f"{name}: items={len(r['items'])} levels={dict(levels)} wishes={len(r['wishes'])} "
              f"cards={len(cards.get('cards', []))} kit_tracks={len(kit['playlist']['tracks'])}")
        print(f"   run_agent {int((t1-t0)*1000)} ms | compare {int((t2-t1)*1000)} ms | total {total_ms} ms "
              f"| qloo errors={len(errs)} | general AI available={generic_ok}")
        if weak:
            print(f"   NOTE told items not in Qloo (swap for the demo?): {weak}")
        problems = []
        if len(r["items"]) < 3: problems.append("fewer than 3 items")
        if not 3 <= len(r["wishes"]) <= 5: problems.append(f"{len(r['wishes'])} wishes")
        if errs: problems.append("Qloo errors in log")
        if not generic_ok: problems.append("general AI unavailable")
        if hot_limit_ms and total_ms > hot_limit_ms: problems.append(f"slow when hot ({total_ms} ms)")
        if problems:
            ok = False
            print("   FAIL:", "; ".join(problems))
        else:
            print("   OK")
    return ok


if __name__ == "__main__":
    a = one_pass("PASS 1 (may be cold)")
    b = one_pass("PASS 2 (must be hot)", hot_limit_ms=3000)
    print("\nRESULT:", "PASS" if (a and b) else "FAIL")
    sys.exit(0 if (a and b) else 1)