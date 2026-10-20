"""Side-by-side (Day 7): what a general AI suggests next to what Genie suggests, from the SAME facts.
Fair by design: the general AI gets exactly what the family gave (names, birth year, region, language,
favourites, circle notes) and no Qloo data. It is held to the same tone filter as Genie's wishes. If it does
not answer, we say so instead of inventing a result. Never raises."""
import json
from concurrent.futures import ThreadPoolExecutor

try:
    from .agent import run_agent
    from .qloo_client import QlooClient
    from .wishes import BANNED
    from . import llm
except ImportError:
    from agent import run_agent
    from qloo_client import QlooClient
    from wishes import BANNED
    import llm

SYSTEM = ("You suggest personal last wishes that a family could give someone they love who is nearing the end of life. "
          "Use only the facts given. Suggest 5 wishes. Tone: warm, plain, quiet. No emojis, no exclamation marks, "
          "no medical or clinical words. "
          'Reply with JSON only: {"wishes": [{"title": "...", "description": "...", "mode": "remote" or "in-person"}]}')
UNAVAILABLE = "The general AI did not answer in time. Please try again."
NOTE = ("Both were given the same facts. Genie adds Qloo's taste links, an honest label for where each wish "
        "came from, and a maker type it can match to a real Wish Maker.")


def _facts(inputs):
    fav, notes = [], []
    for q in inputs.get("quick_facts") or []:
        if isinstance(q, dict) and q.get("name"):
            fav.append(str(q["name"]).strip()[:80])
    for c in inputs.get("circle_answers") or []:
        answers = c.get("answers") if isinstance(c, dict) else None
        if isinstance(answers, dict):
            notes += [str(t).strip()[:500] for t in answers.values() if t]
    return fav[:20], notes[:10]


def _is_demo(person, fav, notes):
    """Only the two fictional demo people are cached. A typed person's answer can contain a first name."""
    try:
        try:
            from .personas import PERSONAS
        except ImportError:
            from personas import PERSONAS
        for spec in PERSONAS.values():
            p, i = spec["person"], spec["inputs"]
            f2, n2 = _facts(i)
            if (person.get("first_name") == p["first_name"] and person.get("birth_year") == p["birth_year"]
                    and person.get("region") == p["region"] and person.get("language") == p["language"]
                    and fav == f2 and notes == n2):
                return True
    except Exception:
        pass
    return False


def generic_wishes(person, inputs):
    """A plain LLM answer from the same facts, no Qloo. Returns {available, wishes, filtered, message}."""
    try:
        fav, notes = _facts(inputs or {})
        person = person or {}
        payload = {"first_name": person.get("first_name"), "birth_year": person.get("birth_year"),
                   "region": person.get("region"), "language": person.get("language"),
                   "favourites": fav, "family_notes": notes}
        data = llm.chat_json(SYSTEM, json.dumps(payload, ensure_ascii=False), max_tokens=2000, timeout=20,
                             cache=_is_demo(person, fav, notes))
        rows = data.get("wishes") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            return {"available": False, "wishes": [], "filtered": 0, "message": UNAVAILABLE}
        out, filtered = [], 0
        for w in rows[:5]:
            if not isinstance(w, dict):
                continue
            t, d = str(w.get("title") or "").strip(), str(w.get("description") or "").strip()
            text = t + " " + d
            if not t or not d:
                continue
            if "!" in text or BANNED.search(text):
                filtered += 1
                continue
            mode = w.get("mode") if w.get("mode") in ("remote", "in-person") else "remote"
            out.append({"title": t[:120], "description": d[:400], "mode": mode, "basis": None})
        if not out:
            return {"available": False, "wishes": [], "filtered": filtered, "message": UNAVAILABLE}
        return {"available": True, "wishes": out, "filtered": filtered, "message": None}
    except Exception:
        return {"available": False, "wishes": [], "filtered": 0, "message": UNAVAILABLE}


def _evidence(genie, generic):
    wishes = genie.get("wishes") or []
    told = [i for i in (genie.get("items") or []) if i.get("source_label") in ("told", "reacted")]
    disc = next((w for w in wishes if w.get("kind") == "discovery"), None)
    return {
        "genie_wishes": len(wishes),
        "genie_wishes_with_taste_tags": sum(1 for w in wishes if w.get("tags")),
        "genie_told_items": len(told),
        "genie_told_items_found_in_qloo": sum(1 for i in told if i.get("qloo_entity_id")),
        "genie_qloo_calls": len(genie.get("qloo_log") or []),
        "genie_discovery": ({"title": disc.get("title"), "why": disc.get("why"), "affinity": disc.get("affinity")}
                            if disc else None),
        "generic_wishes": len(generic.get("wishes") or []),
        "generic_taste_evidence": "none (no Qloo data was given)",
    }


def side_by_side(person, inputs, client=None):
    person, inputs = person or {}, inputs or {}
    client = client or QlooClient()
    fav, notes = _facts(inputs)
    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            f_generic = ex.submit(generic_wishes, person, inputs)
            f_genie = ex.submit(run_agent, person, inputs, client)
            genie, generic = f_genie.result(), f_generic.result()
    except Exception:
        genie = {"items": [], "wishes": [], "follow_up": None, "steps": [], "qloo_log": client.log, "timings": {}}
        generic = {"available": False, "wishes": [], "filtered": 0, "message": UNAVAILABLE}
    return {
        "inputs_given": {"first_name": person.get("first_name"), "birth_year": person.get("birth_year"),
                         "region": person.get("region"), "language": person.get("language"),
                         "favourites": fav, "family_notes": len(notes)},
        "generic": generic,
        "genie": {k: genie.get(k) for k in ("wishes", "follow_up", "steps", "qloo_log", "timings")},
        "evidence": _evidence(genie, generic),
        "note": NOTE,
    }