# Genie engine: documentation

**Owner:** Umaima. **Folder:** `backend/engine/`. **Status:** Days 1-3 complete (resolve, fallback ladder, portrait builder). Wish generation is Day 4.

The engine is plain Python. It talks to Qloo (and optionally an LLM), and returns data. **It never touches the database**: the backend calls it and stores what it returns. See `docs/engine-contract.md` for the exact input/output shapes.

---

## 1. What the engine does

Genie turns "what a person loved" into a Taste Portrait. The engine does the Qloo-facing part:

1. **Collect** names from quick facts and Wish Circle answers.
2. **Understand** free text (LLM, optional) and normalise spellings.
3. **Resolve** each name to a Qloo entity or tag, with a fallback ladder so nothing fails empty.
4. **Expand** each resolved item into Qloo taste tags.
5. **Label** every item with where it came from and how confident we are.
6. **Fill gaps** with era-and-place items when the portrait is thin.
7. **Log** every Qloo call so the UI can show a live "Qloo call log".

Not built yet (Day 4+): `generate_wishes`, affinity scores, cross-domain "people like them also love", Reaction Mode logic, Bedside Kit.

## 2. Files

| File | Purpose |
|---|---|
| `qloo_client.py` | The only place that calls Qloo. Disk cache, timeouts, retries, call log. Also shared helpers (`score`, `clean_tags`, `as_list`). |
| `resolve.py` | `resolve(name, domain)`: the fallback ladder (levels 1, 2, 3, 5, 6). |
| `portrait.py` | `build_portrait(person, inputs)`: collects, resolves in parallel, labels, scores, expands (level 4). |
| `llm.py` | Optional LLM helper: alternate spellings, parent artist/cuisine, extracting names from free text. |
| `__init__.py` | Exposes `QlooClient`, `resolve`, `build_portrait` so the backend can `from engine import ...`. |
| `test_engine.py` | Ladder checks and the "Nani" demo portrait. Run: `python engine\test_engine.py` from `backend/`. |
| `coverage_test_v2.py` | The original 40-input coverage test and Qloo probe (`--probe`). |
| `coverage_run.py` | Re-runs the same 40 inputs through the real ladder. |

Git-ignored (never commit): `engine/_cache/`, `engine/_coverage/`, `engine/_nani_portrait.json`. Use one rule: `backend/engine/_*`.

## 3. Setup

```
cd backend
pip install requests python-dotenv
```

`backend/.env` (never committed; names are in `.env.example`):

```
QLOO_API_KEY=...                         # hackathon key
QLOO_API_URL=https://hackathon.api.qloo.com
LLM_API_KEY=...                          # optional, see section 8
LLM_MODEL=claude-haiku-5-5               # optional
```

The hackathon key only works against `https://hackathon.api.qloo.com`. Staging and production return 401.

## 4. Usage (what the backend calls)

```python
from engine import QlooClient, resolve, build_portrait

person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
inputs = {
  "quick_facts": [{"domain": "music", "name": "Lag Jaa Gale"}],
  "circle_answers": [{"contributor": "Ayesha", "answers": {"music": "Kishore Kumar and Lata Mangeshkar"}}],
}
result = build_portrait(person, inputs)   # {"items": [...], "qloo_log": [...]}
```

Both functions **never raise**. Failures come back as a lower `resolution_level`.

## 5. The fallback ladder

| Level | Situation | What the engine does | Item shown as |
|---|---|---|---|
| 1 | Exact entity found | Use it with its Qloo tags | Qloo match |
| 2 | Spelling or script differs | Try aliases (built-in table, plus LLM if configured) | Qloo match (alternate spelling) |
| 3 | Still not found | Search the parent: song to artist, dish to cuisine, spot to city/landmark | "Matched via Lata Mangeshkar" |
| 4 | Portrait thin (fewer than 3 resolved items) | Ask Qloo for popular artists/films for the person's age bracket, region and language | "Likely from their era and region" |
| 5 | Qloo has nothing useful | Keep the item, no entity, no tags | "Not in Qloo": excluded from Qloo scoring |
| 6 | API error, timeout or no key | Same, but flagged as an error | Friendly retry message, never a raw error |

Notes:
- Level 4 is decided in `portrait.py` (it is about the whole person). Levels 1, 2, 3, 5, 6 are in `resolve.py`.
- **Thin-hit rule:** an exact hit with fewer than 3 usable tags is probably a namesake or tribute act (for example an artist literally named "Hotel California"). If a parent is known, the parent wins and the item is level 3.
- **Songs:** Qloo indexes artists, not songs. A song input will normally land at level 3 on its artist. The UI wording must say "via the artist", never "we found the song".
- `source_label` stays `told` when the family told us about the item, even if Qloo does not know it. `ai-only` is reserved for things the LLM itself suggests.

## 6. Confidence

`confidence = source base x level factor`

| Source | Base | | Level | Factor |
|---|---|---|---|---|
| told | 0.90 | | 1 | 1.00 |
| reacted | 0.95 | | 2 | 0.95 |
| likely | 0.50 | | 3 | 0.70 |
| ai-only | 0.30 | | 4 | 0.60 |
| | | | 5, 6 | 0.50 |

Example: a told song matched via its artist (level 3) is 0.9 x 0.7 = 0.63.

## 7. Caching and compliance

- Every Qloo response is cached on disk in `engine/_cache/` (one JSON per request, keyed by a hash). 404 "no results" are cached too. LLM answers are cached the same way.
- Qloo's developer guide allows private server-side caching with no time limit but **forbids storing Qloo response data in a public repository**. So: the cache, coverage outputs and portrait dumps are git-ignored, and **no Qloo data may appear in docs, screenshots of raw JSON, or seed files in the repo**.
- Consequence for deployment: Render's free disk is wiped on redeploy. Demo personas must be pre-warmed from a **private** store (a table in the private Supabase database), not from the repo. Planned for Day 8, to agree with Zunairah.
- Observed latency: an uncached Qloo call takes roughly 3-6 seconds, a cached one under 100 ms. Portrait items are resolved in parallel (5 workers) with a 20 second overall limit. Anything still pending at the limit becomes level 6.

## 8. LLM (optional but strongly recommended)

Without `LLM_API_KEY` everything still works, using built-in aliases and parent hints for the known test cases. What you lose:
- Free-text circle answers: the fallback splits on commas, "and" and line breaks and keeps only short (five words or fewer) segments. Long sentences yield nothing rather than junk. Real answers need the LLM.
- Level 2/3 for unseen names: only names in the built-in tables get alternate spellings or a parent.

The LLM receives only names of songs, artists, dishes, places and films (plus the person's region and language), never surnames, contact details or health data. The Wish Circle consent note already tells contributors an AI service processes answers.

## 9. What we learned about Qloo (so nobody repeats it)

- **Endpoints used:** `GET /search` (entities), `GET /v2/tags` (tags, used for food), `GET /v2/insights` (era/place and, from Day 4, wishes). All are GET with the key in the `X-Api-Key` header.
- **`/search` types are not the same as insights `filter.type`.** `/search` also accepts legacy types such as `urn:entity:locality`; `/v2/insights` does not accept locality as a result type. Insights accepts: artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game.
- **Food is a tag, not an entity.** "Haleem" resolves to a `urn:tag:specialty_dish:place:...` id. Use it in `signal.interests.tags` or `filter.tags`, never in `signal.interests.entities`.
- **Entities are UUIDs, tags are URNs.**
- **Tag ids differ between endpoints.** `/search` returns tags as `urn:tag:genre:rock` while `/v2/insights` returns the same concept as `urn:tag:genre:music:rock`. **Do not match makers to portrait items by raw tag id only; also compare normalised tag names.** This matters for Day 4 matching.
- **Tag field name differs:** `tag_id` in `/search`, `id` in `/v2/insights`. `clean_tags()` handles both.
- **Not every search hit has tags.** Duet entries (for example "A, B") and some namesakes have none. The resolver prefers hits that have tags, then higher popularity.
- **Invalid parameters are silently ignored.** An empty 200 response usually means a parameter is not valid for that `filter.type`, not that data is missing. Check the Entity Type Parameter Guide. Where the guide and the OpenAPI definition disagree (for example Resy filters, price range names), trust the OpenAPI definition.
- **`destination` insights require `signal.interests.entities`.**
- **`feature.explainability=true`** returns per-result scores for which input entities contributed. This is the data for the "why this wish" and side-by-side screens.
- **Limits:** `take` max 50. `/search` can return 429 (rate limit); the client retries with backoff. Hackathon quotas are high; raise them via Discord `#api-help`.
- **Wrong-looking entity names exist.** Some search hits carry another entity's description (a namesake rapper carrying a legendary singer's description). Always match by name and tags, never trust the description.

## 10. Known limits and open items

- Level 4 (era and place) is implemented but **not yet verified against live Qloo** (the Nani test resolved enough items to skip it). It might skew Western for older Indian personas. The language tag hints in `portrait.py` (`LANG_TAGS`) are unverified guesses.
- The LLM path is **untested** until a key is set.
- `affinity` in `resolve()` is `null`. Search does not return it. Real affinity needs an insights call (Day 4).
- Circle answer question keys are assumed to contain `music`, `food`, `place`, `film`. Confirm against `GET /circle/{token}` with Zunairah.
- No automated tests yet beyond `test_engine.py` and an offline check of the thin-hit rule.
- Two items with the same Qloo entity can appear in one portrait (for example a song matched via Lata Mangeshkar and Lata Mangeshkar herself). The UI should tolerate it; dedupe on entity id if it looks odd.

## 11. Next steps (from the 10-day plan)

| Day | Engine task |
|---|---|
| 4 | `generate_wishes`: insights using the portrait as signals (cross-domain), a realism filter, explainability; confirm tag-name matching with Zunairah's maker matching |
| 5 | Orchestrate the full agent for demo person 1; make the agent steps visible; first live deploy |
| 6 | Reaction Mode logic |
| 7 | Feature freeze; side-by-side screen (generic AI vs Genie); Bedside Kit generator |
| 8 | Caching, timeouts, error states, second demo person, odd-input tests, pre-warm store |
| 9 | Judge test with 10 varied people; technical README and Qloo notes for the Devpost description |