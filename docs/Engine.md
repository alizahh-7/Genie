# Genie engine: documentation

**Owner:** Umaima. **Folder:** `backend/engine/`. **Status:** Days 1-9 complete on the engine side, plus two small contract changes on 25 Oct (`label` on every Qloo call row, `discovered` on discovery wishes). Day 1-8 work: resolve, fallback ladder, portrait builder, wish generation, one end-to-end entry point with visible steps (`run_agent`), Reaction Mode logic, the side-by-side comparison with a general AI, the Bedside Kit, and the Day 8 polish (private cache pre-warm, a second demo person, odd-input and outage checks, a Qloo circuit breaker, tone fixes, a copy audit). **Feature freeze:** from here on the engine only gets bug fixes, polish, copy and tests. Day 9 was the judge test (twelve fictional people, no failed checks on a local server).

The engine is plain Python. It talks to Qloo (and optionally an LLM) and returns data. **It never touches the database**: the backend calls it and stores what it returns. See `docs/engine-contract.md` (v1.7) for the exact input/output shapes (Day 8 changed no shapes; v1.7 added `label` and `discovered`), and `docs/umaima-engine-report-days-1-9.md` for the full work report.

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
10. **Compare**: put a general AI's wishes next to Genie's, from the same facts, with the evidence.
11. **Comfort**: build a Bedside Kit (playlist, small changes to the room, what visitors can do) for wishes in a care room.
12. **Log** every Qloo call so the UI can show a live "Qloo call log".

## 2. Files

| File | Purpose |
|---|---|
| `qloo_client.py` | The only place that calls Qloo. Disk cache, a 4 second connect timeout plus a 10 second read timeout, retries, a circuit breaker (see 7), call log. Shared helpers (`score`, `clean_tags`, `is_heavy`, `as_list`). `clean_tags` also removes audience tags and tags that must not reach a family-facing screen (see 9). |
| `resolve.py` | `resolve(name, domain)`: the fallback ladder (levels 1, 2, 3, 5, 6), alias and parent tables, short-input guard. |
| `portrait.py` | `build_portrait(person, inputs)`: collects, resolves in parallel, labels, scores, expands (level 4, with per-language Qloo tags). At most 30 items, level-4 guesses included. |
| `wishes.py` | `generate_wishes(items, person)`: 3-5 template-based wishes, Qloo discovery with explainability, realism filter, optional LLM polish. |
| `agent.py` | `run_agent(person, inputs)`: portrait, then wishes, in one call, with a list of visible steps and timings. **The function the backend should call to build a portrait and wishes.** |
| `reaction.py` | `pick_reaction_cards(...)` and `apply_reactions(...)`: Reaction Mode logic. |
| `sidebyside.py` | `side_by_side(person, inputs)`: a general AI's wishes next to Genie's, from the same facts, plus the evidence. |
| `kit.py` | `generate_bedside_kit(person, items)`: the Bedside Kit, from templates. |
| `llm.py` | Optional LLM helper: alternate spellings, parent artist/cuisine, extracting names from free text. OpenAI-compatible, cached, one retry, circuit breaker. |
| `personas.py` | The two fictional demo personas (Nani and Jun). Inputs only, no Qloo data. |
| `prewarm_run.py` | Runs the demo personas through every entry point twice. Pass 2 must be fast. |
| `live_odd.py` | Live odd-input checks (43), and `--outage qloo` or `--outage llm` for outage checks. |
| `copy_audit.py` | Writes every family-facing sentence to `_review/copy_review.txt` for the team read-aloud, and flags clinical words and exclamation marks. |
| `__init__.py` | Exposes `QlooClient`, `resolve`, `build_portrait`, `generate_wishes`, `run_agent`, `pick_reaction_cards`, `apply_reactions`, `side_by_side`, `generate_bedside_kit`. |
| `test_offline.py` | 43 offline checks (matching, tag hygiene, name splitting, ladder, confidence, portrait, level 4, HTTP client). No network, no keys, LLM stubbed. |
| `test_wishes.py` | 35 offline checks for wish generation. |
| `test_agent.py` | 17 offline checks for `run_agent`. |
| `test_reaction.py` | 34 offline checks for Reaction Mode. |
| `test_sidebyside.py` | 21 offline checks for the comparison: fairness, tone filter, evidence, failures. |
| `test_kit.py` | 17 offline checks for the Bedside Kit: order, wording rules, empty and junk input. |
| `test_labels.py` | 14 offline checks for the friendly `label` on each Qloo call row (cached, found, not found, errors, bad input, one-shot `note()`). |
| `test_day8.py` | 46 offline checks for the Day 8 fixes (cap, heavy-theme skip, tag filters, no waiting on stuck calls, circuit breaker, step wording, comparison caching). |
| `live_checks.py` | Checks against real Qloo and the real LLM: `--level4`, `--extra`, `--l6`, `--llm`, `--wishes`, `--agent`, `--reaction`, `--compare`, `--kit`. |
| `test_engine.py` | Ladder checks and the "Nani" demo portrait. |
| `coverage_test_v2.py`, `coverage_run.py` | The original 40-input coverage test, and a re-run through the real ladder. |
| `smoke_api.py` (in backend/) | Runs every stateless engine route for both demo people against a running server (python smoke_api.py [url]). |
| `judge_test.py` (in backend/) | Drives the real API for 10 varied people (12 with --extra) from creation to a printed, shared, revoked and deleted Wish Book (python judge_test.py [url] [--extra] [--only 3,9] [--keep]) |

Backend-level files for the private cache (they use the database, so they live next to `main.py`, not in the engine): `backend/engine_cache_store.py` (`init`, `snapshot`, `restore`, `stats`), `backend/test_cache_store.py` (8 offline checks) and `backend/migrations/006_engine_cache.sql`.

Backend routes that expose the engine live in `backend/routers/agent_demo.py` (stateless, nothing stored): `POST /agent/run`, `/agent/reaction-cards`, `/agent/reactions`, `/agent/compare` and `/agent/bedside-kit`. The person-bound routes (`/persons/{id}/...`) are in `routers/agent.py`, owned by the backend owner. Small scripts in `backend/` only print: `qloo_probe.py`, `tag_probe.py`, `llm_probe.py`, `model_probe.py`, `llm_ping.py`, `polish_check.py`, `tag_filter_check.py`.

Git-ignored (never commit): `_cache/`, `_coverage/`, `_review/`, `_nani_portrait.json`, `*.csv`. Do **not** use a rule like `backend/engine/_*`: it also matches `__init__.py` and breaks `from engine import ...`.

## 3. Setup
cd backend
pip install -r requirements.txt # needs requests, python-dotenv and psycopg


`backend/.env` (never committed; names are in `.env.example`):

QLOO_API_KEY=... # hackathon key
QLOO_API_URL=https://hackathon.api.qloo.com
LLM_API_KEY=... # Google Gemini key (free tier, AI Studio)
LLM_MODEL=gemini-3.5-flash-lite # pick a fast one with model_probe.py
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_TIMEOUT=8 # optional, seconds per attempt
LLM_REASONING_EFFORT= # optional
WISH_POLISH=0 # 1 = let the LLM rewrite wish wording (off by default, see 5b)
DATABASE_URL=... # used only by the private cache store, never by the engine
ENGINE_CACHE_RESTORE=1 # 1 = restore the private cache snapshot at server start

The hackathon key only works against `https://hackathon.api.qloo.com`. Staging and production return 401. On Render, set the same variables in the service's environment settings. If the Gemini key is replaced (for example after the free quota runs out), update it in Render too.

Run the tests from `backend/`:
python engine\test_offline.py
python engine\test_wishes.py
python engine\test_agent.py
python engine\test_reaction.py
python engine\test_sidebyside.py
python engine\test_kit.py
python engine\test_day8.py
python engine\test_labels.py
python test_cache_store.py
python engine\live_checks.py # or --level4 / --extra / --l6 / --llm / --wishes / --agent / --reaction / --compare / --kit
python engine\live_odd.py # odd inputs against real Qloo (spends LLM quota: do not run it near a demo)
python engine\prewarm_run.py # demo personas, twice; the second pass must be fast


## 4. Usage (what the backend calls)

```python
from engine import run_agent, pick_reaction_cards, apply_reactions, side_by_side, generate_bedside_kit

person = {"first_name": "Nani", "birth_year": 1948, "region": "Hyderabad", "language": "Hindi"}
inputs = {
  "quick_facts": [{"domain": "music", "name": "Lag Jaa Gale"}],
  "circle_answers": [{"contributor": "Ayesha", "answers": {"music": "Kishore Kumar and Lata Mangeshkar"}}],
}
result = run_agent(person, inputs)
# result["items"]    -> POST /persons/{id}/portrait
# result["wishes"]   -> POST /persons/{id}/wishes
# result["steps"]    -> the "what Genie did" panel
# result["qloo_log"] -> the live Qloo call panel; each row is {step, request, status, ms, label}
# `label` is one calm sentence, e.g. "Looked up Charminar as a place. Remembered."
# result["timings"]  -> {"portrait_ms", "wishes_ms", "total_ms"}

cards = pick_reaction_cards(result["items"], tried=[])["cards"]            # what to show next
update = apply_reactions(person, result["items"],
                         [{"name": cards[0]["name"], "domain": cards[0]["domain"], "reaction": "lit_up"}], tried=[])
# update["items"] -> POST /persons/{id}/portrait (replaces the portrait)

both = side_by_side(person, inputs)                # the side-by-side screen
kit = generate_bedside_kit(person, result["items"])  # the Bedside Kit screen
```

The lower-level functions `resolve`, `build_portrait` and `generate_wishes` are still available. All functions **never raise**. Failures come back as a lower `resolution_level`, or as fewer wishes. They can take several seconds when Qloo is not cached, so the backend should call them from a worker thread or background task with its own timeout (40 seconds in `routers/agent.py`).

### The visible steps

`run_agent` returns a list of steps, each `{id, title, summary, qloo_calls, cached, errors}`, in this order: `collect`, `resolve`, `expand`, `era` (only when the portrait was thin), `build`, `discover`, `wishes`. The summaries are built from real counts (names matched, taste tags collected, Qloo calls made, wishes suggested), never invented, so the frontend can show them as written. Singular and plural are handled ("Gathered 1 name", "Matched it in Qloo."). If Qloo is down, the steps say so.

## 5. The fallback ladder

| Level | Situation | What the engine does | Item shown as |
|---|---|---|---|
| 1 | Exact entity found | Use it with its Qloo tags | Qloo match |
| 2 | Spelling or script differs | Try aliases (built-in table, plus LLM if configured) | Qloo match (alternate spelling) |
| 3 | Still not found | Search the parent: song to artist, dish to cuisine, spot to city/landmark | "Matched via the artist" |
| 4 | Portrait thin (fewer than 3 resolved items) | Ask Qloo for popular artists/films for the person's age bracket, region and language | "Likely from their era and region" |
| 5 | Qloo has nothing useful | Keep the item, no entity, no tags | "Not in Qloo": excluded from Qloo scoring |
| 6 | API error, timeout or no key | Same, but flagged as an error | Friendly retry message, never a raw error |

Notes:
- Level 4 is decided in `portrait.py` (it is about the whole person). Levels 1, 2, 3, 5, 6 are in `resolve.py`.
- **Level 4 is audience-popularity, not era-specific.** It uses the person's age bracket, region and, where we know a verified Qloo tag, the language (Hindi, Urdu, Telugu, Tamil, Korean, Arabic). Results are region and language appropriate, but Qloo's age brackets are coarse and some items can look odd for the person. Items are always labelled "likely" at confidence 0.3.
- **Level-4 guesses are screened (Day 8).** A guess is skipped entirely, not only stripped of tags, when any of its tags is ageing or end-of-life wording or a heavy theme (communal, riot, terror, murder, violence, crime and similar). The next hit takes its place. Told items are never skipped.
- **The portrait never exceeds 30 items.** Level-4 guesses are added last, so they are the ones dropped.
- **Thin-hit rule:** an exact hit with fewer than 3 usable tags is probably a namesake or tribute act. If a parent is known, the parent wins and the item is level 3.
- **Songs:** Qloo indexes artists, not songs. A song input normally lands at level 3 on its artist. UI wording must say "via the artist", never "we found the song".
- **Short-input guard:** inputs shorter than 2 characters go straight to level 5.
- **Without the LLM**, free-text circle answers are split on commas, "and" and line breaks. A segment is kept only if it is short (five words or fewer) and has no sentence words (she, he, they, we, my, her, his, their, our, was, were, used, sang, would, because, loved), so a short sentence like "She sang along to Queen" is not turned into an item.
- `source_label` stays `told` when the family told us about the item, even if Qloo does not know it. `ai-only` is reserved for things the LLM itself suggests.

## 5b. Wish generation

`generate_wishes(items, person)` turns portrait items into 3-5 wishes.
- **Templates, not free text.** Each wish comes from a fixed template (recorded songs, a dish recreated, a place walk, a memory from someone who was there, a live evening, a discovery), so every wish maps to a real Wish Maker type. The wording is plain and reviewable by the team.
- **Anchors.** It uses items the family told us (or the person reacted to). If there are none, it falls back to "likely" items and labels the wishes `likely`.
- **Discovery.** One `/v2/insights` call with the anchors as `signal.interests.entities` (food tags go to `signal.interests.tags`), asking for artists with `feature.explainability=true`. Artists already in the portrait are removed. The anchors Qloo weighted most become the "why", and `query.affinity` is the match score. The wish is labelled `likely` and says it is a guess.
- **Realism filter.** Remote wishes first (lowest risk, works from anywhere). At most one in-person wish, always last, with a reserved slot. A place visit is in-person only if the place matches the person's region. Discoveries are always "a musician plays in that spirit", never a celebrity. Any wish with medical or clinical wording is dropped.
- **Films and guesses (Day 9).** A told film gets its own remote wish ("An evening with ..."), so a portrait with only a film still gets at least three wishes when Qloo answers. A guessed film does not get a wish of its own (we know nothing about its tone). Wishes built only from guessed items say so ("in the spirit of ..., a guess from their era and region") and never call a guess a favourite.
- **Follow-up.** If fewer than 3 items are told or reacted, follow_up carries one gentle question for the UI. Guessed items never count, so a person typed with nothing still gets the question.

### LLM polish (optional, off by default in `run_agent`)
One LLM call can soften the wording. Each rewrite is accepted or rejected on its own: it must keep every name, a discovery must still say it is a guess, an in-person wish must still mention a family member, and there may be no medical wording, exclamation marks or over-long text. A rejected rewrite keeps its template.

Measured with seven fictional personas (`polish_check.py`): **26 of 33 rewrites accepted (79%)**. Every rejection was a safety check doing its job. Accepted rewrites were uneven in quality.

**Decision:** `run_agent` leaves polish **off** unless `WISH_POLISH=1`. This is an end-of-life product with a team copy review on Day 8, templates can be reviewed while live LLM text cannot, polish adds a slow free-tier call, and the gain is small. Callers of `generate_wishes` should pass `use_llm=False` unless `WISH_POLISH=1`.

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
- **Refresh:** if anything lit up, one Qloo discovery call adds up to 3 new "likely" artists, so the portrait grows from what worked. The portrait never exceeds 30 items.
- Returns the updated `items` (replace the portrait with them), `added`, `removed`, `tried`, a `message`, the `next` cards and the Qloo log. The `message` is "That is okay. Let us try something else." when nothing lit up, and "Thank you. Genie has noted what they enjoyed." otherwise. "No reaction" is never shown as failure.
- The input is not mutated, and the item shape does not change, so the backend's portrait table needs no new columns.
- The **`tried` list is not stored by the engine**. The caller keeps it for the session (the frontend, or a column if the backend wants to keep it across sessions).

Safeguards that stay with the interface (from the project plan): a visible Stop button at all times, the family present, a few items at a time.

## 5d. Side-by-side with a general AI (Day 7)

`side_by_side(person, inputs)` answers the hackathon's central question ("would this work the same without Qloo?") with a live, honest comparison.
- **Fair by design.** The general AI gets exactly the facts the family gave (first name, birth year, region, language, favourites, circle notes) and no Qloo data. It is asked for 5 wishes in the same tone, and held to the same tone filter as Genie's wishes (no medical wording, no exclamation marks); the response says how many it filtered.
- **No invented results.** If the general AI does not answer in time, the response says so (`available: false` with a message) and Genie's side is still complete.
- **Both run in parallel.** The general AI's answer is cached per prompt(since Day 8, only for the two demo people), so a demo person can be pre-warmed. The prompt includes the family notes, so a demo person only hits the cache when the request is exactly the persona's inputs (see `personas.py`).Since Day 8 the answer is cached only for the two demo people, because a typed person's answer can contain their first name.
- **Evidence from real results:** how many of Genie's wishes carry taste tags, how many told items Qloo found, how many Qloo calls were made, and the discovery wish with its "why" and match score. The general AI's side reports that it had no taste data, and its wishes carry no source.
- What Genie adds is evidence and structure, not necessarily nicer prose: taste links from Qloo, an honest label for where each wish came from, a discovery with a score, and a maker type it can match to a real Wish Maker. In our runs the general AI's wishes read well, and some suggest eating or drinking in the room, which Genie's wishes route through a recipe, a video, or a "ask the care team first" note.

## 5e. Bedside Kit (Day 7)

`generate_bedside_kit(person, items)` is for wishes that happen in a care room. It is comfort and connection only, never treatment, and it ends with "Genie is not a medical service. For questions about care, please speak with the care team."
- **Templates, no LLM**, so every line can be read aloud and approved by the team.
- **Playlist:** items they reacted to first, then what the family told us, then at most 3 guesses (each labelled), up to 10 names, no repeats. It lists names to search for in a music app, not recordings.
- **Small changes to the room:** music played softly, a photo of a place, a short scene from a film, a recipe card or photo for a dish (always with "please ask the care team before bringing any food or drink"), plus general comforts (daylight, a familiar blanket).
- **What visitors can do:** hum along, share a short memory, use the person's language, say who is here, and short visits are fine.
- Every suggestion carries a `because` (the item it came from, or "general"), so nothing is made up. An empty portrait still gives a kit with the general suggestions and an empty-playlist note.

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

## 7. Caching, resilience and compliance

- Every Qloo response is cached on disk in `engine/_cache/` (one JSON per request, keyed by a hash). 404 "no results" are cached too. LLM answers (including the general AI's wishes in the comparison) are cached the same way, keyed by model, prompt and text.
- Qloo's developer guide allows private server-side caching with no time limit but **forbids storing Qloo response data in a public repository**. So the cache, review output, coverage outputs and portrait dumps are git-ignored, and **no Qloo response data may appear in docs, screenshots of raw JSON, or seed files in the repo**. That includes result names, entity ids, tag names and tag counts, not just raw JSON.
- **Private pre-warm store (Day 8).** Render's free disk is wiped on every redeploy, so the cache is also kept in a private table, `engine_cache`, in the Supabase database (never in the repo). The table has row-level security on and holds only hashed request keys and response bodies, with no person data, so deleting a person does not touch it. `backend/engine_cache_store.py` has four commands: `init` (creates the table), `snapshot` (copies `engine/_cache/` into the table), `restore` (copies missing files back) and `stats`. `main.py` calls `restore_safely()` at server start in a background thread (`ENGINE_CACHE_RESTORE=1`), so a redeploy no longer starts cold, and a failed restore never blocks start-up. A path check refuses any stored key that would write outside the cache folder (8 offline checks).
- **How to refresh the snapshot.** Take it only from a clean cache that holds the demo personas and nothing else: delete `engine/_cache`, run `python engine\prewarm_run.py`, then `python engine_cache_store.py snapshot`. Never snapshot a cache that has seen odd-input runs, judge-typed people or any real person. The first snapshot held 41 files (about 1.9 MB).
- **Qloo client resilience (Day 8).** A 4 second connect timeout, a 10 second read timeout and 2 retries per call. A shared circuit breaker: after 3 timeouts or network errors in a row, uncached calls fail fast for 30 seconds (the cache is still served), and any answer from Qloo resets the count. The portrait builder no longer waits for stuck calls at its 20 second limit: they finish in the background and only fill the cache, and one failed resolve only affects that item.
- **Measured (Day 8).**
  - A cold demo person took 16 to 30 seconds (about a dozen Qloo calls, plus one LLM call for the comparison).
  - After a cache restore the first run took 0.25 to 0.35 seconds.
  - A hot run took 29 to 91 milliseconds.
  - With Qloo unreachable, `run_agent` for one unknown favourite returned in about 14 seconds when the host silently drops packets (33 seconds before the breaker) and about 8 seconds when the connection is refused (9 before).
  - The longest odd-input cases took about 20 seconds, which is the portrait limit.
- An uncached Qloo call takes roughly 3-6 seconds (the discovery call about 6 seconds), a cached one under 100 ms. Portrait items are resolved in parallel (5 workers) with a 20 second overall limit. Anything still pending at the limit becomes level 6.
- **Privacy of the cache.** The cache holds Qloo responses and cached LLM answers. The general AI's comparison answer can contain the first name that was typed, so it is cached only for the two fictional demo people (exactly the inputs in personas.py) and never for anyone else. Other cached LLM answers (alternate spellings, names pulled out of free text) hold names of favourites, not the person's name. The prompt itself is never stored (the file name is a hash). The cache is not linked to a person record, so DELETE /persons/{id} does not clear it, and on the live server the disk cache is lost on every restart or redeploy. The stored snapshot holds only the two fictional demo people.

## 8. LLM (optional but recommended)

The LLM is provider-agnostic: any OpenAI-compatible chat endpoint works through `LLM_BASE_URL`. We use Gemini's free tier. Free tiers may use prompts to improve the provider's models, which is why we send only what is needed (the names of favourites and the person's region and language, plus the first name and birth year for the comparison), never surnames, contact details or health data. Mention the third-party AI in the Devpost privacy section.

Behaviour of `llm.py`:
- Answers are cached on disk, so repeats are instant and work even when the provider is down.
- Each call has a timeout (`LLM_TIMEOUT`, default 8 s) and one retry on timeout, network error, 429 or 5xx.
- **Circuit breaker:** after a failed call the LLM is skipped for 60 seconds, so a slow provider never stalls resolution.
- **Free-tier limits are real.** During Day 8 testing the provider returned quota errors (429) and an overload error (503). The log lines show the engine carrying on with its built-in fallbacks, and the checks running at that moment passed (apart from the unrelated portrait-cap bug, fixed the same day). What was not seen live is the comparison screen's message under a quota error. That behaviour is covered by the offline suite ("LLM down: the general AI side says so") and by `live_odd.py --outage llm`. The quota ran out because the live checks spend it, and a new key (a new quota) fixed it. Do not run `live_odd.py` shortly before a demo.
- **Model choice matters.** In our probe, `gemini-3.8-flash` took 30-40 seconds for a trivial answer, while the lite models took 1.5-3 seconds. Run `model_probe.py` and pick the fastest. Model names change often; `llm_probe.py` lists what your key can use, and `llm_ping.py` checks that it answers.

Without `LLM_API_KEY` everything still works, using built-in aliases and parent hints for the known test cases. What you lose:
- Free-text circle answers: the fallback keeps only short segments without sentence words (see 5). Real answers need the LLM. The Wish Circle's fifth question ("what made them light up", key `joy`) has no domain and is read only with the LLM.
- Level 2/3 for unseen names: only names in the built-in tables get alternate spellings or a parent.
- The general AI's side of the comparison (it is an LLM call; the response says it is unavailable).

The LLM receives only names of songs, artists, dishes, places and films (plus the person's region and language) and, if polish is on, the wish text. For the comparison, the general AI also receives the first name, birth year, region, language, the favourites and the family's circle notes, because that is exactly what Genie was given. The Wish Circle consent note already tells contributors an AI service processes answers.

## 9. What we learned about Qloo (so nobody repeats it)

- **Endpoints used:** `GET /search` (entities), `GET /v2/tags` (tags, used for food and to find language tags), `GET /v2/insights` (era/place, wishes and reaction refresh). All are GET with the key in the `X-Api-Key` header.
- **`/search` types are not the same as insights `filter.type`.** `/search` also accepts legacy types such as `urn:entity:locality`; `/v2/insights` does not accept locality as a result type. Insights accepts: artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game.
- **Food is a tag, not an entity.** A dish resolves to a `urn:tag:` id. Use it in `signal.interests.tags` or `filter.tags`, never in `signal.interests.entities`. A plain `/search` for a dish returns restaurants, which must never be stored as the dish.
- **Entities are UUIDs, tags are URNs.**
- **Tag ids differ between endpoints.** The same concept comes back with a different id on `/search` and on `/v2/insights`. **Do not match makers to portrait items by raw tag id only; also compare normalised tag names.**
- **Tag field name differs:** `tag_id` in `/search`, `id` in `/v2/insights`. `clean_tags()` handles both.
- **Tags are scoped by domain.** The same word has different tag ids for music, film, places and cuisine. Level 4 therefore uses a different language tag for artists and for films.
- **Tag hygiene.** Qloo describes films and artists with rich tags, and some are wrong for a family-facing screen: ageing and end-of-life words (the interface tone rules forbid clinical or dramatic wording), heavy themes (communal, riot, terror, murder and similar, added on Day 8 after a real response showed them on a guessed film), and identity labels attached to content ("<religion> family"). `clean_tags()` drops audience-style tag types and tags with those words in their name. Genre tags are kept, because they describe the music. Edge case: a genre whose name contains a dropped word loses that tag. `is_heavy()` is the stricter test used to skip a whole level-4 guess.A second pass (Day 8) dropped medical, outbreak and war wording from tag names, free-form media keywords, and place facets such as amenities and nearby attractions, after a real portrait showed medical-drama wording on a told film.
- **Not every search hit has tags.** Duet entries and some namesakes have none. The resolver prefers hits that have tags, then higher popularity.
- **Invalid parameters are silently ignored.** An empty 200 response usually means a parameter is not valid for that `filter.type`, not that data is missing. Where the guide and the OpenAPI definition disagree, trust the OpenAPI definition.
- **`destination` insights require `signal.interests.entities`.**
- **`feature.explainability=true`** returns, per result, `query.affinity` (0-1) and `query.explainability['signal.interests.entities']`, a list of `{entity_id, score}` for how much each input entity contributed. Entity ids come back in upper case in that list, so compare case-insensitively.
- **Limits:** `take` max 50. `/search` can return 429; the client retries with backoff. Hackathon quotas are high; raise them via Discord `#api-help`.
- **Wrong-looking entity names exist.** Some search hits carry another entity's description. Always match by name and tags, never trust the description.
- **Do not add descriptive words to a search query** ("X singer" returned unrelated authors).

## 10. Known limits and open items

- Level 4 is audience-popularity for the person's age bracket, region and language, not era-specific. It only runs for thin portraits and is always labelled "likely". With only two favourites it still adds up to six guesses, and some can look odd for the person (an unfamiliar title, for example). Heavy and end-of-life guesses are skipped (see 5), but the UI must still show all of them clearly as "likely".
- The heavy-theme skip covers level-4 guesses only. Discovery artists and the Reaction Mode refresh artists are not screened by theme (artists rarely carry such tags); their ageing and end-of-life tag names are still removed by `clean_tags`.
- Discovery artists can be unexpected for a given taste. They are always labelled likely and the family decides.
- `resolve()` still returns `affinity: null` (search does not return it). Affinity only appears on discovery wishes.
- LLM polish is off by default (see 5b). With it on, about one rewrite in five is rejected, and accepted rewrites can be awkward.
- Side-by-side: the general AI is the same free-tier model the engine uses for its helper. A stronger general model would write better prose, but would still have no taste links, no source labels and no maker mapping. Its side depends on a live LLM call and can be unavailable. The two demo personas' answers are in the private cache snapshot, but only for their exact inputs.
- The LLM free tier can return quota (429) or overload (503) errors. The engine degrades and never fails, but a person typed live during a demo may get a comparison with `available: false`.
- A person typed live is cold: expect 15-30 seconds. The frontend needs a calm waiting state that shows the real steps, and a timeout above the backend's 40 seconds.
- Bedside Kit: the playlist lists names, not recordings, and most names are artists because Qloo has artists, not songs. The suggestions are general comforts plus items from the portrait, not clinical advice.
- Reaction Mode: the engine does not remember the `tried` list, and the refresh adds artists only. The interface must provide the Stop button and show "no reaction" kindly.
- Wish Circle answer keys are `music`, `food`, `place`, `film` and `joy` (`routers/circle.py`). The engine maps the first four. `joy` is read only with the LLM.
- Two items with the same Qloo entity can appear in one portrait (for example a song matched via its artist, and the artist herself). The UI should tolerate it; dedupe on entity id if it looks odd.
- Free-tier LLM latency varies. The breaker and cache make this safe, but the first call after a pause can fail.
- The private cache snapshot only helps if it was taken from a clean demo-persona cache (see 7). If the snapshot is missing, the first run of a demo person after a deploy is cold.
- Parking lot (not built, per the feature freeze): Clue Box (photo or voice upload), a `discovered` field on discovery wishes (needs a column in the `wish` table), cross-domain additions in Reaction Mode, a cap on how many tags the interface shows per item.
- A typed person's first name is not written to the cache. The cache is still not covered by "delete everything", and a name typed inside a free-text circle answer could survive in an extracted-names answer (rare).
- The judge test is run against a local server; the deployed site and the frontend are checked separately.

## 11. Next steps (from the 10-day plan)

| Day | Engine task |
|---|---|
| 5-6 | Done on the engine side: `run_agent` with visible steps, Reaction Mode logic |
| 7 | Done on the engine side: side-by-side, Bedside Kit. **Feature freeze starts.** |
| 8 | Done: private cache pre-warm store, second demo persona, odd-input and outage checks, circuit breaker, tone fixes, copy audit |
| 9 | Judge test with 10 varied people; technical README and Qloo notes for the Devpost description |
| 10 | Final bug fixes with the team, demo video if there is time |

## 12. Day 8 polish checks (how to repeat them)

| Check | Command (from `backend/`) | Pass means |
|---|---|---|
| Offline suites | the eight test commands in section 3 | all pass (213 engine checks and 8 cache-store checks) |
| Odd inputs | `python engine\live_odd.py` | 43 of 43: nothing raises, shapes are valid, the portrait never exceeds 30 items, no clinical words or exclamation marks |
| Qloo outage, refused | `$env:QLOO_API_URL="http://127.0.0.1:9"; python engine\live_odd.py --outage qloo; Remove-Item Env:QLOO_API_URL` | 2 of 2, level-6 items, a follow-up, about 8 seconds |
| Qloo outage, black hole | same with `http://10.255.255.1` | 2 of 2, about 14 seconds |
| LLM outage | `$env:LLM_BASE_URL="http://127.0.0.1:9"; python engine\live_odd.py --outage llm; Remove-Item Env:LLM_BASE_URL` | 2 of 2, the comparison says the general AI is unavailable |
| Demo personas | `python engine\prewarm_run.py` | both personas OK on both passes, the second pass under 3 seconds |
| Cache store | `python engine_cache_store.py stats`, delete `engine\_cache`, `python engine_cache_store.py restore`, then `prewarm_run.py` | the first pass is fast, with no Qloo calls |
| Server restore | delete `engine\_cache`, start `uvicorn main:app --reload` | the log shows `[engine cache] restored N files` |
| Copy audit | `python engine\copy_audit.py`, then the team reads `engine\_review\copy_review.txt` aloud | 0 flags, and every line sounds right aloud |
| Secrets | from the repo root: `git ls-files backend/.env`, `git log --all --oneline -- backend/.env`, `git grep -n "AIza"`, `git log --all -S "AIza" --oneline`, and the same `-S` search with the first 8 characters of the Qloo key | all print nothing |
| Judge test | python judge_test.py (server running) | every person reaches a printed Wish Book with no failed check; python judge_test.py --extra adds two odd people |.