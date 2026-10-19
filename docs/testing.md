# Genie: testing

Three layers: offline engine tests, API checks you can repeat by hand, and the 10-person judge test. All data is fictional. Do not commit screenshots, tokens, person ids, or Qloo responses.

## 1. Engine tests (offline, no network, no keys)

From the `backend` folder:

```powershell
python engine\test_offline.py
python engine\test_wishes.py
python engine\test_agent.py
python engine\test_reaction.py
python engine\test_sidebyside.py
python engine\test_kit.py
```

Checks against the real services (needs `QLOO_API_KEY`, and `LLM_*` for some):

```powershell
python engine\live_checks.py
python llm_ping.py
```

## 2. API checks by hand

Start the server from the `backend` folder and open `http://localhost:8000/docs`:

```powershell
uvicorn main:app --reload
```

| # | Check | Body or action | Expected |
|---|---|---|---|
| 1 | Create a person | `{"first_name":"Nani","birth_year":1948,"region":"Hyderabad","language":"Hindi"}` | 200, expiry 7 days ahead |
| 2 | Full agent run | `POST /persons/{id}/agent/run` with `{"quick_facts":[{"domain":"music","name":"Lag Jaa Gale"},{"domain":"food","name":"haleem"},{"domain":"place","name":"Charminar"}]}` | Steps end with "Find Wish Makers". 3 to 5 wishes, at most one in person, last |
| 3 | Comparison | `POST /persons/{id}/compare` (no body) | Both sides available. Genie's wishes carry taste tags and labels |
| 4 | Read the comparison back | `GET /persons/{id}/compare` | 200, same result |
| 5 | Free-text Wish Circle answer | `POST /persons/{id}/circle`, then `POST /circle/{token}/responses` with `{"contributor_first_name":"Ayesha","answers":{"music":"She sang along to Queen","food":"her haleem"},"consent_given":true}`, then `POST /persons/{id}/portrait/build` with `{"quick_facts":[]}` | Names are extracted. The sentence is not an item |
| 6 | Consent is required | Same answer with `"consent_given":false` | 400 |
| 7 | In-person matching | `POST /persons/{id}/wishes` with `{"title":"Haleem, the way she made it","description":"A cook makes it with the family","mode":"in-person","source_items":["haleem"]}`, then `POST /persons/{id}/wishes/{wish_id}/match` | A verified or sample maker in the same city. An empty result explains itself |
| 8 | Weak matches are not suggested | Match a music wish | Makers that share only broad traits are not listed |
| 9 | Retention | `PATCH /persons/{id}/retention` with `{"days":5}`, then `{"days":30}` | 422, then 200 |
| 10 | Pin a demo person | `POST /admin/persons/{id}/pin` with the `X-Admin-Token` header | Expiry about five years ahead. Wrong token gives 401 |
| 11 | Demo copy | `GET /demo/personas`, then `POST /demo/start` with `{"persona":0}` | A new person with portrait, wishes, comparison, agent log, matches, and a 7-day expiry. No real id is returned by the list |
| 12 | Delete everything | `DELETE /persons/{id}` then `GET /persons/{id}` | 200, then 404 |
| 13 | Rate limit | Run the loop below | 10 responses of 200, then 429 |

```powershell
1..12 | % { try { (Invoke-WebRequest -Method Post -Uri http://localhost:8000/agent/bedside-kit -ContentType "application/json" -Body '{"person":{"first_name":"Nani"},"items":[]}' -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
```

### Wish Book and sharing

1. Add a Wish Circle answer containing `<script>alert(1)</script>`.
2. `POST /persons/{id}/wish-book/compile`, then `POST /persons/{id}/wish-book/share`. Copy the token.
3. Open `/book/{token}/print` in a browser. The text must appear as plain text, with no popup.
4. Press Ctrl+P and choose Save as PDF. Open the file.
5. `DELETE /persons/{id}/wish-book/share`, then reload `/book/{token}`. It must return 404.

### Wish Maker flow

1. `POST /makers/apply` with consent and conduct accepted. Save the private link. It is shown once.
2. `GET /makers` does not list the applicant. `GET /maker-portal/{token}` shows `pending`.
3. `GET /admin/makers` with the admin token lists the applicant. `POST /admin/makers/{id}/review` approves.
4. A family sends a request. The maker accepts. Contact details appear only after that.
5. Feedback with a concern suspends the maker, who then appears at `/admin/concerns`.
6. `POST /makers/recover` emails a new link. The old link must stop working.
7. `DELETE /maker-portal/{token}` withdraws the profile.

## 3. Judge test: ten different people

Every person must reach a Wish Book with no error. Use `agent/run`, `wish-book/compile`, `wish-book/share`, and the print page. Delete each person afterwards.

| # | Person | Region, language | Favourites to type |
|---|---|---|---|
| 1 | Nani, born 1948 | Hyderabad, Hindi | Lag Jaa Gale (music), haleem (food), Charminar (place) |
| 2 | Sana, born 1992 | Seoul, Korean | BTS (music), kimchi jjigae (food), Busan (place) |
| 3 | Raju, born 1946 | Hyderabad, Telugu | Mugal e Azam (film), pesarattu (food), Hussain Sagar (place) |
| 4 | Ghulam, born 1950 | Lahore, Urdu | Ghulam Ali (music) |
| 5 | Layla, born 1955 | Beirut, Arabic | Fairouz (music) |
| 6 | Margaret, born 1950 | Edinburgh, English | Elton John (music), Edinburgh (place) |
| 7 | Arjun, born 1960 | Chennai, Tamil | A. R. Rahman (music), Kumbakonam filter coffee (food) |
| 8 | Min-jun, born 1985 | Seoul, Korean | Descendants of the Sun (film) |
| 9 | Someone with almost nothing | Any region and language | No favourites. Birth year, region and language only |
| 10 | A judge's own person | Anything the judge types, including a misspelling and a song title | Whatever they enter |

Record for each person: reached the Wish Book (yes or no), items labelled "not in Qloo" (these are expected and honest), time to first result, and any error. Person 9 must still return a portrait and a gentle follow-up question.

## 4. Safety checks before submission

- No medical or clinical wording on any screen. The medical notice is visible.
- The delete button works. Wish Circle links cannot be guessed.
- Every sample Wish Maker shows a "Sample" label.
- `git ls-files backend/.env` prints nothing, and the secret search of the history finds no real key.
- Screenshots use fictional data and show no token.
- The live link opens in a private window and on a phone, with no login wall.