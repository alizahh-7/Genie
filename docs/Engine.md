# Genie engine: documentation

**Owner:** Umaima. **Folder:** `backend/engine/`. **Status:** Days 1-6 complete on the engine side: resolve, fallback ladder, portrait builder, wish generation, one end-to-end entry point with visible steps (`run_agent`), and Reaction Mode logic. Day 7 is the side-by-side screen and the Bedside Kit.

The engine is plain Python. It talks to Qloo (and optionally an LLM) and returns data. **It never touches the database**: the backend calls it and stores what it returns. See `docs/engine-contract.md` for the exact input/output shapes, and `docs/umaima-engine-report-days-1-6.md` for the full work report.

---

## 1. What the engine does

Genie turns "what a person loved" into a Taste Portrait and then into wishes. The engine does the Qloo-facing part:

1. **Collect** names from quick facts and Wish Circle answers.
2. **Understand** free text (LLM, optional) and normalise spellings.
3. **Resolve** each name to a Qloo entity or tag, with a fallback ladder so nothing fails empty.
4. **Expand** each resolved item into Qloo taste tags.
5. **Label** every item with where it came from and how confident we are.
6. **Fill gaps** with era-and-place items when the portrait is thin.
7. **Generate wishes** from the portrait, including one Qloo "people like them also love" discovery.
8. **Explain** what it did as a short list of steps built from real counts.
9. **React**: choose a few items to show a person who cannot speak, take "lit up" or "no reaction" taps, and refresh the portrait.
10. **Log** every Qloo call so the UI can show a live "Qloo call log".

Not built yet: Bedside Kit and the side-by-side screen (Day 7).

## 2. Files

| File | Purpose |
|---|---|
| `qloo_client.py` | The only place that calls Qloo. Disk cache, timeouts, retries, call log. Shared helpers (`score`, `clean_tags`, `as_list`). `clean_tags` also removes audience tags and tags that must not reach a family-facing screen (see 9). |
| `resolve.py` | `resolve(name, domain)`: the fallback ladder (levels 1, 2, 3, 5, 6), alias and parent tables, short-input guard. |
| `portrait.py` | `build_portrait(person, inputs)`: collects, resolves in parallel, labels, scores, expands (level 4, with per-language Qloo tags). |
| `wishes.py` | `generate_wishes(items, person)`: 3-5 template-based wishes, Qloo discovery with explainability, realism filter, optional LLM polish. |
| `agent.py` | `run_agent(person, inputs)`: portrait, then wishes, in one call, with a list of visible steps and timings. **The function the backend should call.** |
| `reaction.py` | `pick_reaction_cards(...)` and `apply_reactions(...)`: Reaction Mode logic. |
| `llm.py` | Optional LLM helper: alternate spellings, parent artist/cuisine, extracting names from free text. OpenAI-compatible, cached, one retry, circuit breaker. |
| `__init__.py` | Exposes `QlooClient`, `resolve`, `build_portrait`, `generate_wishes`, `run_agent`, `pick_reaction_cards`, `apply_reactions`. |
| `test_offline.py` | 42 offline checks (matching, tag hygiene, ladder, confidence, portrait, level 4, HTTP client). No network, no keys, LLM stubbed. |
| `test_wishes.py` | 35 offline checks for wish generation. |
| `test_agent.py` | 17 offline checks for `run_agent`: step honesty, ordering, robustness. |
| `test_reaction.py` | 34 offline checks for Reaction Mode: card choice, safety rules, portrait updates, robustness. |
| `live_checks.py` | Checks against real Qloo and the real LLM: `--level4`, `--extra`, `--l6`, `--llm`, `--wishes`, `--agent`, `--reaction`. |
| `test_engine.py` | Ladder checks and the "Nani" demo portrait. |
| `coverage_test_v2.py`, `coverage_run.py` | The original 40-input coverage test, and a re-run through the real ladder. |

Backend routes that expose the engine live in `backend/routers/agent.py` (stateless `POST /agent/run` for the "try it yourself" demo, and the Reaction Mode routes). Small scripts in `backend/` only print: `qloo_probe.py`, `tag_probe.py`, `llm_probe.py`, `model_probe.py`, `llm_ping.py`, `polish_check.py`.

Git-ignored (never commit): `_cache/`, `_coverage/`, `_nani_portrait.json`, `*.csv`. Do **not** use a rule like `backend/engine/_*`: it also matches `__init__.py` and breaks `from engine import ...`.

## 3. Setup

```
cd backend
pip install -r requirements.txt          # needs requests and python-dotenv
```

`backend/.env` (never committed; names are in `.env.example`):

```
QLOO_API_KEY=...                         # hackathon key
QLOO_API_URL=https://hackathon.api.qloo.com
LLM_API_KEY=...                          # Google Gemini key (free tier, AI Studio)
LLM_MODEL=gemini-3.5-flash-lite          # pick a fast one with model_probe.py
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_TIMEOUT=8                            # optional, seconds per attempt
LLM_REASONING_EFFORT=                    # optional
WISH_POLISH=0                            # 1 = let the LLM rewrite wish wording (off by default, see 5b)
```

The hackathon key only works against `https://hackathon.api.qloo.com`. Staging and production return 401. On Render, set the same variables in the service's environment settings.

Run the tests from `backend/`:

```
python engine\test_offline.py
python engine\test_wishes.py
python engine\test_agent.py
python engine\test_reaction.py
python engine\live_checks.py             # or --level4 / --extra / --l6 / --llm / --wishes / --agent / --reaction
```

## 4. Usage (what the backend calls)

```python
from engine import run_agent, pick_reaction_cards, apply_reactions

person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
inputs = {
  "quick_facts": [{"domain": "music", "name": "Lag Jaa Gale"}],
  "circle_answers": [{"contributor": "Ayesha", "answers": {"music": "Kishore Kumar and Lata Mangeshkar"}}],
}
result = run_agent(person, inputs)
# result["items"]    -> POST /persons/{id}/portrait
# result["wishes"]   -> POST /persons/{id}/wishes
# result["steps"]    -> the "what Genie did" panel
# result["qloo_log"] -> the live Qloo call panel
# result["timings"]  -> {"portrait_ms", "wishes_ms", "total_ms"}

cards = pick_reaction_cards(result["items"], tried=[])["cards"]            # what to show next
update = apply_reactions(person, result["items"],
                         [{"name": cards[0]["name"], "domain": cards[0]["domain"], "reaction": "lit_up"}], tried=[])
# update["items"] -> POST /persons/{id}/portrait (replaces the portrait)
```

The lower-level functions `resolve`, `build_portrait` and `generate_wishes` are still available. All functions **never raise**. Failures come back as a lower `resolution_level`, or as fewer wishes. They can take several seconds when Qloo is not cached, so the backend should call them from a worker thread or background task with its own timeout.

### The visible steps

`run_agent` returns a list of steps, each `{id, title, summary, qloo_calls, cached, errors}`, in this order: `collect`, `resolve`, `expand`, `era` (only when the portrait was thin), `build`, `discover`, `wishes`. The summaries are built from real counts (names matched, taste tags collected, Qloo calls made, wishes suggested), never invented, so the frontend can show them as written. If Qloo is down, the steps say so.

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
- **Level 4 is audience-popularity, not era-specific.** It uses the person's age bracket, region and, where we know a verified Qloo tag, the language (Hindi, Urdu, Telugu, Tamil, Korean, Arabic). Results are region and language appropriate, but Qloo's age brackets are coarse and some items can look odd for the person. Items are always labelled "likely" at confidence 0.3.
- **Thin-hit rule:** an exact hit with fewer than 3 usable tags is probably a namesake or tribute act. If a parent is known, the parent wins and the item is level 3.
- **Songs:** Qloo indexes artists, not songs. A song input normally lands at level 3 on its artist. UI wording must say "via the artist", never "we found the song".
- **Short-input guard:** inputs shorter than 2 characters go straight to level 5.
- `source_label` stays `told` when the family told us about the item, even if Qloo does not know it. `ai-only` is reserved for things the LLM itself suggests.

## 5b. Wish generation

`generate_wishes(items, person)` turns portrait items into 3-5 wishes.
- **Templates, not free text.** Each wish comes from a fixed template (recorded songs, a dish recreated, a place walk, a memory from someone who was there, a live evening, a discovery), so every wish maps to a real Wish Maker type. The wording is plain and reviewable by the team.
- **Anchors.** It uses items the family told us (or the person reacted to). If there are none, it falls back to "likely" items and labels the wishes `likely`.
- **Discovery.** One `/v2/insights` call with the anchors as `signal.interests.entities` (food tags go to `signal.interests.tags`), asking for artists with `feature.explainability=true`. Artists already in the portrait are removed. The anchors Qloo weighted most become the "why", and `query.affinity` is the match score. The wish is labelled `likely` and says it is a guess.
- **Realism filter.** Remote wishes first (lowest risk, works from anywhere). At most one in-person wish, always last, with a reserved slot. A place visit is in-person only if the place matches the person's region. Discoveries are always "a musician plays in that spirit", never a celebrity. Any wish with medical or clinical wording is dropped.
- **Follow-up.** If fewer than 3 usable items exist, `follow_up` carries one gentle question for the UI.

### LLM polish (optional, off by default in `run_agent`)
One LLM call can soften the wording. Each rewrite is accepted or rejected on its own: it must keep every name, a discovery must still say it is a guess, an in-person wish must still mention a family member, and there may be no medical wording, exclamation marks or over-long text. A rejected rewrite keeps its template.

Measured with seven fictional personas (`polish_check.py`): **26 of 33 rewrites accepted (79%)**. Every rejection was a safety check doing its job. Accepted rewrites were uneven in quality.

**Decision:** `run_agent` leaves polish **off** unless `WISH_POLISH=1`. This is an end-of-life product with a team copy review on Day 8, templates can be reviewed while live LLM text cannot, polish adds a slow free-tier call, and the gain is small. Calling `generate_wishes` directly still polishes by default (`use_llm=True`).

## 5c. Reaction Mode (Day 6)

For a person who can no longer recall or speak. The frontend shows a few items (a short song clip, a photo of a dish or place), the family taps "lit up" or "no reaction", and the portrait learns. The engine does the logic only; finding the clip or photo is the frontend's job (each card carries a `media_query`).

`pick_reaction_cards(items, tried=(), n=4)` chooses what to show next:
- **Short sessions:** 4 cards by default, never more than 5.
- **Told items first**, then guesses, ordered by confidence. Domains are mixed (a session is never four songs in a row).
- **Never repeated:** anything in `tried` is skipped (matched loosely by name), and so is anything already reacted to.
- Each card has a calm `prompt` ("Play a short clip of X", "Show a photo of X"). No medical wording.
- `done` is true when nothing is left to show.

`apply_reactions(person, items, reactions, tried=(), client=None)` takes taps `{name, domain (optional), reaction: "lit_up" | "no_reaction"}`:
- **Lit up:** the item becomes `reacted` (UI label "They reacted to this") with higher confidence, even if the family had told us about it.
- **No reaction on a guess ("likely"):** the item is removed, because we never claim a guess nobody reacted to.
- **No reaction on something the family told us:** it stays unchanged. We never contradict the family, and nothing is penalised.
- **Refresh:** if anything lit up, one Qloo discovery call ("people who love these also love...") adds up to 3 new "likely" artists, so the portrait grows from what worked. The portrait never exceeds 30 items.
- Returns the updated `items` (replace the portrait with them), `added`, `removed`, `tried`, a `message`, the `next` cards and the Qloo log. The `message` is "That is okay. Let us try something else." when nothing lit up, and "Thank you. Genie has noted what they enjoyed." otherwise. "No reaction" is never shown as failure.
- The input is not mutated, and the item shape does not change, so the backend's portrait table needs no new columns.
- The **`tried` list is not stored by the engine**. The caller keeps it for the session (the frontend, or a column if the backend wants to keep it across sessions).

Safeguards that stay with the interface (from the project plan): a visible Stop button at all times, the family present, a few items at a time.

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

- Every Qloo response is cached on disk in `engine/_cache/` (one JSON per request, keyed by a hash). 404 "no results" are cached too. LLM answers are cached the same way, keyed by model, prompt and text.
- Qloo's developer guide allows private server-side caching with no time limit but **forbids storing Qloo response data in a public repository**. So the cache, coverage outputs and portrait dumps are git-ignored, and **no Qloo response data may appear in docs, screenshots of raw JSON, or seed files in the repo**. That includes result names, entity ids and tag counts, not just raw JSON.
- Consequence for deployment: Render's free disk is wiped on redeploy, so the first run of a demo person after each deploy is uncached (about a dozen Qloo calls, several seconds each, inside the 20 second portrait limit). Run the demo person once after each deploy to warm it. The proper fix is a private pre-warm store (a table in the private Supabase database, not the repo), planned for Day 8 with the backend owner.
- Observed latency: an uncached Qloo call takes roughly 3-6 seconds (the discovery call took about 5.7 seconds uncached), a cached one under 100 ms. A fully cached Nani run through `run_agent` takes about 150 ms. Portrait items are resolved in parallel (5 workers) with a 20 second overall limit. Anything still pending at the limit becomes level 6.

## 8. LLM (optional but recommended)

The LLM is provider-agnostic: any OpenAI-compatible chat endpoint works through `LLM_BASE_URL`. We use Gemini's free tier. Free tiers may use prompts to improve the provider's models, which is why only names and the person's region and language are sent, never surnames, contact details or health data. Mention the third-party AI in the Devpost privacy section.

Behaviour of `llm.py`:
- Answers are cached on disk, so repeats are instant and work even when the provider is down.
- Each call has a timeout (`LLM_TIMEOUT`, default 8 s) and one retry on timeout, network error, 429 or 5xx.
- **Circuit breaker:** after a failed call the LLM is skipped for 60 seconds, so a slow provider never stalls resolution.
- **Model choice matters.** In our probe, `gemini-3.8-flash` took 30-40 seconds for a trivial answer, while the lite models took 1.5-3 seconds. Run `model_probe.py` and pick the fastest. Model names change often; `llm_probe.py` lists what your key can use, and `llm_ping.py` checks that it answers.

Without `LLM_API_KEY` everything still works, using built-in aliases and parent hints for the known test cases. What you lose:
- Free-text circle answers: the fallback splits on commas, "and" and line breaks and keeps only short (five words or fewer) segments. Long sentences yield nothing rather than junk. Real answers need the LLM.
- Level 2/3 for unseen names: only names in the built-in tables get alternate spellings or a parent.

The LLM receives only names of songs, artists, dishes, places and films (plus the person's region and language) and, if polish is on, the wish text. The Wish Circle consent note already tells contributors an AI service processes answers.

## 9. What we learned about Qloo (so nobody repeats it)

- **Endpoints used:** `GET /search` (entities), `GET /v2/tags` (tags, used for food and to find language tags), `GET /v2/insights` (era/place, wishes and reaction refresh). All are GET with the key in the `X-Api-Key` header.
- **`/search` types are not the same as insights `filter.type`.** `/search` also accepts legacy types such as `urn:entity:locality`; `/v2/insights` does not accept locality as a result type. Insights accepts: artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game.
- **Food is a tag, not an entity.** A dish resolves to a `urn:tag:specialty_dish:place:...` id. Use it in `signal.interests.tags` or `filter.tags`, never in `signal.interests.entities`. A plain `/search` for a dish returns restaurants, which must never be stored as the dish.
- **Entities are UUIDs, tags are URNs.**
- **Tag ids differ between endpoints.** `/search` returns tags as `urn:tag:genre:rock` while `/v2/insights` returns the same concept as `urn:tag:genre:music:rock`. **Do not match makers to portrait items by raw tag id only; also compare normalised tag names.**
- **Tag field name differs:** `tag_id` in `/search`, `id` in `/v2/insights`. `clean_tags()` handles both.
- **Tags are scoped by domain.** The same word has different tag ids for music, film, places and cuisine. Level 4 therefore uses a different language tag for artists and for films.
- **Tag hygiene.** Qloo describes films and artists with rich tags, and some are wrong for a family-facing screen: ageing and end-of-life words (the interface tone rules forbid clinical or dramatic wording), and identity labels attached to content ("<religion> family"). `clean_tags()` drops audience-style tag types, tags with ageing, illness or end-of-life words in their name, and religion-plus-family/community labels. Genre tags are kept (for example a devotional or Sufi genre), because they describe the music. Edge case: a genre whose name contains a dropped word (for example a metal subgenre with "death" in its name) loses that tag.
- **Not every search hit has tags.** Duet entries and some namesakes have none. The resolver prefers hits that have tags, then higher popularity.
- **Invalid parameters are silently ignored.** An empty 200 response usually means a parameter is not valid for that `filter.type`, not that data is missing. Where the guide and the OpenAPI definition disagree, trust the OpenAPI definition.
- **`destination` insights require `signal.interests.entities`.**
- **`feature.explainability=true`** returns, per result, `query.affinity` (0-1) and `query.explainability['signal.interests.entities']`, a list of `{entity_id, score}` for how much each input entity contributed. Entity ids come back in upper case in that list, so compare case-insensitively.
- **Limits:** `take` max 50. `/search` can return 429; the client retries with backoff. Hackathon quotas are high; raise them via Discord `#api-help`.
- **Wrong-looking entity names exist.** Some search hits carry another entity's description. Always match by name and tags, never trust the description.
- **Do not add descriptive words to a search query** ("X singer" returned unrelated authors).

## 10. Known limits and open items

- Level 4 is audience-popularity for the person's age bracket, region and language, not era-specific. It only runs for thin portraits and is always labelled "likely". With only two favourites it still adds six guesses, and some can look odd for the person. The UI must show them clearly as "likely".
- Discovery artists can be unexpected for a given taste. They are always labelled likely and the family decides.
- `resolve()` still returns `affinity: null` (search does not return it). Affinity only appears on discovery wishes.
- LLM polish is off by default (see 5b). With it on, about one rewrite in five is rejected, and accepted rewrites can be awkward.
- Reaction Mode: the engine does not remember the `tried` list, and the refresh adds artists only (cross-domain additions are possible later). The interface must provide the Stop button and show "no reaction" kindly.
- Circle answer question keys are assumed to contain `music`, `food`, `place`, `film`. The "what made them light up" answer is not mapped to a domain. Confirm the real keys against `GET /circle/{token}`.
- Two items with the same Qloo entity can appear in one portrait (for example a song matched via Lata Mangeshkar and Lata Mangeshkar herself). The UI should tolerate it; dedupe on entity id if it looks odd.
- Free-tier LLM latency varies. The breaker and cache make this safe, but the first call after a pause can fail.
- The Qloo cache is lost on every Render redeploy until the private pre-warm store exists (Day 8).
- Planned: a `discovered` field on discovery wishes (the discovered artist's name), so matching can look for makers who list that artist. Needs a column in the `wish` table first.

## 11. Next steps (from the 10-day plan)

| Day | Engine task |
|---|---|
| 5 | Done on the engine side: `run_agent` with visible steps |
| 6 | Done on the engine side: Reaction Mode logic. The screens and routes are with the frontend and backend owners. |
| 7 | Feature freeze; side-by-side screen (generic AI vs Genie); Bedside Kit generator |
| 8 | Caching, timeouts, error states, second demo person, odd-input tests, private pre-warm store, copy read-aloud |
| 9 | Judge test with 10 varied people; technical README and Qloo notes for the Devpost description |