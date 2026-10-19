# Genie: Engine Work Report, Days 1 to 8

**Project:** Genie, an AI agent that learns who someone was through what they loved, suggests personal wishes, and finds the people who can fulfil them. Built on Qloo's taste graph for the Qloo Agentic Hackathon.
**Author:** Umaima
**Role in the team:** Agent and Qloo engine
**Dates of work:** Oct 15 to 19, 2026
**Team:** Umaima (agent and Qloo engine), Alizah and Zunairah (frontend and backend, roles swapped from the plan: Alizah on screens and copy, Zunairah on backend, data, deployment and submission)
**Companion documents:** `docs/Engine.md` (how the engine works), `docs/engine-contract.md` (exact input and output shapes, v1.5), `docs/coverage-report.md` (Qloo coverage test).

---

## 1. Where this work fits

Genie has three layers: the frontend, the backend and database, and the engine (this report). The engine is the part that makes Genie depend on Qloo. It turns what a family tells us into a Taste Portrait, turns the portrait into wishes, learns from a person's reactions, compares itself honestly with a general AI, builds a Bedside Kit for care rooms, explains what it did, and records every Qloo call so the interface can show it.

The engine is plain Python in `backend/engine/`. It never touches the database: the backend calls it and stores what it returns. It never raises errors to its caller, so a Qloo or LLM outage degrades the result and never breaks the app. The feature freeze started after Day 7. Day 8 was polish only: a demo that cannot fall over, honest behaviour on odd inputs and outages, copy the team can read aloud, and a repo free of Qloo data and secrets.

## 2. What was built

### Day 1: Qloo access and the coverage test
- Qloo hackathon key stored only in `.env`.
- A 40-input coverage test across Telugu, Hindi, Urdu and Tamil music, Western rock and pop, K-pop, Arabic music, regional dishes, places, and films and TV (`coverage_test_v2.py`).

### Day 2: coverage report, resolver and cache, ladder levels 1-3
- **Qloo client** (`qloo_client.py`): the only place that calls Qloo. Disk cache (answers and "no results" are cached forever), timeouts, retries with backoff, and a call log that becomes the "Qloo call log" in the interface.
- **Resolver** (`resolve.py`): turns a name into a Qloo entity or tag.
  - Level 1, exact: strict name matching ("A. R. Rahman" equals "A.R. Rahman", brackets ignored). No loose substring rule, because that wrongly accepted a railway station for a temple city.
  - Level 2, another spelling: a built-in alias table, plus the LLM if configured.
  - Level 3, move up a level: a song to its artist, a landmark to its parent. A "thin-hit rule" prefers the known parent when an exact hit has fewer than 3 taste tags (namesake and tribute acts).
- Coverage report written (`docs/coverage-report.md`).

### Day 3: portrait builder, ladder levels 4-6, LLM
- **Portrait builder** (`portrait.py`): collects names from quick facts and Wish Circle answers, resolves them in parallel (5 workers, 20 second overall limit), removes duplicates, and gives every item a source label (told, likely, reacted, ai-only) and a confidence score.
- **Confidence** = source base times level factor. Example: a told song matched through its artist is 0.9 x 0.7 = 0.63.
- **Level 4, era and place:** when fewer than 3 items resolve, Qloo's audience signals (age bracket, region, language) provide "likely" items. It tries several signal combinations, because we cannot know in advance which one Qloo accepts for a person with no favourites. Verified Qloo language tags (Hindi, Urdu, Telugu, Tamil, Korean, Arabic) are used per domain, with separate tags for music and film.
- **Level 5, not in Qloo:** the item is kept, labelled honestly, and excluded from Qloo scoring.
- **Level 6, API error or timeout:** a calm fallback, never a raw error.
- **LLM helper** (`llm.py`): alternate spellings, parent artist or cuisine, and extracting names from free-text circle answers. Provider-agnostic (any OpenAI-compatible endpoint), cached, one retry, and a 60 second circuit breaker. Optional: the engine works without it.

### Day 4: wish generation
- **`generate_wishes(items, person)`** (`wishes.py`) builds 3 to 5 wishes from the portrait.
  - Wishes come from fixed templates (recorded songs, a dish recreated, a place walk, a memory from someone who was there, a live evening, a discovery), so each maps to a real Wish Maker type.
  - **Qloo discovery:** one `/v2/insights` call with the portrait as signals asks for artists that people with similar taste also love, with explainability on. The anchors Qloo weighted most become the "why", and Qloo's own affinity becomes the match score. This wish is labelled "likely" and says it is a guess.
  - **Realism filter:** remote wishes first, one in-person wish last, a place visit is in-person only if it matches the person's region, no celebrity appearances, no medical or clinical wording.
  - A gentle follow-up question when the portrait is thin.

### Day 5: one call, visible steps, polish measured
- **`run_agent(person, inputs)`** (`agent.py`) runs the portrait and then the wishes in one call, sharing one Qloo client. It returns the portrait items, the wishes, a list of **visible steps**, the full Qloo call log, and timings. This is the single function the backend wires.
- **Visible steps** are built from real results: names matched, taste tags collected, Qloo calls made and how many were cached, wishes suggested. Nothing is invented, and if Qloo is down the steps say so.
- **LLM polish measured.** Rewrites are accepted or rejected one wish at a time, with a reason for each rejection. Across seven fictional personas, **26 of 33 rewrites were accepted (79%)**. All seven rejections were the safety checks working. Accepted rewrites were uneven in quality, so polish is **off by default** (`WISH_POLISH=1` turns it on): templates can be read aloud and approved by the team on Day 8, and live LLM text cannot.
- **Stateless endpoint** (`routers/agent_demo.py`): `POST /agent/run` runs the engine for one person and stores nothing. It powers the "try it yourself" demo.

### Day 6: Reaction Mode logic
- **`pick_reaction_cards(items, tried, n)`** (`reaction.py`) chooses what to show a person who cannot recall or speak. Sessions are short (4 cards, never more than 5), told items come first, domains are mixed, nothing already tried or already reacted to is shown again, and every card has a calm prompt.
- **`apply_reactions(person, items, reactions, tried)`** takes "lit up" or "no reaction" taps and updates the portrait. Lit up: the item becomes `reacted` ("They reacted to this") with higher confidence. No reaction on a guess: the guess is removed, because we never claim something nobody reacted to. No reaction on something the family told us: it stays unchanged. Nothing is ever shown as failure, and the message is always "That is okay. Let us try something else." If anything lit up, one Qloo discovery call adds up to 3 new "likely" artists. The portrait item shape is unchanged, so the backend needs no new columns.
- **Tag hygiene.** Reading a real `/agent/run` response showed Qloo tags such as "Old age" and "Ageing" on a film, and a religion-plus-family label on another, attached to guessed items on a family-facing screen. `clean_tags` now drops tags with ageing, illness or end-of-life words and religion-plus-family or community labels, while keeping genre tags.

### Day 7: the comparison and the Bedside Kit
- **Side-by-side** (`sidebyside.py`, `POST /agent/compare`): a general AI's wishes next to Genie's, from the same facts. It answers the hackathon's central rule ("would this work the same without Qloo?") live, and is fair by design: the general AI gets exactly what the family gave (name, birth year, region, language, favourites, circle notes) and no Qloo data, and is held to the same tone filter. If it does not answer, the response says so instead of inventing a result. The evidence block is computed from real results: wishes with taste tags, told items found in Qloo, Qloo calls made, and the discovery wish with its "why" and match score. The two sides run in parallel and the general AI's answer is cached per prompt.
- **Bedside Kit** (`kit.py`, `POST /agent/bedside-kit`): for wishes in a care room. A gentle playlist (reacted first, then told, then at most 3 labelled guesses), small changes to the room, and what visitors can do, all from templates so every line can be read aloud and approved. Comfort and connection only, never treatment, and it ends with "Genie is not a medical service." Food suggestions always say to ask the care team first. Every suggestion says which portrait item it came from, or "general".
- **Clue Box** (photo and voice upload) was not built: the plan makes it "only if on schedule", and it is first on the cut list.

### Day 8: polish, resilience and a clean repo (Oct 19)
Day 8 added no features. Everything below came from checking the engine against odd inputs, outages and a real read of its own copy.

- **Private cache pre-warm store.** Render's free disk is wiped on every redeploy, and Qloo's terms forbid keeping response data in the public repo, so a redeploy would start cold. `backend/engine_cache_store.py` copies the engine's disk cache into a private table, `engine_cache` (migration `006_engine_cache.sql`, row-level security on), with four commands: `init`, `snapshot`, `restore` and `stats`. `main.py` restores the table into the cache folder at server start, in a background thread, controlled by `ENGINE_CACHE_RESTORE=1`. A restore never blocks or breaks start-up. A path check refuses any stored key that would write outside the cache folder. The table holds only hashed request keys and response bodies, with no person data. The first snapshot held 41 files (about 1.9 MB), taken from a clean cache that held only the two demo personas.
- **Second demo person.** `engine/personas.py` holds the two fictional demo people: Nani (born 1948, Hyderabad, Hindi: Hindi film songs, haleem, Charminar) and Jun (born 1992, Seoul, Korean: K-pop, tteokbokki, Busan, the sea). Jun's region matches the city of the two sample Korean Wish Makers, so Jun's in-person wish can be matched to a local maker. `engine/prewarm_run.py` runs both through every entry point twice and checks that pass 2 is fast.
- **Odd-input and outage checks** (`engine/live_odd.py`, 43 live checks). 20 odd names through `resolve` (empty, whitespace, one letter, `None`, digits, emoji, punctuation, script tags, SQL, 5000 characters, Telugu, Hindi, Arabic and Korean script, mixed scripts, a misspelt film, an artist typed as a dish, an unknown domain, a newline). 16 odd people and inputs through `run_agent` (empty, `None`, text and future birth years, an unknown language, 40 junk favourites, duplicates, missing keys, wrong value types in circle answers, very long free text, a phone number and surname, answers that are not a list). Junk through Reaction Mode, the Bedside Kit and the comparison. The checks assert the contract, not particular results: never raises, valid shape, domains and labels from the allowed lists, at most 30 items, no duplicates, wishes in the right order, no clinical wording or exclamation marks, bounded time. `--outage qloo` and `--outage llm` repeat the agent and the comparison with a service pointed at nothing.
- **Fixes the checks found.**
  1. **The 30-item cap.** The level-4 guesses were added after the told items and never trimmed (36 items). Now trimmed to 30, guesses first.
  2. **A dead Qloo took 33 seconds to fail.** The thread pool's `with` block kept waiting for stuck calls after the 20 second limit, and every call retried with its full timeout. Now the portrait builder abandons stuck calls at its limit (they finish in the background and only fill the cache), the client has a separate 4 second connect timeout, and a shared circuit breaker skips uncached Qloo calls for 30 seconds after 3 timeouts or network errors in a row (the cache is still served, and any answer resets the count).
  3. **One failed resolve could drop all later results.** Each result is now handled on its own.
  4. **Heavy-theme guesses.** A real run showed a guessed film for an older person carrying tags about communal conflict, and another with an ageing-related archetype tag. The tag filter now also drops heavy-theme words, and `is_heavy()` makes the portrait builder skip the whole level-4 guess, not only its tags. The next hit takes its place. Told items are never skipped.
  5. **Step wording.** "Gathered 1 names" and "Matched all 1 in Qloo" now read "Gathered 1 name" and "Matched it in Qloo."
- **Copy audit** (`engine/copy_audit.py`). Writes every family-facing sentence the engine can produce (steps, wishes, follow-ups, reaction prompts and messages, the Bedside Kit, the comparison note) for four scenes (Nani, Jun, a thin portrait, an empty portrait) into a git-ignored file for the team read-aloud, and flags clinical words and exclamation marks. The file can contain Qloo discovery names, so it is never committed.
- **Repo hygiene.** Secret scan of the repo and its history (the `.env` file, the Gemini key prefix and the Qloo key prefix): nothing found. `.gitignore` gains `_review/`. `.env.example` gains `ENGINE_CACHE_RESTORE`.
- **New offline suites:** `engine/test_day8.py` (21 checks) and `backend/test_cache_store.py` (8 checks).

## 3. Test evidence

| # | Check | Result |
|---|---|---|
| 1 | Offline suite (`test_offline.py`): matching, tag hygiene, name splitting, ladder levels, confidence, portrait, level 4, HTTP client | 43 of 43 pass |
| 2 | Wish suite (`test_wishes.py`) | 35 of 35 pass |
| 3 | Agent suite (`test_agent.py`) | 17 of 17 pass |
| 4 | Reaction suite (`test_reaction.py`) | 34 of 34 pass |
| 5 | Side-by-side suite (`test_sidebyside.py`): fairness, tone filter, evidence, failures | 21 of 21 pass |
| 6 | Bedside Kit suite (`test_kit.py`): order, wording rules, empty and junk input | 17 of 17 pass |
| 7 | 40-input coverage test through the real ladder | 40 of 40 resolve (33 exact, 1 alternate spelling, 6 via the artist or parent) |
| 8 | Level 4 live for three thin personas (Hindi/Hyderabad, Telugu/Chennai, Korean/Seoul) | Returns items for all three, region and language appropriate |
| 9 | Judge-style extra inputs, 12 cases | No crash. Spelling variants land at levels 1-2, a song at level 3, true misses at level 5 |
| 10 | Level 6, simulated bad key | PASS |
| 11 | LLM live (Gemini free tier) | PASS |
| 12 | `run_agent` live for Nani, and `POST /agent/run` through Swagger | PASS: seven honest steps, items, 5 wishes |
| 13 | Reaction Mode live and through Swagger (`lit_up` and `no_reaction`) | PASS |
| 14 | Side-by-side live and through Swagger (`POST /agent/compare`) | PASS: the general AI answered with 5 wishes and no source; Genie's 5 wishes all carry taste tags; discovery shown with its score |
| 15 | Bedside Kit live for Nani | PASS: playlist, small changes, visitor suggestions, care note |
| 16 | LLM polish on seven fictional personas | 26 of 33 rewrites accepted, every rejection explained |
| 17 | Offline tests never call the network | Confirmed (LLM is stubbed in every suite) |
| 18 | Day 8: the six suites above re-run after all Day 8 changes | 167 of 167 pass |
| 19 | Day 8: `test_day8.py` (cap, heavy-theme skip, tag filter, no waiting on stuck calls, circuit breaker, step wording) | 21 of 21 pass |
| 20 | Day 8: `test_cache_store.py` (path safety) | 8 of 8 pass |
| 21 | Day 8: `live_odd.py`, first run | 42 of 43. The 40-junk-favourites case returned 36 items, above the 30-item cap. |
| 22 | Day 8: `live_odd.py`, after the fixes | 43 of 43. The longest cases took about 20 seconds, which is the portrait limit. |
| 23 | Day 8: Qloo outage, connection refused | Pass, 7.6 seconds (9.3 before the fixes) |
| 24 | Day 8: Qloo outage, silent black hole | Pass, 13.6 seconds (33.0 before the fixes) |
| 25 | Day 8: LLM outage (`--outage llm`) | Pass. The comparison says the general AI is unavailable, and Genie's side is complete. |
| 26 | Day 8: LLM provider errors seen during live testing | Quota errors (429) logged six times in the first odd-input run, and one overload error (503) in the second. The engine carried on with its built-in fallbacks and those checks passed (apart from the cap bug). The comparison screen's message under a quota error was not seen live. It is covered by the offline suite and check 25. A new API key (a new quota) cleared the quota problem. |
| 27 | Day 8: `prewarm_run.py` on a cold cache | Both personas OK, no Qloo errors. Nani 24 to 30 seconds, Jun 16 to 27 seconds. |
| 28 | Day 8: `prewarm_run.py` on a hot cache | Both OK, 29 to 91 milliseconds |
| 29 | Day 8: cache store round trip: `init`, `snapshot` (41 files, 1.9 MB), `stats` (41 rows), delete the local cache, `restore` (41 files), `prewarm_run.py` | Pass. The first pass after a restore took 0.25 to 0.35 seconds, with no Qloo calls. |
| 30 | Day 8: `live_checks.py` `--agent`, `--reaction`, `--compare`, `--kit` | PASS (regression) |
| 31 | Day 8: `copy_audit.py` | First run: 4 flags, all the mandatory "not a medical service" note (a false positive of my own linter, which now exempts it). After the fix: 0 flagged in 139 lines. The heavy-theme guesses no longer appear. |
| 32 | Day 8: secret scan (`backend/.env` tracked or in history, the Gemini key prefix, the Qloo key prefix) | Nothing found |
| 33 | Day 8: `uvicorn` start-up shows `[engine cache] restored N files` after the local cache is deleted | Pending |
| 34 | Day 8: Swagger after the fixes: `/agent/run`, `/agent/compare`, `/agent/bedside-kit`, `/agent/reactions` for both personas | Pending |
| 35 | Day 8: team read-aloud of the copy review | Pending |

Total offline checks: 188 in the engine (167 + 21), plus 8 for the cache store.

## 4. Decisions and reasons

| Decision | Reason |
|---|---|
| Every Qloo call goes through one cached client | Demo safety, speed, and rate limits. One place to log calls for the interface. |
| Strict name matching, no substring shortcut | The shortcut accepted a railway station for a temple city. |
| Songs resolve through their artist and are labelled that way | Qloo has artists, not songs. We never claim the song was found. |
| Food resolves as a tag | Qloo has no dish entities. A plain search returns restaurants, which must not be stored as the dish. |
| Items the family told us stay `told` even when Qloo does not know them | The family said it, so we keep it, and we say plainly that Qloo does not know it. |
| Wishes and the Bedside Kit come from templates | Every line maps to a real maker type or a real portrait item, tone is controlled, and nothing can invent a celebrity or a medical claim. |
| LLM polish is optional, checked per wish, and off by default | Measured 79% acceptance with uneven quality. This is a sensitive product with a team copy review. |
| Remote wishes first, one in-person wish last | Matches the safety plan: remote wishes carry the least risk and work from anywhere. |
| The LLM is optional and provider-agnostic, with a cache and a circuit breaker | No paid key needed. A slow or down provider cannot stall the demo. |
| A wish's discovery says it is a guess | Honesty rule: Genie never pretends to know more than it does. |
| One `run_agent` call with steps built from real counts | The backend wires one function, and the interface can show what the agent did without us making it up. |
| Reaction Mode removes a guess with no reaction but keeps what the family told us | We never claim an unconfirmed guess, and we never contradict the family. |
| "No reaction" always gets the same kind message | The plan says it must never read as failure. |
| Qloo tags with ageing, end-of-life or identity-label wording are dropped | The interface tone rules forbid clinical or dramatic wording, and a guess should not attach a religion label to a person's portrait. |
| Stateless routes alongside the stored flow | Judges can type their own person live without an account. |
| The general AI gets the same facts and no Qloo data, and is held to the same tone filter | A comparison is only credible if it is fair. If the baseline cannot answer, we say so. |
| The Bedside Kit never claims an effect | The plan: comfort and wellbeing, never treatment. Food always says to ask the care team first. |
| Clue Box not built | First on the cut list, and the feature freeze starts after Day 7. |
| The cache snapshot lives in the private database, never in the repo | Qloo's terms allow private caching and forbid public storage. |
| The snapshot is taken only from a clean cache that holds the demo personas | The cache can hold what odd-input or judge runs typed. |
| The restore runs in a background thread and never raises | A database problem must never stop the server from starting. |
| The cache store lives in `backend/`, not in the engine | The engine never touches the database. |
| A circuit breaker in the Qloo client (3 failures, 30 seconds, cache still served) | With Qloo down, every call used to wait out all its retries. |
| A separate 4 second connect timeout | Connecting to a dead host should not cost 10 seconds per attempt. |
| The portrait builder abandons stuck calls at its 20 second limit | Leaving the thread pool's `with` block used to wait for them anyway. |
| A level-4 guess with ageing, end-of-life or heavy-theme tags is skipped, not just stripped of tags | A guess is optional, and a film about communal conflict does not belong on a portrait for someone near the end of life. Told items are never skipped. |
| Odd-input tests assert the contract, not particular results | Results depend on Qloo's data. The contract does not. |
| The outage test uses one unknown favourite | With three unknown told items a portrait is not "thin", and the engine is right to still make wishes. |
| The comparison cache only helps for a demo person's exact inputs | The general AI's prompt includes the favourites and the family notes. The demo buttons must send the persona's exact inputs. |

## 5. Challenges

1. **Level 4 returned irrelevant items** (electronic artists for an older Hindi-speaking person). The language tag ids in the code were unverified guesses. Fix: looked up the real tag ids with the Qloo tags endpoint, and used separate tags for music and film.
2. **The first LLM model name was retired**, and the next one took 30 to 40 seconds to answer a trivial prompt. Fix: probed the models available to the key, picked a fast lite model (1.5 to 3 seconds), added a timeout, one retry, and a circuit breaker.
3. **The offline tests were quietly calling the real LLM** once the key was set. Fix: stub the LLM in every suite so offline means offline.
4. **A `.gitignore` rule for `engine/_*` would also have ignored `__init__.py`**, which would break `from engine import ...` for the team and on Render. Fix: list the private folders explicitly.
5. **Wish polish was always rejected** because the safety check required every wish to name its first source item, and one template does not. Fix: only names that were in the original text must survive.
6. **Wishes came out in the wrong order** (a live evening ranked above recorded songs). Fix: remote first, with a reserved last slot for one in-person wish.
7. **One bad rewrite threw away all five.** Fix: rewrites are accepted per wish, and each rejection says why, which is how we measured 79%.
8. **A template read as recording the singer** ("records Kishore Kumar"). Found through the LLM rewrites. Fix: "records a few favourites with X and Y in mind". The same issue appeared in the Bedside Kit ("a line of Kishore Kumar") and was fixed the same way.
9. **Qloo tags were not safe to show as they came.** A real response carried ageing wording and a religion-plus-family label on guessed items. Fix: a tag-name filter in `clean_tags`, with tests.
10. **A short sentence became an item.** Without the LLM, "She sang along to Queen" passed the name splitter (five words) and showed up as a "not in Qloo" favourite. A new test caught it. Fix: segments with sentence words are not names.
11. **A merge conflict** on `routers/agent.py`: two people had written a router with the same name. Fix: both kept, the stateless routes moved to `routers/agent_demo.py`.
12. **The portrait could exceed the 30-item cap** (Day 8). Found by the odd-input run (36 items). Fix: trim to 30, dropping guesses first.
13. **A dead Qloo took 33 seconds to fail** (Day 8). Two causes: the thread pool waited for stuck calls, and every call retried with its full timeout. Fix: abandon stuck calls, add a connect timeout and a circuit breaker. Now about 14 seconds.
14. **One failed resolve could drop every later result** (Day 8). A single `try` wrapped the whole results loop. Fix: each result is handled on its own.
15. **A guessed film carried heavy tags** on a portrait for an older person (Day 8). The tag filter alone was not enough, because the film itself was a poor guess. Fix: a wider filter, and the whole guess is skipped.
16. **My first outage test was wrong** (Day 8). It expected a follow-up question when three unknown told items came back, but that portrait is not thin. Fix: the outage test uses one favourite.
17. **My copy linter flagged the mandatory medical note** (Day 8) because the note contains the word "medical". Fix: the note is exempt, the rest is still linted.
18. **The cache store failed at first** (Day 8): the table did not exist yet. Fix: an `init` command that creates it through the same connection the backend uses, so nobody needs the Supabase screen. A small bug (the usage text printing after `init`) was fixed the same day.
19. **The LLM free tier ran out of quota during live testing** (Day 8). The engine degraded as designed, and a new key cleared it. Lesson: the live odd-input run spends quota, so it must not be run near a demo.

## 6. Known limits

- Level 4 is audience-popularity for the person's age bracket, region and language, not era-specific. It only runs for thin portraits and is always labelled "likely". With only two favourites it still adds up to six guesses, and some can look odd for the person (an unfamiliar title, for example). Ageing, end-of-life and heavy-theme guesses are skipped.
- The heavy-theme skip covers level-4 guesses only. Discovery and Reaction Mode artists are not screened by theme.
- Discovery artists can be unexpected for a given taste. They are labelled likely and the family decides.
- Qloo has no song or dish entities, so a song is matched only at artist level.
- Some artists have no taste tags in Qloo, so items resolved to them carry little data into matching.
- Free-tier LLM latency and quota vary. The cache and breaker make it safe, but a person typed live can get a comparison with `available: false`.
- A person typed live is cold: 15 to 30 seconds. The frontend needs a calm waiting state and a timeout above the backend's 40 seconds.
- The comparison's general AI is the same free-tier model the engine uses for its helper. A stronger general model would write better prose, but would still have no taste links, labels or maker mapping. The two demo personas' answers are in the private cache snapshot, but only for their exact inputs.
- The Bedside Kit lists names to search for in a music app, not recordings, and most names are artists.
- The private cache snapshot is only as clean as the cache it was taken from, and it must be re-taken from a clean demo-persona cache if the personas change.
- Reaction Mode: the engine does not remember the `tried` list, and the refresh adds artists only. The interface must provide the Stop button.
- The tag filter drops any tag whose name contains a listed word, so a genre with such a word in its name loses that tag.
- The Wish Circle answer keys are `music`, `food`, `place`, `film` and `joy`. The engine maps the first four. `joy` ("what made them light up") is read only when the LLM is on.
- Parking lot (not built, per the feature freeze): Clue Box, a `discovered` field on discovery wishes, cross-domain additions in Reaction Mode, a cap on how many tags the interface shows per item.
- Screens for the "what Genie did" panel, Reaction Mode, the comparison and the Bedside Kit, and the first live deploy, belong to the frontend and backend owners.

## 7. What is next

| Day | Engine task |
|---|---|
| 8 | Done (see above). Remaining: the three pending checks in section 3 (rows 33 to 35), then the commit. |
| 9 | Judge test with 10 varied people end to end. Technical README and Qloo notes for the Devpost description. Re-take the cache snapshot only from a clean demo-persona cache. Do not run `live_odd.py` near the demo. |
| 10 | Final bug fixes with the team, demo video if there is time |

Open questions for the team are listed in `docs/engine-contract.md` ("Status of the open questions"). Since Day 8 the Wish Circle answer keys are answered (see above).

## 8. Reusable text

**For the Devpost description, How it is Qloo-powered:**
Genie uses Qloo four ways. It resolves every favourite a family names to a Qloo entity or taste tag, moving from a song to its artist and from a spelling variant to the right entity when needed. It asks Qloo's taste graph what people with similar taste also love, using Qloo's own match scores and explanations to suggest a wish the family might not think of. When a person can no longer speak, it shows a few items, learns from what lights them up, and asks Qloo for more in that direction. And it matches Wish Makers to the portrait through shared taste links. A visible call log shows every Qloo request, a short list of steps shows what the agent did, and a side-by-side screen puts a general AI's wishes next to Genie's, from the same facts, with the evidence.

**For the Devpost description, Challenges:**
Qloo has entities for artists and places, but not for individual songs or dishes. Genie resolves by type, moves from a song to its artist, treats dishes as taste tags, and labels anything it could not find as "not in Qloo" instead of hiding it. Qloo's own tags are not always right for a family's screen, so we filter wording about ageing and end of life before anything is shown. Every wish says whether it came from what the family told us or from a Qloo guess. We also measured an LLM that rewrites wish wording: our safety checks accepted it about four times in five, but we kept the reviewed templates as the default, because this is a product where every sentence should be one we chose. And we made the comparison with a general AI fair: it gets the same facts, no Qloo data, and the same tone rules, and if it cannot answer we say so.

**For the Devpost description, Challenges (Day 8 addition):**
We made the agent safe to demo, not only to build. Qloo's answers are cached privately and restored when the server starts, so a redeploy does not start cold. A circuit breaker makes the agent fail fast and honestly when a service is down, and we test that by pointing it at a dead address. We fed it odd input on purpose (empty names, emoji, scripts in four languages, injected code, 5000-character answers) and made it a rule that it never crashes. We also found that a guessed film for an older person could carry tags about communal conflict, so Genie now skips any guess with heavy or end-of-life themes instead of showing it.

**For the README, Engine section:**
The engine is in `backend/engine/`. Set `QLOO_API_KEY` (and optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`) in `backend/.env`. The backend calls `run_agent(person, inputs)`, and for the other screens `pick_reaction_cards`, `apply_reactions`, `side_by_side` and `generate_bedside_kit`. Run `python engine\test_offline.py`, `test_wishes.py`, `test_agent.py`, `test_reaction.py`, `test_sidebyside.py`, `test_kit.py` and `test_day8.py` for offline tests, and `python engine\live_checks.py` for checks against real Qloo. See `docs/Engine.md`.