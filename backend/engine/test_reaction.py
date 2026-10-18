"""Offline tests for Reaction Mode: no network, no keys. Run from backend/:  python engine\\test_reaction.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reaction as R
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


class Fake:
    def __init__(self, insights=None, err=None):
        self.insights, self.err, self.log, self.calls = insights or {}, err, [], 0

    def get(self, path, params, step=""):
        self.calls += 1
        self.log.append({"step": step, "request": path, "status": self.err or "ok", "ms": 1})
        if self.err:
            return None, self.err
        return self.insights, None


def item(domain, name, eid, src="told", conf=0.9, lvl=1):
    return {"domain": domain, "name": name, "qloo_entity_id": eid, "tags": [{"id": "t", "name": "Classic", "type": "x"}],
            "source_label": src, "confidence": conf, "resolution_level": lvl, "matched_name": name}


ITEMS = [item("music", "Kishore Kumar", "K1"), item("music", "Mohammed Rafi", "R1", conf=0.85),
         item("food", "haleem", "urn:tag:specialty_dish:place:haleem"), item("place", "Charminar", "C1"),
         item("film", "Mughal-e-Azam", "M1"), item("music", "Era Artist", "E1", "likely", 0.3, 4)]
INS = {"results": {"entities": [{"name": "Kishore Kumar", "entity_id": "x", "tags": []},
                                {"name": "Talat Mahmood", "entity_id": "T1", "tags": [{"id": "g", "name": "Ghazal", "type": "urn:tag:genre"}]},
                                {"name": "Hemant Kumar", "entity_id": "H1", "tags": []}]}}

print("picking cards")
p = R.pick_reaction_cards(ITEMS)
cards = p["cards"]
check("4 cards by default", len(cards) == 4, len(cards))
check("never more than 5 even if asked", len(R.pick_reaction_cards(ITEMS, n=20)["cards"]) <= 5)
check("domains are mixed", len({c["domain"] for c in cards}) >= 3, [c["domain"] for c in cards])
check("told items come before guesses", all(c["source_label"] == "told" for c in cards))
check("no name twice", len({c["name"] for c in cards}) == len(cards))
check("each card has a prompt and media query", all(c["prompt"] and c["media_query"] for c in cards))
check("prompts have no medical wording", not any(BANNED.search(c["prompt"]) for c in cards))
check("remaining counts the rest", p["remaining"] == len(ITEMS) - len(cards))
p2 = R.pick_reaction_cards(ITEMS, tried=[c["name"] for c in cards])
check("tried items are never shown again", not ({c["name"] for c in p2["cards"]} & {c["name"] for c in cards}))
check("tried matches loosely (case, spacing)", all(c["name"] != "haleem" for c in R.pick_reaction_cards(ITEMS, tried=["HALEEM "])["cards"]))
check("already reacted items are skipped", all(c["name"] != "Charminar" for c in R.pick_reaction_cards(
    [dict(i, source_label="reacted") if i["name"] == "Charminar" else i for i in ITEMS], n=5)["cards"]))
check("done when nothing is left", R.pick_reaction_cards(ITEMS, tried=[i["name"] for i in ITEMS])["done"])
check("junk and None do not crash", R.pick_reaction_cards([{"name": None}, 5, {"domain": "other", "name": "x"}])["cards"] == []
      and R.pick_reaction_cards(None)["done"])

print("applying reactions")
before = json.dumps(ITEMS, sort_keys=True)
res = R.apply_reactions({}, ITEMS, [{"name": "Kishore Kumar", "domain": "music", "reaction": "lit_up"}], client=Fake(INS))
kk = next(i for i in res["items"] if i["name"] == "Kishore Kumar")
check("lit up becomes 'reacted'", kk["source_label"] == "reacted")
check("lit up raises confidence", kk["confidence"] > 0.9 - 0.001 and kk["confidence"] == 0.95)
check("input list is not changed", json.dumps(ITEMS, sort_keys=True) == before)
check("tried is updated", res["tried"] == ["Kishore Kumar"])
check("thank-you message", res["message"] == R.LIT_UP_MSG)
check("lit up adds new likely items from Qloo", res["added"] == ["Talat Mahmood", "Hemant Kumar"], res["added"])
check("the anchor itself is not added again", "Kishore Kumar" not in res["added"])
new = next(i for i in res["items"] if i["name"] == "Talat Mahmood")
check("added items are 'likely' with the portrait shape", new["source_label"] == "likely" and new["resolution_level"] == 4
      and {"domain", "name", "qloo_entity_id", "tags", "source_label", "confidence", "resolution_level", "matched_name"} <= set(new))
check("next cards exclude what was tried", all(c["name"] != "Kishore Kumar" for c in res["next"]))
check("qloo log returned", any(l["step"] == "reaction_expand" for l in res["qloo_log"]))

f = Fake(INS)
res = R.apply_reactions({}, ITEMS, [{"name": "Era Artist", "domain": "music", "reaction": "no_reaction"}], client=f)
check("no reaction on a guess removes it", "Era Artist" in res["removed"] and all(i["name"] != "Era Artist" for i in res["items"]))
check("no reaction message is kind", res["message"] == "That is okay. Let us try something else.")
check("no reaction makes no Qloo call", f.calls == 0)
res = R.apply_reactions({}, ITEMS, [{"name": "haleem", "domain": "food", "reaction": "no_reaction"}], client=Fake(INS))
hl = next(i for i in res["items"] if i["name"] == "haleem")
check("no reaction on a told item keeps it unchanged", hl["source_label"] == "told" and hl["confidence"] == 0.9 and res["removed"] == [])
check("tried still remembers it", res["tried"] == ["haleem"])

print("robustness")
res = R.apply_reactions({}, ITEMS, [{"name": "Kishore Kumar", "domain": "music", "reaction": "lit_up"}], client=Fake(err="timeout"))
check("Qloo down: still updates the item, adds nothing", res["added"] == [] and any(i["source_label"] == "reacted" for i in res["items"]))
res = R.apply_reactions({}, ITEMS, [{"name": "Nobody", "reaction": "lit_up"}, {"name": "haleem", "reaction": "maybe"}, 7, {}], client=Fake(INS))
check("unknown names and bad values are ignored", len(res["items"]) == len(ITEMS) and res["added"] == [])
res = R.apply_reactions({}, ITEMS, [{"name": "haleem", "reaction": "lit_up"}], client=Fake(INS))
check("domain is optional when the name is unique", next(i for i in res["items"] if i["name"] == "haleem")["source_label"] == "reacted")
full = [item("music", f"Artist {n}", f"A{n}") for n in range(30)]
res = R.apply_reactions({}, full, [{"name": "Artist 0", "domain": "music", "reaction": "lit_up"}], client=Fake(INS))
check("portrait never grows past 30 items", len(res["items"]) <= 30 and res["added"] == [])
check("empty and None input do not crash", R.apply_reactions(None, None, None, client=Fake())["items"] == [])


class Boom(Fake):
    def get(self, *a, **k):
        raise RuntimeError("boom")


res = R.apply_reactions({}, ITEMS, [{"name": "Kishore Kumar", "domain": "music", "reaction": "lit_up"}], client=Boom())
check("a client that raises still returns a result", isinstance(res, dict) and len(res["items"]) == len(ITEMS))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)