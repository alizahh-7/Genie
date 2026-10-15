# Genie: Backend Work Report, Days 1 to 3

**Project:** Genie, an AI agent that learns who someone was through what they loved, suggests personal wishes, and finds the people who can fulfil them. Built on Qloo's taste graph for the Qloo Agentic Hackathon.
**Author:** Zunairah
**Role in the team:** Backend, data, privacy, deployment, and submission
**Date of work:** Oct 15, 2026 (planned Days 1 to 3, completed together)
**Team:** Umaima (agent and Qloo engine), Alizah (team lead, frontend, copy), Zunairah (backend, data, deployment, submission)

---

## 1. Where this work fits

Genie has three layers:

1. **Frontend** (Alizah): the screens families see.
2. **Engine** (Umaima): the agent that talks to Qloo and the LLM. It resolves favorites, builds the Taste Portrait, and generates wishes.
3. **Backend** (this report): the database and API that store everything and enforce privacy. It sits between the frontend and the engine.

The backend is the part that makes Genie a product and not a one-off demo. It holds people, portraits, wishes, the Wish Circle, and the Wish Makers. It also carries the privacy promises: minimal data, consent, deletion, and expiry.

---

## 2. What was built

### 2.1 Repository and project setup
- Public GitHub repository with an MIT license, visible in the About section (required by the hackathon).
- Collaborators added.
- `.gitignore` protecting secrets (`.env`, virtual environment, database files).
- `README.md` with structure, local run steps, and a privacy note.
- `.env.example` documenting the configuration variables without real values.
- Folder structure: `backend/` (API), `backend/data/` (seed data), `backend/routers/` (endpoints), `docs/` (project documents).

### 2.2 Database: Supabase (Postgres), 8 tables

| Table | Purpose | Main fields |
|---|---|---|
| `person` | The person a Genie is built for | id, first_name, birth_year, region, language, created_at, expires_at |
| `portrait_item` | One item in the Taste Portrait | domain, name, qloo_entity_id, qloo_tags, source_label, confidence, resolution_level |
| `circle_invite` | A Wish Circle link | token (primary key), person_id |
| `circle_response` | One family member's answers | contributor_first_name, answers, consent_given |
| `wish_maker` | Sample musicians, cooks, cafes, storytellers, volunteers | name, type, bio, tags, qloo_entity_ids, city, remote_ok, is_sample, verification_status |
| `wish` | A suggested wish | title, description, mode (in-person or remote), source_items |
| `wish_match` | A wish matched to a maker | wish_id, maker_id, score, status (suggested, accepted, declined, done) |
| `wish_book` | The final keepsake | compiled_content, share_token |

Design details:
- **Cascade deletes:** deleting a person removes all their portrait items, circle invites and responses, wishes, matches, and wish book in one step.
- **Constraints in the database:** wish mode and match status can only hold allowed values.
- **Indexes** on the person lookups used most (portrait, responses, wishes) and on `expires_at` for the purge.
- **Row-level security** is on for all 8 tables. The backend connects directly to Postgres, but anyone who finds Supabase's public key cannot read family data.
- `wish_match` is named that way because `match` is an SQL keyword.

### 2.3 Sample Wish Makers: 15, all fictional
Each is labelled `is_sample = true` and `verification_status = sample`.

| Group | Makers |
|---|---|
| Hyderabad / Hindi / Telugu (for the demo persona "Nani") | Meera Rao (classic Hindi film songs), Zainab Siddiqui (haleem, Hyderabadi cuisine), Farhan Qureshi (Old City and Charminar stories), Lakshmi Devi (classic Telugu film songs) |
| Wider South Asia | Anand Kulkarni (ghazal), Priya Nair (Carnatic), Harbour Companions (seaside visits) |
| K-pop and ocean (second demo persona) | Minseo Han (K-pop covers), Hana Park (Korean home cooking), Harbour Companions |
| Global coverage for judges' own inputs | Rosa Delgado (bolero), Samir Haddad (Arabic classical, oud), Lucia Romano (Italian home cooking), Eleanor Whitfield (jazz standards), The Corner Vinyl Cafe (classic rock, vinyl), Tomas Reyes (letters and life stories) |

Seeding is re-runnable. It updates a maker's details without erasing Qloo entity IDs that will be added later (`on conflict do update`).

### 2.4 API endpoints (13)

| Group | Endpoint | What it does |
|---|---|---|
| Health | `GET /health`, `GET /health/db` | Service check, and database connectivity check |
| Person | `POST /persons` | Create a person (sets a 7-day expiry) |
| Person | `GET /persons/{id}` | Read a person |
| Privacy | `DELETE /persons/{id}` | Delete everything about a person |
| Makers | `GET /makers`, `GET /makers/{id}` | List makers (with a remote-only filter) or read one |
| Wishes | `POST` and `GET /persons/{id}/wishes` | Store and list wishes (called by the engine) |
| Portrait | `POST` and `GET /persons/{id}/portrait` | Store and read the Taste Portrait. Saving replaces the old one, so rebuilding is clean |
| Circle (owner) | `POST /persons/{id}/circle` | Create an invite link |
| Circle (owner) | `GET /persons/{id}/circle-responses` | Read what the family circle said |
| Circle (public) | `GET /circle/{token}` | Open an invite: shows the person's first name, the consent note, and the 5 questions |
| Circle (public) | `POST /circle/{token}/responses` | Submit answers |

### 2.5 Wish Circle: how it works
1. The person who created the Genie requests an invite and receives a link.
2. They share it. Relatives and friends open it with no login.
3. They read the consent note, then answer up to five gentle questions (music, food, place, film, what made them light up). Skipping any question is allowed.
4. Answers are saved. The owner reads them, and the engine uses them for the portrait.

Safeguards:
- **Unguessable link:** 32 random bytes, URL-safe.
- **Consent is required:** a submission without consent is rejected with a 400 error.
- **Only known questions:** an unknown question key is rejected.
- **Limits:** each answer is capped at 500 characters, at least one answer is required, and a link accepts at most 25 responses.
- **The consent note** says answers are seen by the family and processed by an AI service, which the project plan requires us to disclose.

### 2.6 Input validation
- Person: first name 1 to 40 characters, birth year 1900 to 2026, region up to 80, language up to 40.
- Wish: title 1 to 200, description up to 2000, mode must be `remote` or `in-person`.
- Portrait item: domain must be music, food, place, film, or other. Source label must be told, likely, reacted, or ai-only. Confidence is 0 to 1, and resolution level is 1 to 6. A portrait holds at most 60 items.
- Unknown people return a clean 404, not a server error.

### 2.7 Privacy and safety built in
- **Data minimisation:** the system stores a first name or nickname, birth year, region, language, and favorites. No surnames, addresses, health data, or ID numbers.
- **No accounts:** a person's private ID acts as the key.
- **No "list all people" endpoint**, so private records cannot be browsed.
- **Delete everything** with one call, covering every linked record.
- **Automatic expiry:** every person expires after 7 days. An hourly background job purges expired people.
- **Secrets:** the database URL and API keys live only in environment variables and are never committed.
- **Fictional data only:** all testing used fictional people and sample makers.
- **CORS** is limited to a list of allowed origins.

### 2.8 Engine contract (`docs/engine-contract.md`)
A written agreement with Umaima on how the engine and backend exchange data. It fixes the output of three engine functions:
- `resolve(name, domain)`: a favorite becomes a Qloo entity with tags, affinity, and a fallback-ladder level.
- `build_portrait(person, inputs)`: returns portrait items with source labels (told, likely, reacted, ai-only), confidence, and a Qloo call log.
- `generate_wishes(portrait)`: returns wishes with title, description, mode, and the portrait items they came from.

Rules in the contract: every function returns within a timeout and never raises to the caller, and keys come from environment variables only. Qloo's raw response format stays inside the engine, so the backend does not change when the real key arrives.

---

## 3. Test evidence

All checks were run locally through the API's interactive docs page.

| # | Check | Result |
|---|---|---|
| 1 | Database connects and all 8 tables exist | Pass |
| 2 | Seeding loads 15 makers | Pass |
| 3 | `/health` and `/health/db` return ok | Pass |
| 4 | Create person (fictional "Nani", born 1948, Hyderabad, Hindi). Expiry set 7 days ahead | Pass |
| 5 | Read person back | Pass |
| 6 | List makers returns 15, with correct tags, cities, and sample labels | Pass |
| 7 | Create wish for a person | Pass |
| 8 | Create Wish Circle invite returns an unguessable token | Pass |
| 9 | Open invite shows first name, consent note, and the 5 questions | Pass |
| 10 | Submit answers with consent | Pass |
| 11 | Owner reads the submitted answers | Pass |
| 12 | Save a portrait item with tags, then read it back | Pass |
| 13 | Submission without consent is rejected (400) | Pass |
| 14 | Empty answers and unknown question keys are rejected (422) | Pass |
| 15 | Delete everything, then repeat read returns 404 | Pass |
| 16 | Linked rows (portrait, circle, wishes) are gone after delete | Pass |

Test people created during testing were deleted, and the 15 sample makers were kept.

---

## 4. Decisions and reasons

| Decision | Reason |
|---|---|
| Supabase (Postgres) instead of SQLite | SQLite files are lost when hosting restarts or redeploys. A judge's session must not vanish. |
| Direct Postgres connection through the session pooler | Full SQL control, and the pooler works on hosting that does not support IPv6. |
| No login for families | Lower barrier for families and judges. Privacy comes from unguessable IDs, deletion, and expiry. |
| Contract-first design with Umaima's engine | Backend and engine meet at one fixed format, so work proceeds in parallel and the real Qloo key causes no backend changes. |
| Wish Makers are seeded samples, clearly labelled | A live network takes time to grow, and the plan says judges understand that. |
| Deletion and expiry built early | They are privacy requirements, and they are far cheaper to build now than to add late. |
| Table named `wish_match` | `match` is an SQL keyword. |

---

## 5. Challenges

1. **Database login failed** ("password authentication failed"). Cause and fix: *[add the fix in your own words, for example the corrected connection string or password]*. Lesson: with the Supabase pooler, the username includes the project reference, and the password should be letters and numbers only.
2. **Server could not find the app** ("Could not import module main"). It was started from the wrong folder. The server must be started from the `backend` folder.

---

## 6. Known limits

- The backend runs locally only so far. Deployment is next.
- Free hosting sleeps when idle, so the first request after a pause is slow. We need a keep-alive or a paid instance before judging.
- Demo personas must be exempted from the 7-day expiry (Day 8 pre-warming).
- Expired data can remain up to an hour before the hourly purge runs.
- Wish Makers have no Qloo entity IDs yet, because those need the Qloo key.
- The consent note wording should be reviewed by Alizah (tone and copy).

---

## 7. What is next

| Step | Detail |
|---|---|
| Push Day 3 code to GitHub | Confirm `.env` is not in the commit |
| Deploy backend to Render | Set environment variables, test `/health/db` and `/docs` on the live URL |
| Send Alizah the live API URL | She needs it for the frontend, and the frontend's address must be added to the allowed origins |
| Confirm the engine contract with Umaima | She confirms or changes the format |
| Day 4: matching | Score portrait tags against maker tags and store results in `wish_match`, built to the contract |
| Enrich makers with Qloo IDs | Once Umaima has the key, run each maker's tags through the engine's `resolve()` once and store the IDs |
| Wish Book data and PDF export | Planned for Day 7 |
| Maker accept and decline | Planned for Day 5 |
| Demo persona pre-warming | Exempt from expiry and cache Qloo results (Day 8) |

---

## 8. Reusable text

**For the README, Privacy section:**
Genie stores only a first name or nickname, birth year, region, language, and favorites. There are no accounts. Each person has one private identifier, and a single call deletes everything linked to them. Demo data expires automatically after seven days. All keys are held in environment variables.

**For the Devpost description, Safety and privacy section:**
Genie works with people near the end of life, so privacy is built into the data layer. We collect the minimum, family members contribute through unguessable no-login links with an explicit consent step, every record can be deleted in one action, and demo data expires on its own. All Wish Makers in this build are clearly labelled samples, and our documented verification plan for real makers starts with remote wishes and requires reference checks before any in-person wish.

**For the Devpost description, How we built it:**
FastAPI backend on a Supabase Postgres database, with a fixed contract between the API and the Qloo agent engine. Qloo responses are cached, every external call has a timeout, and failures degrade through a six-level fallback ladder instead of breaking the experience.
