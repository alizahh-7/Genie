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

1. **Database login failed** ("password authentication failed for user postgres"). Cause: the connection string in .env still had the square brackets from Supabase's template around the password, so the password sent to the database was wrong. Fix: removed the brackets so only the real password remained. Lesson: Supabase's connection string shows [YOUR-PASSWORD] as a placeholder, and the brackets must be replaced along with the words inside them.
2. **Server could not find the app** ("Could not import module main"). Cause: uvicorn was started from the repository root, and main.py lives inside the backend folder. Fix: run cd backend first, then uvicorn main:app --reload. Lesson: the prompt should end in genie\backend> before running any backend command.
   
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

# Backend Report Addendum, Real Wish Maker Onboarding and Email

**Author:** Zunairah
**Date of work:** Oct 15 & 16, 2026

---

## A. Why this was added

Days 1 to 3 gave us a working backend, but the Wish Network was 15 fictional samples. A product that people anywhere in the world can use has to accept real Wish Makers (musicians, home cooks, cafes, storytellers, volunteers) without the team recruiting each one by hand. This addition turns "real Wish Maker onboarding", which the plan listed as mockup-only, into a working feature.

The design goal: **anyone can apply from anywhere, the team reviews, families request, makers accept or decline, and trust and safety rules are enforced by the system, not by good intentions.**

---

## B. What was built

### B.1 Database changes (migration `001_maker_onboarding.sql`)
- `wish_maker` gained: `contact_email` (private), `country`, `languages`, `application_status` (pending, approved, rejected, paused, suspended), `manage_token_hash`, `conduct_accepted_at`, `listing_consent_at`, `review_note`, `applied_at`, `reviewed_at`.
- `wish_match` gained: `request_message`, `family_contact` (private), `maker_note`, `requested_at`, `responded_at`, `concern_flagged`, `feedback_note`.
- Match statuses extended to: suggested, requested, accepted, declined, withdrawn, done.
- Deleting a maker now removes their matches (cascade), so a maker can fully withdraw.
- The 15 samples became `approved` automatically.

### B.2 The five parts of the feature

**1. Open application (`POST /makers/apply`, `GET /makers/apply/terms`)**
- Public form. Fields: name, what they offer, short bio (20 to 600 characters), tags (artists, dishes, styles), city, country, languages, remote availability, contact email.
- Required: acceptance of the code of conduct (18 or older, honesty, dignity, no money or gifts or personal details requested, privacy, not a medical service, free to decline or withdraw) and consent to be listed.
- New applicants start as `pending` and are **not visible** to families.
- Abuse controls: hidden bot-trap field, at most 3 applications per email per day, and a cap on the size of the pending queue.
- The response contains a private manage token, shown once.

**2. Private maker page without passwords (`/maker-portal/{token}`)**
- The token is the maker's key. Only its SHA-256 hash is stored, so a database leak does not expose working links.
- View status and incoming requests. Update bio, tags, city, languages, and remote availability. Pause or resume. Accept or decline a request. Withdraw the profile entirely.
- Editing bio, tags, or city sends an approved profile back to `pending` for a fresh review.
- Rejected and suspended profiles cannot edit or respond.

**3. Admin review (`/admin/makers`, `/admin/makers/{id}/review`, `/admin/concerns`)**
- Protected by a secret `ADMIN_TOKEN` header, compared in constant time. If the token is not configured, admin access is switched off entirely.
- Decisions: approve (with a `reference_checked` flag that sets verification to `verified`, otherwise `reviewed`), reject, or suspend.
- Sample makers cannot be reviewed.

**4. Family requests (`/persons/{id}/wishes/{wish_id}/requests` and related)**
- Send a request with a message and an optional contact. List requests and statuses. Withdraw. Give feedback.
- Rules enforced by the system:
  - Only approved makers can be requested.
  - **In-person wishes go only to `verified` makers.** Remote wishes only to makers who offer remote.
  - A wish can have at most 3 open requests at once.
  - A maker who declined cannot be re-requested for the same wish.
  - **Contact details are shared only after the maker accepts.** The family sees the maker's email, and the maker sees the family's contact, only then.
- Sample makers auto-accept with a clearly labelled "This is a sample Wish Maker" note and share no contact details, so the demo flow is complete and honest.

**5. Safety loop (feedback and concern flags)**
- After acceptance, the family can mark the wish done and optionally raise a concern.
- A concern **suspends the maker immediately** and appears in `/admin/concerns` for review. This implements the plan's rule that makers with concerns are paused.

### B.3 Privacy changes made along the way
- The public makers list uses an explicit column list, so the contact email and the token hash can never appear in public responses.
- Makers see only the first name of the person a request is about, and only on requests they received.

---

## C. Email notifications and link recovery

### C.1 What email does in Genie
Without email, a real maker would never know a request arrived unless they happened to revisit their link. Email closes that loop.

| Email | Sent to | When |
|---|---|---|
| Application received, with the private link | Maker | On applying |
| New application waiting | Admin (Zunairah) | On applying |
| Approved, rejected, or paused notice | Maker | On review |
| A family has sent you a request (no request details in the email) | Maker | On a new request |
| Accepted or declined update | Family | When the maker replies, only if the family's contact looks like an email |
| New private link | Maker | On "send me my link again" |

### C.2 Link recovery (`POST /makers/recover`)
Because only the token hash is stored, a lost link cannot be re-sent. Recovery generates a fresh link, replaces the old one, and emails it. It always returns the same generic response, so nobody can discover which emails are registered. It is limited to one use per 10 minutes per profile, and it does nothing unless email is configured, so a link is never rotated into the void.

### C.3 Delivery choice
Email is sent through Brevo's web API over HTTPS. Render's free web services block outbound SMTP (ports 25, 465, 587) since September 2025, so classic SMTP would fail once deployed. Sending runs in the background, so a slow or failed email never breaks the user's request. If email is not configured, every feature still works and the email step is skipped.

---

## D. Test evidence

Run locally through the interactive API docs.

| # | Check | Result |
|---|---|---|
| 1 | Apply as a new Wish Maker returns a maker ID and a one-time manage token | Pass |
| 2 | Public makers list shows the 15 samples and does **not** show the pending applicant | Pass |
| 3 | The maker's private page loads by token and shows status `pending` | Pass |
| 4 | Admin endpoints reject a wrong admin token (401) | Pass (access control works) |
| 5 | Request to a **pending** maker is refused (404 "Maker not found") | Pass (unapproved makers cannot be requested) |
| 6 | A **pending** maker cannot respond to a request (403) | Pass |
| 7 | Feedback before any accepted request is refused (409) | Pass |
| 8 | Admin lists pending applications with the correct token. The admin sees the applicant's email, which is never public | Pass (Oct 16) |
| 9 | Admin approves the applicant. The profile becomes `approved` and `verified`, appears first in the public list (16 makers), and the 15 samples now show their countries | Pass (Oct 16) |
| 10 | Full request flow: the family sends a request, the maker accepts, and the maker then sees the family's contact. A repeat request to the same maker is refused (409, "A request is already in progress") | Pass (Oct 16) |
| 11 | Request to a sample maker auto-accepts with the sample label and no contact | Pass (run by Zunairah) |
| 12 | Concern feedback suspends the maker and lists it under admin concerns | Pass (run by Zunairah) |
| 13 | Application without conduct acceptance returns 400; a fourth application from one email returns 429 | Pass (run by Zunairah) |
| 14 | A fourth open request on one wish returns 429; an in-person wish to a non-verified maker returns 400 | Pass (run by Zunairah) |
| 15 | Maker withdraws their profile; test person deleted | Pass (run by Zunairah) |
| 16 | Email: application email arrives with a working link | Not run yet. Email stays switched off until a Brevo key is configured |
| 17 | Email: "send me my link again" delivers a new link and the old one stops working | Not run yet, for the same reason |

Note on checks 4 to 7: during the first run, the admin call used the wrong token, so the applicant was never approved. Every later step then failed exactly as designed: an unapproved maker cannot be requested, cannot respond, and cannot receive feedback. These failures are evidence that the approval gate protects families, and not bugs.

---

## E. Decisions and reasons

| Decision | Reason |
|---|---|
| Tokens instead of passwords for makers, hashed in the database | No accounts to manage, no passwords to leak, and a database leak exposes nothing usable. |
| Manual admin review before anyone is listed | Families are vulnerable. Nobody appears in matches without a human decision. |
| Two trust levels: `reviewed` and `verified` | Remote wishes carry little risk. In-person wishes require a reference check first, as in the plan's verification rules. |
| Contact details revealed only after acceptance | Matches the plan: no contact details until both sides agree. |
| Edits to bio, tags, or city trigger re-review | A trusted profile cannot be silently changed into something else. |
| Concern flag suspends immediately | Safety first. A person reviews afterwards. |
| Sample makers auto-accept with a label | The demo shows the full flow without pretending real people replied. |
| Email through an HTTPS API | Render's free tier blocks SMTP ports. |
| Recovery rotates the link and always gives a generic answer | A lost link can be replaced, and email addresses cannot be probed. |

---

## F. Challenges (this addition)

1. **Admin calls returned 401.** Cause: the maker's private token was pasted into the admin token header, so the admin check correctly refused it. Fix: use the `ADMIN_TOKEN` value from `.env`. The failures that followed (404, 403, 409) were the approval gate doing its job on an unapproved maker. On Oct 16 the full flow was re-run with the correct token, and approval, request, accept, and the contact reveal all passed.
2. **Email on a free host.** Direct SMTP from Render's free tier is blocked, so email is sent through an HTTPS API.
3. **Lost links.** Hashing the token means the original cannot be re-sent, which led to the recovery flow.

---

## G. Known limits (updated)

- **Email ownership is not proven at signup.** The applicant already holds the link when they apply. The admin reference check (an email exchange during review) covers this for now. Emailing the link only, with no on-screen display, would prove ownership, at the cost of locking out anyone whose email fails.
- **Review is manual**, with one reviewer. A partner organisation could share this later.
- **Emails from a free email address may land in spam.** A sending domain of our own would fix this later.
- **Email depends on Brevo's free plan limits**, which should be checked on their pricing page before launch.
- The family notification link assumes a frontend page at `/person/{id}`, and the maker pages at `/maker/{token}` and `/maker/recover`. These must be confirmed with Alizah.
- Sample makers have no real people behind them. They are labelled everywhere.

---

## H. What is next

1. Configure email (Brevo) and run tests 16 and 17. Tests 1 to 15 are complete.
2. Deploy the backend to Render, with all environment variables set (database, allowed origins, admin token, email settings, frontend URL).
3. Alizah builds the screens: Become a Wish Maker, the maker page, link recovery, request and status on the family side.
4. Day 4: matching function, using only approved makers, with in-person wishes limited to `verified` makers.
5. Enrich real makers' tags with Qloo entity IDs on approval, once Umaima's `resolve()` exists.

---

## I. Reusable text

**Devpost, "What it does" addition:**
Genie is a living network, not a fixed demo. Musicians, home cooks, cafes, storytellers, and volunteers anywhere in the world can apply to become Wish Makers. Every application is reviewed by a person before anyone is listed. Families send a request, the maker accepts or declines, and contact details are shared only after both sides agree.

**Devpost, "Safety and privacy" addition:**
Trust is enforced in code. Makers are not visible until approved. In-person wishes are limited to makers who passed a reference check. Edits to a profile trigger a fresh review. Any family concern suspends a maker immediately. Makers manage their profile through a private link whose secret is stored only as a hash, and they can withdraw their profile and everything linked to it at any time.

**README addition:**
Wish Makers apply at `POST /makers/apply`. An admin reviews applications with the `ADMIN_TOKEN` header at `/admin/makers`. Email is optional: set `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `FRONTEND_URL`, and `ADMIN_EMAIL` to enable notifications.

---

## J. Commits

| Commit message |
|---|
| `Maker onboarding: applications, admin review, maker portal, family requests, concern flags` |
| `Email: notifications via Brevo API, link recovery, sample makers' countries` |
