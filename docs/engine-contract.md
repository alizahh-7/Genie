# Genie engine contract (v1.2)

Engine owner: Umaima. Backend owner: Zunairah.
The engine lives in `backend/engine/` as plain Python. The backend imports and calls these functions:

```python
from engine import resolve, build_portrait, generate_wishes
```

The engine never touches the database. It returns data and the backend stores it.

## Rules
- Every function returns within a timeout and **never raises** to the caller. Failure comes back as `found: false`, a lower `resolution_level`, or fewer wishes. `build_portrait` has a 20 second overall limit. Uncached Qloo calls take about 3-6 seconds each, so the backend should run the engine in a worker thread or background task with its own timeout (worst case with repeated Qloo timeouts is around 30 seconds).
- All Qloo calls go through one cached client inside the engine.
- Keys come from environment variables only: `QLOO_API_KEY`, and optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`. Without the LLM variables everything still works.
- Domains are one of: `music`, `food`, `place`, `film`, `other`. (TV shows are treated as `film`.)
- `source_label` is one of: `told`, `likely`, `reacted`, `ai-only`.
- `resolution_level` is the fallback ladder level: 1 exact, 2 alternate spelling, 3 parent (artist/cuisine/city), 4 era-and-place, 5 not in Qloo, 6 API error or timeout.
- No Qloo response data may be stored in the public repository (Qloo's terms). Seed files and docs must not contain Qloo ids, result names or tag lists. Private database rows are fine.

## What changed from v1 (please confirm, Zunairah)
1. `resolve().entity.type` is now the Qloo kind: `artist`, `movie`, `tv_show`, `place`, `destination`, `locality` or `tag` (not `song`).
2. `resolve().affinity` stays `null`. Search does not return an affinity score. Affinity appears only on discovery wishes (section 3).
3. `resolve()` also returns `popularity` (0-1) and `matched_via` (the alternate spelling or parent that matched, or `null`).
4. Items can have `qloo_entity_id: null` and `tags: []` (levels 5 and 6). The backend must accept that.
5. **Food is a tag, not an entity.** For food items `qloo_entity_id` holds a tag id (`urn:tag:...`) and `entity.type` is `tag`. Entity ids are UUIDs. The matcher must not treat a `urn:tag:...` value as an entity id (for example, do not compare it to a maker's entity ids). Matching on tag *names* works for both.
6. Portrait items carry one extra field, `matched_name`: what Qloo matched. The UI should show "Matched via Lata Mangeshkar" when it differs from `name`. If the backend rejects unknown fields, tell Umaima and it will be dropped.
7. `tags` are normalised to `{id, name, type}`, audience-style tags removed, capped at 30. **Tag ids differ between Qloo endpoints; compare tag names (case-insensitive) as well as ids when matching makers.**
8. `source_label` stays `told` when the family told us about an item, even if Qloo does not know it. `ai-only` is only for items the LLM itself suggests.
9. Circle answers: the engine detects the domain from the answer key (a key containing `music`, `food`, `place`, `film`). The "what made them light up" answer is not mapped to a domain. Please confirm the real keys.
10. `generate_wishes` returns extra fields (`kind`, `maker_type`, `tags`, `basis`, `why`, `affinity`) and a top-level `follow_up`. The `wish` table currently holds only title, description, mode and source_items, so please either add columns (or one JSON column) for the extra fields or confirm that they are ignored. `why` and `affinity` are needed later for the side-by-side screen.
11. `maker_type` values are `musician`, `home cook`, `storyteller`, `volunteer`. Please confirm they match the `type` values in `wish_maker`, or tell Umaima which names to use.

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
- At most 30 items. If fewer than 3 resolve, up to 6 level-4 items (`source_label: "likely"`, confidence 0.3) are added. Level 4 reflects the person's age bracket, region and language, not their era specifically.
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

## 4. How the backend should call the engine
- Module path: `backend/engine/` (import `from engine import ...` with `backend/` on the path).
- Typical flow: collect `quick_facts` and `circle_answers` (from `GET /persons/{id}/circle-responses`), call `build_portrait`, save `items` with `POST /persons/{id}/portrait`, call `generate_wishes(items, person)`, save with `POST /persons/{id}/wishes`, then run matching.
- Return the `qloo_log` from both calls to the frontend for the live Qloo call panel.
- Reaction Mode will need a function that takes reactions and returns an updated portrait. Its signature is agreed on Day 6.

## Backend endpoints the engine output is stored through
- POST /persons/{id}/portrait (replaces all portrait items)
- POST /persons/{id}/wishes
- GET /persons/{id}/circle-responses (what the family circle said)