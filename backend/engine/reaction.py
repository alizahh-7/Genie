"""Reaction Mode logic (Day 6). Never raises.
pick_reaction_cards(items, tried, n): which portrait items to show next (few at a time, mixed domains, never repeated).
apply_reactions(person, items, reactions, tried, client): update the portrait from taps and suggest what to try next."""
try:
    from .qloo_client import QlooClient, as_list, clean_tags, compact, hit_id, hit_name
    from .portrait import _confidence
except ImportError:
    from qloo_client import QlooClient, as_list, clean_tags, compact, hit_id, hit_name
    from portrait import _confidence

DOMAINS = ("music", "food", "place", "film")
MAX_CARDS = 5      # short sessions: a few items at a time
MAX_ITEMS = 30
PROMPTS = {"music": "Play a short clip of {name}.", "food": "Show a photo of {name}.",
           "place": "Show a photo of {name}.", "film": "Show a short scene or the poster of {name}."}
NO_REACTION_MSG = "That is okay. Let us try something else."
LIT_UP_MSG = "Thank you. Genie has noted what they enjoyed."


def pick_reaction_cards(items, tried=(), n=4):
    try:
        return _pick(items or [], tried or (), n)
    except Exception:
        return {"cards": [], "remaining": 0, "done": True}


def _pick(items, tried, n):
    n = max(1, min(int(n), MAX_CARDS))
    seen = {compact(t) for t in tried}
    ranked = sorted((i for i in items if isinstance(i, dict)),
                    key=lambda i: (i.get("source_label") != "told", -(i.get("confidence") or 0)))
    queues, order, used = {}, [], set()
    for i in ranked:
        d, k = i.get("domain"), compact(i.get("name") or "")
        if d not in DOMAINS or not k or k in seen or k in used or i.get("source_label") == "reacted":
            continue
        used.add(k)
        queues.setdefault(d, []).append(i)
        if d not in order:
            order.append(d)
    cards = []
    while len(cards) < n and any(queues.values()):
        for d in order:
            if queues.get(d) and len(cards) < n:
                i = queues[d].pop(0)
                cards.append({"name": i["name"], "domain": d, "source_label": i.get("source_label"),
                              "prompt": PROMPTS[d].format(name=i["name"]), "media_query": i["name"]})
    return {"cards": cards, "remaining": sum(len(q) for q in queues.values()), "done": not cards}


def apply_reactions(person, items, reactions, tried=(), client=None):
    client = client or QlooClient()
    try:
        return _apply(items or [], reactions or [], list(tried or ()), client)
    except Exception:
        return {"items": [dict(i) for i in (items or []) if isinstance(i, dict)], "added": [], "removed": [],
                "tried": list(tried or ()), "message": NO_REACTION_MSG, "next": [], "qloo_log": client.log}


def _expand(client, lit, known, room):
    """People who light up at these items also love...: up to 3 new 'likely' artists from Qloo."""
    ents = [i["qloo_entity_id"] for i in lit
            if i.get("qloo_entity_id") and not str(i["qloo_entity_id"]).startswith("urn:tag")][:3]
    if not ents or room <= 0:
        return []
    data, err = client.get("/v2/insights", {"filter.type": "urn:entity:artist", "take": 8,
                                            "signal.interests.entities": ",".join(ents)}, step="reaction_expand")
    out = []
    for h in as_list(data) if data else []:
        name = hit_name(h)
        if not name or compact(name) in known:
            continue
        known.add(compact(name))
        out.append({"domain": "music", "name": name, "qloo_entity_id": hit_id(h), "tags": clean_tags(h),
                    "source_label": "likely", "confidence": _confidence("likely", 4),
                    "resolution_level": 4, "matched_name": name})
        if len(out) >= min(3, room):
            break
    return out


def _apply(items, reactions, tried, client):
    out = [dict(i) for i in items if isinstance(i, dict)]
    index = {}
    for n, i in enumerate(out):
        index.setdefault((i.get("domain"), compact(i.get("name") or "")), n)
    tried_keys = {compact(t) for t in tried}
    lit, removed = [], []
    for r in reactions:
        if not isinstance(r, dict) or r.get("reaction") not in ("lit_up", "no_reaction"):
            continue
        name = str(r.get("name") or "").strip()
        k = compact(name)
        if not k:
            continue
        if k not in tried_keys:
            tried_keys.add(k)
            tried.append(name)
        n = index.get((r.get("domain"), k))
        if n is None and not r.get("domain"):
            n = next((j for (d, kk), j in index.items() if kk == k), None)
        if n is None or out[n] is None:
            continue
        it = out[n]
        if r["reaction"] == "lit_up":
            it["source_label"] = "reacted"
            it["confidence"] = _confidence("reacted", it.get("resolution_level") or 6)
            lit.append(it)
        elif it.get("source_label") in ("likely", "ai-only"):
            removed.append(it["name"])   # a guess nobody reacted to is not claimed
            out[n] = None
        # a told item with no reaction stays: the family told us, and no reaction is never a failure
    out = [i for i in out if i is not None]
    known = {compact(i.get("name") or "") for i in out} | {compact(i.get("matched_name") or "") for i in out}
    added = _expand(client, lit, known, MAX_ITEMS - len(out)) if lit else []
    out += added
    return {"items": out, "added": [i["name"] for i in added], "removed": removed, "tried": tried,
            "message": LIT_UP_MSG if lit else NO_REACTION_MSG,
            "next": _pick(out, tried, 4)["cards"], "qloo_log": client.log}