# Genie engine contract (v1.4)

Engine owner: Umaima. Backend owner: Zunairah.
The engine lives in `backend/engine/` as plain Python. The backend imports and calls these functions:

```python
from engine import run_agent                                    # the one call for building a portrait and wishes
from engine import pick_reaction_cards, apply_reactions         # Reaction Mode
from engine import resolve, build_portrait, generate_wishes     # the pieces behind run_agent
```

The engine never touches the database. It returns data and the backend stores it.

## Rules
- Every function returns within a timeout and **never raises** to the caller. Failure comes back as `found: false`, a lower `resolution_level`, or fewer wishes. `build_portrait` has a 20 second overall limit. Uncached Qloo calls take about 3-6 seconds each, so the backend should run the engine in a worker thread or background task with its own timeout (worst case with repeated Qloo timeouts is around 30 seconds).
- All Qloo calls go through one cached client inside the engine.
- Keys and switches come from environment variables only: `QLOO_API_KEY`, and optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`, `WISH_POLISH`. Without the LLM variables everything still works.
- Domains are one of: `music`, `food`, `place`, `film`, `other`. (TV shows are treated as `film`.)
- `source_label` is one of: `told`, `likely`, `reacted`, `ai-only`.
- `resolution_level` is the fallback ladder level: 1 exact, 2 alternate spelling, 3 parent (artist/cuisine/city), 4 era-and-place, 5 not in Qloo, 6 API error or timeout.
- No Qloo response data may be stored in the public repository (Qloo's terms). Seed files and docs must not contain Qloo ids, result names or tag lists. Private database rows are fine.

## Status of the open questions
- **Confirmed by the backend owner:** the extra wish fields (`kind`, `maker_type`, `tags`, `basis`, `why`, `affinity`) are stored in new columns on `wish`, and the `maker_type` values match the maker types, so matching sends a wish only to makers of that type.
- **Still open:** (a) the real Wish Circle answer keys (the engine assumes keys containing `music`, `food`, `place`, `film`); (b) a `discovered` column on `wish` (see section 3); (c) where the Reaction Mode `tried` list is kept (section 5).

## What changed from v1
1. `resolve().entity.type` is now the Qloo kind: `artist`, `movie`, `tv_show`, `place`, `destination`, `locality` or `tag` (not `song`).
2. `resolve().affinity` stays `null`. Search does not return an affinity score. Affinity appears only on discovery wishes (section 3).
3. `resolve()` also returns `popularity` (0-1) and `matched_via` (the alternate spelling or parent that matched, or `null`).
4. Items can have `qloo_entity_id: null` and `tags: []` (levels 5 and 6). The backend must accept that.
5. **Food is a tag, not an entity.** For food items `qloo_entity_id` holds a tag id (`urn:tag:...`) and `entity.type` is `tag`. Entity ids are UUIDs. The matcher must not treat a `urn:tag:...` value as an entity id. Matching on tag *names* works for both.
6. Portrait items carry one extra field, `matched_name`: what Qloo matched. The UI should show "Matched via Lata Mangeshkar" when it differs from `name`.
7. `tags` are normalised to `{id, name, type}`, capped at 30, with audience-style tags removed. **New in v1.4:** tags with ageing, illness or end-of-life words in their name, and religion-plus-family/community labels, are also removed, so they never reach a family-facing screen or a match. **Tag ids differ between Qloo endpoints; compare tag names (case-insensitive) as well as ids when matching makers.**
8. `source_label` stays `told` when the family told us about an item, even if Qloo does not know it. `ai-only` is only for items the LLM itself suggests.
9. `generate_wishes` returns extra fields (`kind`, `maker_type`, `tags`, `basis`, `why`, `affinity`) and a top-level `follow_up`.
10. `run_agent(person, inputs)` is the single call to wire for building a portrait and wishes (section 4). Wish polish by the LLM is off by default in `run_agent`.
11. **New in v1.4:** Reaction Mode functions (section 5). The portrait item shape is unchanged, so no new columns are needed.

## 1. resolve(name, domain, hint=None)
`hint` is optional: an artist, cuisine or city to use at level 3.
Returns:
```
{
  "input": "<what was typed>",
  "domain": "music",
  "found": true,
  "resolution_level": 1,
  "entity": {"id": "<qloo id>", "name": "<qloo name>", "type": "artist"},
  "tags": [{"id": "...", "name": "...", "type": "..."}],
  "affinity": null,
  "popularity": 0.93,
  "matched_via": null
}
```
Not found: `found: false`, `entity: null`, `tags: []`, level 5 (or 6 on error). Inputs shorter than 2 characters are level 5.

Resolution rules (Qloo field mapping and type rules):
- `results[].entity_id` becomes `entity.id`, kept exactly as given. `results[].name` becomes `entity.name`.
- The result is chosen by entity **type**: artist for music, movie or tv_show for film, place, destination or locality for places, and a tag for food. Prefer the hit with a matching name, then one that has tags, then the most popular.
- Qloo has artists and places but no entities for songs. A song resolves through its artist (level 3), and `matched_via` says which one.
- Descriptive words are never added to the query.

## 2. build_portrait(person, inputs)
person: `{"first_name": "...", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}`
inputs:
```
{
  "quick_facts": [{"domain": "music", "name": "Lag Jaa Gale", "hint": "optional"}],
  "circle_answers": [{"contributor": "Ayesha", "answers": {"music": "...", "food": "..."}}]
}
```
Returns:
```
{
  "items": [
    {
      "domain": "music",
      "name": "Lag Jaa Gale",
      "qloo_entity_id": "<id or null>",
      "tags": [{"id": "...", "name": "...", "type": "..."}],
      "source_label": "told",
      "confidence": 0.63,
      "resolution_level": 3,
      "matched_name": "<name Qloo matched or null>"
    }
  ],
  "qloo_log": [{"step": "resolve", "request": "/search {...}", "status": "ok", "ms": 312}]
}
```
- At most 30 items. If fewer than 3 resolve, up to 6 level-4 items (`source_label: "likely"`, confidence 0.3) are added. Level 4 reflects the person's age bracket, region and language, not their era specifically, so some of these can look odd. The UI must show them clearly as "likely".
- `qloo_log.status` is one of `ok`, `cached`, `no results`, `timeout`, `network`, `HTTP <code>`, `no key`.
- Saving a portrait replaces the previous one, so rebuild with all items, not only the new ones.

## 3. generate_wishes(items, person=None)
Input: the `items` list from `build_portrait`, and the same `person` object (region is used to decide whether a place visit is local).
Returns:
```
{
  "wishes": [
    {
      "title": "Their songs, recorded for them",
      "description": "...",
      "mode": "remote",
      "source_items": ["Kishore Kumar", "Mohammed Rafi"],
      "kind": "music",
      "maker_type": "musician",
      "tags": [{"id": "...", "name": "..."}],
      "basis": "told",
      "why": null,
      "affinity": null
    }
  ],
  "follow_up": null,
  "qloo_log": [...]
}
```
- 3 to 5 wishes. Remote wishes come first; at most one in-person wish, always last.
- `mode` is `remote` or `in-person`.
- `source_items` are portrait item names, so a wish can be matched to portrait items by name. A wish's own items should always be used for matching, even if they are no longer in the portrait.
- `kind` is `music`, `food`, `place`, `story` or `discovery`. `maker_type` is `musician`, `home cook`, `storyteller` or `volunteer`.
- `tags` are merged from the source items, as `{id, name}`. Compare names as well as ids when matching makers.
- `basis` is `told` (from what the family told us) or `likely` (a Qloo discovery or an era-based portrait). The UI shows the same honesty labels as the portrait.
- Only `discovery` wishes carry `why` (a sentence naming the anchors Qloo weighted most) and `affinity` (Qloo's 0-1 match score). Both are `null` for other wishes. A discovery wish always says it is a guess.
- `follow_up` is a gentle question to show when the portrait has fewer than 3 usable items ("Is there a song or a place they loved?"), otherwise `null`.
- No wish contains medical or clinical wording. If Qloo or the LLM is down, wishes are still returned, without the discovery wish.
- Wording comes from fixed templates. The LLM may rewrite it only when polish is switched on, and each rewrite is checked; otherwise the template is kept. `run_agent` leaves polish off unless `WISH_POLISH=1`.
- Planned (not built): a `discovered` field on discovery wishes holding the discovered artist's name, so matching can look for makers who list that artist. It will be added once the `wish` table has a column for it.

## 4. run_agent(person, inputs)
The single call for building a portrait and wishes. `person` and `inputs` are exactly as in `build_portrait`. It runs `build_portrait`, then `generate_wishes` on the result, sharing one Qloo client and call log.
Returns:
```
{
  "items": [...],        # as in section 2: POST /persons/{id}/portrait
  "wishes": [...],       # as in section 3: POST /persons/{id}/wishes
  "follow_up": null,
  "steps": [
    {"id": "resolve", "title": "Resolve in Qloo",
     "summary": "Matched all 6 in Qloo (1 through an artist or parent).",
     "qloo_calls": 11, "cached": 11, "errors": 0}
  ],
  "qloo_log": [...],     # every Qloo call from both stages
  "timings": {"portrait_ms": 4200, "wishes_ms": 900, "total_ms": 5100}
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
```
{
  "cards": [
    {"name": "Kishore Kumar", "domain": "music", "source_label": "told",
     "prompt": "Play a short clip of Kishore Kumar.", "media_query": "Kishore Kumar"}
  ],
  "remaining": 5,
  "done": false
}
```
- At most 5 cards (default 4): sessions stay short. Told items come before guesses, domains are mixed, and a name is never repeated (`tried` is matched loosely by name, and items already `reacted` are skipped).
- `done` is true when nothing is left to show.

### apply_reactions(person, items, reactions, tried=(), client=None)
`reactions` is a list of `{"name": "...", "domain": "music" (optional), "reaction": "lit_up" | "no_reaction"}`.
Returns:
```
{
  "items": [...],        # the updated portrait: replace it with POST /persons/{id}/portrait
  "added": ["..."],      # new "likely" items from Qloo (up to 3)
  "removed": ["..."],    # guesses nobody reacted to
  "tried": ["..."],      # pass this back as `tried` next time
  "message": "Thank you. Genie has noted what they enjoyed.",
  "next": [...],         # the next cards, same shape as above
  "qloo_log": [...]
}
```
- `lit_up`: the item becomes `reacted` (UI label "They reacted to this") with higher confidence, even if the family had told us about it.
- `no_reaction`: a "likely" item is removed. An item the family told us stays unchanged. "No reaction" is never failure: the `message` is "That is okay. Let us try something else." when nothing lit up. Show `message` as written.
- If anything lit up, one Qloo discovery call adds up to 3 new "likely" artists (`resolution_level` 4, confidence 0.3). The portrait never exceeds 30 items. No Qloo call is made when nothing lit up.
- The input is not mutated, and unknown names or bad values are ignored. It never raises.
- **The engine does not store `tried`.** The caller keeps it for the session (frontend state), or the backend may keep it in a column if it needs to survive a reload.
- Interface safeguards from the project plan: a visible Stop button at all times, the family present, a few items at a time.

## 6. How the backend should call the engine
- Module path: `backend/engine/` (import `from engine import ...` with `backend/` on the path). `backend/requirements.txt` must include `requests` and `python-dotenv`.
- Typical flow: collect `quick_facts` and `circle_answers` (from `GET /persons/{id}/circle-responses`), call `run_agent` from a worker thread with your own timeout, save `items` with `POST /persons/{id}/portrait`, save `wishes` with `POST /persons/{id}/wishes`, then run matching.
- Return `steps`, `qloo_log` and `timings` to the frontend for the "what Genie did" panel and the live Qloo call panel. They do not need to be stored.
- A stateless `POST /agent/run` exists in `backend/routers/agent.py` for the "try it yourself" demo: it stores nothing and returns the `run_agent` result. Keep only one route per path (a second `/agent/run` would be shadowed by the first one registered).
- Qloo's cache lives on the server's disk and is wiped on a Render redeploy. After each deploy, run the demo person once to warm it.

## Backend endpoints the engine output is stored through
- POST /persons/{id}/portrait (replaces all portrait items)
- POST /persons/{id}/wishes
- GET /persons/{id}/circle-responses (what the family circle said)