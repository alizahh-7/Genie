# Genie engine contract (v1.1)

Engine owner: Umaima. Backend owner: Zunairah.
The engine lives in `backend/engine/` as plain Python. The backend imports and calls these functions:

```python
from engine import resolve, build_portrait   # generate_wishes arrives on Day 4
```

The engine never touches the database. It returns data and the backend stores it.

## Rules
- Every function returns within a timeout (20 seconds overall for `build_portrait`) and **never raises** to the caller. Failure comes back as `found: false` or a lower `resolution_level`.
- All Qloo calls go through one cached client inside the engine.
- Keys come from environment variables only: `QLOO_API_KEY`, optional `LLM_API_KEY`.
- Domains are one of: `music`, `food`, `place`, `film`, `other`. (TV shows are treated as `film`.)
- `source_label` is one of: `told`, `likely`, `reacted`, `ai-only`.
- `resolution_level` is the fallback ladder level: 1 exact, 2 alternate spelling, 3 parent (artist/cuisine/city), 4 era-and-place, 5 not in Qloo, 6 API error or timeout.

## What changed from v1 (please confirm, Zunairah)
1. `resolve().entity.type` is now the Qloo kind: `artist`, `movie`, `tv_show`, `place`, `destination`, `locality` or `tag` (not `song`).
2. `resolve().affinity` is `null` for now. Search does not return an affinity score. It arrives with insights on Day 4.
3. `resolve()` also returns `popularity` (0-1) and `matched_via` (the alternate spelling or parent that matched, or `null`).
4. Items can have `qloo_entity_id: null` and `tags: []` (levels 5 and 6). The backend must accept that. For food, `qloo_entity_id` holds a tag id (`urn:tag:...`), because Qloo treats dishes as tags.
5. Portrait items carry one extra field, `matched_name`: what Qloo matched. The UI should show "Matched via Lata Mangeshkar" when it differs from `name`. If the backend rejects unknown fields, tell Umaima and it will be dropped.
6. `tags` are normalised to `{id, name, type}`, audience-style tags removed, capped at 30. **Tag ids differ between Qloo endpoints; compare tag names (case-insensitive) as well as ids when matching makers.**
7. `source_label` stays `told` when the family told us about an item, even if Qloo does not know it. `ai-only` is only for items the LLM itself suggests.
8. Circle answers: the engine detects the domain from the answer key (a key containing `music`, `food`, `place`, `film`). Please confirm the real keys.

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
Not found: `found: false`, `entity: null`, `tags: []`, level 5 (or 6 on error).

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
- At most 30 items. If fewer than 3 resolve, up to 6 level-4 items (`source_label: "likely"`) are added.
- `qloo_log.status` is one of `ok`, `cached`, `no results`, `timeout`, `network`, `HTTP <code>`, `no key`.

## 3. generate_wishes(portrait)  (Day 4, shape unchanged)
Input: the `items` list from `build_portrait`.
```
{
  "wishes": [{"title": "...", "description": "...", "mode": "remote", "source_items": ["Lag Jaa Gale", "haleem"]}],
  "qloo_log": [...]
}
```
`mode` is `remote` or `in-person`. Wishes never contain medical wording; tone rules from the project plan apply.

## Backend endpoints the engine output is stored through
- POST /persons/{id}/portrait (replaces all portrait items)
- POST /persons/{id}/wishes
- GET /persons/{id}/circle-responses (what the family circle said)