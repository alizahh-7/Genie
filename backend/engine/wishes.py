"""generate_wishes(items, person): Day 4. Portrait items in, 3-5 wishes out. Never raises.
Wishes come from fixed templates so each one maps to a real maker type; Qloo supplies the
'people like them also love' discovery (with its own affinity and explainability); the LLM only
polishes wording (optional, rejected unless safe)."""
import json
import re

try:
    from .qloo_client import QlooClient, as_list, compact, hit_name
except ImportError:
    from qloo_client import QlooClient, as_list, compact, hit_name
try:
    from . import llm
except ImportError:
    import llm

MAX_WISHES = 5
FOLLOW_UP = "Is there a song or a place they loved?"
# tone rules from the project plan: no medical or clinical wording anywhere in a wish
BANNED = re.compile(r"\b(therap\w*|treat\w*|cure\w*|heal\w*|pain|dementia|alzheimer\w*|diagnos\w*|"
                    r"medic\w*|prognosis|dying|terminal|illness|disease|symptom\w*)\b", re.I)


def _cap(s):
    s = (s or "").strip()
    return s[:1].upper() + s[1:]


def _anchors(items):
    """Group usable portrait items by domain. Prefer told/reacted; fall back to likely."""
    pool = [i for i in items if i.get("source_label") in ("told", "reacted")]
    basis = "told"
    if not pool:
        pool = [i for i in items if i.get("source_label") == "likely"]
        basis = "likely"
    by = {"music": [], "film": [], "place": [], "food": []}
    for i in sorted(pool, key=lambda x: -(x.get("confidence") or 0)):
        if i.get("domain") in by and i.get("name"):
            by[i["domain"]].append(i)
    return by, basis


def _is_tag(i):
    return str(i.get("qloo_entity_id") or "").startswith("urn:tag")


def _tags_for(srcs):
    seen, out = set(), []
    for i in srcs:
        for t in i.get("tags") or []:
            k = compact(t.get("name", ""))
            if k and k not in seen:
                seen.add(k)
                out.append({"id": t.get("id"), "name": t.get("name")})
    return out[:15]


def _discover(client, by, known):
    """Qloo insights: artists loved by people whose taste is close to the anchors.
    Returns [{'name', 'affinity', 'because': [anchor names Qloo weighted most]}]."""
    anchors = [i for d in ("music", "film", "place") for i in by[d][:3]
               if i.get("qloo_entity_id") and not _is_tag(i)][:6]
    tags = [i["qloo_entity_id"] for i in by["food"][:2] if _is_tag(i)]
    if not anchors and not tags:
        return []
    params = {"filter.type": "urn:entity:artist", "take": 10, "feature.explainability": "true"}
    if anchors:
        params["signal.interests.entities"] = ",".join(i["qloo_entity_id"] for i in anchors)
    if tags:
        params["signal.interests.tags"] = ",".join(tags)
    data, err = client.get("/v2/insights", params, step="wish_discover")
    id2name = {str(i["qloo_entity_id"]).lower(): i["name"] for i in anchors}
    out = []
    for h in as_list(data) if data else []:
        n = hit_name(h)
        if not n or compact(n) in known or any(o["name"] == n for o in out):
            continue
        q = h.get("query") if isinstance(h.get("query"), dict) else {}
        aff = q.get("affinity")
        expl = q.get("explainability") if isinstance(q.get("explainability"), dict) else {}
        contrib = [c for c in (expl.get("signal.interests.entities") or []) if isinstance(c, dict)]
        because = []
        for c in sorted(contrib, key=lambda c: -(c.get("score") or 0)):
            nm = id2name.get(str(c.get("entity_id", "")).lower())
            if nm and nm not in because:
                because.append(nm)
            if len(because) == 2:
                break
        out.append({"name": n, "because": because,
                    "affinity": round(aff, 2) if isinstance(aff, (int, float)) else None})
        if len(out) >= 3:
            break
    return out


def _is_local(place, region):
    a, b = compact(region), compact(place)
    return bool(a and b and (a in b or b in a))


def _cands(by, basis, person, discoveries):
    region = (person.get("region") or "").strip()
    out = []

    def add(prio, kind, title, desc, mode, maker, srcs, why=None, label=None, affinity=None):
        out.append({"_p": prio, "title": title, "description": desc, "mode": mode,
                    "source_items": [s["name"] for s in srcs], "kind": kind, "maker_type": maker,
                    "tags": _tags_for(srcs), "basis": label or basis, "why": why, "affinity": affinity})

    music, food, place = by["music"][:3], by["food"][:1], by["place"][:1]
    allitems = [i for d in ("music", "food", "place", "film") for i in by[d]]
    mix = [by[d][0] for d in ("place", "food", "music", "film") if by[d]][:3]
    if music:
        names = " and ".join(i["name"] for i in music[:2])
        add(1, "music", "Their songs, recorded for them",
            f"A singer or musician records {names} just for them. The family can play it whenever they like, from anywhere.",
            "remote", "musician", music[:2])
        if region:
            add(5, "music", "A live evening of their songs",
                f"A musician plays {names} for them at home, with family in the room. This needs a verified Wish Maker and a family member present.",
                "in-person", "musician", music[:2])
    if food:
        dish = food[0]["name"]
        add(2, "food", f"{_cap(dish)}, the way they loved it",
            f"A home cook makes {dish} and shares the recipe and a short video, so the family can cook it again together.",
            "remote", "home cook", food)
        if region:
            add(6, "food", f"{_cap(dish)}, cooked at home",
                f"A home cook prepares {dish} in the family's kitchen, with a family member present.",
                "in-person", "home cook", food)
    if place:
        p = place[0]["name"]
        add(3, "place", f"A walk through {p}",
            f"Someone who knows {p} sends a short video or voice walk, so they can be there again for a few minutes.",
            "remote", "storyteller", place)
        mn = place[0].get("matched_name") or ""
        if region and (_is_local(p, region) or _is_local(mn, region)):
            add(7, "place", f"An afternoon at {p}",
                "A family member and a volunteer take them there, if it is within reach and they are comfortable.",
                "in-person", "volunteer", place)
    if allitems:
        add(4, "story", "A memory from someone who was there",
            "A friend or relative from long ago records or writes a few lines about a time they shared. The Wish Circle can invite them.",
            "remote", "storyteller", mix or allitems[:2])
    if discoveries:
        d = discoveries[0]
        because = d["because"] or [i["name"] for i in music[:2]]
        srcs = [i for i in allitems if i["name"] in because] or (music[:2] or allitems[:2])
        anchors = " and ".join(because) if because else "what they loved"
        score = f" (match score {d['affinity']:.2f})" if d["affinity"] is not None else ""
        add(3.5, "discovery", f"Music like {d['name']}, played for them",
            f"People whose taste is close to {anchors} also love {d['name']}. A musician plays a few pieces in that spirit. "
            "This is a guess from Qloo's taste links, so the family decides.",
            "remote", "musician", srcs,
            why=f"Qloo's taste graph links {anchors} with {d['name']}{score}.",
            label="likely", affinity=d["affinity"])
    return out


def _pick(cands):
    """Remote wishes first (lowest risk, works from anywhere). One slot is kept for the best
    in-person wish, shown last. If there are too many candidates the lowest-priority remote one drops."""
    remote = sorted([c for c in cands if c["mode"] == "remote"], key=lambda c: c["_p"])
    inperson = sorted([c for c in cands if c["mode"] == "in-person"], key=lambda c: c["_p"])[:1]
    chosen = remote[:MAX_WISHES - len(inperson)] + inperson
    return [{k: v for k, v in c.items() if k != "_p"} for c in chosen]


def _ok(w):
    return (w["mode"] in ("remote", "in-person") and w["title"] and w["description"]
            and w["maker_type"] and not BANNED.search(w["title"] + " " + w["description"]))


def _polish(wishes):
    """Optional: one LLM call to soften wording. Whole answer is rejected unless every wish is safe."""
    payload = [{"i": n, "title": w["title"], "description": w["description"]} for n, w in enumerate(wishes)]
    system = ("You rewrite short descriptions of gift ideas for a family who loves someone nearing the end of life. "
              "Tone: warm, plain, quiet. No emojis, no exclamation marks, no medical or clinical words, no promises. "
              "Keep every name exactly as written. If a description says it is a guess, keep saying so. "
              "If it says a family member is present, keep saying so. At most two sentences per description. "
              'Reply with JSON only: {"wishes": [{"i": 0, "title": "...", "description": "..."}]}')
    data = llm.chat_json(system, json.dumps({"wishes": payload}, ensure_ascii=False))
    try:
        rows = sorted(data["wishes"], key=lambda r: r["i"])
        if len(rows) != len(wishes):
            return wishes
        out = []
        for w, r in zip(wishes, rows):
            t, d = str(r["title"]).strip(), str(r["description"]).strip()
            text = t + " " + d
            orig = compact(w["title"] + " " + w["description"])
            names = [s for s in w["source_items"] if compact(s) and compact(s) in orig]
            if (not t or not d or len(t) > 70 or len(d) > 280 or "!" in text or BANNED.search(text)
                    or any(compact(s) not in compact(text) for s in names)
                    or (w["kind"] == "discovery" and "guess" not in text.lower())
                    or (w["mode"] == "in-person" and "family member" not in text.lower())):
                return wishes
            out.append({**w, "title": t, "description": d})
        return out
    except Exception:
        return wishes


def generate_wishes(items, person=None, client=None, use_llm=True):
    client = client or QlooClient()
    try:
        return _generate(items or [], person or {}, client, use_llm)
    except Exception:
        return {"wishes": [], "follow_up": FOLLOW_UP, "qloo_log": client.log}


def _generate(items, person, client, use_llm):
    by, basis = _anchors(items)
    total = sum(len(v) for v in by.values())
    if total == 0:
        return {"wishes": [], "follow_up": FOLLOW_UP, "qloo_log": client.log}
    known = {compact(i.get("name") or "") for i in items} | {compact(i.get("matched_name") or "") for i in items}
    discoveries = _discover(client, by, known) if basis == "told" else []
    wishes = _pick(_cands(by, basis, person, discoveries))
    if use_llm and wishes:
        wishes = _polish(wishes)
    wishes = [w for w in wishes if _ok(w)]
    return {"wishes": wishes, "follow_up": FOLLOW_UP if total < 3 else None, "qloo_log": client.log}