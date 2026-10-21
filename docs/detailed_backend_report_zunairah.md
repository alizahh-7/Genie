# Genie: Backend Work Report

**Project:** Genie, an AI agent that learns who someone was through what they loved, suggests personal wishes, and finds the people who can fulfil them. Built on Qloo's taste graph for the Qloo Agentic Hackathon.
**Author:** Zunairah
**Role in the team:** Backend, data, privacy, deployment, and submission
**Team:** Umaima (agent and Qloo engine), Alizah (team lead, frontend, copy), Zunairah (backend, data, deployment, submission)
**Dates of work:** Oct 15 to Oct 20, 2026
**Last updated:** Oct 20, 2026

**Rules for the public repo copy.** Qloo's terms forbid publishing Qloo response data, and Umaima's notes say that includes result names, result types, IDs, and tag counts. This report follows that rule: it names no Qloo results and gives no tag counts or Qloo-derived scores. Keep Swagger output, test persons, person IDs, and tokens out of the repo as well.

## Contents

| Part | What it covers |
|---|---|
| 1 | Days 1 to 3: repository, database, sample makers, first API, Wish Circle, privacy |
| 2 | Real Wish Maker onboarding and email |
| 3 | Backend testing report (Oct 17) |
| 4 | Audit, matching, retention, Wish Book, notices, rate limiting, Qloo findings (sections A to I) |
| 5 | Engine integration (sections K.1 to K.9) |
| 6 | Final local checks, demo people, and engine Day 8 changes (section L) |
| 7 | What remains (section M) |

---

# Part 1: Days 1 to 3

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

Later parts added columns to these tables and one more table (`agent_log`, plus the private `engine_cache`). See Parts 2, 5, and 6.

Design details:
- **Cascade deletes:** deleting a person removes all their portrait items, circle invites and responses, wishes, matches, and wish book in one step.
- **Constraints in the database:** wish mode and match status can only hold allowed values.
- **Indexes** on the person lookups used most (portrait, responses, wishes) and on `expires_at` for the purge.
- **Row-level security** is on for all tables. The backend connects directly to Postgres, but anyone who finds Supabase's public key cannot read family data.
- `wish_match` is named that way because `match` is an SQL keyword.

### 2.3 Sample Wish Makers: 15, all fictional
Each is labelled `is_sample = true` and `verification_status = sample`.

| Group | Makers |
|---|---|
| Hyderabad / Hindi / Telugu (for the demo persona "Nani") | Meera Rao (classic Hindi film songs), Zainab Siddiqui (haleem, Hyderabadi cuisine), Farhan Qureshi (Old City and Charminar stories), Lakshmi Devi (classic Telugu film songs) |
| Wider South Asia | Anand Kulkarni (ghazal), Priya Nair (Carnatic), Harbour Companions (seaside visits) |
| K-pop and ocean (second demo persona) | Minseo Han (K-pop covers), Hana Park (Korean home cooking), Harbour Companions |
| Global coverage for judges' own inputs | Rosa Delgado (bolero), Samir Haddad (Arabic classical, oud), Lucia Romano (Italian home cooking), Eleanor Whitfield (jazz standards), The Corner Vinyl Cafe (classic rock, vinyl), Tomas Reyes (letters and life stories) |

Seeding is re-runnable. It updates a maker's details without erasing Qloo entity IDs that were added later (`on conflict do update`).

### 2.4 API endpoints (the first 13)

This table is the Day 3 set. The endpoints added later are listed in Part 2 (makers, requests, admin), Part 4 (matching, retention, Wish Book, notices), Part 5 (K.3, the agent routes), and Part 6 (L.1, the demo routes).

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
- **The consent note** says answers are seen by the family and processed by an AI service, which the project plan requires us to disclose. The wording is updated in Part 6 (L.8).

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

The full privacy statement is in `docs/privacy.md`.

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

## 6. Known limits (status on Oct 20)

- The backend is deployed on Render and was redeployed with the latest code on Oct 20.
- Free hosting sleeps when idle, so the first request after a pause is slow. An uptime monitor now checks `/health/db` every 5 minutes (set up Oct 20), as described in `docs/deployment.md`, section 6.
- *Resolved on Oct 19:* all 15 sample makers now have Qloo data attached.
- The consent note has new wording (Part 6, L.8). Alizah should read it once for tone.
- *Removed, because they are now handled:* "Demo personas must be exempted from the 7-day expiry" (an admin pin endpoint exists) and "Expired data can remain up to an hour" (expired data is now unreadable at once, although the purge can lag).

---

## 7. What was next after Day 3, and where it stands

| Step | Status on Oct 20 |
|---|---|
| Push Day 3 code to GitHub | Done |
| Deploy backend to Render | Done. Redeployed with the latest code on Oct 20 |
| Send Alizah the live API URL | Done. The frontend guide (`docs/frontend-integration.md`) was handed to Alizah |
| Confirm the engine contract with Umaima | Done. The stale lines were updated on Oct 20 (Part 6, L.5) |
| Matching (portrait tags against maker tags, stored in `wish_match`) | Done and re-tested on Oct 19 |
| Enrich makers with Qloo IDs | Done on Oct 19 |
| Wish Book data and PDF export | Done (a printable page, shared link, and compile endpoint) |
| Maker accept and decline | Done in the backend. The screen is pending |
| Demo persona pre-warming | Done. Two pinned demo people and a copy route (Part 6) |

---

## 8. Reusable text

**For the README, Privacy section:**
Genie stores only a first name or nickname, birth year, region, language, and favorites. There are no accounts. Each person has one private identifier, and a single call deletes everything linked to them. Demo data expires automatically after seven days. All keys are held in environment variables.

**For the Devpost description, Safety and privacy section:**
Genie works with people near the end of life, so privacy is built into the data layer. We collect the minimum, family members contribute through unguessable no-login links with an explicit consent step, every record can be deleted in one action, and demo data expires on its own. All Wish Makers in this build are clearly labelled samples, and our documented verification plan for real makers starts with remote wishes and requires reference checks before any in-person wish.

**For the Devpost description, How we built it:**
FastAPI backend on a Supabase Postgres database, with a fixed contract between the API and the Qloo agent engine. Qloo responses are cached, every external call has a timeout, and failures degrade through a six-level fallback ladder instead of breaking the experience.

---

# Part 2: Real Wish Maker onboarding and email

**Date of work:** Oct 15 and 16, 2026

## A. Why this was added

Days 1 to 3 gave us a working backend, but the Wish Network was 15 fictional samples. A product that people anywhere in the world can use has to accept real Wish Makers (musicians, home cooks, cafes, storytellers, volunteers) without the team recruiting each one by hand. This addition turns "real Wish Maker onboarding", which the plan listed as mockup-only, into a working feature.

The design goal: **anyone can apply from anywhere, the team reviews, families request, makers accept or decline, and trust and safety rules are enforced by the system, not by good intentions.**

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
| 16 | Email: the application email and the admin notice arrive. The link points at the frontend address, so it opens once the frontend is running there | Pass (Oct 19) |
| 17 | Email: "send me my link again" delivers a new link. Whether the old link stops working is not yet checked | Partly verified (Oct 19). The old-link check is still to run |

Note on checks 4 to 7: during the first run, the admin call used the wrong token, so the applicant was never approved. Every later step then failed exactly as designed: an unapproved maker cannot be requested, cannot respond, and cannot receive feedback. These failures are evidence that the approval gate protects families, and not bugs.

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

## F. Challenges (this addition)

1. **Admin calls returned 401.** Cause: the maker's private token was pasted into the admin token header, so the admin check correctly refused it. Fix: use the `ADMIN_TOKEN` value from `.env`. The failures that followed (404, 403, 409) were the approval gate doing its job on an unapproved maker. On Oct 16 the full flow was re-run with the correct token, and approval, request, accept, and the contact reveal all passed.
2. **Email on a free host.** Direct SMTP from Render's free tier is blocked, so email is sent through an HTTPS API.
3. **Lost links.** Hashing the token means the original cannot be re-sent, which led to the recovery flow.

## G. Known limits (updated)

- **Email ownership is not proven at signup.** The applicant already holds the link when they apply. The admin reference check (an email exchange during review) covers this for now. Emailing the link only, with no on-screen display, would prove ownership, at the cost of locking out anyone whose email fails.
- **Review is manual**, with one reviewer. A partner organisation could share this later.
- **Emails from a free email address may land in spam.** A sending domain of our own would fix this later.
- **Email depends on Brevo's free plan limits**, which should be checked on their pricing page before launch.
- The family notification link assumes a frontend page at `/person/{id}`, and the maker pages at `/maker/{token}` and `/maker/recover`. These must be confirmed with Alizah.
- Sample makers have no real people behind them. They are labelled everywhere.

## H. Status of the next steps (Oct 20)

1. Email is configured with Brevo. Tests 16 and 17 are done except the old-link check.
2. Deploying to Render with every environment variable is in Part 7.
3. Alizah builds the screens: Become a Wish Maker, the maker page, link recovery, request and status on the family side, matches, the Wish Book, and the retention choice.
4. Matching is built and tested (Part 4, section B), with in-person wishes limited to verified, local makers.
5. Real makers' tags are enriched with Qloo entity IDs for the 15 samples. Real applicants are enriched when they are approved, by running `enrich_makers.py`.

## I. Reusable text

**Devpost, "What it does" addition:**
Genie is a living network, not a fixed demo. Musicians, home cooks, cafes, storytellers, and volunteers anywhere in the world can apply to become Wish Makers. Every application is reviewed by a person before anyone is listed. Families send a request, the maker accepts or declines, and contact details are shared only after both sides agree.

**Devpost, "Safety and privacy" addition:**
Trust is enforced in code. Makers are not visible until approved. In-person wishes are limited to makers who passed a reference check. Edits to a profile trigger a fresh review. Any family concern suspends a maker immediately. Makers manage their profile through a private link whose secret is stored only as a hash, and they can withdraw their profile and everything linked to it at any time.

**README addition:**
Wish Makers apply at `POST /makers/apply`. An admin reviews applications with the `ADMIN_TOKEN` header at `/admin/makers`. Email is optional: set `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `FRONTEND_URL`, and `ADMIN_EMAIL` to enable notifications.

---

# Part 3: Backend testing report (Oct 17)

**Testing environment:** Local FastAPI server, Supabase database, Swagger UI, PowerShell, and Supabase SQL Editor.

The backend was tested for expiry enforcement, Wish Maker matching, retention controls, Wish Circle and Wish Book functionality, public notices, API rate limiting, and repository secret exposure.

## Test results

| No. | Test | Result | Observations |
|---|---|---|---|
| 1 | Expiry at read time | PASS | A manually expired person returned HTTP 404 on read (18:09 GMT), and deletion then returned HTTP 200 (18:11 GMT). |
| 2 | Text-based matching (remote wish, Mohammed Rafi) | NOT VERIFIED | The person, portrait, and wish were created, but the matching response was not saved. |
| 3 | Taste-based matching | PASS | A stored suggestion included a taste-based matching signal and explanatory reasons. Matching quality was validated again on enriched makers on Oct 19 (Part 6). |
| 4 | In-person matching (haleem, Hyderabad) | FAIL on Oct 17, then PASS on Oct 19 | The first run returned no matches. The cause is in Part 4, section C. The fix was applied on Oct 17 and re-tested on Oct 19 with two people (Part 6, L.2). |
| 5 | Stored match suggestions | PASS FOR FIELDS | The list for the Lag Jaa Gale wish returned `status`, `score`, `reasons`, `basis`, and the maker's name, type, city, country, and verification status. The maker's contact was `null`, as designed. Ordering across several makers was exercised on Oct 19. |
| 6 | Retention and administrative pinning | PASS | Retention of 5 days returned HTTP 422 with "Choose one of [7, 30, 90, 365] days". Pinning returned HTTP 200 with `expires_at` exactly five years ahead, read back from the database. The 30-day retention call returned HTTP 200 (reported; its output was not kept). |
| 7 | Wish Circle and Wish Book | PARTLY VERIFIED | A Circle answer containing `<script>alert(1)</script>` was saved (200). Compile, retrieve, and share all returned HTTP 200, and share returned a token. In the compiled data the script text is stored as plain text. **Not recorded:** the printed page showing it as text, Save as PDF, and the revoked link returning 404. |
| 8 | Public notices | PASS | `/meta/notices` returned the disclaimer, sample label, source labels, match-basis labels, verification plan, privacy points, retention options (7, 30, 90, 365), and maker status messages. |
| 9 | Rate limiting and security headers | PASS | Of 310 requests, 300 returned HTTP 200 and 10 returned HTTP 429. Every response in the Swagger output carries `cache-control: no-store`, `referrer-policy: no-referrer`, and `x-content-type-options: nosniff`. The limits for agent routes changed on Oct 20 (Part 6). |
| 10 | Git secret exposure | PASS (Oct 19) | `git ls-files backend/.env` and `git log --all --oneline -- backend/.env` both printed nothing. A search of the whole history for key patterns found only placeholders in `.env.example`. |

## Additional entity resolution testing

Entity-resolution tests showed that a successful API response does not necessarily identify the item the user intended. See Part 4, section D for the observed resolution outcomes and the resulting fallback strategy.

## Issues (status on Oct 20)

1. In-person matching: fixed and re-tested on Oct 19.
2. The exact response for text-based matching was not preserved.
3. Ordering across several makers: exercised on Oct 19.
4. Script-like text on the printed Wish Book page, Save as PDF, and the revoked share link are not yet recorded. They belong in the final judge test.
5. Test-data cleanup must be confirmed before the final judge test.
6. Entity resolution can return related items rather than the exact item intended, so the engine selects results by type and uses its fallback strategy.
7. Tag-overlap scoring: weak matches that rest only on broad shared traits are now dropped (Part 6, L.1). Further calibration on more real data is still useful.

## Conclusion

The backend demonstrated expiry enforcement at read time, stored and explained match suggestions, retention validation, administrative pinning, public notices, rate limiting, and security headers. The in-person matching failure was traced to a replaced portrait and an unhelpful fallback, and the fix has since been confirmed. The Qloo probes showed that artists and places resolve well, while songs and dishes are not Qloo entities, so the engine resolves by entity type and falls back from a song to its artist. The remaining checks (printed-page safety, Save as PDF, and share revocation) belong in the final judge test.

---

# Part 4: Audit, matching, retention, Wish Book, notices, rate limiting, Qloo findings

## A. Audit before building further (Oct 16 and 17)

Before adding features, the existing code was checked against the route list of the running API, so nothing was built twice.

| Feature | Already existed | Decision |
|---|---|---|
| Delete everything | `DELETE /persons/{id}`, cascading through every linked table | Kept, not rebuilt |
| 7-day expiry | An expiry date on every person and an hourly purge | Kept, one gap fixed |
| Maker accept and decline | Maker page, request, withdraw, and feedback endpoints | Kept. Only the screen remains |
| Safety workflow | Approval gate, verified-only in-person wishes, concern suspension, hashed tokens | Kept |
| Matching | The match table had a score column and a `suggested` status, but nothing wrote them | Built |
| Wish Book | A `wish_book` table with no endpoints | Built |
| Disclaimer and verification text | Not in the API | Built (one shared file) |
| Rate limiting | Only a per-email application limit | Built |

**Gaps found and fixed**
1. **Expired people stayed readable until the hourly purge ran.** Expiry is now enforced at read time, in every person-level endpoint and in the Wish Circle links.
2. **A 7-day expiry would delete the Wish Book keepsake.** Retention is now a choice (7, 30, 90, or 365 days), and it only edits the existing expiry date, so the purge and delete code were not changed.
3. **The consent note did not mention the keepsake.** A shared Wish Book can include a family member's answers, so the note now says answers may appear in a keepsake the family can print or share.

## B. Matching, retention, Wish Book, notices, and rate limiting

### B.1 Matching (`POST /persons/{id}/wishes/{wish_id}/match`)

**Which makers are considered**
- Only `approved` makers, excluding any maker who already declined this wish.
- **Remote wishes:** only makers who offer remote wishes. Location is ignored, which is what makes the network worldwide.
- **In-person wishes:** only makers who are `verified` (or labelled samples) and whose city matches the person's region.

**How a maker is scored.** For each item the wish is about, the strongest available signal is used:

| Signal | Strength | Basis label |
|---|---|---|
| The maker's Qloo entity is the same as the item's | 1.0 | `qloo` |
| Shared Qloo taste tags | 0.35 to 0.7, by overlap | `qloo` |
| Exact name match with one of the maker's own tags | 0.8 | `text` |
| One of the item's tags matches a maker's own tag | 0.5 | `text` |
| Partial word overlap | 0.4 | `text` |

- Each item's strength is weighted by its confidence.
- The score blends the best item (70 percent) with the average of the top three (30 percent), multiplied by 0.85.
- Small bonuses: +0.08 if the maker's type fits the kind of wish, +0.05 for a shared language, +0.05 for a verified maker, and +0.05 for a local maker on an in-person wish.
- Makers below 0.2 are not suggested, and a maker with no overlap at all is never suggested.
- **Added Oct 19:** a match that rests only on broad shared taste traits must score at least 0.45. Weaker ones are dropped, so unrelated makers do not pad the list. If nothing else matches a wish for one kind of maker, the honest fallback by maker type (labelled `type`) still applies.
- Every stored suggestion carries plain-language **reasons** and a **basis**, so the interface can say honestly whether a match came through Qloo's taste graph or only from matching names.
- A new run replaces the old suggestions and never touches requests already in progress.
- Text matching only finds literal overlap. Qloo's links are what can connect related things, which gives a clean evaluation: text-only matching against Qloo-assisted matching.

### B.2 Expiry and retention
- `PATCH /persons/{id}/retention` lets a family choose 7, 30, 90, or 365 days. Other values are refused.
- `POST /admin/persons/{id}/pin` keeps a demo persona alive for five years (admin only). This replaces the earlier "demo personas must be exempted" limit.

### B.3 Wish Book
- **Compile** builds the book from the portrait, wishes, accepted makers, and (optionally) family voices. The result has a title, tagline, person details, portrait items with their labels, themes, "what we learned" lines, wishes with their makers, family voices, the medical notice, and a timestamp.
- **Nothing is invented.** A theme appears in "what we learned" only when it occurs in at least two portrait items. In the test output a theme with a count of 1 produced no line, and only the family's memory appeared.
- **Sharing** is opt-in and revocable. The shared page contains no person ID.
- **Print or save as PDF** is a printable web page. A server-built PDF with standard fonts cannot show Telugu, Hindi, Arabic, or Korean text, while the browser's print dialog handles every script.
- **Safe rendering:** all text is escaped before it reaches the page, and the page carries no-index, no-referrer, and restrictive content-security headers.
- Maker contact details are never included. Sample makers are marked "(sample)".

### B.4 Shared notices (`GET /meta/notices`)
The medical disclaimer, sample label, verification plan, privacy points, source labels, match-basis labels, retention options, and maker status messages live in one place. The frontend loads them from here, so the wording is reviewed once.

### B.5 Rate limiting and headers
Per IP address: applications 5 per hour, link recovery 5 per hour, Circle submissions 40 per hour, new people (and new demo copies) 30 per hour, agent routes 10 per minute, the comparison 5 per minute, and everything else 300 per minute. Every response carries no-store, no-referrer, and no-sniff headers.

## C. In-person matching failure: root cause and fix

**Symptom.** A wish in in-person mode with the source item "haleem", for a person in Hyderabad, returned no matches, although the sample maker Zainab Siddiqui (Hyderabad, tag "haleem") exists.

**What the outputs ruled out**
- The wish mode was `in-person` and the person's region was Hyderabad.
- Maker `m03` was approved, listed publicly, in Hyderabad, and a sample (`remote_ok: false`, as expected for an in-person maker).

**What the outputs showed**
- 18:20 GMT: a portrait was saved with one item, "Lag Jaa Gale". Saving a portrait replaces all earlier items, so "Mohammed Rafi" and "haleem" were removed.
- 18:26 GMT: the in-person haleem wish was created.
- 18:31 GMT: matching returned an empty list with the old message and no explanation.
- 18:47 GMT: the compiled Wish Book lists only "Lag Jaa Gale" in the portrait. No later portrait save appears in the logged calls.

**Root cause (supported by the logged outputs).** The portrait no longer contained "haleem". The old code then fell back to matching against the whole portrait, which had nothing in common with Zainab Siddiqui, so the result was empty and gave no reason.

**Fix (two files)**
- `matcher.py`: a wish's own source items are always used for matching, even when they are not in the portrait. When the names are found, remote and Qloo-style matching behave exactly as before.
- `routers/matching.py`: an empty result now explains itself (for example "Add where they live so Genie can look for in-person Wish Makers nearby"), and the response carries an `explain` block with the mode, region, items used, and the numbers of approved and eligible makers.

**Status.** Applied on Oct 17. **Re-tested and confirmed on Oct 19** with two people: the in-person haleem wish for a person in Hyderabad matched the sample home cook in Hyderabad, and the in-person musician wish for a person in Seoul matched the sample musician in Seoul.

## D. Qloo integration findings (Oct 17)

### D.1 Setup
The Qloo hackathon key is stored only in `.env`. The search path, the key header, and the results field are confirmed by the successful probe calls.

### D.2 Second probe: entity resolution outcomes

| Input type | What happened |
|---|---|
| A song title | Not found as the song. Resolved through its artist |
| Song title plus the singer's name | The artist was found |
| A singer's name | Found, but not ranked first among the results |
| Singer's name plus a descriptive word | Results got worse, so descriptive words are never added to a query |
| A dish | Not found as an entity. Resolved as a taste tag |
| A landmark | Found as a place |
| A drink | The wrong kind of result ranked first, so results are chosen by type |

### D.3 What this means
1. **Songs:** the engine resolves a song through its artist (fallback level 3) and labels it "via the artist".
2. **Dishes:** the engine can use a taste-tag fallback when a direct entity is unavailable. The chosen representation must preserve the distinction between the requested dish and a related place.
3. **Results must be chosen by type.** Selecting a result solely because its name matches can return the wrong kind of entity. The engine should prefer the intended entity type and apply a documented fallback when no direct match exists.
4. **Do not add descriptive words to a query.** Adding a word such as "singer" made the results worse.
5. **Tag-overlap scoring:** Entities carry many tags (dozens to over a hundred). Tag-overlap scoring was first tested with hand-made tags. Real entities may share broad tags, so scoring needs calibration on real data. Until then, a match on the same entity is the most trustworthy Qloo signal.
6. **Definition of "resolved":** The engine's coverage test indicates that inputs can resolve through different levels of the fallback ladder. Songs may resolve through an artist or parent entity rather than directly as songs.
7. **Regional-language coverage:** Additional testing is needed across regional-language inputs before coverage can be considered reliable.
8. **Theme extraction:** The engine derives themes from entity tags. Broad or ambiguous tags can produce themes that do not accurately represent the user's intended preference, so theme extraction should be validated against representative inputs.

### D.4 Field mapping for the engine contract

- Entity identifiers and names are mapped into the engine's internal entity representation.
- Entity types are mapped into the internal type field.
- Tag identifiers and names are mapped into the engine's internal tag representation.
- Raw provider responses remain internal and must not be included in public reports.

### D.5 What follows
- The fallback ladder handles cases where the requested item cannot be resolved directly. Fallback results must be labelled accurately and should not be presented as exact matches.
- The type rules and the fallback ladder are implemented in the engine. The backend side stores the new fields and matches on tag names (Part 5).

## E. Decisions (new)

| Decision | Reason |
|---|---|
| Matches show their basis (`qloo` or `text`) | The project must visibly depend on Qloo, and honesty means saying when a match did not come from it. |
| Remote wishes ignore location | Recorded songs, messages, and recipes work from anywhere, which is what makes Genie worldwide. |
| In-person wishes need a verified, local maker | Safety first, as in the verification plan. |
| A wish's own items are always matched | A silent fallback to the whole portrait can match a wish against unrelated items. |
| Printable page instead of a server PDF | Font coverage for every language. |
| Retention is the family's choice | A keepsake must outlast a demo's seven days. |
| All safety text in one shared file | One review and one source of truth. |
| Qloo results are chosen by entity type | A name match alone returned a film for a song and a film for a drink. |

## F. Challenges (new)
1. **In-person matching returned no candidates.** Cause: a portrait save replaced the items, and the old fallback matched against unrelated items. Fix: always match a wish's own items, and explain empty results.
2. **Entity resolution can be indirect.** Some inputs do not resolve directly to the intended item. The engine selects results by type and uses its fallback ladder when needed.
3. **The admin token appeared in pasted screenshots and output.** The local token is low risk, but it must be rotated before deployment, and screenshots for Devpost must not show it.

## G. Known limits (new)
- The purge runs inside the server process. If a free host sleeps, expired data stays stored until the server wakes, although it is no longer readable.
- Emails already sent cannot be recalled when a family deletes their data.
- Tag-based matching needs calibration on more real Qloo tags. Weak shared-trait matches are now filtered out.
- The rate limiter keeps its counts in memory, so it resets on restart and covers one server instance.
- The in-person rule compares a maker's city with the person's region text, so both must be spelled sensibly.
- Direct entity resolution is not reliable for every input type; fallback behaviour requires continued testing.

## H. What remains

Superseded by Part 7, which is the current list.

## I. Reusable text (new)

**Devpost, "How it is Qloo-powered" (matching):**
Every match is explained and honest. Genie scores each Wish Maker against the specific items a wish is about, using Qloo's entity and taste-tag links where they exist, and falling back to plain name matching only when they do not. Each match is labelled with which of the two produced it, so a judge or a family always knows how much of the result came from Qloo's taste graph.

**Devpost, "Challenges":**
Qloo's search mixes entity types, and it has entities for artists and places but not for individual songs or dishes. Genie therefore chooses results by type, moves from a song to its artist, and labels anything it could not resolve instead of hiding it.

**Devpost, "Safety and privacy" (addition):**
A family's data expires automatically, and they choose how long it stays. Expired data is unreadable immediately, deletion removes everything linked to a person in one step, and shared keepsakes can be switched off at any time. Every page that shows user text escapes it, and sensitive endpoints are rate limited.

**Devpost, "Safety and privacy" (third-party services):**
Genie sends the names of favourite songs, dishes, places and films to Qloo and, when an AI key is set, to a third-party AI service that helps read typed answers. If a family opens the comparison with a general AI, that service also receives the person's first name, birth year, region, language, the favourites, and the Wish Circle notes, because that is exactly what Genie was given. Free-tier AI services may use prompts to improve their models, so we send nothing else: no surnames, contact details or health information. Qloo's data stays in our private database and is never published.

---

# Part 5: Engine integration (Oct 18 and 19)

## K. Engine integration

### K.1 What arrived
Umaima's engine (Days 1 to 7) is in `backend/engine/`. The backend calls it and stores what it returns. The functions the backend uses are: `run_agent` (portrait, then wishes, in one call, with visible steps and timings), `pick_reaction_cards` and `apply_reactions` (Reaction Mode), `side_by_side` (the comparison with a general AI), and `generate_bedside_kit`. The engine never touches the database and never raises an error to its caller. Her own documents (`Engine.md`, `engine-contract.md`, `coverage-report.md`, and her Days 1 to 7 report) describe it.

### K.2 What the contract changed on the backend side

| Finding | Change made |
|---|---|
| Portrait items carry `matched_name` ("Matched via ...") | New column, accepted on save and returned on read |
| Wishes carry `kind`, `maker_type`, `tags`, `basis`, `why`, `affinity` | New columns on `wish`, accepted on save and returned on read |
| Food items hold a taste-tag ID in the entity field | The matcher treats it as a tag, not an entity |
| Provider identifiers may differ across endpoints or formats | Tags are compared by name first, and identifiers are normalized where required |
| `maker_type` values are musician, home cook, storyteller, volunteer | An exact type match adds a bonus, and a wish for one maker type only goes to that type |
| Seeded maker `m14` had the type "volunteer group" | Corrected to "volunteer" |
| The seeded home cook did not offer remote wishes, but the engine's food wish is a recorded recipe | Set to remote |
| The public makers list exposed Qloo entity IDs | Removed from the public list |
| An empty engine result could have deleted a saved portrait or wishes | Empty results are never saved over existing data |
| Wish polish by an AI is off by default in the engine | The backend passes `use_llm` only when `WISH_POLISH=1` |

### K.3 Endpoints added

| Endpoint | What it does |
|---|---|
| `POST /persons/{id}/portrait/build` | Builds and saves the portrait from quick facts plus the family's Circle answers |
| `POST /persons/{id}/wishes/generate` | Generates and saves 3 to 5 wishes from the saved portrait |
| `POST /persons/{id}/agent/run` | Portrait, wishes, and matching in one call. Returns the engine's steps (with a final "find Wish Makers" step added by the backend), timings, the portrait, the wishes, the matches, and the Qloo call log |
| `POST /persons/{id}/match-all` | Matches every wish of the person |
| `POST /persons/{id}/reaction/cards` | The next few items to show in Reaction Mode (the caller sends the `tried` list) |
| `POST /persons/{id}/reaction/apply` | Applies "lit up" or "no reaction" taps and updates the portrait |
| `POST /persons/{id}/compare` and `GET /persons/{id}/compare` | Runs the side-by-side with a general AI, stores it, and reads back the last result. The POST takes no body: it reads the saved portrait and Circle answers |
| `GET /persons/{id}/bedside-kit` | Builds the Bedside Kit from the saved portrait |
| `GET /persons/{id}/agent-log` | The stored steps and call logs, so the interface can show them after a reload |

The stateless routes in `routers/agent_demo.py` (Umaima's) run the engine without storing anything and power the "try it yourself" demo.

### K.4 Design decisions

| Decision | Reason |
|---|---|
| Separate short steps, plus one combined call | The interface can show visible progress step by step, and a one-click demo is still possible |
| The engine runs in a worker thread with a time limit | A slow Qloo or AI response never blocks the server, and a timeout gives a calm message and never a raw error |
| The database connection is released before the engine call | A slow call never holds a connection |
| Regenerating wishes keeps any wish that already has a request in progress | A family's requests are never deleted |
| The comparison result is stored | A demo person can show it again without another AI call |
| `tried` lives in the frontend session | The engine does not remember it, and no column is needed |
| Rate limits cover every agent route (10 per minute per address, and 5 per minute for the comparison) | Each call spends Qloo quota, and the comparison also spends an AI call |
| The privacy notice names the third-party AI and says what the comparison sends | Transparency, as the plan requires |

### K.5 Test results (Oct 19)

| # | Check | Result |
|---|---|---|
| 1 | One call builds the portrait: the quick fact and the Circle answers were gathered, every name matched in Qloo (one through an artist), and the portrait was saved with source labels and confidence | Pass |
| 2 | Wishes: 5 were generated (4 remote, one in-person and last), saved with all the extra fields, and read back | Pass |
| 3 | The combined call returns the engine's real steps plus the backend's matching step, and timings for each stage. With a warm cache the whole request took about 1.6 seconds | Pass |
| 4 | Matching: every wish received at least one suggestion. After the makers were enriched, most suggestions came through Qloo's taste links, and a few place and story wishes matched by what the maker offers, labelled as such | Pass (Oct 19, evening) |
| 5 | Reaction cards: three cards were returned from the three items the family named | Pass |
| 6 | Reaction apply: the item that lit up became "reacted" with higher confidence. A "no reaction" on an item the family told us left it unchanged, as designed. New guessed items were added with the "likely" label, and the message was the kind one. The saved portrait was read back | Pass |
| 7 | Comparison with the AI key set: the general AI answered with 5 wishes and no source label. Genie's side had 5 wishes, all with taste tags, plus a discovery wish with its reason. The result was stored and read back | Pass (Oct 19, evening) |
| 8 | Bedside Kit: the playlist was ordered (reacted, told, then labelled guesses), with small room changes, visitor suggestions, a care-team note on food, and the medical disclaimer | Pass |
| 9 | The public makers list no longer contains Qloo entity IDs. The home cook offers remote wishes, and `m14` has the type "volunteer" | Pass |
| 10 | Rate limits for the agent and comparison routes, after the change to per-minute limits (Part 6, L.1), and the protection against empty engine results | Not run yet |

### K.6 Issues found while reviewing the results (status on Oct 20)
1. **The general AI side of the comparison was unavailable.** Fixed on Oct 19: the AI key is set and the comparison runs on both sides. The same key variables are needed on the host.
2. **Matching ignored the artist a song was matched through.** When a song resolves through its artist, a maker who lists that artist should match. For makers with Qloo data this already worked through the shared artist entity. Fixed on Oct 20 for makers who list the artist only as plain text: `routers/matching.py` now selects `matched_name`, and `matcher.py` compares it with the maker's own tags (labelled `text`). Re-check pending (Part 6, check 29).
3. **Broad tags can create false shared-taste matches.** Fixed on Oct 19 in a different way: a match that rests only on shared traits must now score at least 0.45 (Part 4, B.1).
4. **Test people were left in the database** and must be deleted before the final judge test.

### K.7 Known limits
- The first call after a restart can take 10 seconds or more for each uncached Qloo request, and the interface needs a calm waiting state.
- A private snapshot of the engine's cache is restored from the database when the server starts (`ENGINE_CACHE_RESTORE=1`), so a redeploy no longer starts cold. A brand-new person whose items are not in the snapshot still takes several seconds on the first run.
- The comparison depends on a live AI call and can be unavailable.
- Reaction Mode has no memory of the tried list, by design.

### K.8 What remains from this part

Superseded by Part 7, which is the current list.

### K.9 Reusable text

**Devpost, "How we built it":**
The backend calls our agent engine in a worker thread with a time limit, stores the portrait, wishes, and a private log of every step, and then matches each wish to Wish Makers. Each stage reports its real timing, so the interface can show what the agent did without inventing anything.

**Devpost, "Safety and privacy" (addition):**
Typed answers go to a third-party AI service only to pick out the names of songs, dishes, and places. If a family opens the comparison with a general AI, we tell them exactly what is sent: the person's first name, birth year, region, language, the favourites, and the Wish Circle notes. Free-tier AI services may use prompts to improve their models, so nothing else is sent. Qloo's data stays in our private database and is never published.

**README, Engine section (backend side):**
The backend calls the engine in `backend/engine/` through `POST /persons/{id}/agent/run` (or the separate portrait and wishes endpoints), with a time limit on every call. Set `QLOO_API_KEY` and, optionally, the `LLM_*` variables and `WISH_POLISH` in `backend/.env`.

---

# Part 6: Final local checks, demo people, and engine Day 8 changes (Oct 19 to 20)

## L. Final checks

### L.1 What changed in the code

- **New router `routers/demo.py`** with `GET /demo/personas` and `POST /demo/start`. Demo people are listed by position only. Their real ids live in the private variable `DEMO_PERSON_IDS` and are never returned. Starting a demo copies the pinned person's portrait, wishes, stored comparison, and agent log into a new person with the normal 7-day expiry, then runs matching against the database. It makes no Qloo or AI call, so a judge's first click is instant.
- **Not copied by a demo start:** Wish Circle answers, Wish Book, share links, and requests. Those belong to the source person and stay private.
- **`matcher.py`:** a match that rests only on broad shared taste traits must score at least 0.45 (`TRAITS_ONLY_MIN`). Weaker ones are dropped.
- **`matcher.py` and `routers/matching.py` (Oct 20):** a maker who lists the artist or parent that an item was resolved through (`matched_name`) now matches, labelled `text`. Entity matches still score highest.
- **`routers/circle.py` and `notices.py` (Oct 20):** the Wish Circle consent note and the privacy points now name Qloo and the third-party AI service, and say that free AI services may use prompts to improve their models. The frontend reads both from the API, so no screen change is needed.
- **`guard.py`:** agent routes are limited to 10 per minute per address and the comparison to 5 per minute. They replace the earlier 40 per hour and 12 per hour. `/demo/start` counts with new people.
- **`main.py`:** registers the demo router, and restores the engine cache snapshot at start-up (Umaima's change, controlled by `ENGINE_CACHE_RESTORE`).
- **`mailer.py`:** a failed email now logs Brevo's reason. This also fixes a bug where a timeout raised a second error inside the error handler, because the handler read a response that did not exist.

### L.2 Test results

| # | Check | Result |
|---|---|---|
| 11 | Comparison with the AI key set: both sides available, stored, read back | Pass |
| 12 | Free-text Wish Circle answers: three names were extracted and the sentence around them was not turned into an item | Pass |
| 13 | One-call agent run: steps end with the matching step, matches labelled by basis. A warm run took about 1.6 seconds. A first run with uncached requests took about 11 seconds | Pass |
| 14 | In-person matching re-test, demo person in Hyderabad: the in-person haleem wish matched the sample home cook in Hyderabad | Pass |
| 15 | In-person matching re-test, demo person in Seoul: the in-person musician wish matched the sample musician in Seoul, the only eligible maker | Pass |
| 16 | Two clean demo people built (one in Hyderabad, one in Seoul), each with one agent run and one comparison, then pinned for five years | Pass |
| 17 | `/demo/personas` lists both people by position with no real id. `/demo/start` for each returned a new person with a 7-day expiry and matches | Pass (Oct 19, after the minimum-score change). Reads of the copy's portrait, wishes, comparison, and log passed on an earlier copy with the same code, and again on the deployed service (check 26) |
| 18 | Minimum score for weak matches: each music wish now shows only its strong match (one maker). A place wish for a place with no local storyteller still shows type-only matches, labelled as such | Pass |
| 19 | Email through Brevo: the application email, the admin notice, and the new-link email all arrived | Pass |
| 20 | Secret check: `backend/.env` is not tracked and not in history. The only pattern hits are placeholders in `.env.example` | Pass |
| 21 | Maker enrichment: all 15 sample makers enriched. A maker keeps only exact matches | Pass |
| 22 | Engine offline suites (167 checks across six suites), the live checks against Qloo and the AI service, and the AI ping | Pass |
| 23 | After a link recovery, the old maker link stops working | Not run yet |
| 24 | Rate limits after the change to per-minute limits | Not run yet |
| 25 | Wish Book printed page showing script text as plain text, Save as PDF, and the revoked share link returning 404 | Not recorded yet. Part of the final judge test |
| 26 | Deployed service: `/health/db`, `/demo/personas`, and `/demo/start` for both demo people returned 200. Reads of a copy's portrait, wishes, comparison, and agent log returned 200 | Pass (Oct 20) |
| 27 | Email from the deployed service: the admin notice for a new Wish Maker application arrived | Pass (Oct 20) |
| 28 | Engine cache snapshot restored on the deployed service at start-up | Pass (Oct 20) |
| 29 | Matching through `matched_name` after the change to `matcher.py` and `routers/matching.py` | Applied Oct 20. Re-check pending |
| 30 | Test data cleanup: test people and test Wish Makers deleted, the two pinned demo people kept | Done (Oct 20) |

The in-person fix noted as untested in Part 4, section C is now confirmed by checks 14 and 15.

### L.3 Issues found

1. **The first demo person had test leftovers** (a test wish, an item from a free-text test, and a comparison made from an older portrait). Both demo people were rebuilt clean.
2. **Some lower-ranked matches rested only on broad shared traits.** For example, a jazz musician could appear under a K-pop wish. Fixed with the minimum score (check 18). Each music wish now shows one strong match. If a wish needs more suggestions, lower `TRAITS_ONLY_MIN`.
3. **A place wish with no local storyteller gets type-only matches**, labelled "by what the maker offers". This is honest, and the wish is remote.
4. **The admin token appeared again in pasted output.** It must be rotated, and the hosted service must use a new one.
5. **The email error handler had a bug** (see L.1). Fixed.

### L.4 Engine Day 8 changes and the Render settings they need

Umaima added a private snapshot of the engine's cache to the database (table `engine_cache`). It holds hashed request keys and response bodies only, has row-level security on, contains no person data, and is not touched when a person is deleted. It is restored when the server starts. This is private server-side caching, as Qloo's terms allow, and nothing from it is published.

Render needs: `ENGINE_CACHE_RESTORE=1`, `DATABASE_URL`, `QLOO_API_KEY`, `QLOO_API_URL`, `LLM_API_KEY` (the new key, because the old one ran out of quota), `LLM_MODEL`, `LLM_BASE_URL`, `LLM_TIMEOUT`, `DEMO_PERSON_IDS`, `ADMIN_TOKEN` (new), `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `ADMIN_EMAIL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`. `requirements.txt` needs `requests`, `python-dotenv`, `psycopg`, and `httpx`. After a deploy, the log should say the engine cache was restored. The full steps are in `docs/deployment.md`.

### L.5 Engine contract: lines to update (applied by Zunairah on Oct 20)

1. Section "Rules": change the worst-case note to "a dead Qloo now fails in about 14 seconds".
2. Section 8: replace the "wiped on a Render redeploy" note with "a private snapshot in the database (table `engine_cache`) is restored at start-up when `ENGINE_CACHE_RESTORE=1`. Run the demo people once after each deploy."
3. Open questions: remove question (a). The Wish Circle answer keys are music, food, place, film and joy. The engine maps the first four, and reads joy only when the AI key is set.
4. Wherever the docs show a named "Matched via ..." example, change it to "Matched via <artist name>". Also note that the 30-item cap includes the level-4 guesses, and that a level-4 guess with ageing or heavy tags is skipped.

### L.6 Decisions

| Decision | Reason |
|---|---|
| Demo people are listed by position, ids stay in a private variable | Anyone could otherwise copy a real person's data by id |
| A demo copy leaves out Circle answers, Wish Book, links, and requests | They belong to the source person |
| A demo copy makes no Qloo or AI call | The first click is instant, and quota is not spent |
| Agent limits are per minute | Every call spends Qloo quota, and the comparison also spends an AI call |
| Weak shared-trait matches are dropped, with an honest type-only fallback | A short, correct list is better than a long list that includes poor fits |

### L.7 Known limits (additions)

- A demo copy shows the comparison stored for the source person, not a fresh one.
- Rate limit counts stay in memory, so they reset when the server restarts.
- A cached comparison answer can contain the first name that was used in it. Deleting a person does not remove cache rows.

### L.8 Documents and wording added

- `docs/privacy.md`: what is stored, who receives it, retention, deletion, and the Wish Maker verification plan.
- `docs/deployment.md`: database setup, Render settings and variables, first deploy, smoke test, uptime monitor, secrets.
- `docs/testing.md`: engine tests, API checks by hand, the 10-person judge test, and the safety checks.

**Consent note, new wording** (applied on Oct 20 in `routers/circle.py`, `CONSENT_NOTE`; the privacy points in `notices.py` were updated to match):

Your answers will be seen by the family who invited you. They may appear in a keepsake book the family can print or share. The names in them (songs, dishes, places, films) are checked against Qloo, a taste database, and an AI service helps read what you type. Free AI services may use what they receive to improve their models, so please leave out surnames, contact details and health details. You can skip any question.

---

# Part 7: What remains

## M. Current list (updated Oct 20)

**Done**

1. Local changes committed and Umaima's Day 8 changes pulled. The engine cache table exists in the database Render uses, and the deployed log shows the cache restored.
2. Render redeployed with the latest code and all variables.
3. Both demo people are pinned. `/demo/personas` and `/demo/start` work on the deployed service.
4. Email from the deployed service works.
5. Uptime monitor on `/health/db`, every 5 minutes.
6. Consent note and privacy points updated (L.1).
7. Engine contract lines updated (L.5).
8. `matcher.py` and `routers/matching.py` match through `matched_name`. Re-check pending (check 29).
9. Test people and test Wish Makers deleted. The two pinned demo people remain.
10. Frontend guide (`docs/frontend-integration.md`) handed to Alizah.

**Still to do**

1. Re-run `/demo/start` for both demo people after the `matched_name` change, and confirm the matches look the same.
2. When the frontend is deployed: set `FRONTEND_URL` and `ALLOWED_ORIGINS` to its address on Render, and test from the live site.
3. Paste the third-party AI wording (Part 4, section I, and K.9) into the Devpost privacy section.
4. Run the checks marked not run: the old maker link after recovery (23), the new rate limits (24), and the Wish Book print, Save as PDF, and revoked-link checks (25).
5. Final judge test with 10 varied people (`docs/testing.md`), README setup steps, license check in the About panel, the Devpost description, and submission by Oct 
