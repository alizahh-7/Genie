# Genie

Everyone deserves to be known before they go.

Genie is an AI agent that learns who someone was through what they loved, suggests personal wishes only they would recognize, and finds the real people who can make those wishes happen. Powered by Qloo's taste graph. Built for the Qloo Agentic Hackathon.

## Structure
- `backend/` FastAPI API, Supabase (Postgres) database, sample Wish Makers
- `backend/engine/` the agent and Qloo engine (see `docs/Engine.md` and `docs/engine-contract.md`)
- `frontend/` Next.js app (see `frontend/README.md`)
- `docs/` project documents

## Run the backend locally
1. `cd backend`
2. `python -m venv venv` then `.\venv\Scripts\Activate.ps1`
3. `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `QLOO_API_KEY` and, optionally, the `LLM_*` values
5. Run `backend/schema.sql` once in the Supabase SQL editor
6. `python engine_cache_store.py init` (once: creates the private table that keeps the Qloo cache between deploys)
7. `python seed.py` then `uvicorn main:app --reload`
8. Open http://127.0.0.1:8000/docs

## Run the frontend locally
1. `cd frontend`
2. `Copy-Item .env.example .env.local` (PowerShell) or `cp .env.example .env.local`. `NEXT_PUBLIC_API_URL` points to the backend: the deployed API, or `http://127.0.0.1:8000` for a local one.
3. `npm install`
4. `npm run dev`, then open http://localhost:3000
5. Checks: `npm run typecheck`, `npm test`, `npm run build`

The free backend host can need up to 90 seconds to wake after a quiet period. Deployment steps for both halves are in `docs/deployment.md`.

## The engine (how Genie uses Qloo)
The engine in `backend/engine/` is plain Python. It never touches the database: the backend calls it and stores what it returns.

- **Resolve** every favourite a family names to a Qloo entity or taste tag, with a six-level fallback ladder (exact, alternate spelling, parent artist or place, era and place, not in Qloo, API error). Nothing ever fails empty, and anything Qloo does not know is labelled "not in Qloo".
- **Discover** wishes with Qloo's taste links ("people like them also love"), using Qloo's own match scores and explanations. A discovery always says it is a guess.
- **Explain** itself: every run returns visible steps and a live Qloo call log.
- **Compare** honestly: `POST /agent/compare` puts a general AI's wishes next to Genie's, from the same facts and no Qloo data.
- **Reaction Mode** and the **Bedside Kit** are comfort and connection only, never treatment. Genie is not a medical service.
- **Stay up**: every Qloo call has a connect timeout and a circuit breaker, answers are cached, and a failure becomes a lower fallback level, never a crash.

Set these in `backend/.env` (names are in `.env.example`): `QLOO_API_KEY` and `QLOO_API_URL`; optionally `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (any OpenAI-compatible endpoint; without them everything works except the general AI's side of the comparison); and `DATABASE_URL` plus `ENGINE_CACHE_RESTORE=1` for the private cache store.

Qloo's terms forbid storing its response data publicly, so the cache (`backend/engine/_cache/`) is git-ignored. A private copy lives in a database table, `engine_cache`, and is restored when the server starts. The commands are `python engine_cache_store.py init | snapshot | restore | stats`.

Try the engine without a stored person:
- `POST /agent/run` runs the whole agent for one fictional person and stores nothing.
- `POST /agent/compare`, `/agent/reaction-cards`, `/agent/reactions` and `/agent/bedside-kit` power the other screens.
- Two fictional demo people for engine tests, Nani and Jun, are in `backend/engine/personas.py`. The live site's demo people (`POST /demo/start`, personas 0 and 1) are Nani and Sana, with their family memories in `backend/demo_memories.sql`.

## Tests
Run from `backend/`. The offline suites need no network and no keys.
python engine\test_offline.py
python engine\test_wishes.py
python engine\test_agent.py
python engine\test_reaction.py
python engine\test_sidebyside.py
python engine\test_kit.py
python engine\test_day8.py
python engine\test_labels.py
python test_cache_store.py

Frontend, from `frontend/`: `npm test` and `npm run typecheck`.

Checks against the real Qloo API: `python engine\live_checks.py` (flags in `docs/Engine.md`), `python engine\live_odd.py` (odd inputs and outages) and `python engine\prewarm_run.py` (demo people, run twice, the second pass must be fast).

The whole path through the real API (create a person, run the agent, compare, compile and share a Wish Book, revoke, delete) for ten varied fictional people: python judge_test.py (server running; add --extra for two odd ones).

## Docs
- `docs/Engine.md` how the engine works
- `docs/engine-contract.md` the exact input and output shapes
- `docs/umaima-engine-report-days-1-9.md` the engine work report
- `docs/coverage-report.md` the Qloo coverage test
- `docs/devpost-technical-notes.md` how Genie uses Qloo, with the evidence
- `docs/deployment.md` and `docs/testing.md` how to deploy and test
- `docs/privacy.md` what data is collected and how it is deleted
- `docs/detailed_backend_report_zunairah.md` the backend report

## Privacy
No accounts. Minimal data (first name, birth year, region, favorites). Everything for a person can be deleted with one call, and demo data expires automatically. Secrets live in environment variables only.

Genie uses third-party AI. Qloo receives the names of favourites. If an LLM key is set, the LLM receives names of songs, artists, dishes, places and films plus the person's region and language. For the side-by-side comparison, the general AI also receives the first name, birth year, region, language, the favourites and the family's Wish Circle notes, because that is exactly what Genie was given. Wish Circle contributors see this in the consent note. Free-tier LLM services may use prompts to improve their models, so never enter real people's details in the demo.

All Wish Makers in this build are fictional samples. Demo data is fictional only.

License: MIT