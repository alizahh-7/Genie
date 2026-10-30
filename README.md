# Genie

**Everyone deserves to be known before they go.**

Genie is an AI agent that learns who someone was through what they loved, suggests personal wishes only they would recognise, and finds the real people who can make those wishes happen. Its cultural intelligence comes from the **Qloo taste graph**. Built for the **Qloo Agentic Hackathon** ("Agents, but with taste").

| | |
|---|---|
| **Live demo** | `<PASTE FRONTEND URL HERE>` (Vercel) |
| **API (backend)** | https://genie-ld8p.onrender.com (interactive docs at `/docs`) |
| **Repository** | https://github.com/alizahh-7/Genie |
| **License** | MIT (see `LICENSE`) |

> The free backend host can take up to 90 seconds to wake after a quiet period. If the first click is slow, wait; it is not broken.

**Fastest way to try it:** open the live demo, choose **Explore the demo**, and follow the guided story of Nani, a fictional grandmother. Then open **How Genie uses Qloo** to see the evidence. All people and Wish Makers in this build are fictional.

---

## The problem

When someone is seriously ill or in the last stage of life, the people around them want to do something meaningful. Generic advice ("play their favourite music", "bring flowers") fails because it does not know the person. What a grandmother from Hyderabad who loved 1970s Hindi film songs and her own mother's biryani would actually treasure is very specific, and a general AI can only guess.

## What Genie does

1. **Taste Portrait.** A family gives quick facts, a few favourites (songs, dishes, films, places), era and place, and can invite relatives through a **Wish Circle** link to add memories. Genie builds a portrait of the person from those inputs.
2. **Personal wishes.** From the portrait, Genie proposes wishes (for example "someone who sings her favourite songs for her") and one **discovery wish** based on Qloo's "people like them also love" signal. Anything Genie is guessing is labelled as a guess.
3. **Wish Network.** Each wish is matched to **Wish Makers** (musicians, cooks, storytellers and so on). Every match shows its reasons and whether Qloo or a plain name match found it.
4. **Wish Book.** A keepsake the family can compile, print and share with a private link, and revoke.
5. **Reaction Mode** and **Bedside Kit.** Gentle prompts for when a person cannot tell us their favourites, and a small kit for visitors. These are comfort and connection only. Genie is **not** a medical service.
6. **Side-by-side with a general AI.** The same facts, no Qloo data, shown next to Genie's output, so you can see what Qloo changes.
7. **Hospice portal (organisation side).** Hospices apply, get approved, and manage stories with roles, consent confirmation, opaque case keys, an activity log and deletion. This is how Genie could be paid for: the hospice, not the family.

## How Genie is Qloo-powered

If Genie worked the same without Qloo, it would be the wrong thing to build. It does not.

| Job | What Qloo does | Where it shows |
|---|---|---|
| **Understand** | Every favourite is resolved to a Qloo entity or taste tag (search, tags and insights endpoints). The tags become the portrait's "what kind of taste is this" layer. | Taste Portrait, Taste Map |
| **Discover** | Qloo's insights endpoint, with explainability on, returns what people with close taste also love. The wish names the anchors Qloo weighted most. When the input is thin, Qloo's audience signals (birth year, city) build a "likely from their era and region" portrait. | Wishes page, discovery wish |
| **Match** | Wishes are matched to Wish Makers by comparing Qloo entity ids and tags (exact entity, shared taste tags, then an artist Qloo links to the item). | Wish Network, match reasons |

Qloo is visible, not hidden: each wish carries a **Qloo receipt**, there is a **live log of every Qloo call** in plain language, and the **How Genie uses Qloo** page shows the coverage evidence.

### The agent

`run_agent` runs visible steps: **collect → resolve → expand → era and place (only if thin) → build → discover → wishes**. Each step reports real counts (calls, cached, errors).

### Fallback ladder (nothing ever fails empty)

1. Exact entity found
2. Alternate spelling or alias
3. Parent item (the artist, cuisine or city)
4. Era-and-place signals
5. Not in Qloo: kept, labelled "Suggested by AI, not in Qloo", excluded from Qloo scoring
6. Qloo error or timeout: a cached answer, or a calm message and a retry

### Honesty rules built into the product

- Every item is labelled: *Told by family*, *They reacted to this*, *Likely from their era and region*, or *Suggested by AI, not in Qloo*.
- A discovery always says it is a guess.
- No clinical claims, ever.

### Evidence

- **Coverage test:** 40 real-world inputs (Telugu, Hindi, Urdu and Tamil film songs, Western rock and pop, K-pop, Arabic and Latin music, regional dishes, places, films). 38 of 40 resolved automatically; all 40 land on something true through the ladder. By domain: music 21/23, food 6/6, places 6/6, film 4/4, TV 1/1.
- **Judge test:** 12 varied fictional people (different cultures and languages) went through the real API, from creating a person to a compiled, shared and deleted Wish Book, with no failed checks.
- **Automated tests:** hundreds of offline engine checks (fallback ladder, wishes, agent, Reaction Mode, side-by-side, Bedside Kit, cache, circuit breaker, call-log labels) and 162 frontend tests, plus typecheck and a production build.

---

## Architecture

```
Next.js frontend (Vercel)  ──►  FastAPI backend (Render)  ──►  Supabase Postgres
                                      │
                                      ├──►  engine/  (plain Python, never touches the database)
                                      │        ├──► Qloo API (search, tags, insights)
                                      │        └──► optional LLM (any OpenAI-compatible endpoint)
                                      └──►  private engine_cache table (restored at start-up)
```

| Folder | Contents |
|---|---|
| `frontend/` | Next.js 14 app (landing, demo, story pages, Wish Book, org portal, "How Genie uses Qloo") |
| `backend/` | FastAPI API, Supabase access, matching, email, admin |
| `backend/engine/` | The agent and Qloo engine: resolve, portrait, wishes, reaction, kit, side-by-side |
| `backend/migrations/` | SQL migrations `001`–`009` |
| `docs/` | Engine, contract, privacy, deployment, testing, Devpost notes, reports |
| `design/` | Design system, copy guidelines, wireframes |

The engine returns data and the backend stores it. The exact input and output shapes are in `docs/engine-contract.md`.

## Tech stack

Next.js 14, React 18, TypeScript, Tailwind CSS, Vitest · FastAPI, Python, psycopg, httpx · Supabase (Postgres) · Render · Vercel · Qloo API · optional Gemini or any OpenAI-compatible LLM · Brevo (transactional email)

---

## Run it locally

### Backend

1. `cd backend`
2. `python -m venv venv`, then `.\venv\Scripts\Activate.ps1` (Windows) or `source venv/bin/activate`
3. `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in the values (table below)
5. In the Supabase SQL editor, run `backend/schema.sql`, then `backend/migrations/001` through `009` in order
6. `python engine_cache_store.py init` (creates the private table that keeps the Qloo cache between deploys)
7. `python seed.py` (loads 15 fictional sample Wish Makers; safe to repeat), then `python enrich_makers.py`
8. `uvicorn main:app --reload`
9. Open http://127.0.0.1:8000/docs

### Frontend

1. `cd frontend`
2. `cp .env.example .env.local` (PowerShell: `Copy-Item .env.example .env.local`). Set `NEXT_PUBLIC_API_URL` to the deployed API or `http://127.0.0.1:8000`.
3. `npm install`
4. `npm run dev`, then open http://localhost:3000
5. Checks: `npm run typecheck`, `npm test`, `npm run build`

### Environment variables (backend)

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Supabase session-pooler connection string |
| `QLOO_API_KEY`, `QLOO_API_URL` | Qloo hackathon key and `https://hackathon.api.qloo.com` |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | Optional. Any OpenAI-compatible endpoint. Without them everything works except the general-AI side of the comparison |
| `ALLOWED_ORIGINS`, `FRONTEND_URL` | The frontend address (no trailing slash) |
| `ADMIN_TOKEN`, `ADMIN_EMAIL` | Admin access and notification address |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Email (optional) |
| `DEMO_TTL_DAYS`, `DEMO_PERSON_IDS` | Demo data expiry and pinned demo people |
| `WISH_POLISH`, `ENGINE_CACHE_RESTORE` | Optional LLM polish switch; restore the private cache at start-up |

Deployment steps for Render, Supabase and Vercel are in `docs/deployment.md`.

---

## Try the engine without a stored person

- `POST /agent/run` runs the whole agent for one fictional person and stores nothing.
- `POST /agent/compare`, `/agent/reaction-cards`, `/agent/reactions` and `/agent/bedside-kit` power the other screens.
- Fictional demo people live in `backend/engine/personas.py`. The live site's demo people are Nani and Sana, with family memories in `backend/demo_memories.sql`.

## Tests

Run from `backend/`. The offline suites need no network and no keys.

```
python engine/test_offline.py
python engine/test_wishes.py
python engine/test_agent.py
python engine/test_reaction.py
python engine/test_sidebyside.py
python engine/test_kit.py
python engine/test_day8.py
python engine/test_labels.py
python test_cache_store.py
```

Frontend, from `frontend/`: `npm test` and `npm run typecheck`.

Against the real Qloo API: `python engine/live_checks.py`, `python engine/live_odd.py` (odd inputs and outages), `python engine/prewarm_run.py`.

Whole path through a running server for varied fictional people: `python judge_test.py <API URL>` (add `--extra` for two odd ones). Post-deploy check: `python post_deploy_check.py <API URL>`.

---

## Reliability

Every Qloo call has a connect timeout, retries and a circuit breaker. Answers are cached, so repeat calls are instant and demo people always load fast. No engine function raises to its caller: failure becomes a lower fallback level, fewer wishes, or a calm "unavailable" state.

## Privacy and safety

- No accounts. Minimal data: first name, birth year, region, favourites. No surnames, addresses, health data or ID numbers.
- Everything for a person can be deleted with one call; demo data expires automatically; Wish Book links can be revoked.
- Secrets live in environment variables only. `.env` is git-ignored and was never committed.
- Qloo receives the names of favourites. If an LLM key is set, the LLM receives names of songs, artists, dishes, places and films plus region and language. For the side-by-side comparison, the general AI also receives first name, birth year, region, language, favourites and Wish Circle notes, because that is exactly what Genie was given. Wish Circle contributors see this in the consent note.
- Free-tier LLM services may use prompts to improve their models, so **never enter real people's details in the demo.**
- **Qloo data.** Qloo's terms forbid publishing its response data. The engine cache (`backend/engine/_cache/`) and coverage files are git-ignored. A private copy lives in the `engine_cache` database table.
- Genie is not a medical service. Reaction Mode and the Bedside Kit are comfort and connection only.

## Honest limits

- The Wish Network is seeded with clearly labelled **fictional** sample makers. Real onboarding, identity checks and partner hospices are next steps.
- The hospice side is a working portal for demonstration; real hospice pilots are future work.
- Qloo's coverage depends on its data. Songs resolve at artist level and dishes as taste tags; two of 40 test inputs did not resolve directly and fall back through the ladder.
- The free hosting tier is slow to wake.

## Docs

- `docs/Engine.md`: how the engine works
- `docs/engine-contract.md`: exact input and output shapes
- `docs/devpost-technical-notes.md`: how Genie uses Qloo, with evidence
- `docs/deployment.md`, `docs/testing.md`: deploy and test
- `docs/privacy.md`: what is collected and how it is deleted
- `docs/umaima-engine-report-days-1-9.md`, `docs/detailed_backend_report_zunairah.md`: engine and backend reports

## Team

Alizah (team lead, repository, data, matching, deployment) · Umaima (agent and Qloo engine) · Zunairah (design, frontend and backend)

## License

MIT. See `LICENSE`.