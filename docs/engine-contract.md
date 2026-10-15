# Genie engine contract (v1 draft)

Engine owner: Umaima. Backend owner: Zunairah.
The engine lives in `backend/engine/` as plain Python. The backend imports and calls these functions. The engine never touches the database. It returns data and the backend stores it.

## Rules
- Every function returns within a timeout (suggested: 20 seconds) and never raises to the caller. Failure comes back as `found: false` or a lower `resolution_level`.
- All Qloo calls go through one cached client inside the engine.
- Keys come from environment variables only: `QLOO_API_KEY`, `LLM_API_KEY`.
- Domains are one of: `music`, `food`, `place`, `film`, `other`.
- `source_label` is one of: `told`, `likely`, `reacted`, `ai-only`.
- `resolution_level` is the fallback ladder level, 1 (exact) to 6 (API error or timeout).

## 1. resolve(name, domain)
Returns:
{
  "input": "Lag Jaa Gale",
  "domain": "music",
  "found": true,
  "resolution_level": 1,
  "entity": {"id": "qloo_entity_id", "name": "Lag Jaa Gale", "type": "song"},
  "tags": [{"id": "tag_id", "name": "classic bollywood"}],
  "affinity": 0.82
}
Not found: `found: false`, `entity: null`, `tags: []`.

## 2. build_portrait(person, inputs)
person: {"first_name": "...", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
inputs: {
  "quick_facts": [{"domain": "music", "name": "Lag Jaa Gale"}],
  "circle_answers": [{"contributor": "Ayesha", "answers": {"music": "...", "food": "..."}}]
}
Returns:
{
  "items": [
    {
      "domain": "music",
      "name": "Lag Jaa Gale",
      "qloo_entity_id": "qloo_entity_id",
      "tags": [{"id": "tag_id", "name": "classic bollywood"}],
      "source_label": "told",
      "confidence": 0.9,
      "resolution_level": 1
    }
  ],
  "qloo_log": [{"step": "resolve", "request": "search: Lag Jaa Gale", "status": "ok", "ms": 312}]
}

## 3. generate_wishes(portrait)
Input: the `items` list from build_portrait.
Returns:
{
  "wishes": [
    {"title": "...", "description": "...", "mode": "remote", "source_items": ["Lag Jaa Gale", "haleem"]}
  ],
  "qloo_log": [...]
}
`mode` is `remote` or `in-person`.

## Backend endpoints the engine output is stored through
- POST /persons/{id}/portrait (replaces all portrait items)
- POST /persons/{id}/wishes
- GET /persons/{id}/circle-responses (what the family circle said)