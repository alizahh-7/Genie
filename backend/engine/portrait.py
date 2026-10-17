"""build_portrait(person, inputs): Day 3. Collect names, resolve them in parallel, label, score, expand if thin."""
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from .qloo_client import QlooClient, as_list, clean_tags, compact, hit_id, hit_name
except ImportError:
    from qloo_client import QlooClient, as_list, clean_tags, compact, hit_id, hit_name
try:
    from .resolve import resolve
except ImportError:
    from resolve import resolve
try:
    from . import llm
except ImportError:
    import llm

MAX_ITEMS = 30
TOTAL_TIMEOUT = 20  # seconds, from the contract
KEY_DOMAIN = {"music": "music", "song": "music", "food": "food", "dish": "food",
              "place": "place", "film": "film", "movie": "film"}
LEVEL_FACTOR = {1: 1.0, 2: 0.95, 3: 0.7, 4: 0.6, 5: 0.5, 6: 0.5}
SOURCE_BASE = {"told": 0.9, "reacted": 0.95, "likely": 0.5, "ai-only": 0.3}
# verify these tag ids on your first run; harmless if Qloo ignores them
LANG_TAGS = {"hindi": "urn:tag:genre:hindi", "telugu": "urn:tag:influence:qloo:telugu_film_music"}


def _age_bracket(birth_year):
    if not birth_year:
        return None
    age = datetime.date.today().year - int(birth_year)
    for limit, label in ((24, "24_and_younger"), (29, "25_to_29"), (34, "30_to_34"),
                         (44, "35_to_44"), (54, "45_to_54")):
        if age <= limit:
            return label
    return "55_and_older"


def _naive_split(text):
    import re
    parts = re.split(r"[,;\n]| and ", text or "")
    return [p.strip(" .") for p in parts if 1 < len(p.strip()) <= 40 and len(p.split()) <= 5][:6]  # short names only: sentences are not names


def _collect(inputs):
    cands, seen = [], set()

    def add(domain, name, hint=None):
        k = (domain, compact(name))
        if name and k not in seen and len(cands) < MAX_ITEMS:
            seen.add(k)
            cands.append({"domain": domain if domain in ("music", "food", "place", "film") else "other",
                          "name": name.strip(), "hint": hint, "source": "told"})

    for q in inputs.get("quick_facts", []):
        add(q.get("domain", "other"), q.get("name", ""), q.get("hint"))
    for c in inputs.get("circle_answers", []):
        for key, text in (c.get("answers") or {}).items():
            if not text:
                continue
            dom = next((v for k, v in KEY_DOMAIN.items() if k in key.lower()), None)
            items = llm.extract_items(text, dom)
            if items is None:  # no LLM: only trust answers whose question we recognise
                items = [{"name": n, "domain": dom} for n in _naive_split(text)] if dom else []
            for it in items:
                add(it["domain"], it["name"])
    return cands


def _confidence(source, level):
    return round(SOURCE_BASE.get(source, 0.5) * LEVEL_FACTOR.get(level, 0.5), 2)


def _era_items(client, person, need):
    """Level 4: 'likely from their era and region' using Qloo audience signals."""
    items = []
    for ftype, domain in (("urn:entity:artist", "music"), ("urn:entity:movie", "film")):
        params = {"filter.type": ftype, "take": need}
        age = _age_bracket(person.get("birth_year"))
        if age:
            params["signal.demographics.age"] = age
        if person.get("region"):
            params["signal.location.query"] = person["region"]
        tag = LANG_TAGS.get((person.get("language") or "").strip().lower())
        if tag:
            params["signal.interests.tags"] = tag
        data, err = client.get("/v2/insights", params, step="era_place")
        if data is None:
            continue
        for h in as_list(data)[:need]:
            items.append({"domain": domain, "name": hit_name(h), "qloo_entity_id": hit_id(h),
                          "tags": clean_tags(h), "source_label": "likely",
                          "confidence": _confidence("likely", 4), "resolution_level": 4,
                          "matched_name": hit_name(h)})
    return items


def build_portrait(person, inputs, client=None):
    client = client or QlooClient()
    try:
        return _build(person, inputs, client)
    except Exception:
        return {"items": [], "qloo_log": client.log}


def _build(person, inputs, client):
    cands = _collect(inputs)
    results = {}
    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(resolve, c["name"], c["domain"], c["hint"], client,
                          person.get("region", ""), person.get("language", "")): i
                for i, c in enumerate(cands)}
        try:
            for f in as_completed(futs, timeout=TOTAL_TIMEOUT):
                results[futs[f]] = f.result()
        except Exception:
            pass  # timed out: leftover items become level 6 below

    items, resolved = [], 0
    for i, c in enumerate(cands):
        r = results.get(i)
        if r is None:
            r = {"found": False, "resolution_level": 6, "entity": None, "tags": []}
        if r["found"]:
            resolved += 1
        # the family told us about it, so source stays 'told' even when Qloo does not know it.
        items.append({"domain": c["domain"], "name": c["name"],
                      "qloo_entity_id": r["entity"]["id"] if r.get("entity") else None,
                      "tags": r["tags"], "source_label": c["source"],
                      "confidence": _confidence(c["source"], r["resolution_level"]),
                      "resolution_level": r["resolution_level"],
                      "matched_name": r["entity"]["name"] if r.get("entity") else None})

    if resolved < 3:  # thin portrait: add level 4 items
        items += _era_items(client, person, need=3)
    return {"items": items, "qloo_log": client.log}