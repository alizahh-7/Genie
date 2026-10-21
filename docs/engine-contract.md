# Genie engine contract (v1.5, updated Oct 20)

Engine owner: Umaima. Backend owner: Zunairah.

The engine lives in `backend/engine/` as plain Python. The backend imports and calls these functions:

```python
from engine import run_agent                                    # build a portrait and wishes in one call
from engine import pick_reaction_cards, apply_reactions         # Reaction Mode
from engine import side_by_side, generate_bedside_kit           # the comparison screen and the Bedside Kit
from engine import resolve, build_portrait, generate_wishes     # the pieces behind run_agent
```

The engine never touches the database. It returns data and the backend stores it. **Feature freeze:** no new functions are planned; only fixes and polish.

## Rules

- Every function returns within a timeout and **never raises** to the caller. Failure comes back as `found: false`, a lower `resolution_level`, fewer wishes, or `available: false`. `build_portrait` has a 20 second overall limit. Uncached Qloo calls take about 3-6 seconds each, so the backend should run the engine in a worker thread or background task with its own timeout (a dead Qloo now fails in about 14 seconds).
- All Qloo calls go through one cached client inside the engine.
- Keys and switches come from environment variables only: `QLOO_API_KEY`, and optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`, `WISH_POLISH`. Without the LLM variables everything still works, except the general AI's side of the comparison.
- Domains are one of: `music`, `food`, `place`, `film`, `other`. (TV shows are treated as `film`.)
- `source_label` is one of: `told`, `likely`, `reacted`, `ai-only`.
- `resolution_level` is the fallback ladder level: 1 exact, 2 alternate spelling, 3 parent (artist/cuisine/city), 4 era-and-place, 5 not in Qloo, 6 API error or timeout.
- Do not publish raw Qloo response data in the public repository. Keep provider-returned entity and tag identifiers, result names, tag lists, response payloads, and match scores out of public documentation, examples, fixtures, logs, and seed files. Use generic placeholders in examples. Keep any permitted provider data in the appropriate private runtime storage and follow Qloo's applicable terms.
- **LLM polish:** call `generate_wishes` with `use_llm=False` unless `WISH_POLISH=1`. Only `run_agent` applies this rule for you.

## Status of the open questions

- **Confirmed by the backend owner:** the extra wish fields (`kind`, `maker_type`, `tags`, `basis`, `why`, `affinity`) are stored in new columns on `wish`, and the `maker_type` values match the maker types, so matching sends a wish only to makers of that type.
- **Resolved:** (a) the Wish Circle answer keys are music, food, place, film and joy. The engine maps the first four, and reads joy only when the LLM is on. The backend keeps the Reaction Mode tried list nowhere: the frontend keeps it for the session and sends it back (question c). **Still open:** (b) a discovered column on wish (section 3, parked until after the freeze).

## What changed from v1

1. `resolve().entity.type` contains the normalized entity type selected by the engine.
2. `resolve().affinity` is `null` for ordinary resolution; affinity is used only for applicable discovery results.
3. `resolve()` returns a normalized popularity value and `matched_via` metadata where available.
4. Unresolved or failed lookups may return `entity: null` and an empty tag list. The backend must accept these cases.
5. Food items may resolve through a tag representation rather than a conventional entity. The matcher must distinguish tag references from entity references.
6. Portrait items carry `matched_name`, describing the item through which the engine resolved the input. The UI may show a generic “Matched via …” label when it differs from the user's original input.
7. Tags are normalized into internal objects, capped, and filtered to exclude unsuitable audience or sensitive categories. When matching, compare normalized tag names as well as identifiers where appropriate.
8. `source_label` remains `told` when the family supplied an item, even if the provider cannot resolve it. `ai-only` is reserved for items suggested by the LLM.
9. `generate_wishes` returns the additional wish metadata and a top-level `follow_up` field.
10. `run_agent(person, inputs)` is the single call for building a portrait and wishes. Wish polishing by the LLM is off by default.
11. Reaction Mode functions are available. The portrait item shape remains compatible with the existing backend storage.
12. `side_by_side` and `generate_bedside_kit` are available as stateless functions.

## 1. resolve(name, domain, hint=None)

`hint` is optional: an artist, cuisine or city to use at level 3.

Returns:

```python
{
    "input": "<user input>",
    "domain": "<domain>",
    "found": True,
    "resolution_level": 1,
    "entity": {"id": "<provider identifier>", "name": "<resolved name>", "type": "<normalized type>"},
    "tags": [{"id": "<tag identifier>", "name": "<tag name>", "type": "<tag type>"}],
    "affinity": None,
    "popularity": None,
    "matched_via": None
}
```

Not found: `found: false`, `entity: null`, `tags: []`, level 5 (or 6 on error). Inputs shorter than 2 characters are level 5.

Resolution rules:

- Map provider identifiers and names into the engine's internal entity representation.
- Normalize result types before selecting a result. Prefer the intended type and use documented fallback rules when no suitable direct result exists.
- When a lookup resolves through a related or parent item, record that fallback accurately.
- Do not add descriptive words to a query merely to force a result.
- Keep provider-specific result examples and response fields out of public documentation.

## 2. build_portrait(person, inputs)

person: `{"first_name": "...", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}`

inputs:

```python
{
    "quick_facts": [{"domain": "<domain>", "name": "<user-supplied item>", "hint": "optional"}],
    "circle_answers": [{"contributor": "<contributor>", "answers": {"music": "...", "food": "..."}}]
}
```

Returns:

```python
{
    "items": [
        {
            "domain": "<domain>",
            "name": "<user-supplied item>",
            "qloo_entity_id": "<provider identifier or null>",
            "tags": [{"id": "<tag identifier>", "name": "<tag name>", "type": "<tag type>"}],
            "source_label": "told",
            "confidence": None,
            "resolution_level": 3,
            "matched_name": "<resolved name or null>"
        }
    ],
    "qloo_log": [
        {"step": "resolve", "request": "<redacted>", "status": "ok", "ms": 0}
    ]
}
```
- At most 30 items, and the 30 includes the level-4 guesses. If fewer than 3 resolve, up to 6 level-4 items (`source_label: "likely"`, confidence 0.3) are added. A level-4 guess with ageing or heavy tags is skipped.
- Without the LLM, free-text circle answers are split into short names; segments with sentence words ("She sang along to Queen") are not turned into items.
- `qloo_log.status` is one of `ok`, `cached`, `no results`, `timeout`, `network`, `HTTP <code>`, `no key`.
- Saving a portrait replaces the previous one, so rebuild with all items, not only the new ones.

## 3. generate_wishes(items, person=None)

Input: the `items` list from `build_portrait`, and the same `person` object (region is used to decide whether a place visit is local).

Returns:

```python
{
    "wishes": [
        {
            "title": "Their songs, recorded for them",
            "description": "...",
            "mode": "remote",
            "source_items": ["<portrait item>", "<portrait item>"],
            "kind": "music",
            "maker_type": "musician",
            "tags": [{"id": "<tag identifier>", "name": "<tag name>"}],
            "basis": "told",
            "why": None,
            "affinity": None
        }
    ],
    "follow_up": None,
    "qloo_log": [...]
}
```

- 3 to 5 wishes. Remote wishes come first; at most one in-person wish, always last.
- `mode` is `remote` or `in-person`.
- `source_items` are portrait item names, so a wish can be matched to portrait items by name. A wish's own items should always be used for matching, even if they are no longer in the portrait.
- `kind` is `music`, `food`, `place`, `story` or `discovery`. `maker_type` is `musician`, `home cook`, `storyteller` or `volunteer`.
- `tags` are merged from the source items, as `{id, name}`. Compare names as well as ids when matching makers.
- `basis` is `told` (from what the family told us) or `likely` (a Qloo discovery or an era-based portrait). The UI shows the same honesty labels as the portrait.
- Only discovery wishes carry `why` and `affinity`, when available. These fields describe the discovery rationale and provider-derived score; keep actual values out of public examples.
- `follow_up` is a gentle question to show when the portrait has fewer than 3 usable items ("Is there a song or a place they loved?"), otherwise `null`.
- No wish contains medical or clinical wording. If Qloo or the LLM is down, wishes are still returned, without the discovery wish.
- Wording comes from fixed templates. The LLM may rewrite it only when polish is switched on, and each rewrite is checked; otherwise the template is kept.
- Parked until after the freeze: a `discovered` field on discovery wishes holding the discovered item's name, so matching can look for makers who list that item. It needs a column in the `wish` table first.

## 4. run_agent(person, inputs)

The single call for building a portrait and wishes. `person` and `inputs` are exactly as in `build_portrait`. It runs `build_portrait`, then `generate_wishes` on the result, sharing one Qloo client and call log.

Returns:

```python
{
    "items": [...],        # as in section 2: POST /persons/{id}/portrait
    "wishes": [...],       # as in section 3: POST /persons/{id}/wishes
    "follow_up": None,
    "steps": [
        {
            "id": "resolve",
            "title": "Resolve items",
            "summary": "<generic resolution summary>",
            "qloo_calls": None,
            "cached": None,
            "errors": None
        }
    ],
    "qloo_log": [...],     # every Qloo call from both stages
    "timings": {"portrait_ms": None, "wishes_ms": None, "total_ms": None}
}
```

- `steps` come in this order: `collect`, `resolve`, `expand`, `era` (only when the portrait was thin), `build`, `discover`, `wishes`. `qloo_calls`, `cached` and `errors` are `null` for steps that make no Qloo call.
- Step summaries are built from real results and written in the calm tone of the product, so they can be shown as they are.
- It never raises. If something unexpected fails it returns empty `items` and `wishes`, `follow_up` set, and an empty `steps` list.
- The backend endpoint that stores a person's portrait and wishes should call `run_agent` rather than composing `build_portrait` and `generate_wishes` itself, so it also gets the steps and timings.

## 5. Reaction Mode

For a person who cannot recall or speak. The frontend shows a few items, the family taps "lit up" or "no reaction", and the portrait learns. The engine does the logic only. Finding the clip or photo is the frontend's job (each card has a `media_query`).

### pick_reaction_cards(items, tried=(), n=4)

`items` are portrait items. `tried` is a list of names already shown in this session.

Returns:

```python
{
    "cards": [
        {
            "name": "<portrait item>",
            "domain": "<domain>",
            "source_label": "told",
            "prompt": "<generic prompt>",
            "media_query": "<search query>"
        }
    ],
    "remaining": 5,
    "done": False
}
```

- At most 5 cards (default 4): sessions stay short. Told items come before guesses, domains are mixed, and a name is never repeated (`tried` is matched loosely by name, and items already `reacted` are skipped).
- `done` is true when nothing is left to show.

### apply_reactions(person, items, reactions, tried=(), client=None)

`reactions` is a list of `{"name": "...", "domain": "music" (optional), "reaction": "lit_up" | "no_reaction"}`.

Returns:

```python
{
    "items": [...],        # the updated portrait: replace it with POST /persons/{id}/portrait
    "added": ["<new likely item>"],
    "removed": ["..."],    # guesses nobody reacted to
    "tried": ["..."],      # pass this back as `tried` next time
    "message": "Thank you. Genie has noted what they enjoyed.",
    "next": [...],         # the next cards, same shape as above
    "qloo_log": [...]
}
```

- `lit_up`: the item becomes `reacted` (UI label "They reacted to this") with higher confidence, even if the family had told us about it.
- `no_reaction`: a "likely" item is removed. An item the family told us stays unchanged. "No reaction" is never failure: the `message` is "That is okay. Let us try something else." when nothing lit up. Show `message` as written.
- If anything lit up, one Qloo discovery call adds up to 3 new "likely" items (`resolution_level` 4, confidence 0.3). The portrait never exceeds 30 items. No Qloo call is made when nothing lit up.
- The input is not mutated, and unknown names or bad values are ignored. It never raises.
- **The engine does not store `tried`.** The caller keeps it for the session (frontend state), or the backend may keep it in a column if it needs to survive a reload.
- Interface safeguards from the project plan: a visible Stop button at all times, the family present, a few items at a time.

## 6. side_by_side(person, inputs, client=None)

The comparison screen: a general AI's wishes next to Genie's, from the same facts. `person` and `inputs` are exactly as in `build_portrait`.

Returns:

```python
{
    "inputs_given": {
        "first_name": "<first name>",
        "birth_year": None,
        "region": "<region>",
        "language": "<language>",
        "favourites": ["<user-supplied item>", "<user-supplied item>"],
        "family_notes": 0
    },
    "generic": {
        "available": True,
        "wishes": [{"title": "...", "description": "...", "mode": "remote", "basis": None}],
        "filtered": 0,
        "message": None
    },
    "genie": {"wishes": [...], "follow_up": None, "steps": [...], "qloo_log": [...], "timings": {...}},
    "evidence": {
        "genie_wishes": None,
        "genie_wishes_with_taste_tags": None,
        "genie_told_items": None,
        "genie_told_items_found_in_qloo": None,
        "genie_qloo_calls": None,
        "genie_discovery": None,
        "generic_wishes": None,
        "generic_taste_evidence": "<generic description>"
    },
    "note": "Both were given the same facts. Genie adds taste links, an honest label for where each wish came from, and a maker type it can match to a real Wish Maker."
}
```

- **Fair by design:** the general AI is given exactly the facts the family gave and no Qloo data. `inputs_given` shows what both received.
- The general AI's wishes are held to the same tone rule as Genie's (no medical wording, no exclamation marks). `filtered` counts how many were dropped. `basis` is always `null`: it makes no claim about where a wish came from.
- If the general AI does not answer in time, `generic.available` is `false` and `generic.message` says so ("The general AI did not answer in time. Please try again."). Genie's side is still complete. Nothing is invented. `genie_discovery` is `null` when there was no discovery wish.
- `genie` has the same shapes as `run_agent` (without `items`). The two sides run in parallel. The general AI's answer is cached per prompt, so a demo person can be pre-warmed.
- Show `note` and the `evidence` numbers as written. Never rewrite them to claim more.

## 7. generate_bedside_kit(person, items)

The kit for wishes in a care room. `items` are portrait items. Comfort and connection only, never treatment. Templates, no LLM.

Returns:

```python
{
    "title": "Bedside kit for <person>",
    "intro": "Small things for the room, from what they loved. Take only what feels right, and skip anything that does not.",
    "playlist": {
        "title": "A gentle playlist",
        "how_to": "Start with the ones they reacted to or the family told us about. Keep the volume low, and stop whenever they or you would like to.",
        "tracks": [{"name": "<portrait item>", "basis": "told", "label": "Told by family"}],
        "empty_note": None
    },
    "small_changes": [{"text": "...", "because": "<portrait item>"}],
    "visitors": [{"text": "...", "because": "general"}],
    "note": "Genie is not a medical service. For questions about care, please speak with the care team.",
    "based_on": None
}
```

- `tracks` are names to search for in a music app (artists or the song names the family gave), not recordings. Order: reacted, then told, then at most 3 guesses (`basis: "likely"`, label "A guess, from their era and region"). Up to 10, no repeats. `empty_note` is set when there are none.
- `small_changes` and `visitors` have at most 6 entries each. `because` is the portrait item the line came from, or `"general"`. A food suggestion always includes "please ask the care team before bringing any food or drink".
- No medical or clinical wording and no exclamation marks outside `note`. Show `note` on the screen as written.
- With an empty or junk portrait it still returns a kit with the general suggestions. It never raises.

## 8. How the backend should call the engine

- Module path: `backend/engine/` (import `from engine import ...` with `backend/` on the path). `backend/requirements.txt` must include `requests` and `python-dotenv` and `psycopg`.
- Typical flow: collect `quick_facts` and `circle_answers` (from `GET /persons/{id}/circle-responses`), call `run_agent` from a worker thread with your own timeout, save `items` with `POST /persons/{id}/portrait`, save `wishes` with `POST /persons/{id}/wishes`, then run matching.
- Return `steps`, `qloo_log` and `timings` to the frontend for the "what Genie did" panel and the live Qloo call panel. They do not need to be stored.
- **Stateless routes** in `backend/routers/agent_demo.py` (nothing stored): `POST /agent/run`, `POST /agent/reaction-cards`, `POST /agent/reactions`, `POST /agent/compare` (same body as `/agent/run`), and `POST /agent/bedside-kit` (body: `person` and `items`). These power the "try it yourself" demo, Reaction Mode, the comparison screen and the Bedside Kit. The person-bound routes under `/persons/{id}/...` are in `routers/agent.py`. Keep only one route per path.
- Per-IP rate limits cover `/agent/*` and the stored agent routes: about 10 per minute, and about 5 per minute for compare. Every call spends Qloo quota, and compare also spends an LLM call.
- A private snapshot of the engine's cache is kept in the database (table engine_cache) and restored at start-up when ENGINE_CACHE_RESTORE=1. Uncached requests still take 3 to 6 seconds, so after each deploy run the demo people once (including `/agent/compare`).

## Backend endpoints the engine output is stored through

- POST /persons/{id}/portrait (replaces all portrait items)
- POST /persons/{id}/wishes
- GET /persons/{id}/circle-responses (what the family circle said)
