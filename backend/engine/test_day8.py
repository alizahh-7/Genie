"""Offline checks for the Day 8 fixes: 30-item cap, heavy-theme skip, tag filter, no-wait executor,
circuit breaker, step wording.   python engine\\test_day8.py"""
import os, sys, tempfile, time
from pathlib import Path

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
os.environ["LLM_API_KEY"] = ""   # keep the LLM off; set before the engine loads .env (it never overrides)

from engine import qloo_client as qc
from engine import portrait as pt
from engine import agent as ag

fails = 0


def check(name, cond):
    global fails
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond:
        fails += 1


PERSON = {"first_name": "T", "birth_year": 1950, "region": "Hyderabad", "language": "Hindi"}


class Stub:
    """Qloo stub: /v2/insights returns era hits, everything else times out."""
    def __init__(self, heavy_first=False):
        self.log, self.heavy_first = [], heavy_first

    def get(self, path, params, step="call"):
        if path == "/v2/insights":
            kind = str(params.get("filter.type", "x")).split(":")[-1]
            ents = [{"entity_id": f"{kind}{i}", "name": f"{kind} era {i}", "tags": []} for i in range(5)]
            if self.heavy_first and kind == "movie":
                ents[0] = {"entity_id": "H", "name": "Heavy Film",
                           "tags": [{"id": "t1", "name": "Communal tension", "type": "urn:tag:theme:qloo"}]}
            return {"results": {"entities": ents}}, None
        return None, "timeout"


print("30-item cap")
junk = {"quick_facts": [{"domain": "music", "name": f"Zq Artist {i}"} for i in range(40)]}
r = pt.build_portrait(PERSON, junk, client=Stub())
check("never more than 30 items", len(r["items"]) <= 30)

print("heavy-theme era guesses")
r = pt.build_portrait(PERSON, {"quick_facts": []}, client=Stub(heavy_first=True))
names = [i["name"] for i in r["items"]]
films = [i for i in r["items"] if i["domain"] == "film"]
check("heavy film is skipped", "Heavy Film" not in names)
check("still 3 films (spares are used)", len(films) == 3)
check("all era items are level 4 and likely",
      all(i["resolution_level"] == 4 and i["source_label"] == "likely" for i in r["items"]))

print("tag filter")
hit = {"tags": [{"id": str(n), "name": nm, "type": "urn:tag:x"} for n, nm in enumerate(
    ["Communal tension", "Communalism", "The wise old man", "Riots", "Comedy", "Sufi", "Qawwali", "Devotion"])]}
kept = [t["name"] for t in qc.clean_tags(hit)]
check("heavy and ageing tags dropped", not {"Communal tension", "Communalism", "The wise old man", "Riots"} & set(kept))
check("genres and gentle tags kept", {"Comedy", "Sufi", "Qawwali", "Devotion"} <= set(kept))
check("is_heavy true for a communal tag", qc.is_heavy(hit))
check("is_heavy false for gentle tags", not qc.is_heavy({"tags": [{"id": "1", "name": "Comedy"}]}))

print("portrait does not wait for stuck calls")


class Slow(Stub):
    def get(self, path, params, step="call"):
        if path == "/v2/insights":
            return super().get(path, params, step)
        time.sleep(2)
        return None, "timeout"


old = pt.TOTAL_TIMEOUT
pt.TOTAL_TIMEOUT = 0.5
t0 = time.time()
r = pt.build_portrait(PERSON, {"quick_facts": [{"domain": "music", "name": "Zq Slow"}]}, client=Slow())
dt = time.time() - t0
pt.TOTAL_TIMEOUT = old
check(f"returned in {dt:.1f}s, not after the stuck call", dt < 1.8)
check("stuck item kept at level 6", any(i["resolution_level"] == 6 for i in r["items"]))

print("circuit breaker")
tmp = tempfile.mkdtemp()
old_dir, old_get, old_sleep = qc.CACHE_DIR, qc.requests.get, time.sleep
qc.CACHE_DIR = Path(tmp)
time.sleep = lambda s: None
calls = []


def fake_timeout(url, params=None, headers=None, timeout=None):
    calls.append(timeout)
    raise qc.requests.Timeout()


class Ok:
    status_code = 200
    def json(self): return {"results": []}


qc.requests.get = fake_timeout
qc.reset_breaker()
c = qc.QlooClient(); c.key = "k"
d, err = c.get("/search", {"query": "b1"})
check("3 attempts, then 'timeout'", err == "timeout" and len(calls) == 3)
check("connect timeout is separate and short", isinstance(calls[0], tuple) and calls[0][0] <= 5)
n = len(calls)
d, err = c.get("/search", {"query": "b2"})
check("breaker open: no network call, same error", len(calls) == n and err == "timeout")
check("log shows the error", c.log[-1]["status"] == "timeout")
qc.reset_breaker()
d, err = c.get("/search", {"query": "b3"})
check("after reset, calls resume", len(calls) == n + 3)

seq = iter([0, 0, 1])


def flaky(url, params=None, headers=None, timeout=None):
    if next(seq) == 0:
        raise qc.requests.Timeout()
    return Ok()


qc.requests.get = flaky
qc.reset_breaker()
d, err = c.get("/search", {"query": "b4"})
check("success on the 3rd attempt", err is None)
check("success resets the failure count", qc._BREAKER["fails"] == 0 and not qc._breaker_open())
qc.requests.get, qc.CACHE_DIR, time.sleep = old_get, old_dir, old_sleep
qc.reset_breaker()

print("step wording")
one = [{"source_label": "told", "qloo_entity_id": "E1", "resolution_level": 1, "tags": []}]
two = one + [{"source_label": "told", "qloo_entity_id": "E2", "resolution_level": 1, "tags": []}]
s1 = {s["id"]: s["summary"] for s in ag._steps(one, [], [])}
s2 = {s["id"]: s["summary"] for s in ag._steps(two, [], [])}
check("1 name, not '1 names'", s1["collect"] == "Gathered 1 name from what the family told us.")
check("single item reads 'Matched it in Qloo.'", s1["resolve"] == "Matched it in Qloo.")
check("two items read 'Matched all 2 in Qloo.'", s2["resolve"] == "Matched all 2 in Qloo.")
check("1 item, 0 tags", s1["build"].startswith("Built a portrait of 1 item,") and "0 taste tags" in s1["expand"])

print("tag filter, second pass (medical wording on a told film)")
hit2 = {"tags": [
    {"id": "1", "name": "Medical drama", "type": "urn:tag:subgenre:qloo"},
    {"id": "2", "name": "Voluntary medical team", "type": "urn:tag:keyword:media"},
    {"id": "3", "name": "Virus outbreak", "type": "urn:tag:keyword:qloo"},
    {"id": "4", "name": "War torn country", "type": "urn:tag:keyword:qloo"},
    {"id": "5", "name": "Surgeon", "type": "urn:tag:keyword:qloo"},
    {"id": "6", "name": "Legs", "type": "urn:tag:keyword:media"},
    {"id": "7", "name": "Public restrooms", "type": "urn:tag:amenity:qloo"},
    {"id": "8", "name": "Romance", "type": "urn:tag:genre:qloo"},
    {"id": "9", "name": "Beach", "type": "urn:tag:genre:place"},
    {"id": "10", "name": "Sacrifice", "type": "urn:tag:theme:qloo"}]}
kept2 = {t["name"] for t in qc.clean_tags(hit2)}
check("medical, outbreak and war wording dropped",
      not ({"Medical drama", "Voluntary medical team", "Virus outbreak", "War torn country", "Surgeon"} & kept2))
check("odd keyword and amenity tags dropped", not ({"Legs", "Public restrooms"} & kept2))
check("genres and themes kept", {"Romance", "Beach", "Sacrifice"} <= kept2)
check("is_heavy flags medical wording", qc.is_heavy({"tags": [{"id": "1", "name": "Medical drama"}]}))

print("comparison cache privacy")
from engine import llm
from engine import sidebyside as sb
from engine.personas import PERSONAS
tmp2 = Path(tempfile.mkdtemp())
old_dir2, old_post2 = llm.CACHE_DIR, llm.requests.post


class _R:
    status_code = 200
    def json(self): return {"choices": [{"message": {"content": '{"wishes": []}'}}]}


llm.CACHE_DIR = tmp2
llm.requests.post = lambda *a, **k: _R()
llm._down_until = 0.0
os.environ["LLM_API_KEY"] = "test"
llm.chat_json("s", "u1", cache=False)
check("cache=False writes nothing", not list(tmp2.glob("llm_*.json")))
llm.chat_json("s", "u2")
check("default still caches", len(list(tmp2.glob("llm_*.json"))) == 1)
os.environ["LLM_API_KEY"] = ""
llm.requests.post, llm.CACHE_DIR = old_post2, old_dir2
n = PERSONAS["nani"]
fav, notes = sb._facts(n["inputs"])
check("demo person is recognised", sb._is_demo(n["person"], fav, notes))
check("same name, other favourites: not demo", not sb._is_demo(n["person"], ["Queen"], notes))
check("typed person: not demo",
      not sb._is_demo({"first_name": "Zed", "birth_year": 1950, "region": "X", "language": "Y"}, ["Queen"], []))
check("junk does not raise", sb._is_demo(None, None, None) is False)

print("tag filter, third pass (disaster and conflict wording)")
hit3 = {"tags": [
    {"id": "1", "name": "Earthquake", "type": "urn:tag:keyword:qloo"},
    {"id": "2", "name": "Special forces", "type": "urn:tag:keyword:qloo"},
    {"id": "3", "name": "Peacekeeping", "type": "urn:tag:keyword:qloo"},
    {"id": "4", "name": "Duty vs desire", "type": "urn:tag:theme:qloo"},
    {"id": "5", "name": "Romance", "type": "urn:tag:genre:qloo"}]}
kept3 = {t["name"] for t in qc.clean_tags(hit3)}
check("disaster and conflict wording dropped", not ({"Earthquake", "Special forces", "Peacekeeping"} & kept3))
check("gentle themes kept", {"Duty vs desire", "Romance"} <= kept3)

print("tag filter, no false alarms")
hit5 = {"tags": [
    {"id": "1", "name": "Bombay cinema", "type": "urn:tag:genre:qloo"},
    {"id": "2", "name": "Patriotism", "type": "urn:tag:theme:qloo"},
    {"id": "3", "name": "Bomb threat", "type": "urn:tag:keyword:qloo"},
    {"id": "4", "name": "Warm", "type": "urn:tag:style:qloo"}]}
kept5 = {t["name"] for t in qc.clean_tags(hit5)}
check("Bombay, Patriotism and Warm are kept", {"Bombay cinema", "Patriotism", "Warm"} <= kept5)
check("Bomb threat is dropped", "Bomb threat" not in kept5)

print("wishes: film-only portrait, follow-up rule, honest wording for guesses")
from engine import wishes as wz


def wit(domain, name, label="told"):
    return {"domain": domain, "name": name, "qloo_entity_id": "E-" + name, "tags": [{"id": "t1", "name": "Romance"}],
            "source_label": label, "confidence": 0.9 if label == "told" else 0.3,
            "resolution_level": 1 if label == "told" else 4, "matched_name": name}


class DownQ:
    def __init__(self): self.log = []
    def get(self, path, params, step="call"): return None, "timeout"


SEOUL = {"first_name": "T", "birth_year": 1985, "region": "Seoul", "language": "Korean"}
fo = wz.generate_wishes([wit("film", "Some Film")], SEOUL, client=Stub(), use_llm=False)["wishes"]
check("a film-only portrait gets at least 3 wishes", len(fo) >= 3)
check("the film gets its own remote wish", any("Some Film" in w["title"] and w["mode"] == "remote" for w in fo))
dn = wz.generate_wishes([wit("film", "Some Film")], SEOUL, client=DownQ(), use_llm=False)["wishes"]
check("film-only with Qloo down still returns wishes", len(dn) >= 2)

likely4 = [wit("music", f"Guess {i}", "likely") for i in range(4)]
told3 = [wit("music", f"Fav {i}") for i in range(3)]
mixed = [wit("music", "Fav 1"), wit("music", "Fav 2")] + likely4
check("guesses only: the gentle question is still asked",
      wz.generate_wishes(likely4, SEOUL, client=Stub(), use_llm=False)["follow_up"] == wz.FOLLOW_UP)
check("3 told items: no question",
      wz.generate_wishes(told3, SEOUL, client=Stub(), use_llm=False)["follow_up"] is None)
check("2 told plus guesses: the question is asked",
      wz.generate_wishes(mixed, SEOUL, client=Stub(), use_llm=False)["follow_up"] == wz.FOLLOW_UP)

gw = wz.generate_wishes(likely4, SEOUL, client=Stub(), use_llm=False)["wishes"]
mw = [w for w in gw if w["kind"] == "music"]
check("guess-based wishes say it is a guess", bool(mw) and all("guess" in w["description"].lower() for w in mw))
check("guess-based wishes never call guesses favourites", not any("favourite" in w["description"].lower() for w in gw))
check("guess-based wishes are labelled likely", bool(gw) and all(w["basis"] == "likely" for w in gw))
tw = wz.generate_wishes(told3, SEOUL, client=Stub(), use_llm=False)["wishes"]
check("told wishes keep their wording", any("favourites" in w["description"] for w in tw))

gf = wz.generate_wishes([wit("music", "Guess A", "likely"), wit("film", "Odd Film", "likely")],
                        SEOUL, client=Stub(), use_llm=False)["wishes"]
check("a guessed film does not get a wish of its own", not any("Odd Film" in w["title"] for w in gf))
print(f"\n{'all passed' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)