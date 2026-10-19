"""Bedside Kit (Day 7). Comfort and connection only, never treatment. Templates, no LLM, so every line can be
read aloud and approved by the team. Never raises."""
try:
    from .qloo_client import compact
except ImportError:
    from qloo_client import compact

NOTE = "Genie is not a medical service. For questions about care, please speak with the care team."
BASIS = {"reacted": "They reacted to this", "told": "Told by family", "likely": "A guess, from their era and region"}
RANK = {"reacted": 0, "told": 1, "likely": 2}
MAX_TRACKS = 10
MAX_GUESSES = 3


def generate_bedside_kit(person=None, items=None):
    try:
        return _kit(person or {}, items or [])
    except Exception:
        return _kit({}, [])


def _kit(person, items):
    name = str(person.get("first_name") or "").strip()
    who = name or "them"
    language = str(person.get("language") or "").strip()
    usable = [i for i in items if isinstance(i, dict) and i.get("name") and i.get("source_label") in RANK]
    usable.sort(key=lambda i: (RANK[i["source_label"]], -(i.get("confidence") or 0)))
    by = {d: [i for i in usable if i.get("domain") == d] for d in ("music", "food", "place", "film")}

    tracks, seen, guesses = [], set(), 0
    for i in by["music"]:
        k = compact(str(i["name"]))
        if not k or k in seen:
            continue
        if i["source_label"] == "likely":
            if guesses >= MAX_GUESSES:
                continue
            guesses += 1
        seen.add(k)
        tracks.append({"name": str(i["name"]), "basis": i["source_label"], "label": BASIS[i["source_label"]]})
        if len(tracks) >= MAX_TRACKS:
            break
    playlist = {
        "title": "A gentle playlist",
        "how_to": ("Start with the ones they reacted to or the family told us about. Keep the volume low, and stop "
                   "whenever they or you would like to."),
        "tracks": tracks,
        "empty_note": None if tracks else "Add a song or a singer they loved, and Genie will fill this in.",
    }

    changes = []
    if tracks:
        changes.append({"text": f"Let {tracks[0]['name']} play softly while you sit with {who}.", "because": tracks[0]["name"]})
    if by["food"]:
        dish = by["food"][0]["name"]
        changes.append({"text": (f"Keep a small reminder of {dish} nearby, such as a recipe card or a photo. "
                                 "Please ask the care team before bringing any food or drink."), "because": dish})
    if by["place"]:
        place = by["place"][0]["name"]
        changes.append({"text": f"Place a photo of {place} where {who} can see it.", "because": place})
    if by["film"]:
        film = by["film"][0]["name"]
        changes.append({"text": f"If {who} would like it, watch a short scene from {film} together.", "because": film})
    changes.append({"text": "Open the curtains for daylight if they like it, and keep the room as quiet and familiar as you can.",
                    "because": "general"})
    changes.append({"text": "Bring a familiar blanket, shawl or cushion from home.", "because": "general"})

    visitors = []
    if tracks:
        visitors.append({"text": f"Hum along to {tracks[0]['name']} together, only if it feels natural.",
                 "because": tracks[0]["name"]})
    topic = next((by[d][0]["name"] for d in ("food", "place", "music", "film") if by[d]), None)
    if topic:
        visitors.append({"text": f"Share a short memory about {topic}.", "because": topic})
    if language:
        visitors.append({"text": f"Use {language} if that is how you usually talk together.", "because": "general"})
    visitors.append({"text": "Tell them who is here, in a calm voice, and sit close if they like it.", "because": "general"})
    visitors.append({"text": "Short visits are fine. Leave when you are ready; you do not need to stay long.", "because": "general"})

    return {
        "title": f"Bedside kit for {name}" if name else "Bedside kit",
        "intro": "Small things for the room, from what they loved. Take only what feels right, and skip anything that does not.",
        "playlist": playlist,
        "small_changes": changes[:6],
        "visitors": visitors[:6],
        "note": NOTE,
        "based_on": len(usable),
    }