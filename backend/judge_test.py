"""Judge test: fictional people through the real API, end to end (portrait, wishes, matches, comparison,
Wish Book, share, revoke, delete). Takes about 10 minutes for 10 people.
    python judge_test.py                              (server on http://127.0.0.1:8000)
    python judge_test.py https://your-api.onrender.com
    python judge_test.py --extra                      also run 2 odd people (nonsense, escaping)
    python judge_test.py --only 3,9                   run only these people
    python judge_test.py --keep                       do not delete the test people afterwards
It never touches the pinned demo people, deletes what it creates, and paces itself under the per-minute
rate limits and the free-tier LLM quota. Results go to engine/_review/judge_results.json (git-ignored:
it can contain Qloo tag names, so never commit it)."""
import json, os, re, sys, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
BASE = next((a for a in args if a.startswith("http")), "http://127.0.0.1:8000").rstrip("/")
EXTRA, KEEP = "--extra" in args, "--keep" in args
ONLY = {int(x) for x in args[args.index("--only") + 1].split(",")} if "--only" in args else None

LABELS = {"told", "likely", "reacted", "ai-only"}
DOMAINS = {"music", "food", "place", "film", "other"}
CLINICAL = re.compile(r"diagnos|medic|dementia|alzheimer|cancer|terminal|dying|\bdeath\b|therap|treatment|\bcure\b|"
                      r"\bpain\b|hospice|palliative|illness|patient|surgeon|virus|outbreak|epidemic|pandemic|hospital", re.I)
HEAVY = re.compile(r"\b(communal\w*|riot\w*|terror\w*|massacre\w*|genocide|murder\w*|abus\w*|suicid\w*|war|warfare|"
                   r"army|military|soldier\w*|funeral|grief|mourn\w*|earthquake|disaster\w*|special forces|"
                   r"peacekeep\w*|combat|battle\w*|weapon\w*|hostage\w*|bomb(?:s|ing|ed|er|ers)?|"
                   r"explosi(?:on|ons|ve|ves))\b", re.I)
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
S = requests.Session()


class Pacer:
    def __init__(self, gap): self.gap, self.last = gap, 0.0
    def wait(self):
        d = self.last + self.gap - time.time()
        if d > 0: time.sleep(d)
        self.last = time.time()


RUN, CMP = Pacer(7), Pacer(13)   # agent routes 10/min, comparison 5/min

PEOPLE = [
    {"n": 1, "who": "Nani, Hyderabad, Hindi", "person": {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"},
     "facts": [("music", "Lag Jaa Gale"), ("food", "haleem"), ("place", "Charminar")]},
    {"n": 2, "who": "Sana, Seoul, Korean", "person": {"first_name": "Sana", "birth_year": 1992, "region": "Seoul", "language": "Korean"},
     "facts": [("music", "BTS"), ("food", "kimchi jjigae"), ("place", "Busan")]},
    {"n": 3, "who": "Raju, Hyderabad, Telugu", "person": {"first_name": "Raju", "birth_year": 1946, "region": "Hyderabad", "language": "Telugu"},
     "facts": [("film", "Mugal e Azam"), ("food", "pesarattu"), ("place", "Hussain Sagar")]},
    {"n": 4, "who": "Ghulam, Lahore, Urdu", "person": {"first_name": "Ghulam", "birth_year": 1950, "region": "Lahore", "language": "Urdu"},
     "facts": [("music", "Ghulam Ali")]},
    {"n": 5, "who": "Layla, Beirut, Arabic", "person": {"first_name": "Layla", "birth_year": 1955, "region": "Beirut", "language": "Arabic"},
     "facts": [("music", "Fairouz")]},
    {"n": 6, "who": "Margaret, Edinburgh, English", "person": {"first_name": "Margaret", "birth_year": 1950, "region": "Edinburgh", "language": "English"},
     "facts": [("music", "Elton John"), ("place", "Edinburgh")]},
    {"n": 7, "who": "Arjun, Chennai, Tamil", "person": {"first_name": "Arjun", "birth_year": 1960, "region": "Chennai", "language": "Tamil"},
     "facts": [("music", "A. R. Rahman"), ("food", "Kumbakonam filter coffee")]},
    {"n": 8, "who": "Min-jun, Seoul, Korean", "person": {"first_name": "Min-jun", "birth_year": 1985, "region": "Seoul", "language": "Korean"},
     "facts": [("film", "Descendants of the Sun")]},
    {"n": 9, "who": "Asha, almost nothing, Marathi", "person": {"first_name": "Asha", "birth_year": 1952, "region": "Pune", "language": "Marathi"},
     "facts": [], "needs_follow_up": True},
    {"n": 10, "who": "Omar, a judge's own person", "person": {"first_name": "Omar", "birth_year": 1958, "region": "Cairo", "language": "Arabic"},
     "facts": [("music", "Umm Kulthum"), ("music", "Aayega Aanewala"), ("food", "koshari")],
     "circle": {"music": "She sang along to Queen", "joy": "making tea <script>alert(1)</script>"},
     "probe": "<script>alert(1)"},
]
EXTRA_PEOPLE = [
    {"n": 11, "who": "Zed, nonsense inputs", "person": {"first_name": "Zed", "birth_year": 1970, "region": "Nowhere", "language": "Klingon"},
     "facts": [("music", "Zxqvk Wplm"), ("food", "Qwzrt"), ("place", "Plmokn Ijnuhb")], "expect_unfound": True},
    {"n": 12, "who": "Sam, odd characters", "person": {"first_name": "Sam", "birth_year": 1965, "region": "Austin", "language": "English"},
     "facts": [("music", "<b>Queen</b>"), ("film", "Descendants of the Sun"), ("place", "a" * 70)],
     "probe": "<b>Queen</b>"},
]

ROUTES = {
    "create": ("post", r"^/persons/?$"), "get_person": ("get", r"^/persons/\{[^}]+\}/?$"),
    "delete": ("delete", r"^/persons/\{[^}]+\}/?$"), "run": ("post", r"^/persons/\{[^}]+\}/agent/run$"),
    "compare": ("post", r"^/persons/\{[^}]+\}/compare$"), "compare_get": ("get", r"^/persons/\{[^}]+\}/compare$"),
    "compile": ("post", r"wish-book/compile$"), "share": ("post", r"wish-book/share$"),
    "unshare": ("delete", r"wish-book/share$"), "book": ("get", r"^/book/\{[^}]+\}/?$"),
    "print": ("get", r"^/book/\{[^}]+\}/print$"), "invite": ("post", r"^/persons/\{[^}]+\}/circle$"),
    "submit": ("post", r"^/circle/\{[^}]+\}/responses$"),
}


def fill(path, value): return re.sub(r"\{[^}]+\}", value, path, count=1)
def norm(s): return re.sub(r"[\W_]+", "", str(s or "").lower())
def jbody(r):
    try: return r.json()
    except Exception: return None


def deep(d, key, depth=3):
    if isinstance(d, dict):
        if key in d: return d[key]
        if depth:
            for v in d.values():
                f = deep(v, key, depth - 1)
                if f is not None: return f
    return None


def find_token(d, kind):
    if isinstance(d, dict):
        for k in ("token", "share_token", "book_token", "invite_token"):
            if isinstance(d.get(k), str): return d[k]
        for v in d.values():
            if isinstance(v, str):
                m = re.search(rf"/{kind}/([A-Za-z0-9_\-]{{16,}})", v)
                if m: return m.group(1)
            elif isinstance(v, dict):
                t = find_token(v, kind)
                if t: return t
    return None


def call(method, path, pacer=None, json_body=None, timeout=150):
    r, t0 = None, time.time()
    for _ in range(4):
        if pacer: pacer.wait()
        t0 = time.time()
        try:
            r = S.request(method, BASE + path, json=json_body, timeout=timeout)
        except requests.RequestException as e:
            return None, time.time() - t0, type(e).__name__
        if r.status_code == 429:
            try: wait = float(r.headers.get("Retry-After", ""))
            except ValueError: wait = 30
            wait = min(max(wait, 5), 65)
            print(f"      (rate limited, waiting {wait:.0f}s)")
            time.sleep(wait)
            continue
        return r, time.time() - t0, None
    return r, time.time() - t0, "still rate limited"


class Res:
    def __init__(self, P): self.P, self.rows, self.stats = P, [], {}
    def _add(self, tag, name, detail):
        self.rows.append([tag, name, str(detail)])
        print(f"   {tag:<5} {name}" + (f"   {detail}" if detail else ""))
    def ok(self, name, cond, detail=""):
        self._add("PASS" if cond else "FAIL", name, detail); return cond
    def warn(self, name, detail=""): self._add("WARN", name, detail)
    def info(self, name, detail=""): self._add("INFO", name, detail)
    def verdict(self):
        tags = {r[0] for r in self.rows}
        return "FAIL" if "FAIL" in tags else ("WARN" if "WARN" in tags else "PASS")


def check_run(res, P, run):
    items = deep(run, "items")
    if items is None:
        p = deep(run, "portrait")
        items = p.get("items") if isinstance(p, dict) else p
    items = [i for i in (items or []) if isinstance(i, dict)]
    wishes = deep(run, "wishes")
    if isinstance(wishes, dict): wishes = wishes.get("wishes")
    wishes = [w for w in (wishes or []) if isinstance(w, dict)]
    steps = [s for s in (deep(run, "steps") or []) if isinstance(s, dict)]
    follow = deep(run, "follow_up")
    told = [i for i in items if i.get("source_label") == "told"]
    res.stats.update(items=len(items), told=len(told), wishes=len(wishes),
                     notq=sum(1 for i in items if i.get("resolution_level") == 5),
                     err=sum(1 for i in items if i.get("resolution_level") == 6),
                     guesses=sum(1 for i in items if i.get("source_label") == "likely"))
    res.ok("at most 30 items", len(items) <= 30, f"{len(items)} items")
    names = {norm(i.get("name")) for i in items}
    missing = [n for _, n in P["facts"] if norm(n) not in names]
    res.ok("every typed favourite is in the portrait", not missing, f"missing: {missing}" if missing else "")
    bad = [i for i in items if i.get("source_label") not in LABELS or i.get("domain") not in DOMAINS
           or i.get("resolution_level") not in range(1, 7)]
    res.ok("labels, domains and levels are valid", not bad, f"{len(bad)} bad items" if bad else "")
    res.ok("level-4 guesses are labelled 'likely'",
           not [i for i in items if i.get("resolution_level") == 4 and i.get("source_label") != "likely"])
    res.ok("items found through an artist say which one",
           not [i for i in items if i.get("resolution_level") == 3 and not i.get("matched_name")])
    if P.get("expect_unfound"):
        res.ok("nothing invented as found in Qloo", all(i.get("resolution_level", 0) >= 5 for i in told))
    tags = []
    for i in items:
        t = i.get("tags") or i.get("qloo_tags") or []
        tags += [x.get("name", "") for x in t if isinstance(x, dict)] if isinstance(t, list) else []
    res.ok("no medical wording in tags", not sorted({n for n in tags if CLINICAL.search(n)}),
           ", ".join(sorted({n for n in tags if CLINICAL.search(n)})))
    heavy = sorted({n for n in tags if HEAVY.search(n)})
    if heavy: res.warn("heavy-theme tag wording is shown", ", ".join(heavy[:6]))
    res.info("portrait", f"{len(items)} items: {len(told)} told, {res.stats['guesses']} guesses, "
                         f"{res.stats['notq']} not in Qloo, {res.stats['err']} errors")
    modes = [w.get("mode") for w in wishes]
    res.ok("at most 5 wishes", len(wishes) <= 5, f"{len(wishes)} wishes")
    if any(i.get("qloo_entity_id") for i in items):
        res.ok("3 to 5 wishes when something resolved", 3 <= len(wishes) <= 5)
    res.ok("modes valid, at most one in-person, and it is last",
           all(m in ("remote", "in-person") for m in modes) and modes.count("in-person") <= 1
           and ("in-person" not in modes or modes[-1] == "in-person"), str(modes))
    texts = [(w.get("title") or "") + " " + (w.get("description") or "") for w in wishes]
    texts += [s.get("summary") or "" for s in steps] + [follow or ""]
    res.ok("wishes, steps and follow-up are calm", not any("!" in t or CLINICAL.search(t) for t in texts))
    if len(told) < 3:
        res.ok("fewer than 3 told items: a gentle follow-up question is returned", bool(follow))
    if items and not told:
        res.ok("wishes built only from guesses do not call them favourites",
               not any("favourite" in (w.get("description") or "").lower() for w in wishes))
    res.ok("every wish has a basis of told or likely", all(w.get("basis") in ("told", "likely") for w in wishes))
    disc = [w for w in wishes if w.get("kind") == "discovery"]
    res.ok("a discovery wish says it is a guess and says why",
           all("guess" in (w.get("description") or "").lower() and w.get("why") for w in disc))
    res.ok("visible steps returned", len(steps) >= 5, f"{len(steps)} steps")
    if P.get("needs_follow_up"):
        res.ok("a thin portrait still returns a portrait and a gentle follow-up", bool(items) and bool(follow),
               f"items={len(items)}, follow_up={'yes' if follow else 'no'}")
    m = deep(run, "matches")
    if m is None: res.warn("matches", "no 'matches' key in the agent/run response")
    else:
        n = sum(1 for v in m.values() if v) if isinstance(m, dict) else len(m)
        res.info("matches", f"{n} of {len(wishes)} wishes have at least one Wish Maker")
    if not isinstance(deep(run, "qloo_log"), list): res.warn("Qloo call log", "no qloo_log in the response")


def check_compare(res, P, pid, routes):
    r, dt, err = call("POST", fill(routes["compare"], pid), pacer=CMP)
    if P.get("needs_follow_up") and r is not None and r.status_code == 409:
        msg = r.text[:200]
        res.ok("comparison with nothing typed is refused calmly (409)",
               not CLINICAL.search(msg) and "!" not in msg, msg)
        return
    if not res.ok("comparison returns 200", r is not None and r.status_code == 200,
                  f"{dt:.1f}s" if r is not None and r.status_code == 200 else
                  (err or f"HTTP {getattr(r, 'status_code', '?')} {(r.text[:150] if r is not None else '')}")):
        return

def check_book(res, P, pid, routes):
    r, dt, err = call("POST", fill(routes["compile"], pid))
    if not res.ok("Wish Book compiles", r is not None and r.status_code == 200,
                  err or f"HTTP {getattr(r, 'status_code', '?')} {(r.text[:120] if r is not None else '')}"): return
    r, dt, err = call("POST", fill(routes["share"], pid))
    tok = find_token(jbody(r), "book") if r is not None and r.status_code in (200, 201) else None
    if not res.ok("Wish Book share link is created", bool(tok), err or f"HTTP {getattr(r, 'status_code', '?')}"): return
    rb, _, _ = call("GET", fill(routes["book"], tok))
    res.ok("shared book opens", rb is not None and rb.status_code == 200)
    rp, _, _ = call("GET", fill(routes["print"], tok))
    if res.ok("printable page opens", rp is not None and rp.status_code == 200):
        html = rp.text
        res.ok("first name is on the page", (P.get("name_token") or P["person"]["first_name"]).lower() in html.lower())
        res.ok("'not a medical service' notice is on the page", bool(re.search(r"not a medical service", html, re.I)))
        res.ok("person id is not on the shared page", pid not in html)
        others = [u for u in UUID.findall(html) if u.lower() != pid.lower()]
        res.ok("no Qloo ids or 'urn:tag' on the shared page", not others and "urn:tag:" not in html,
               f"{len(others)} id-like strings" if others else "")
        if P.get("probe"):
            res.ok("typed markup is not live on the page", P["probe"] not in html)
        hdr = {k.lower(): v for k, v in rp.headers.items()}
        if "noindex" not in (hdr.get("x-robots-tag", "") + html).lower(): res.warn("page is not marked no-index")
        if "content-security-policy" not in hdr: res.warn("no content-security-policy header on the printable page")
    call("DELETE", fill(routes["unshare"], pid))
    r1, _, _ = call("GET", fill(routes["book"], tok))
    r2, _, _ = call("GET", fill(routes["print"], tok))
    res.ok("revoked share link returns 404 (book and print)",
           r1 is not None and r2 is not None and r1.status_code == 404 and r2.status_code == 404,
           f"{getattr(r1, 'status_code', '?')}/{getattr(r2, 'status_code', '?')}")


def run_person(P, routes):
    res, pid = Res(P), None
    try:
        r, dt, err = call("POST", routes["create"], json_body=P["person"])
        if r is not None and r.status_code in (200, 201):
            b = jbody(r) or {}
            if isinstance(b.get("person"), dict): b = b["person"]
            pid = b.get("id") or b.get("person_id")
        if not res.ok("create person", bool(pid), err or f"HTTP {getattr(r, 'status_code', '?')}"): return res
        if P.get("circle"):
            r, _, _ = call("POST", fill(routes["invite"], pid))
            tok = find_token(jbody(r), "circle") if r is not None and r.status_code in (200, 201) else None
            if tok:
                r2, _, _ = call("POST", fill(routes["submit"], tok), json_body={
                    "contributor_first_name": "Dina", "answers": P["circle"], "consent_given": True})
                res.ok("Wish Circle answer accepted", r2 is not None and r2.status_code in (200, 201),
                       f"HTTP {getattr(r2, 'status_code', '?')}")
            else:
                res.warn("Wish Circle invite", "no token found in the response")
        facts = [{"domain": d, "name": n} for d, n in P["facts"]]
        r, dt, err = call("POST", fill(routes["run"], pid), pacer=RUN, json_body={"quick_facts": facts})
        res.stats["run_s"] = round(dt, 1)
        if not res.ok("agent/run returns 200", r is not None and r.status_code == 200,
                      f"{dt:.1f}s" if r is not None and r.status_code == 200 else
                      (err or f"HTTP {getattr(r, 'status_code', '?')} {(r.text[:150] if r is not None else '')}")): return res
        res.info("time to first result", f"{dt:.1f}s")
        check_run(res, P, jbody(r) or {})
        check_compare(res, P, pid, routes)
        check_book(res, P, pid, routes)
    except Exception as e:
        res.ok("test ran without a script error", False, f"{type(e).__name__}: {e}")
    finally:
        if pid and not KEEP:
            r, _, _ = call("DELETE", fill(routes["delete"], pid))
            r2, _, _ = call("GET", fill(routes["get_person"], pid))
            gone = r is not None and r.status_code in (200, 204) and r2 is not None and r2.status_code == 404
            res.ok("delete everything, then the person is gone (404)", gone, "" if gone else f"left behind: {pid}")
    return res


def main():
    print("server:", BASE)
    try:
        S.get(BASE + "/health/db", timeout=90)   # also wakes a sleeping free host
    except Exception as e:
        print("server not reachable:", e); sys.exit(2)
    try:
        paths = S.get(BASE + "/openapi.json", timeout=30).json()["paths"]
    except Exception as e:
        print("could not read /openapi.json:", e); sys.exit(2)
    routes, missing = {}, []
    for k, (method, pat) in ROUTES.items():
        found = next((p for p, ops in paths.items() if method in ops and re.search(pat, p)), None)
        if found: routes[k] = found
        else: missing.append(f"{method.upper()} {pat}")
    if missing:
        print("These routes were not found in /openapi.json (tell Umaima):", *missing, sep="\n   "); sys.exit(2)
    people = [p for p in PEOPLE + (EXTRA_PEOPLE if EXTRA else []) if not ONLY or p["n"] in ONLY]
    results = []
    for P in people:
        print(f"\n=== #{P['n']} {P['who']} ===")
        results.append(run_person(P, routes))
    print("\n" + "=" * 78)
    print(f"{'#':<3}{'person':<34}{'verdict':<8}{'first result':<14}{'items':<7}{'wishes':<8}")
    for r in results:
        s = r.stats
        print(f"{r.P['n']:<3}{r.P['who'][:32]:<34}{r.verdict():<8}{str(s.get('run_s', '-')) + 's':<14}"
              f"{s.get('items', '-')!s:<7}{s.get('wishes', '-')!s:<8}")
    fails = [(r.P["n"], row[1], row[2]) for r in results for row in r.rows if row[0] == "FAIL"]
    warns = [(r.P["n"], row[1], row[2]) for r in results for row in r.rows if row[0] == "WARN"]
    print(f"\n{len(results) - len({f[0] for f in fails})} of {len(results)} people reached the end with no failed check; "
          f"{len(fails)} failed checks, {len(warns)} warnings")
    for n, name, d in fails: print(f"   FAIL #{n}: {name}  {d}")
    for n, name, d in warns: print(f"   WARN #{n}: {name}  {d}")
    os.makedirs(os.path.join(HERE, "engine", "_review"), exist_ok=True)
    with open(os.path.join(HERE, "engine", "_review", "judge_results.json"), "w", encoding="utf-8") as f:
        json.dump([{"n": r.P["n"], "who": r.P["who"], "verdict": r.verdict(), "stats": r.stats, "rows": r.rows}
                   for r in results], f, indent=1, ensure_ascii=False)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()