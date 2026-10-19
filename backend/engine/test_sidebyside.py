"""Offline tests for the side-by-side comparison: no network, no keys. Run from backend/:  python engine\\test_sidebyside.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm
import sidebyside as S

passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


def ent(name, eid):
    return {"name": name, "entity_id": eid, "popularity": 0.9,
            "tags": [{"name": f"T{i}", "tag_id": f"urn:tag:genre:t{i}", "type": "urn:tag:genre"} for i in range(3)]}


class Fake:
    def __init__(self, err=None):
        self.err, self.log = err, []

    def get(self, path, params, step=""):
        self.log.append({"step": step, "request": path, "status": self.err or "ok", "ms": 1})
        if self.err:
            return None, self.err
        if path == "/search" and params.get("query") == "Queen":
            return {"results": [ent("Queen", "Q")]}, None
        if path == "/search":
            return {"results": []}, None
        return {"results": {"entities": []}}, None


PERSON = {"first_name": "X", "birth_year": 1950, "region": "Hyderabad", "language": "Hindi"}
INPUTS = {"quick_facts": [{"domain": "music", "name": "Queen"}, {"domain": "music", "name": "Zzzz Qqqq"},
                          {"domain": "food", "name": "haleem"}],
          "circle_answers": [{"contributor": "A", "answers": {"music": "She sang along to Queen"}}]}
GOOD = {"wishes": [{"title": "Hear Queen again", "description": "Play their favourite Queen songs.", "mode": "remote"},
                   {"title": "A family dinner", "description": "Cook haleem together at home.", "mode": "in-person"},
                   {"title": "A letter", "description": "Write a letter they can keep.", "mode": "weird"}]}
CAPTURED = []


def stub(system, user, **k):
    if "last wishes" in system:
        CAPTURED.append(user)
        return GOOD
    return None


llm.chat_json = stub

print("side by side")
out = S.side_by_side(PERSON, INPUTS, client=Fake())
check("has both sides, evidence and a note", all(k in out for k in ("inputs_given", "generic", "genie", "evidence", "note")))
check("the general AI got the same favourites", CAPTURED and "Queen" in CAPTURED[0] and "haleem" in CAPTURED[0], CAPTURED)
check("the general AI got the family notes too", "sang along" in CAPTURED[0])
check("the general AI got no Qloo data", "urn:tag" not in CAPTURED[0] and "tags" not in CAPTURED[0])
check("inputs_given lists the favourites", out["inputs_given"]["favourites"] == ["Queen", "Zzzz Qqqq", "haleem"])
check("general AI wishes returned", out["generic"]["available"] and len(out["generic"]["wishes"]) == 3)
check("bad mode becomes remote", [w["mode"] for w in out["generic"]["wishes"]] == ["remote", "in-person", "remote"])
check("general AI wishes claim no source", all(w["basis"] is None for w in out["generic"]["wishes"]))
check("Genie side has wishes, steps and the call log", len(out["genie"]["wishes"]) >= 3 and out["genie"]["steps"] and out["genie"]["qloo_log"])
ev = out["evidence"]
check("evidence counts are real", ev["genie_wishes"] == len(out["genie"]["wishes"]) and ev["genie_qloo_calls"] == len(out["genie"]["qloo_log"]))
check("evidence counts told items found in Qloo", ev["genie_told_items"] == 3 and ev["genie_told_items_found_in_qloo"] == 1, ev)
check("evidence says the general AI had no taste data", "none" in ev["generic_taste_evidence"] and ev["generic_wishes"] == 3)

print("tone filter and failures")
llm.chat_json = lambda s, u, **k: ({"wishes": [{"title": "Music therapy", "description": "x", "mode": "remote"},
                                               {"title": "Nice", "description": "Great!", "mode": "remote"},
                                               {"title": "Quiet song", "description": "Play one song.", "mode": "remote"}]}
                                   if "last wishes" in s else None)
g = S.generic_wishes(PERSON, INPUTS)
check("medical wording and shouting are filtered, and counted", len(g["wishes"]) == 1 and g["filtered"] == 2, g)
llm.chat_json = lambda *a, **k: None
out = S.side_by_side(PERSON, INPUTS, client=Fake())
check("LLM down: the general AI side says so", out["generic"]["available"] is False and out["generic"]["message"])
check("LLM down: Genie's side is still complete", len(out["genie"]["wishes"]) >= 3)
for bad in ({"wishes": "no"}, ["x"], {"wishes": [5, None]}):
    llm.chat_json = lambda s, u, bad=bad, **k: bad if "last wishes" in s else None
    check(f"odd answer {str(bad)[:20]} is handled", S.generic_wishes(PERSON, INPUTS)["available"] is False)
llm.chat_json = stub
out = S.side_by_side(PERSON, INPUTS, client=Fake(err="timeout"))
check("Qloo down: still returns both sides", out["generic"]["available"] and "genie" in out)
check("None input does not crash", isinstance(S.side_by_side(None, None, client=Fake()), dict))


class Boom(Fake):
    def get(self, *a, **k):
        raise RuntimeError("boom")


check("a client that raises still returns a result", isinstance(S.side_by_side(PERSON, INPUTS, client=Boom()), dict))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)