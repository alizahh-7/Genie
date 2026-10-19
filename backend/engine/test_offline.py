"""Offline tests: no network, no keys. Run from backend/:  python engine\\test_offline.py
Covers every fallback level, confidence, portrait building, era expansion, and the HTTP client."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qloo_client
from qloo_client import QlooClient, clean_tags, score
import resolve as R
import portrait as P
import llm
llm.chat_json = lambda *a, **k: None   # offline suite must never call a real LLM

passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


def tag(n, k="rock", typ="urn:tag:genre"):
    return {"name": n, "tag_id": f"urn:tag:genre:{k}", "type": typ}


def ent(name, eid, tags=3, pop=0.9):
    return {"name": name, "entity_id": eid, "popularity": pop,
            "tags": [tag(f"T{i}", f"t{i}") for i in range(tags)]}


class Fake:
    """Pretends to be QlooClient. table maps (query, types) -> payload; err_on makes calls fail."""
    def __init__(self, table=None, insights=None, err=None):
        self.table, self.insights, self.err, self.log, self.calls = table or {}, insights or {}, err, [], []

    def get(self, path, params, step=""):
        self.calls.append((path, dict(params)))
        if self.err:
            return None, self.err
        if path == "/v2/insights":
            key = (params.get("filter.type"), tuple(sorted(k for k in params if k.startswith("signal."))))
            return self.insights.get(key, {"results": {"entities": []}}), None
        q = params.get("query") or params.get("filter.query")
        t = params.get("types", "tag")
        data = self.table.get((q, t))
        return (data, None) if data else ({"results": []}, None)


A = "urn:entity:artist"
print("matching")
check("A. R. Rahman == A.R. Rahman", score("A. R. Rahman", "A.R. Rahman") == 1.0)
check("brackets ignored", score("Jeju Island", "Jeju Island (Jeju Do)") == 1.0)
check("Tirupati != Railway Station", score("Tirupati", "Tirupati Railway Station") < 0.85)
check("Arabic script exact", score("أم كلثوم", "أم كلثوم") == 1.0)
check("audience tags dropped", clean_tags({"tags": [tag("Rock"), tag("Loyal", "x", "urn:tag:audience:qloo")]}) == [{"id": "urn:tag:genre:rock", "name": "Rock", "type": "urn:tag:genre"}])
check("ageing and end-of-life tags dropped", clean_tags({"tags": [tag("Old age", "old_age"), tag("Ageing", "ageing"), tag("Death Metal", "dm"), tag("Rock")]}) == [{"id": "urn:tag:genre:rock", "name": "Rock", "type": "urn:tag:genre"}])
check("identity-label tags dropped, genres kept", [t["name"] for t in clean_tags({"tags": [tag("Muslim family", "mf"), tag("Sufi", "sufi"), tag("Devotional", "dev")]})] == ["Sufi", "Devotional"])

print("ladder")
f = Fake({("Queen", A): {"results": [ent("Queen", "Q")]}})
r = R.resolve("Queen", "music", client=f, use_llm=False)
check("level 1 exact", r["found"] and r["resolution_level"] == 1 and r["entity"]["type"] == "artist")
f = Fake({("Oum Kalthoum", A): {"results": [ent("Oum Kalthoum", "U")]}})
r = R.resolve("Umm Kulthum", "music", client=f, use_llm=False)
check("level 2 alias", r["resolution_level"] == 2 and r["matched_via"])
f = Fake({("Lata Mangeshkar", A): {"results": [ent("Lata Mangeshkar", "L")]}})
r = R.resolve("Lag Jaa Gale", "music", client=f, use_llm=False)
check("level 3 parent", r["resolution_level"] == 3 and r["entity"]["name"] == "Lata Mangeshkar")
r = R.resolve("Some Song", "music", hint="Lata Mangeshkar", client=f, use_llm=False)
check("level 3 via caller hint", r["resolution_level"] == 3)
f = Fake({("Hotel California", A): {"results": [ent("Hotel California", "H", tags=1, pop=0.3)]},
          ("Eagles", A): {"results": [ent("Eagles", "E")]}})
r = R.resolve("Hotel California", "music", client=f, use_llm=False)
check("thin hit prefers parent", r["resolution_level"] == 3 and r["entity"]["name"] == "Eagles")
f = Fake({("Hotel California", A): {"results": [ent("Hotel California", "H", tags=1)]}})
r = R.resolve("Hotel California", "music", client=f, use_llm=False)
check("thin hit kept if parent missing", r["resolution_level"] == 1)
r = R.resolve("zzzz qqqq", "music", client=Fake(), use_llm=False)
check("level 5 not in Qloo", not r["found"] and r["resolution_level"] == 5 and r["entity"] is None)
r = R.resolve("Queen", "music", client=Fake(err="timeout"), use_llm=False)
check("level 6 on timeout", not r["found"] and r["resolution_level"] == 6)
r = R.resolve("Queen", "music", client=Fake(err="HTTP 500"), use_llm=False)
check("level 6 on server error", r["resolution_level"] == 6)
r = R.resolve("Queen", "banana", client=Fake(), use_llm=False)
check("unknown domain does not crash", not r["found"])
f = Fake({("haleem", "tag"): {"results": {"tags": [{"id": "urn:tag:specialty_dish:place:haleem", "name": "Haleem", "popularity": 0.98}]}}})
r = R.resolve("haleem", "food", client=f, use_llm=False)
check("food resolves to a tag", r["found"] and r["entity"]["type"] == "tag" and r["entity"]["id"].startswith("urn:tag"))
f = Fake({("Tirupati", "urn:entity:locality"): {"results": [ent("Tirupati", "T", tags=2)]}})
r = R.resolve("Tirupati", "place", client=f, use_llm=False)
check("locality fallback for places", r["found"] and r["entity"]["type"] == "locality")

print("confidence")
check("told L1 = 0.9", P._confidence("told", 1) == 0.9)
check("told L3 = 0.63", P._confidence("told", 3) == 0.63)
check("likely L4 = 0.3", P._confidence("likely", 4) == 0.3)
check("age brackets", P._age_bracket(1948) == "55_and_older" and P._age_bracket(None) is None)

print("portrait")
tbl = {("Queen", A): {"results": [ent("Queen", "Q")]}, ("Lata Mangeshkar", A): {"results": [ent("Lata Mangeshkar", "L")]},
       ("Kishore Kumar", A): {"results": [ent("Kishore Kumar", "K")]}, ("The Beatles", A): {"results": [ent("The Beatles", "B")]}}
inp = {"quick_facts": [{"domain": "music", "name": "Queen"}, {"domain": "music", "name": "queen"},
                       {"domain": "music", "name": "Lag Jaa Gale"}, {"domain": "music", "name": "The Beatles"}],
       "circle_answers": [{"contributor": "A", "answers": {"music": "Kishore Kumar", "light_up": "he laughed loudly at every cricket match"}}]}
out = P.build_portrait({"first_name": "X", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}, inp, client=Fake(tbl))
names = [i["name"] for i in out["items"]]
check("duplicates removed (Queen/queen)", names.count("Queen") + names.count("queen") == 1)
check("circle answer extracted without LLM", "Kishore Kumar" in names)
check("sentence not turned into junk", not any("cricket" in n for n in names))
check("all items told, none era", all(i["source_label"] == "told" for i in out["items"]))
check("item shape", all({"domain", "name", "qloo_entity_id", "tags", "source_label", "confidence", "resolution_level"} <= set(i) for i in out["items"]))
check("confidence within 0-1", all(0 <= i["confidence"] <= 1 for i in out["items"]))
check("levels within 1-6", all(1 <= i["resolution_level"] <= 6 for i in out["items"]))
out = P.build_portrait({"first_name": "X"}, {"quick_facts": [{"domain": "music", "name": "Queen"}]}, client=Fake(err="timeout"))
check("API down: item kept, level 6, no crash", len(out["items"]) == 1 and out["items"][0]["resolution_level"] == 6 and out["items"][0]["qloo_entity_id"] is None)
check("empty input returns empty portrait", P.build_portrait({}, {}, client=Fake())["items"] == [])
check("short sentences are not names, real names are", P._naive_split("She sang along to Queen, Kishore Kumar and Lata") == ["Kishore Kumar", "Lata"])

print("era and place (level 4)")
ins = {(A, ("signal.demographics.age", "signal.interests.tags", "signal.location.query")): {"results": {"entities": [ent("Era Artist 1", "E1"), ent("Era Artist 2", "E2")]}},
       ("urn:entity:movie", ("signal.demographics.age", "signal.interests.tags", "signal.location.query")): {"results": {"entities": [ent("Era Film", "F1")]}}}
f = Fake(insights=ins)
out = P.build_portrait({"first_name": "X", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}, {"quick_facts": []}, client=f)
check("thin portrait gets level 4 items", [i["resolution_level"] for i in out["items"]] == [4, 4, 4])
check("level 4 labelled likely", all(i["source_label"] == "likely" for i in out["items"]))
f = Fake(insights={(A, ("signal.demographics.age",)): {"results": {"entities": [ent("Only Age Artist", "A1")]}}})
out = P.build_portrait({"first_name": "X", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}, {"quick_facts": []}, client=f)
check("falls through to the next signal combination", any(i["name"] == "Only Age Artist" for i in out["items"]))
out = P.build_portrait({"first_name": "X"}, {"quick_facts": []}, client=Fake())
check("no signals at all: empty, no crash", out["items"] == [])

print("http client")
tmp = Path(tempfile.mkdtemp())
qloo_client.CACHE_DIR = tmp
qloo_client.time.sleep = lambda s: None


class Resp:
    def __init__(self, code, data=None):
        self.status_code, self._d = code, data or {}

    def json(self):
        return self._d


def run(responses):
    it = iter(responses)
    calls = []

    def fake_get(url, params=None, headers=None, timeout=None):
        calls.append(url)
        r = next(it)
        if isinstance(r, Exception):
            raise r
        return r
    qloo_client.requests.get = fake_get
    c = QlooClient()
    c.key = "k"
    return c, calls


c, calls = run([Resp(200, {"results": [1]})])
d, e = c.get("/search", {"query": "a"})
d2, e2 = c.get("/search", {"query": "a"})
check("200 ok, then served from cache", e is None and len(calls) == 1 and c.log[-1]["status"] == "cached")
c, calls = run([Resp(404)])
d, e = c.get("/search", {"query": "b"})
check("404 means 'no results' and is cached", e == "no results" and d == {})
c, calls = run([Resp(429), Resp(429), Resp(200, {"results": []})])
d, e = c.get("/search", {"query": "c"})
check("429 is retried then succeeds", e is None and len(calls) == 3)
c, calls = run([Resp(401)])
d, e = c.get("/search", {"query": "d"})
check("401 is not retried", e == "HTTP 401" and len(calls) == 1)
c, calls = run([qloo_client.requests.Timeout()] * 3)
d, e = c.get("/search", {"query": "e"})
check("timeout after retries", e == "timeout" and len(calls) == 3)
c = QlooClient()
c.key = None
d, e = c.get("/search", {"query": "never-cached"})
check("no key reported cleanly", e == "no key")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)