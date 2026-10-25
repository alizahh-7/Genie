"""Offline tests for generate_wishes: no network, no keys. Run from backend/:  python engine\\test_wishes.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm
import wishes as W

llm.chat_json = lambda *a, **k: None   # offline suite never calls a real LLM
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
        self.insights, self.err, self.log, self.calls = insights or {}, err, [], []

    def get(self, path, params, step=""):
        self.calls.append(dict(params))
        if self.err:
            return None, self.err
        key = (params.get("filter.type"), tuple(sorted(k for k in params if k.startswith("signal."))))
        return self.insights.get(key, {"results": {"entities": []}}), None


def item(domain, name, eid, src="told", conf=0.9, lvl=1):
    return {"domain": domain, "name": name, "qloo_entity_id": eid,
            "tags": [{"id": "urn:tag:x", "name": "Classic"}] if eid else [], "source_label": src,
            "confidence": conf, "resolution_level": lvl, "matched_name": name if eid else None}


NANI = [item("music", "Lag Jaa Gale", "L1", conf=0.63, lvl=3), item("music", "Kishore Kumar", "K1"),
        item("food", "haleem", "urn:tag:specialty_dish:place:haleem"), item("place", "Charminar", "C1"),
        item("film", "Mughal-e-Azam", "M1"), item("food", "kumbakonam coffee", None, conf=0.45, lvl=5)]
PERSON = {"first_name": "Nani", "region": "Hyderabad"}
KEY = ("urn:entity:artist", ("signal.interests.entities", "signal.interests.tags"))
INS = {KEY: {"results": {"entities": [{"name": "Kishore Kumar"}, {"name": "Talat Mahmood"}, {"name": "Hemant Kumar"}]}}}
INS2 = {KEY: {"results": {"entities": [{"name": "Talat Mahmood", "query": {"affinity": 0.913, "explainability": {
    "signal.interests.entities": [{"entity_id": "c1", "score": 0.2}, {"entity_id": "K1", "score": 0.3},
                                  {"entity_id": "L1", "score": 0.1}]}}}]}}}

print("wishes")
out = W.generate_wishes(NANI, PERSON, client=Fake(INS), use_llm=False)
ws = out["wishes"]
check("3 to 5 wishes", 3 <= len(ws) <= 5, len(ws))
check("contract fields present", all({"title", "description", "mode", "source_items"} <= set(w) for w in ws))
check("extra fields present", all({"kind", "maker_type", "tags", "basis"} <= set(w) for w in ws))
check("modes valid", all(w["mode"] in ("remote", "in-person") for w in ws))
check("at most one in-person", sum(w["mode"] == "in-person" for w in ws) <= 1)
check("in-person wish is shown last", ws[-1]["mode"] == "in-person")
check("recorded songs wish present even when region is known",
      any(w["kind"] == "music" and w["mode"] == "remote" for w in ws))
check("no banned wording", not any(W.BANNED.search(w["title"] + w["description"]) for w in ws))
check("titles start with a capital", all(w["title"][0].isupper() for w in ws))
check("discovery wish excludes names already in portrait",
      any(w["kind"] == "discovery" and "Talat Mahmood" in w["title"] for w in ws))
check("discovery wish carries the discovered item name", all(w.get("discovered") and w["discovered"] in w["title"] for w in ws if w["kind"] == "discovery"))
check("only discovery wishes carry discovered", all("discovered" not in w for w in ws if w["kind"] != "discovery"))
check("discovery is labelled likely", all(w["basis"] == "likely" for w in ws if w["kind"] == "discovery"))
check("told wishes labelled told", all(w["basis"] == "told" for w in ws if w["kind"] != "discovery"))
check("wish tags carry names", any(w["tags"] and "name" in w["tags"][0] for w in ws))
check("qloo_log returned", isinstance(out["qloo_log"], list))
check("no follow-up when portrait is rich", out["follow_up"] is None)

print("discovery explainability")
out = W.generate_wishes(NANI, PERSON, client=Fake(INS2), use_llm=False)
d = [w for w in out["wishes"] if w["kind"] == "discovery"]
check("discovery wish present", len(d) == 1)
check("strongest anchors named (case-insensitive ids)", d and d[0]["source_items"] == ["Kishore Kumar", "Charminar"], d and d[0]["source_items"])
check("affinity carried", d and d[0]["affinity"] == 0.91)
check("why mentions the score", d and "0.91" in d[0]["why"])
check("discovery says it is a guess", d and "guess" in d[0]["description"])

print("honesty and realism")
out = W.generate_wishes([item("food", "pesarattu", None, conf=0.45, lvl=5)], {"first_name": "X"}, client=Fake(), use_llm=False)
check("dish not in Qloo still gets a wish", any(w["kind"] == "food" for w in out["wishes"]))
check("thin portrait asks a follow-up", out["follow_up"] == W.FOLLOW_UP)
out = W.generate_wishes([item("place", "Hyderabad Zoo", "Z1")], PERSON, client=Fake(), use_llm=False)
check("local place gets in-person wish", any(w["kind"] == "place" and w["mode"] == "in-person" for w in out["wishes"]))
out = W.generate_wishes([item("place", "Kyoto", "K1")], PERSON, client=Fake(), use_llm=False)
check("far place stays remote", all(w["mode"] == "remote" for w in out["wishes"] if w["kind"] == "place"))
out = W.generate_wishes([item("music", "Queen", "Q1", src="likely", conf=0.3, lvl=4)], {}, client=Fake(INS), use_llm=False)
check("likely-only portrait gives likely wishes", out["wishes"] and all(w["basis"] == "likely" for w in out["wishes"]))
check("likely-only portrait skips discovery", not any(w["kind"] == "discovery" for w in out["wishes"]))

print("robustness")
out = W.generate_wishes([], {}, client=Fake(), use_llm=False)
check("empty input: no wishes, follow-up, no crash", out["wishes"] == [] and out["follow_up"])
out = W.generate_wishes(NANI, PERSON, client=Fake(err="timeout"), use_llm=False)
check("Qloo down: wishes still returned", len(out["wishes"]) >= 3 and not any(w["kind"] == "discovery" for w in out["wishes"]))
out = W.generate_wishes([{"domain": "music"}, {"name": None}], {}, client=Fake(), use_llm=False)
check("junk items do not crash", out["wishes"] == [])
out = W.generate_wishes(NANI, PERSON, client=Fake({KEY: {"results": {"entities": [{"name": "X", "query": "oops"}]}}}), use_llm=False)
check("odd insights shape does not crash", len(out["wishes"]) >= 3)

print("llm polish")
llm.chat_json = lambda s, u, **k: {"wishes": [{"i": w["i"], "title": w["title"], "description": w["description"] + " Take your time."}
                                               for w in json.loads(u)["wishes"]]}
out = W.generate_wishes(NANI, PERSON, client=Fake(INS))
check("safe rewrite accepted", any(w["description"].endswith("Take your time.") for w in out["wishes"]))
llm.chat_json = lambda s, u, **k: {"wishes": [{"i": w["i"], "title": "A therapy session", "description": "x"}
                                               for w in json.loads(u)["wishes"]]}
out = W.generate_wishes(NANI, PERSON, client=Fake(INS))
check("banned wording rejected, templates kept", not any("therapy" in w["title"].lower() for w in out["wishes"]))
llm.chat_json = lambda s, u, **k: {"wishes": [{"i": w["i"], "title": "Songs", "description": "Something lovely!"}
                                               for w in json.loads(u)["wishes"]]}
out = W.generate_wishes(NANI, PERSON, client=Fake(INS))
check("unsafe rewrite rejected, templates kept", not any("Something lovely" in w["description"] for w in out["wishes"]))
llm.chat_json = lambda s, u, **k: {"wishes": [{"i": w["i"], "title": w["title"],
                                               "description": w["description"].replace("This is a guess from Qloo's taste links, so the family decides.", "They will love it.")}
                                              for w in json.loads(u)["wishes"]]}
out = W.generate_wishes(NANI, PERSON, client=Fake(INS))
check("rewrite that hides the 'guess' is rejected", all("guess" in w["description"] for w in out["wishes"] if w["kind"] == "discovery"))
llm.chat_json = lambda *a, **k: None
out = W.generate_wishes(NANI, PERSON, client=Fake(INS))
check("LLM down: templates used", len(out["wishes"]) >= 3)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)