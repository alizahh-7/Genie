"""resolve(name, domain): the fallback ladder, levels 1,2,3,5,6 (Day 2-3).
Level 4 (era and place) lives in portrait.py because it is about the whole person, not one item."""
try:
    from .qloo_client import QlooClient, as_list, clean_tags, compact, hit_id, hit_name, score
except ImportError:
    from qloo_client import QlooClient, as_list, clean_tags, compact, hit_id, hit_name, score
try:
    from . import llm
except ImportError:
    import llm

ACCEPT = 0.85
TYPES = {
    "music": ["urn:entity:artist"],
    "film": ["urn:entity:movie", "urn:entity:tv_show"],
    "place": ["urn:entity:place", "urn:entity:destination", "urn:entity:locality"],
}

# Seed knowledge for known misses and for songs (Qloo has artists, not songs). The LLM covers the rest.
ALIASES = {
    "ummkulthum": ["Umm Kalthoum", "Oum Kalthoum", "Om Kalsoum", "أم كلثوم"],
    "whythiskolaveridi": ["Kolaveri Di"],
    "fairouz": ["Fairuz"],
    "hussainsagar": ["Hussain Sagar Lake"],
    "kumbakonamfiltercoffee": ["filter coffee", "South Indian filter coffee"],
}
PARENTS = {
    "buttabomma": ["Armaan Malik"],
    "naatunaatu": ["M. M. Keeravani"],
    "lagjaagale": ["Lata Mangeshkar"],
    "whythiskolaveridi": ["Anirudh Ravichander", "Dhanush"],
    "hotelcalifornia": ["Eagles"],
    "tirupati": ["Tirumala Venkateswara Temple", "Tirupati Balaji Temple"],
    "aayegaaanewala": ["Lata Mangeshkar"],
}


def _kind(t):
    return t.split(":")[-1]


def _note(client, query, domain):
    """Tell the real client which item the next call is about, so its log row gets a friendly label.
    Test doubles without note() are simply skipped."""
    n = getattr(client, "note", None)
    if callable(n):
        n((query, domain))


def _search(client, query, domain):
    """Returns (hit, kind, err). hit is None if nothing scored >= ACCEPT. err is a transport error or None."""
    _note(client, query, domain)
    if domain == "food":
        data, err = client.get("/v2/tags", {"filter.query": query}, step="resolve")
        if data is None:
            return None, "tag", err
        best = None
        for h in as_list(data):
            s = score(query, hit_name(h))
            if s >= ACCEPT and (best is None or (s, h.get("popularity", 0)) > (best[0], best[1].get("popularity", 0))):
                best = (s, h)
        return (best[1], "tag", None) if best else (None, "tag", None)
    for t in TYPES.get(domain, []):
        _note(client, query, domain)
        data, err = client.get("/search", {"query": query, "types": t, "take": 5}, step="resolve")
        if data is None:
            return None, t, err
        good = [(score(query, hit_name(h)), bool(h.get("tags")), h.get("popularity", 0), h)
                for h in as_list(data)]
        good = [g for g in good if g[0] >= ACCEPT]
        if good:
            good.sort(key=lambda g: g[:3], reverse=True)  # best name, then has tags, then most popular
            return good[0][3], _kind(t), None
    return None, "-", None


def _result(name, domain, hit, kind, level, via=None):
    if kind == "tag":
        tags = [{"id": hit_id(hit), "name": hit_name(hit), "type": hit.get("type", "")}]
    else:
        tags = clean_tags(hit)
    return {"input": name, "domain": domain, "found": True, "resolution_level": level,
            "entity": {"id": hit_id(hit), "name": hit_name(hit), "type": kind},
            "tags": tags, "affinity": None, "popularity": hit.get("popularity"), "matched_via": via}


def _miss(name, domain, level):
    return {"input": name, "domain": domain, "found": False, "resolution_level": level,
            "entity": None, "tags": [], "affinity": None, "popularity": None, "matched_via": None}


def resolve(name, domain, hint=None, client=None, region="", language="", use_llm=True):
    """Never raises. hint = optional artist/cuisine/city to use at level 3."""
    client = client or QlooClient()
    try:
        return _resolve(client, name, domain, hint, region, language, use_llm)
    except Exception:
        return _miss(name, domain, 6)


def _via_parents(client, domain, parents):
    """Try each parent query. Returns (hit, kind, via, err)."""
    for p in parents:
        hit, kind, err = _search(client, p, domain)
        if hit:
            return hit, kind, p, None
        if err and err != "no results":
            return None, None, None, err
    return None, None, None, None


def _resolve(client, name, domain, hint, region, language, use_llm):
    if domain not in ("music", "food", "place", "film"):
        return _miss(name, domain, 5)
    key = compact(name)
    if len(key) < 2:
        return _miss(name, domain, 5)
    parents = ([hint] if hint else []) + list(PARENTS.get(key, []))

    # level 1: exact
    hit, kind, err = _search(client, name, domain)
    if hit:
        res = _result(name, domain, hit, kind, 1)
        # a 'thin' exact hit (under 3 usable tags) is usually a tribute act or a namesake,
        # e.g. an artist literally called "Hotel California". Prefer the known parent if we have one.
        if kind == "tag" or len(res["tags"]) >= 3 or not parents:
            return res
        phit, pkind, via, perr = _via_parents(client, domain, parents)
        if phit:
            return _result(name, domain, phit, pkind, 3, via=via)
        return res
    if err and err != "no results":
        return _miss(name, domain, 6)  # API down or timeout

    # level 2: another spelling
    alts = list(ALIASES.get(key, []))
    suggestion = llm.suggest_alternates(name, domain, region, language) if use_llm else None
    if suggestion:
        alts += [a for a in suggestion.get("alternates", []) if isinstance(a, str)]
    for alt in alts:
        hit, kind, err = _search(client, alt, domain)
        if hit:
            return _result(name, domain, hit, kind, 2, via=alt)
        if err and err != "no results":
            return _miss(name, domain, 6)

    # level 3: move up (song -> artist, dish -> cuisine, spot -> city)
    if suggestion and suggestion.get("parent"):
        parents.append(suggestion["parent"])
    phit, pkind, via, perr = _via_parents(client, domain, parents)
    if phit:
        return _result(name, domain, phit, pkind, 3, via=via)
    if perr:
        return _miss(name, domain, 6)

    # level 5: Qloo has nothing useful. Shown honestly, excluded from Qloo scoring.
    return _miss(name, domain, 5)