"""Odd-input and outage checks (live Qloo).
    python engine\\live_odd.py             odd inputs
    python engine\\live_odd.py --outage    run after pointing QLOO_API_URL or LLM_BASE_URL at nothing
"""
import os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND, ".env"))

from engine import (resolve, run_agent, pick_reaction_cards, apply_reactions,
                    generate_bedside_kit, side_by_side)

DOMAINS = {"music", "food", "place", "film", "other"}
LABELS = {"told", "likely", "reacted", "ai-only"}
BAD = re.compile(r"diagnos|medic|dementia|alzheimer|cancer|terminal|dying|\bdeath\b|therap|"
                 r"treatment|\bcure\b|\bpain\b|hospice|palliative|illness|patient", re.I)
results = []


def record(label, ok, detail):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + label + "  " + detail)


def case(label, fn, check, limit=45.0):
    t0 = time.time()
    try:
        out = fn()
    except Exception as e:  # the engine must never raise
        record(label, False, f"RAISED {type(e).__name__}: {e}")
        return
    dt = time.time() - t0
    problems = check(out)
    if dt > limit:
        problems.append(f"took {dt:.1f}s (limit {limit:.0f}s)")
    record(label, not problems, f"{dt:.1f}s " + "; ".join(problems))


def tone(texts):
    out = []
    for t in texts:
        if not isinstance(t, str): continue
        if "!" in t: out.append("exclamation mark")
        m = BAD.search(t)
        if m: out.append(f"clinical word '{m.group(0)}'")
    return out


def check_resolve(r):
    if not isinstance(r, dict): return ["not a dict"]
    p = [f"missing {k}" for k in ("input", "domain", "found", "resolution_level", "entity", "tags") if k not in r]
    if p: return p
    if r["resolution_level"] not in range(1, 7): p.append("bad level")
    if r["found"] and not (isinstance(r["entity"], dict) and r["entity"].get("id")): p.append("found without entity id")
    if not r["found"] and r["entity"] is not None: p.append("not found but entity set")
    if r["found"] and r["resolution_level"] >= 5: p.append("found at level 5/6")
    if not isinstance(r["tags"], list): p.append("tags not a list")
    return p


def check_agent(r):
    if not isinstance(r, dict): return ["not a dict"]
    p = [f"missing {k}" for k in ("items", "wishes", "follow_up", "steps", "qloo_log", "timings") if k not in r]
    if p: return p
    items, wishes = r["items"], r["wishes"]
    if len(items) > 30: p.append(f"{len(items)} items (max 30)")
    seen = set()
    for it in items:
        if it.get("domain") not in DOMAINS: p.append(f"bad domain {it.get('domain')}")
        if it.get("source_label") not in LABELS: p.append(f"bad label {it.get('source_label')}")
        if it.get("resolution_level") not in range(1, 7): p.append("bad level")
        c = it.get("confidence")
        if c is not None and not 0 <= c <= 1: p.append("confidence out of range")
        if not str(it.get("name", "")).strip(): p.append("empty item name")
        k = (it.get("domain"), str(it.get("name", "")).strip().lower())
        if k in seen: p.append(f"duplicate item {k[1]}")
        seen.add(k)
    if len(wishes) > 5: p.append(f"{len(wishes)} wishes")
    modes = [w.get("mode") for w in wishes]
    if any(m not in ("remote", "in-person") for m in modes): p.append("bad wish mode")
    if modes.count("in-person") > 1 or ("in-person" in modes and modes[-1] != "in-person"):
        p.append("in-person wish rule broken")
    texts = [r["follow_up"]] + [s.get("summary") for s in r["steps"]]
    for w in wishes:
        if not str(w.get("title", "")).strip(): p.append("empty wish title")
        texts += [w.get("title"), w.get("description")]
    p += tone(texts)
    return sorted(set(p))


def check_kit(k):
    if not isinstance(k, dict): return ["not a dict"]
    p = [f"missing {x}" for x in ("title", "intro", "playlist", "small_changes", "visitors", "note") if x not in k]
    if p: return p
    texts = [k["intro"], k["playlist"].get("how_to")] + [x.get("text") for x in k["small_changes"] + k["visitors"]]
    return sorted(set(tone(texts)))


BASE = {"first_name": "Test", "birth_year": 1950, "region": "Hyderabad", "language": "Hindi"}
FACT = {"quick_facts": [{"domain": "music", "name": "Kishore Kumar"}]}

RESOLVE_CASES = [
    ("empty name", "music", ""), ("whitespace", "music", "   "), ("one letter", "music", "a"),
    ("None name", "music", None), ("digits", "music", "12345"), ("emoji", "music", "🎵🎶"),
    ("punctuation", "food", "!!!???"), ("html", "music", "<script>alert(1)</script>"),
    ("sql", "food", "'; DROP TABLE person; --"), ("5000 chars", "music", "a" * 5000),
    ("telugu", "music", "ఘంటసాల"), ("hindi", "music", "लग जा गले"), ("arabic", "music", "فيروز"),
    ("korean", "music", "방탄소년단"), ("mixed script", "music", "Lata लता Mangeshkar"),
    ("misspelt film", "film", "Mugal e Azam"), ("artist under food", "food", "Kishore Kumar"),
    ("unknown domain", "banana", "Queen"), ("newline", "music", "Queen\nBeatles"),
    ("nonsense", "place", "Zxqvk Wplm"),
]

AGENT_CASES = [
    ("empty person and inputs", {}, {}),
    ("None inputs", BASE, None),
    ("no facts", BASE, {"quick_facts": [], "circle_answers": []}),
    ("one-letter fact", BASE, {"quick_facts": [{"domain": "music", "name": "a"}]}),
    ("birth year as text", {**BASE, "birth_year": "1948"}, FACT),
    ("birth year None", {**BASE, "birth_year": None}, FACT),
    ("birth year in the future", {**BASE, "birth_year": 2040}, FACT),
    ("unknown language", {**BASE, "language": "Klingon"}, FACT),
    ("emoji name, empty region", {"first_name": "🙂", "birth_year": 1950, "region": "", "language": ""}, FACT),
    ("40 junk facts (cap and 20s limit)", BASE,
     {"quick_facts": [{"domain": "music", "name": f"Zq Artist {i}"} for i in range(40)]}),
    ("duplicate facts", BASE, {"quick_facts": [{"domain": "music", "name": "Kishore Kumar"}] * 3}),
    ("facts with missing keys", BASE, {"quick_facts": [{}, {"name": "Queen"}, {"domain": "music"}, "Queen", None]}),
    ("circle: wrong value types", BASE, {"circle_answers": [{"contributor": "X", "answers": {
        "music": None, "food": 123, "place": ["a", "b"], "film": "<script>alert(1)</script>"}}]}),
    ("circle: very long free text", BASE, {"circle_answers": [{"contributor": "X", "answers": {
        "music": "I loved many songs. " * 300}}]}),
    ("circle: phone number and surname", BASE, {"circle_answers": [{"contributor": "X", "answers": {
        "music": "Call Ayesha Khan on 9876543210 about Kishore Kumar"}}]}),
    ("circle: answers not a list", BASE, {"circle_answers": "hello"}),
]


def outage():
    i = sys.argv.index("--outage") + 1
    mode = sys.argv[i] if i < len(sys.argv) else "qloo"
    tag = int(time.time())
    one = {"quick_facts": [{"domain": "music", "name": f"Zqv{tag} Singer"}]}
    print("mode:", mode, "| QLOO_API_URL =", os.getenv("QLOO_API_URL"), "| LLM_BASE_URL =", os.getenv("LLM_BASE_URL"))

    def chk_agent(r):
        p = check_agent(r)
        if p or mode != "qloo":
            return p
        if not any(it.get("resolution_level") == 6 for it in r["items"]):
            p.append("no level-6 item: the outage was not in effect")
        if not r["follow_up"]:
            p.append("thin portrait but no follow_up")
        return p

    def chk_cmp(r):
        if not isinstance(r, dict) or "generic" not in r or "genie" not in r:
            return ["bad shape"]
        if mode == "llm" and (r["generic"].get("available") is not False or not r["generic"].get("message")):
            return ["general AI should say it is unavailable"]
        return []

    case("run_agent", lambda: run_agent(BASE, one), chk_agent, limit=40)
    case("side_by_side", lambda: side_by_side(BASE, one), chk_cmp, limit=60)
    
    
def main():
    if "--outage" in sys.argv:
        outage()
    else:
        for label, dom, name in RESOLVE_CASES:
            case(f"resolve: {label}", lambda d=dom, n=name: resolve(n, d), check_resolve, limit=40)
        for label, person, inputs in AGENT_CASES:
            case(f"run_agent: {label}", lambda p=person, i=inputs: run_agent(p, i), check_agent)
        items = run_agent(BASE, FACT).get("items", [])
        case("reaction cards: empty", lambda: pick_reaction_cards([]),
             lambda r: [] if isinstance(r, dict) and isinstance(r.get("cards"), list) else ["bad shape"])
        case("reaction cards: None", lambda: pick_reaction_cards(None),
             lambda r: [] if isinstance(r, dict) and isinstance(r.get("cards"), list) else ["bad shape"])
        case("apply_reactions: None", lambda: apply_reactions(BASE, None, None),
             lambda r: [] if isinstance(r, dict) and isinstance(r.get("items"), list) else ["bad shape"])
        case("apply_reactions: junk taps", lambda: apply_reactions(
            BASE, items, [{"name": "zzz", "reaction": "maybe"}, {}, None, "x", {"name": "", "reaction": "lit_up"}]),
             lambda r: [] if isinstance(r, dict) and isinstance(r.get("items"), list) and r.get("message") else ["bad shape"])
        case("kit: None", lambda: generate_bedside_kit(None, None), check_kit)
        case("kit: junk items", lambda: generate_bedside_kit({}, [{}, None, {"name": "<b>x</b>", "domain": "food"}]), check_kit)
        case("side_by_side: empty", lambda: side_by_side({}, {}),
             lambda r: [] if isinstance(r, dict) and "genie" in r and "generic" in r and "note" in r else ["bad shape"], limit=60)
    print(f"\n{sum(results)} of {len(results)} passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()