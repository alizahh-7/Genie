"""Smoke test of the stateless engine routes against a running server.
    python smoke_api.py                              (server on http://127.0.0.1:8000)
    python smoke_api.py https://your-api.onrender.com
"""
import os, re, sys, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from engine.personas import PERSONAS

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
BAD = re.compile(r"diagnos|medic|dementia|alzheimer|cancer|terminal|dying|\bdeath\b|therap|"
                 r"treatment|\bcure\b|\bpain\b|hospice|palliative|illness|patient", re.I)
fails = 0


def check(name, cond, extra=""):
    global fails
    print(("  ok   " if cond else "  FAIL ") + name + (f"   {extra}" if extra else ""))
    if not cond:
        fails += 1


def post(path, body, timeout=60):
    t0 = time.time()
    r = requests.post(BASE + path, json=body, timeout=timeout)
    return r, time.time() - t0


def calm(texts):
    return all(not (isinstance(t, str) and ("!" in t or BAD.search(t))) for t in texts)


print("server:", BASE)
for name, spec in PERSONAS.items():
    person, inputs = spec["person"], spec["inputs"]
    body = {"person": person, "quick_facts": inputs["quick_facts"],
            "circle_answers": inputs.get("circle_answers", [])}
    print(f"\n=== {name} ===")

    r, dt = post("/agent/run", body)
    check("/agent/run returns 200", r.status_code == 200, f"{dt:.1f}s, HTTP {r.status_code}")
    if r.status_code != 200:
        print("      ", r.text[:300]); continue
    run = r.json()
    items = run["items"]
    check("at most 30 items", len(items) <= 30, f"{len(items)} items")
    check("3 to 5 wishes", 3 <= len(run["wishes"]) <= 5, f"{len(run['wishes'])} wishes")
    check("steps and timings present", len(run["steps"]) >= 5 and "total_ms" in run["timings"],
          f"total {run['timings'].get('total_ms')} ms")
    check("wishes and steps are calm", calm([w["title"] + " " + w["description"] for w in run["wishes"]]
                                            + [s["summary"] for s in run["steps"]]))

    r, dt = post("/agent/compare", body)
    check("/agent/compare returns 200", r.status_code == 200, f"{dt:.1f}s, HTTP {r.status_code}")
    if r.status_code == 200:
        c = r.json()
        check("general AI answered", c["generic"]["available"] is True, c["generic"].get("message") or "")
        check("Genie side complete", len(c["genie"]["wishes"]) >= 3)
        check("evidence and note present", bool(c.get("evidence")) and bool(c.get("note")))
        check("general wishes claim no source", all(w.get("basis") is None for w in c["generic"]["wishes"]))

    r, dt = post("/agent/reaction-cards", {"items": items, "tried": [], "n": 4})
    check("/agent/reaction-cards returns 200", r.status_code == 200, f"HTTP {r.status_code}")
    cards = r.json().get("cards", []) if r.status_code == 200 else []
    check("1 to 5 cards", 1 <= len(cards) <= 5, f"{len(cards)} cards")
    if cards:
        c0 = cards[0]
        for kind, expect in (("lit_up", "Thank you. Genie has noted what they enjoyed."),
                             ("no_reaction", "That is okay. Let us try something else.")):
            tap = {"name": c0["name"], "domain": c0["domain"], "reaction": kind}
            r, dt = post("/agent/reactions", {"person": person, "items": items, "reactions": [tap], "tried": []})
            check(f"/agent/reactions {kind} returns 200", r.status_code == 200, f"{dt:.1f}s, HTTP {r.status_code}")
            if r.status_code == 200:
                u = r.json()
                if kind == "lit_up":
                    check("tapped item became 'reacted'",
                          any(i["name"] == c0["name"] and i["source_label"] == "reacted" for i in u["items"]))
                check(f"{kind} message is the kind one", u["message"] == expect, u["message"])
                check("portrait never above 30", len(u["items"]) <= 30)

    r, dt = post("/agent/bedside-kit", {"person": person, "items": items})
    check("/agent/bedside-kit returns 200", r.status_code == 200, f"{dt:.1f}s, HTTP {r.status_code}")
    if r.status_code == 200:
        k = r.json()
        check("care note present", k["note"].startswith("Genie is not a medical service"))
        check("kit wording is calm", calm([k["intro"], k["playlist"].get("how_to")]
                                          + [x["text"] for x in k["small_changes"] + k["visitors"]]))

print("\nwaiting 62 seconds so the per-minute rate limit resets (429 earlier was the limiter working)...")
time.sleep(62)
print("\n=== validation ===")
person = PERSONAS["nani"]["person"]
r, _ = post("/agent/run", {"person": person, "quick_facts": [{"domain": "music", "name": f"A{i}"} for i in range(21)]})
check("21 favourites are refused with 422", r.status_code == 422, f"HTTP {r.status_code}")
r, _ = post("/agent/run", {"person": person, "quick_facts": [{"domain": "banana", "name": "x"}]})
check("an unknown domain is refused with 422", r.status_code == 422, f"HTTP {r.status_code}")

print(f"\n{'ALL PASSED' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)