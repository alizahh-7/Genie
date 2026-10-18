# Genie: Engine Work Report, Days 1 to 5

**Project:** Genie, an AI agent that learns who someone was through what they loved, suggests personal wishes, and finds the people who can fulfil them. Built on Qloo's taste graph for the Qloo Agentic Hackathon.
**Author:** Umaima
**Role in the team:** Agent and Qloo engine
**Dates of work:** Oct 15 to 18, 2026
**Team:** Umaima (agent and Qloo engine), Alizah (team lead, frontend, copy), Zunairah (backend, data, deployment, submission)
**Companion documents:** `docs/Engine.md` (how the engine works), `docs/engine-contract.md` (exact input and output shapes), `docs/coverage-report.md` (Qloo coverage test).

---

## 1. Where this work fits

Genie has three layers: the frontend (Alizah), the backend and database (Zunairah), and the engine (this report). The engine is the part that makes Genie depend on Qloo. It turns what a family tells us into a Taste Portrait, turns the portrait into wishes, explains what it did, and records every Qloo call so the interface can show it.

The engine is plain Python in `backend/engine/`. It never touches the database: the backend calls it and stores what it returns. It never raises errors to its caller, so a Qloo or LLM outage degrades the result and never breaks the app.

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

### Day 5: one call, visible steps, and the LLM polish measured
- **`run_agent(person, inputs)`** (`agent.py`) runs the portrait and then the wishes in one call, sharing one Qloo client. It returns the portrait items, the wishes, a list of **visible steps**, the full Qloo call log, and timings. This is the single function the backend needs to wire.
- **Visible steps** (collect, resolve, expand, fill the gaps when the portrait is thin, build, discover, suggest wishes) are built from real results: how many names matched, how many through an artist, how many taste tags were collected, how many Qloo calls were made and how many were cached, how many wishes were suggested. Nothing is invented, and if Qloo is down the steps say so.
- **LLM polish measured.** Rewrites are now accepted or rejected one wish at a time, with the reason for each rejection. Across seven fictional personas (Hindi, Korean, Telugu, Tamil, classic rock, Arabic, and a thin one-item portrait), **26 of 33 rewrites were accepted (79%)**. All seven rejections were the safety checks working: six discovery wishes where the LLM dropped a name, and one in-person wish that lost "family member". Accepted rewrites were uneven in quality, with a few awkward phrasings.
- **Decision:** polish is off by default in `run_agent` (`WISH_POLISH=1` turns it on). Templates can be read aloud and approved by the team on Day 8, and live LLM text cannot. The template wording for recorded songs was also made unambiguous ("a few favourites with X and Y in mind"), because the LLM's rewrites exposed that "records Kishore Kumar" reads as recording the singer.

## 3. Test evidence

| # | Check | Result |
|---|---|---|
| 1 | Offline suite (`test_offline.py`): matching, ladder levels, confidence, portrait, level 4, HTTP client | 40 of 40 pass |
| 2 | Wish suite (`test_wishes.py`): realism rules, honesty labels, explainability, robustness, LLM polish safety | 35 of 35 pass |
| 3 | Agent suite (`test_agent.py`): step honesty and order, Qloo down, empty input, a client that raises | 17 of 17 pass |
| 4 | 40-input coverage test through the real ladder | 40 of 40 resolve (33 exact, 1 alternate spelling, 6 via the artist or parent) |
| 5 | Level 4 live for three thin personas (Hindi/Hyderabad, Telugu/Chennai, Korean/Seoul) | Returns items for all three, region and language appropriate |
| 6 | Judge-style extra inputs, 12 cases | No crash. Spelling variants land at levels 1-2, a song at level 3, true misses at level 5 |
| 7 | Level 6, simulated bad key | PASS |
| 8 | LLM live (Gemini free tier) | PASS (`llm_ping.py` returns an answer) |
| 9 | Wishes live for the Nani demo person | 5 wishes: remote first, in-person last, discovery with Qloo's match score |
| 10 | `run_agent` live for Nani | PASS: six honest steps, 6 items, 5 wishes, 147 ms fully cached |
| 11 | LLM polish on seven fictional personas | 26 of 33 rewrites accepted, every rejection explained |
| 12 | Offline tests never call the network | Confirmed (LLM is stubbed in all three suites) |

## 4. Decisions and reasons

| Decision | Reason |
|---|---|
| Every Qloo call goes through one cached client | Demo safety, speed, and rate limits. One place to log calls for the interface. |
| Strict name matching, no substring shortcut | The shortcut accepted a railway station for a temple city. |
| Songs resolve through their artist and are labelled that way | Qloo has artists, not songs. We never claim the song was found. |
| Food resolves as a tag | Qloo has no dish entities. A plain search returns restaurants, which must not be stored as the dish. |
| Items the family told us stay `told` even when Qloo does not know them | The family said it, so we keep it, and we say plainly that Qloo does not know it. |
| Wishes come from templates | Every wish maps to a real maker type, tone is controlled, and nothing can invent a celebrity or a medical claim. |
| LLM polish is optional, checked per wish, and off by default | Measured 79% acceptance with uneven quality. This is a sensitive product with a team copy review. |
| Remote wishes first, one in-person wish last | Matches the safety plan: remote wishes carry the least risk and work from anywhere. |
| The LLM is optional and provider-agnostic, with a cache and a circuit breaker | No paid key needed. A slow or down provider cannot stall the demo. |
| A wish's discovery says it is a guess | Honesty rule: Genie never pretends to know more than it does. |
| One `run_agent` call with steps built from real counts | The backend wires one function, and the interface can show what the agent did without us making it up. |

## 5. Challenges

1. **Level 4 returned irrelevant items** (electronic artists for an older Hindi-speaking person). The language tag ids in the code were unverified guesses. Fix: looked up the real tag ids with the Qloo tags endpoint, and used separate tags for music and film.
2. **The first LLM model name was retired**, and the next one took 30 to 40 seconds to answer a trivial prompt. Fix: probed the models available to the key, picked a fast lite model (1.5 to 3 seconds), added a timeout, one retry, and a circuit breaker.
3. **The offline tests were quietly calling the real LLM** once the key was set. Fix: stub the LLM in every suite so offline means offline.
4. **A `.gitignore` rule for `engine/_*` would also have ignored `__init__.py`**, which would break `from engine import ...` for the team and on Render. Fix: list the private folders explicitly.
5. **Wish polish was always rejected** because the safety check required every wish to name its first source item, and one template does not. Fix: only names that were in the original text must survive.
6. **Wishes came out in the wrong order** (a live evening ranked above recorded songs). Fix: remote first, with a reserved last slot for one in-person wish.
7. **One bad rewrite threw away all five.** Fix: rewrites are accepted per wish, and each rejection says why, which is how we measured 79%.
8. **A template read as recording the singer** ("records Kishore Kumar"). Found through the LLM rewrites. Fix: "records a few favourites with X and Y in mind".

## 6. Known limits

- Level 4 is audience-popularity for the person's age bracket, region and language, not era-specific. It only runs for thin portraits and is always labelled "likely".
- Discovery artists can be unexpected for a given taste. They are labelled likely and the family decides.
- Qloo has no song or dish entities, so a song is matched only at artist level.
- Some artists have no taste tags in Qloo, so items resolved to them carry little data into matching.
- Free-tier LLM latency varies. The cache and breaker make it safe, but the first call after a pause can fail.
- The Qloo cache is wiped on every Render redeploy, so the first run of a demo person after each deploy is uncached. Run it once after each deploy. A private pre-warm store comes on Day 8.
- Circle answer keys are assumed to contain `music`, `food`, `place` or `film`. The "what made them light up" answer is not mapped to a domain yet.
- Not built yet: Reaction Mode logic, the Bedside Kit, and the side-by-side screen.
- Day 5 is not finished for the team until the backend exposes `run_agent`, the frontend shows the steps, and the first live deploy is done.

## 7. What is next

| Day | Engine task |
|---|---|
| 5 | Backend endpoint for `run_agent`, the steps on screen, first live deploy (with Zunairah and Alizah) |
| 6 | Reaction Mode logic |
| 7 | Feature freeze, side-by-side screen (generic AI vs Genie), Bedside Kit generator |
| 8 | Caching, timeouts, error states, second demo person, odd-input tests, private pre-warm store |
| 9 | Judge test with 10 varied people, technical README and Qloo notes for the Devpost description |

Open questions for the team are listed at the end of `docs/engine-contract.md` ("What changed from v1").

## 8. Reusable text

**For the Devpost description, How it is Qloo-powered:**
Genie uses Qloo three ways. It resolves every favourite a family names to a Qloo entity or taste tag, moving from a song to its artist and from a spelling variant to the right entity when needed. It asks Qloo's taste graph what people with similar taste also love, using Qloo's own match scores and explanations to suggest a wish the family might not think of. And it matches Wish Makers to the portrait through shared taste links. A visible call log shows every Qloo request, and a short list of steps shows what the agent did and how many Qloo calls each step made.

**For the Devpost description, Challenges:**
Qloo has entities for artists and places, but not for individual songs or dishes. Genie resolves by type, moves from a song to its artist, treats dishes as taste tags, and labels anything it could not find as "not in Qloo" instead of hiding it. Every wish says whether it came from what the family told us or from a Qloo guess. We also measured an LLM that rewrites wish wording: it was accepted by our safety checks about four times in five, but we kept the reviewed templates as the default, because this is a product where every sentence should be one we chose.

**For the README, Engine section:**
The engine is in `backend/engine/`. Set `QLOO_API_KEY` (and optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`) in `backend/.env`. The backend calls `run_agent(person, inputs)`. Run `python engine\test_offline.py`, `python engine\test_wishes.py` and `python engine\test_agent.py` for offline tests, and `python engine\live_checks.py` for checks against real Qloo. See `docs/Engine.md`.