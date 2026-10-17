import unicodedata

STOPWORDS = {"the", "a", "an", "of", "and", "for", "in", "to"}

TYPE_FIT = {
    "music": {"musician", "cafe"},
    "food": {"home cook", "cafe"},
    "place": {"volunteer", "storyteller", "cafe"},
    "film": {"storyteller", "cafe"},
    "other": {"storyteller", "volunteer", "other"},
}


def norm(text) -> str:
    """Lowercase, keep letters, marks, and numbers of any script, drop punctuation."""
    text = unicodedata.normalize("NFKC", str(text or "")).casefold()
    chars = [" " if unicodedata.category(c)[0] in "PSZC" else c for c in text]
    return " ".join("".join(chars).split())


def tokens(text) -> set:
    return {t for t in norm(text).split() if t not in STOPWORDS and len(t) > 1}


def item_view(item: dict) -> dict:
    tag_map = {}
    for t in item.get("tags") or []:
        if isinstance(t, dict) and t.get("id"):
            tag_map[t["id"]] = t.get("name") or ""
    conf = item.get("confidence")
    return {
        "name": item.get("name", ""),
        "domain": item.get("domain") or "other",
        "entity_id": item.get("qloo_entity_id"),
        "tag_map": tag_map,
        "tag_names": [n for n in tag_map.values() if n],
        "confidence": 0.7 if conf is None else float(conf),
    }


def maker_view(maker: dict) -> dict:
    qtags = {}
    for t in maker.get("qloo_tags") or []:
        if isinstance(t, dict) and t.get("id"):
            qtags[t["id"]] = t.get("name") or ""
    own = [str(t) for t in (maker.get("tags") or [])]
    return {
        "entity_ids": {str(e) for e in (maker.get("qloo_entity_ids") or [])},
        "tag_ids": set(qtags),
        "own_norm": {norm(t) for t in own},
        "own_tokens": set().union(*[tokens(t) for t in own]),
    }


def item_strength(item, mv, maker_name):
    """Returns (strength 0..1, kind 'qloo' or 'text', reason), or None."""
    if item["entity_id"] and str(item["entity_id"]) in mv["entity_ids"]:
        return 1.0, "qloo", f"Both connect to {item['name']}"

    shared = set(item["tag_map"]) & mv["tag_ids"]
    if shared:
        smaller = min(len(item["tag_map"]), len(mv["tag_ids"]))
        strength = max(0.35, min(0.7, 0.7 * len(shared) / smaller))
        names = sorted(item["tag_map"][i] for i in shared if item["tag_map"].get(i))[:3]
        reason = ("Shared taste: " + ", ".join(names)) if names else "Shared taste profile"
        return strength, "qloo", reason

    name_n = norm(item["name"])
    if name_n and name_n in mv["own_norm"]:
        return 0.8, "text", f"{maker_name} lists {item['name']}"
    for tag_name in item["tag_names"]:
        if norm(tag_name) in mv["own_norm"]:
            return 0.5, "text", f"{maker_name} lists {tag_name}"
    it = tokens(item["name"])
    if it and len(it & mv["own_tokens"]) / len(it) >= 0.5:
        return 0.4, "text", f"{maker_name}'s tags overlap with {item['name']}"
    return None


def same_place(a, b) -> bool:
    a, b = norm(a), norm(b)
    return bool(a and b and (a in b or b in a))


def is_eligible(maker: dict, mode: str, person: dict) -> bool:
    if maker.get("application_status") != "approved":
        return False
    if mode == "remote":
        return bool(maker.get("remote_ok"))
    # In-person: verified makers (or labelled samples) in the same place only.
    if not (maker.get("is_sample") or maker.get("verification_status") == "verified"):
        return False
    return same_place(maker.get("city"), person.get("region"))


def score_maker(items, maker, mode, person):
    mv = maker_view(maker)
    hits = []
    for it in items:
        found = item_strength(it, mv, maker["name"])
        if found:
            strength, kind, reason = found
            weighted = strength * (0.5 + 0.5 * it["confidence"])
            hits.append((weighted, kind, reason, it["domain"]))
    if not hits:
        return None

    hits.sort(key=lambda h: h[0], reverse=True)
    top = hits[:3]
    base = 0.7 * top[0][0] + 0.3 * (sum(h[0] for h in top) / 3)

    reasons = []
    for h in top:
        if h[2] not in reasons:
            reasons.append(h[2])

    bonus = 0.0
    if any(maker.get("type") in TYPE_FIT.get(h[3], set()) for h in top):
        bonus += 0.08
    lang = norm(person.get("language"))
    if lang and any(norm(x) == lang for x in (maker.get("languages") or [])):
        bonus += 0.05
        reasons.append(f"Speaks {person['language']}")
    if maker.get("verification_status") == "verified":
        bonus += 0.05
        reasons.append("Identity and references checked")
    if mode == "in-person":
        bonus += 0.05
        reasons.append(f"Based in {maker.get('city')}")
    else:
        reasons.append("Offers remote wishes")

    return {
        "score": round(min(1.0, base * 0.85 + bonus), 3),
        "reasons": reasons[:5],
        "basis": "qloo" if any(h[1] == "qloo" for h in top) else "text",
    }


def select_items(portrait, source_items):
    """The items a wish is about. Names that are not in the portrait are still used."""
    wanted, seen = [], set()
    for s in source_items or []:
        name = s if isinstance(s, str) else (s.get("name") if isinstance(s, dict) else None)
        key = norm(name)
        if key and key not in seen:
            seen.add(key)
            wanted.append((key, name))
    if not wanted:
        return portrait  # no source items given: use the whole portrait
    by_name = {norm(p["name"]): p for p in portrait}
    return [
        by_name.get(key) or {"name": name, "domain": "other", "tags": [], "confidence": 0.7}
        for key, name in wanted
    ]


def rank_makers(items, makers, mode, person, blocked=frozenset(), limit=5, min_score=0.2):
    views = [item_view(i) for i in items]
    ranked = []
    for m in makers:
        if m["id"] in blocked or not is_eligible(m, mode, person):
            continue
        result = score_maker(views, m, mode, person)
        if result and result["score"] >= min_score:
            ranked.append({"maker_id": m["id"], **result})
    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked[:limit]