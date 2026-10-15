# Genie

Everyone deserves to be known before they go.

Genie is an AI agent that learns who someone was through what they loved, suggests personal wishes only they would recognize, and finds the real people who can make those wishes happen. Powered by Qloo's taste graph. Built for the Qloo Agentic Hackathon.

## Structure
- `backend/` FastAPI API, Supabase (Postgres) database, sample Wish Makers
- `backend/engine/` the agent and Qloo engine (see `docs/engine-contract.md`)
- `docs/` project documents

## Run the backend locally
1. `cd backend`
2. `python -m venv venv` then `.\venv\Scripts\Activate.ps1`
3. `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in `DATABASE_URL`
5. Run `backend/schema.sql` once in the Supabase SQL editor
6. `python seed.py` then `uvicorn main:app --reload`
7. Open http://127.0.0.1:8000/docs

## Privacy
No accounts. Minimal data (first name, birth year, region, favorites). Everything for a person can be deleted with one call, and demo data expires automatically. Secrets live in environment variables only.

All Wish Makers in this build are fictional samples.

License: MIT