# Genie: Engine Work Report, Days 1 to 7

**Project:** Genie, an AI agent that learns who someone was through what they loved, suggests personal wishes, and finds the people who can fulfil them. Built on Qloo's taste graph for the Qloo Agentic Hackathon.
**Author:** Umaima
**Role in the team:** Agent and Qloo engine
**Dates of work:** Oct 15 to 18, 2026
**Team:** Umaima (agent and Qloo engine), Alizah and Zunairah (frontend and backend, roles swapped from the plan: Alizah on screens and copy, Zunairah on backend, data, deployment and submission)
**Companion documents:** `docs/Engine.md` (how the engine works), `docs/engine-contract.md` (exact input and output shapes), `docs/coverage-report.md` (Qloo coverage test).

---

## 1. Where this work fits

Genie has three layers: the frontend, the backend and database, and the engine (this report). The engine is the part that makes Genie depend on Qloo. It turns what a family tells us into a Taste Portrait, turns the portrait into wishes, learns from a person's reactions, compares itself honestly with a general AI, builds a Bedside Kit for care rooms, explains what it did, and records every Qloo call so the interface can show it.

The engine is plain Python in `backend/engine/`. It never touches the database: the backend calls it and stores what it returns. It never raises errors to its caller, so a Qloo or LLM outage degrades the result and never breaks the app. The feature freeze starts after Day 7: from here the engine only gets fixes, polish and tests.

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

Total offline checks: 167.

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
| The Bedside Kit never claims an effect | The plan: comfort and wellbeing, never treatment. Food always says to ask the care team. |
| Clue Box not built | First on the cut list, and the feature freeze starts after Day 7. |

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

## 6. Known limits

- Level 4 is audience-popularity for the person's age bracket, region and language, not era-specific. It only runs for thin portraits and is always labelled "likely". With only two favourites it still adds six guesses, and some can look odd or heavy for the person.
- Discovery artists can be unexpected for a given taste. They are labelled likely and the family decides.
- Qloo has no song or dish entities, so a song is matched only at artist level.
- Some artists have no taste tags in Qloo, so items resolved to them carry little data into matching.
- Free-tier LLM latency varies. The cache and breaker make it safe, but the first call after a pause can fail.
- The comparison's general AI is the same free-tier model the engine uses for its helper. A stronger general model would write better prose, but would still have no taste links, labels or maker mapping. Its side can be unavailable if the LLM is slow.
- The Bedside Kit lists names to search for in a music app, not recordings, and most names are artists.
- The Qloo cache is wiped on every Render redeploy, so the first run of a demo person after each deploy is uncached. Run it once after each deploy. A private pre-warm store comes on Day 8.
- Reaction Mode: the engine does not remember the `tried` list, and the refresh adds artists only. The interface must provide the Stop button.
- The tag filter drops any tag whose name contains a listed word, so a genre with such a word in its name loses that tag.
- Circle answer keys are assumed to contain `music`, `food`, `place` or `film`. The "what made them light up" answer is not mapped to a domain yet.
- Parking lot (not built, per the feature freeze): Clue Box, a `discovered` field on discovery wishes, cross-domain additions in Reaction Mode, a cap on how many tags the interface shows per item.
- Screens for the "what Genie did" panel, Reaction Mode, the comparison and the Bedside Kit, and the first live deploy, belong to the frontend and backend owners and have not started.

## 7. What is next

| Day | Engine task |
|---|---|
| 8 | Polish only: caching and the private pre-warm store, timeouts, error states, second demo person, odd-input tests, copy read-aloud with the team |
| 9 | Judge test with 10 varied people, technical README and Qloo notes for the Devpost description |
| 10 | Final bug fixes with the team, demo video if there is time |

Open questions for the team are listed in `docs/engine-contract.md` ("Status of the open questions").

## 8. Reusable text

**For the Devpost description, How it is Qloo-powered:**
Genie uses Qloo four ways. It resolves every favourite a family names to a Qloo entity or taste tag, moving from a song to its artist and from a spelling variant to the right entity when needed. It asks Qloo's taste graph what people with similar taste also love, using Qloo's own match scores and explanations to suggest a wish the family might not think of. When a person can no longer speak, it shows a few items, learns from what lights them up, and asks Qloo for more in that direction. And it matches Wish Makers to the portrait through shared taste links. A visible call log shows every Qloo request, a short list of steps shows what the agent did, and a side-by-side screen puts a general AI's wishes next to Genie's, from the same facts, with the evidence.

**For the Devpost description, Challenges:**
Qloo has entities for artists and places, but not for individual songs or dishes. Genie resolves by type, moves from a song to its artist, treats dishes as taste tags, and labels anything it could not find as "not in Qloo" instead of hiding it. Qloo's own tags are not always right for a family's screen, so we filter wording about ageing and end of life before anything is shown. Every wish says whether it came from what the family told us or from a Qloo guess. We also measured an LLM that rewrites wish wording: our safety checks accepted it about four times in five, but we kept the reviewed templates as the default, because this is a product where every sentence should be one we chose. And we made the comparison with a general AI fair: it gets the same facts, no Qloo data, and the same tone rules, and if it cannot answer we say so.

**For the README, Engine section:**
The engine is in `backend/engine/`. Set `QLOO_API_KEY` (and optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`) in `backend/.env`. The backend calls `run_agent(person, inputs)`, and for the other screens `pick_reaction_cards`, `apply_reactions`, `side_by_side` and `generate_bedside_kit`. Run `python engine\test_offline.py`, `test_wishes.py`, `test_agent.py`, `test_reaction.py`, `test_sidebyside.py` and `test_kit.py` for offline tests, and `python engine\live_checks.py` for checks against real Qloo. See `docs/Engine.md`.