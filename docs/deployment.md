# Genie: deployment

Backend on Render, database on Supabase (Postgres), frontend on Vercel. Never commit keys. Every value below is set in the host's environment settings.

## 1. Database (Supabase)

Run these in the Supabase SQL Editor, in order, once:

1. `backend/schema.sql`
2. `backend/migrations/001_maker_onboarding.sql`
3. `backend/migrations/002_email_recovery.sql`
4. `backend/migrations/003_matching.sql`
5. `backend/migrations/004_engine_integration.sql`
6. `backend/migrations/005_matching_fixes.sql`

Then, from the `backend` folder with `DATABASE_URL` pointing at the same project:

```powershell
python seed.py
python engine_cache_store.py init
python enrich_makers.py
```

`seed.py` loads the 15 sample Wish Makers and is safe to repeat. `engine_cache_store.py init` creates the private `engine_cache` table and is safe to repeat. `enrich_makers.py` attaches taste data to makers and only touches makers that have none.

Use the **session pooler** connection string from Supabase, with the real password and no square brackets.

## 2. Backend (Render)

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

`requirements.txt` must include `fastapi`, `uvicorn`, `psycopg`, `python-dotenv`, `requests`, and `httpx`. If `requests` is missing, every agent route answers 503.

### Environment variables

| Name | What it is |
|---|---|
| `DATABASE_URL` | Supabase session pooler connection string |
| `ALLOWED_ORIGINS` | The frontend address, comma separated, no trailing slash |
| `FRONTEND_URL` | The frontend address, used in email links |
| `DEMO_TTL_DAYS` | `7` |
| `ADMIN_TOKEN` | A fresh secret, never shown in screenshots or chat |
| `ADMIN_EMAIL` | Where "new application" emails go |
| `QLOO_API_KEY` | The Qloo hackathon key |
| `QLOO_API_URL` | `https://hackathon.api.qloo.com` |
| `LLM_API_KEY` | The current Gemini key |
| `LLM_MODEL` | The fast model chosen with `model_probe.py` |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `LLM_TIMEOUT` | `15` |
| `WISH_POLISH` | `0` |
| `ENGINE_CACHE_RESTORE` | `1` |
| `BREVO_API_KEY` | Brevo API key |
| `MAIL_FROM_EMAIL` | A sender verified in Brevo |
| `MAIL_FROM_NAME` | `Genie` |
| `DEMO_PERSON_IDS` | The two pinned demo people, comma separated, no spaces |

In Brevo, open Security, then Authorized IPs, and either turn the restriction off or allow Render's addresses. Otherwise emails fail without any error on screen.

## 3. Frontend (Vercel)

Set the frontend's API base URL to the Render address. Then make sure `ALLOWED_ORIGINS` and `FRONTEND_URL` on Render match the Vercel address exactly.

The backend's email links assume these frontend pages: `/maker/{token}`, `/maker/recover`, `/person/{id}`.

## 4. First deploy, in this order

1. Create the Render service with the settings above and all variables.
2. Wait for the deploy. The log should show the engine cache restored.
3. Check the smoke test (section 5).
4. Create the two demo people on the deployed service (or confirm they exist, because they live in the shared database). Run `agent/run` and `compare` once for each, then pin each with the admin endpoint.
5. Put their ids in `DEMO_PERSON_IDS` and redeploy.
6. Run `/demo/start` for each demo person.

## 5. Smoke test

1. `GET /health/db` returns `ok`.
2. `GET /makers` lists the makers with no email and no Qloo identifiers.
3. `GET /meta/notices` loads.
4. `POST /persons`, then `POST /persons/{id}/agent/run`, then `POST /persons/{id}/compare`. The first run is slow after a cold start.
5. `GET /demo/personas`, then `POST /demo/start` for each person.
6. `DELETE /persons/{id}` for everything created in this test.
7. From the live frontend, open the browser console and run `fetch('<render address>/health/db').then(r => r.json()).then(console.log)`. A cross-origin error means `ALLOWED_ORIGINS` is wrong.

## 6. Keeping the free tier awake

Render's free service sleeps after a quiet period, and the first request after that is slow. Before judging, point a free uptime monitor at `<render address>/health` every 5 minutes, or use a paid instance. Rate-limit counts and the engine's disk cache reset on a restart. The database snapshot restores the cache.

## 7. After every deploy

1. Check the log for the cache-restored line.
2. Run the demo people once through `/demo/start`.
3. Open the live site in a private window and on a phone.

## 8. Secrets

- `backend/.env` is ignored by Git and must stay that way.
- Check before every push: `git ls-files backend/.env` prints nothing.
- Rotate any key that appears in a screenshot, a chat, or a pasted log.
- Devpost screenshots use fictional data and never show a token, a key, or a person's private link.