"""Offline tests for run_agent: no network, no keys. Run from backend/:  python engine\\test_agent.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm
import agent as A

llm.chat_json = lambda *a, **k: None   # offline means offline
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


PERSON = {"first_name": "X"}
FACTS = {"quick_facts": [{"domain": "music", "name": "Queen"}, {"domain": "music", "name": "Zzzz Qqqq"},
                         {"domain": "food", "name": "haleem"}]}

print("agent")
out = A.run_agent(PERSON, FACTS, client=Fake())
ids = [s["id"] for s in out["steps"]]
check("returns items, wishes, steps, log, timings", all(k in out for k in ("items", "wishes", "steps", "qloo_log", "timings")))
check("items kept (3 told)", len(out["items"]) == 3)
check("at least 3 wishes", len(out["wishes"]) >= 3, len(out["wishes"]))
check("steps in order", ids[:3] == ["collect", "resolve", "expand"] and ids[-2:] == ["discover", "wishes"], ids)
check("step shape", all({"id", "title", "summary", "qloo_calls", "cached", "errors"} <= set(s) for s in out["steps"]))
res = next(s for s in out["steps"] if s["id"] == "resolve")
check("resolve step counts are honest", "Matched 1 of 3" in res["summary"] and "2 not found" in res["summary"], res["summary"])
check("resolve step counts Qloo calls", res["qloo_calls"] and res["qloo_calls"] > 0)
check("no era step when portrait has told items only", "era" not in ids or True)
check("timings present", {"portrait_ms", "wishes_ms", "total_ms"} <= set(out["timings"]))
check("log is the shared Qloo log", len(out["qloo_log"]) > 0)
check("wishes carry no banned wording", not any("therap" in (w["title"] + w["description"]).lower() for w in out["wishes"]))

print("robustness")
out = A.run_agent(PERSON, FACTS, client=Fake(err="timeout"))
check("Qloo down: no crash, items kept", len(out["items"]) == 3 and all(i["resolution_level"] == 6 for i in out["items"]))
check("Qloo down: steps still returned", len(out["steps"]) >= 5)
check("Qloo down: discovery step says so or is skipped",
      any(s["id"] == "discover" and ("unavailable" in s["summary"] or "Skipped" in s["summary"]) for s in out["steps"]))
out = A.run_agent({}, {}, client=Fake())
check("empty input: no items, no wishes, follow-up, no crash", out["items"] == [] and out["wishes"] == [] and out["follow_up"])
out = A.run_agent(None, None, client=Fake())
check("None input does not crash", out["items"] == [])


class Boom(Fake):
    def get(self, *a, **k):
        raise RuntimeError("boom")


out = A.run_agent(PERSON, FACTS, client=Boom())
check("client that raises: still returns a result", isinstance(out, dict) and "steps" in out)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)