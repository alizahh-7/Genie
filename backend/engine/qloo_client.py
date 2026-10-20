"""One cached Qloo client for the whole engine (Day 2). All Qloo calls go through here."""
import difflib
import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

BASE = os.environ.get("QLOO_API_URL", "https://hackathon.api.qloo.com").rstrip("/")
CACHE_DIR = Path(__file__).resolve().parent / "_cache"
CACHE_DIR.mkdir(exist_ok=True)

CONNECT_TIMEOUT = 4      # seconds to reach Qloo. The read timeout (default 10) is separate.
BREAKER_FAILS = 3        # this many timeouts/network errors in a row ...
BREAKER_SECONDS = 30     # ... and Qloo calls are skipped for this long (cache still served)
_LOCK = threading.Lock()
_BREAKER = {"fails": 0, "until": 0.0, "kind": "network"}


def _breaker_open():
    return time.time() < _BREAKER["until"]


def _breaker_fail(kind):
    with _LOCK:
        _BREAKER["fails"] += 1
        _BREAKER["kind"] = kind
        if _BREAKER["fails"] >= BREAKER_FAILS:
            _BREAKER["until"] = time.time() + BREAKER_SECONDS
            _BREAKER["fails"] = 0


def _breaker_ok():
    with _LOCK:
        _BREAKER["fails"] = 0


def reset_breaker():
    with _LOCK:
        _BREAKER["fails"] = 0
        _BREAKER["until"] = 0.0


# tag types that describe the audience, not the thing. Useless for matching makers.
_DROP_TAG_TYPES = ("audience", "obscurity", "complexity", "age_range", "customer_identity",
                   "keyword:media", "amenity", "nearby_attraction", "time_of_day_fit", "visit_intent")

# tag names that must not reach a family-facing screen or a match: ageing and end-of-life wording (the tone
# rules forbid it), heavy themes, and religion-plus-family labels on content. Genre tags (Sufi, Devotional) are kept.
_DROP_TAG_NAMES = re.compile(
    r"\b(old age|ageing|aging|elderly|old (?:man|woman|men|women)|longevity|mortality|death|dying|funeral|grief|"
    r"mourn\w*|bereave\w*|terminal|illness|disease|cancer|dementia|alzheimer\w*|hospice|hospital|suicide|"
    r"communal\w*|riot\w*|terror\w*|massacre\w*|genocide|murder\w*|abus\w*|"
    r"medical|medicine|surgeon|surgery|doctor|nurse|clinic\w*|patient|virus|outbreak|epidemic|pandemic|"
    r"war|warfare|military|army|soldier\w*|demilitari\w*)\b|"
    r"\b(muslim|hindu|christian|jewish|sikh|buddhist)\s+(family|families|community|characters?|protagonists?)\b", re.I)

# extra themes that make an era-and-place GUESS a bad idea for a family screen (the guess is skipped, not just
# the tag). Told items are never skipped.
_HEAVY_THEMES = re.compile(
    r"\b(violen\w*|crime\w*|criminal\w*|revenge|kidnap\w*|suicid\w*|addict\w*|torture|rape|war crime\w*)\b", re.I)


def is_heavy(hit):
    """True if any tag on this hit is ageing/end-of-life wording or a heavy theme."""
    for t in hit.get("tags") or []:
        name = t.get("name") or ""
        if _DROP_TAG_NAMES.search(name) or _HEAVY_THEMES.search(name):
            return True
    return False


class QlooClient:
    def __init__(self, timeout=10, retries=2):
        self.key = os.environ.get("QLOO_API_KEY")
        self.timeout = timeout
        self.retries = retries
        self.log = []  # becomes qloo_log in the contract

    def _log(self, step, label, status, t0):
        self.log.append({"step": step, "request": label, "status": status,
                         "ms": int((time.time() - t0) * 1000)})

    def get(self, path, params, step="call"):
        """Returns (data, error). error is None, 'no results', 'timeout', 'network', 'HTTP 5xx', 'no key'.
        Successful answers and 404s are cached on disk forever (demo safety).
        After BREAKER_FAILS timeouts/network errors in a row, uncached calls fail fast for BREAKER_SECONDS."""
        shown = {k: v for k, v in params.items()
                 if k in ("query", "filter.query", "filter.type", "types")}
        label = f"{path} {shown}"
        ck = hashlib.sha1((path + json.dumps(params, sort_keys=True)).encode()).hexdigest()
        f = CACHE_DIR / f"{ck}.json"
        t0 = time.time()
        if f.exists():
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                self._log(step, label, "cached", t0)
                return data, None
            except Exception:
                pass
        if not self.key:
            self._log(step, label, "no key", t0)
            return None, "no key"
        last = "error"
        for attempt in range(self.retries + 1):
            if _breaker_open():
                last = _BREAKER["kind"]
                break
            try:
                r = requests.get(BASE + path, params=params,
                                 headers={"X-Api-Key": self.key},
                                 timeout=(CONNECT_TIMEOUT, self.timeout))
            except requests.Timeout:
                last = "timeout"
                _breaker_fail(last)
            except requests.RequestException:
                last = "network"
                _breaker_fail(last)
            else:
                _breaker_ok()  # Qloo answered, so it is reachable
                if r.status_code == 200:
                    data = r.json()
                    f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                    self._log(step, label, "ok", t0)
                    return data, None
                if r.status_code == 404:
                    f.write_text("{}", encoding="utf-8")
                    self._log(step, label, "no results", t0)
                    return {}, "no results"
                last = f"HTTP {r.status_code}"
                if r.status_code in (400, 401, 403):
                    break
            if _breaker_open():
                break
            time.sleep(0.5 * (attempt + 1))
        self._log(step, label, last, t0)
        return None, last


# ---------- helpers shared by resolve.py and portrait.py ----------

def as_list(data):
    """Find the list of hits. /search -> results[], /v2/tags -> results.tags[], /v2/insights -> results.entities[]"""
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []
    res = data.get("results", data)
    if isinstance(res, list):
        return res
    if isinstance(res, dict):
        for k in ("entities", "tags", "results", "items"):
            if isinstance(res.get(k), list):
                return res[k]
    return []


def hit_id(h):
    return str(h.get("entity_id") or h.get("id") or "")


def hit_name(h):
    return str(h.get("name") or h.get("title") or "")


def _strip_paren(s):
    return re.sub(r"\(.*?\)", "", s or "")


def compact(s):
    return re.sub(r"[\W_]+", "", _strip_paren(s).lower())


def spaced(s):
    return re.sub(r"[\W_]+", " ", _strip_paren(s).lower()).strip()


def score(query, cand):
    """1.0 for the same name ignoring punctuation/spaces/brackets ('A. R. Rahman' == 'A.R. Rahman',
    'Jeju Island' == 'Jeju Island (Jeju Do)'). Otherwise plain similarity. No 'substring' shortcut:
    that shortcut wrongly accepted 'Tirupati Railway Station' for 'Tirupati'."""
    a, b = compact(query), compact(cand)
    if a and a == b:
        return 1.0
    return difflib.SequenceMatcher(None, spaced(query), spaced(cand)).ratio()


def clean_tags(hit, cap=30):
    """Normalise tags from /search (tag_id) and /v2/insights (id) into {id, name, type}.
    Drops audience-style tag types and tag names that must not reach a family-facing screen."""
    out, seen = [], set()
    for t in hit.get("tags") or []:
        tid = t.get("tag_id") or t.get("id")
        typ = t.get("type") or ""
        name = t.get("name") or ""
        if not tid or tid in seen or any(x in typ for x in _DROP_TAG_TYPES) or _DROP_TAG_NAMES.search(name):
            continue
        seen.add(tid)
        out.append({"id": tid, "name": t.get("name", ""), "type": typ})
        if len(out) >= cap:
            break
    return out