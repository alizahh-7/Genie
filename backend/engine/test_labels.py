"""Offline checks for the friendly `label` on every qloo_log row.   python engine\\test_labels.py"""
import os, sys, tempfile
from pathlib import Path

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
os.environ["LLM_API_KEY"] = ""

from engine import qloo_client as qc

fails = 0


def check(name, cond):
    global fails
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond:
        fails += 1


fl = qc.friendly_label
check("resolved from cache reads 'Remembered'", fl("resolve", "cached", ("Charminar", "place")) == "Looked up Charminar as a place. Remembered.")
check("fresh hit reads 'Found it'", fl("resolve", "ok", ("Haleem", "food")) == "Looked up Haleem as a dish. Found it.")
check("no results is calm", "Nothing found" in fl("resolve", "no results", ("X", "music")))
for bad in ("timeout", "network", "HTTP 503", "no key"):
    check(f"{bad} never shows a raw error", fl("resolve", bad, ("X", "film")).endswith("carried on without it."))
check("era step", fl("era_place", "ok").startswith("Asked Qloo what people of their era"))
check("discover step", fl("wish_discover", "cached").startswith("Asked Qloo what people with similar taste"))
check("reaction step", fl("reaction_expand", "ok").startswith("Asked Qloo what else"))
check("unknown step and bad input never raise", fl("zzz", "ok") == "Asked Qloo. Found it." and fl("resolve", "ok", 5) == "Asked Qloo.")

# a real client with no key: every row has a label, the redacted request stays, note() is used once only
tmp = tempfile.mkdtemp()
qc.CACHE_DIR = Path(tmp)
os.environ.pop("QLOO_API_KEY", None)
c = qc.QlooClient()
c.key = None
c.note(("Charminar", "place"))
c.get("/search", {"query": "Charminar", "types": "urn:entity:place"}, step="resolve")
c.get("/search", {"query": "Other", "types": "urn:entity:place"}, step="resolve")
check("every row has a label", len(c.log) == 2 and all(r.get("label") for r in c.log))
check("note() labels the next call only", "Charminar" in c.log[0]["label"] and c.log[1]["label"].startswith("Asked Qloo"))
check("original fields are kept", all({"step", "request", "status", "ms"} <= set(r) for r in c.log))

print("\nall passed" if not fails else f"\n{fails} failed")
sys.exit(1 if fails else 0)
