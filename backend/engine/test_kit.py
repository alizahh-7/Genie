"""Offline tests for the Bedside Kit: no network, no keys. Run from backend/:  python engine\\test_kit.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit as K
from wishes import BANNED

passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


def item(domain, name, src="told", conf=0.9):
    return {"domain": domain, "name": name, "qloo_entity_id": "x", "tags": [], "source_label": src,
            "confidence": conf, "resolution_level": 1, "matched_name": name}


ITEMS = ([item("music", "Era One", "likely", 0.3), item("music", "Told Song", "told"), item("music", "Reacted Song", "reacted", 0.95),
          item("music", "Era Two", "likely", 0.3), item("music", "Era Three", "likely", 0.3), item("music", "Era Four", "likely", 0.3),
          item("music", "told song", "told"), item("food", "haleem"), item("place", "Charminar"), item("film", "Mughal-e-Azam")])
PERSON = {"first_name": "Nani", "language": "Telugu"}

print("the kit")
kit = K.generate_bedside_kit(PERSON, ITEMS)
check("all parts present", all(k in kit for k in ("title", "intro", "playlist", "small_changes", "visitors", "note")))
check("the not-a-medical-service note is there", kit["note"] == K.NOTE)
names = [t["name"] for t in kit["playlist"]["tracks"]]
check("reacted first, then told", names[:2] == ["Reacted Song", "Told Song"], names)
check("duplicate names are not repeated", len({n.lower() for n in names}) == len(names))
check("at most 3 guesses, and they are labelled", sum(t["basis"] == "likely" for t in kit["playlist"]["tracks"]) == 3
      and all(t["label"] for t in kit["playlist"]["tracks"]))
check("never more than 10 tracks", len(K.generate_bedside_kit(PERSON, [item("music", f"S{n}") for n in range(30)])["playlist"]["tracks"]) == 10)
body = json.dumps({k: v for k, v in kit.items() if k != "note"})
check("no medical or clinical wording outside the note", not BANNED.search(body))
check("no exclamation marks", "!" not in body)
check("food suggestion asks the care team first", any("care team" in c["text"] for c in kit["small_changes"] if c["because"] == "haleem"))
check("every suggestion says why", all(c["because"] for c in kit["small_changes"] + kit["visitors"]))
valid = {i["name"] for i in ITEMS} | {"general"}
check("reasons are real items or 'general'", all(c["because"] in valid for c in kit["small_changes"] + kit["visitors"]))
check("the person's language is used", any("Telugu" in v["text"] for v in kit["visitors"]))
check("title uses the first name", kit["title"] == "Bedside kit for Nani")
check("at most 6 suggestions in each list", len(kit["small_changes"]) <= 6 and len(kit["visitors"]) <= 6)

print("robustness")
before = json.dumps(ITEMS, sort_keys=True)
K.generate_bedside_kit(PERSON, ITEMS)
check("input is not changed", json.dumps(ITEMS, sort_keys=True) == before)
empty = K.generate_bedside_kit({}, [])
check("empty portrait: still a kit, with an empty note", empty["playlist"]["tracks"] == [] and empty["playlist"]["empty_note"]
      and len(empty["small_changes"]) >= 2 and len(empty["visitors"]) >= 2 and empty["title"] == "Bedside kit")
check("junk items and None do not crash", K.generate_bedside_kit(None, [{"name": None}, 5, {"name": "x", "source_label": "weird"}])["note"] == K.NOTE)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)