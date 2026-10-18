# Qloo coverage report (Risk 2, Day 1-3)

**Owner:** Umaima. **Scripts:** `backend/engine/coverage_test_v2.py`, `coverage_run.py`, `live_checks.py`. **Dates run:** Oct 16-18, 2026.
**Pass mark from the plan:** at least 70% of 40 inputs resolve.

> Raw Qloo responses and per-row ids are kept locally in `engine/_coverage/` (git-ignored) because Qloo's terms forbid publishing response data. This report contains only our own inputs and statuses, and no Qloo result names, ids or tag counts.

## Result

| Measure | Result |
|---|---|
| Original automatic score (exact or via level 3) | **38 of 40 (95%)** |
| After the fixes below, all 40 through the real ladder | **40 of 40 resolve** (33 exact, 1 alternate spelling, 6 via the artist or parent) |
| Manual review (`my_review` column, kept locally) | 39 right, 1 suspicious (one song resolves to the right composer, who has no taste tags in Qloo) |
| Verdict | **Pass** (well above 70%) |

By domain (original automatic run): music 21/23, film 4/4, TV 1/1, food 6/6, place 6/6.

## Two ways to count "resolved"

The original run counted an input as resolved when Qloo returned something. A stricter reading counts it only if it is the right entity of the right type. The two readings differ for songs and dishes, because Qloo has artists and places but no song or dish entities in `/search`.

| Input kind | Strict reading | How the engine handles it |
|---|---|---|
| Artists, films, TV, cities and landmarks | Resolve as the right entity | Level 1 (or level 2 for alternate spellings) |
| Songs | Do not resolve as the song | Level 3, through the artist or composer, labelled "via the artist" |
| Dishes and drinks | Do not resolve as an entity (a plain search returns restaurants) | Resolved as a **tag** through the Qloo tags endpoint (6 of 6 test dishes), never stored as a restaurant |

So the honest claim is: every test input lands on something true and useful, songs only at artist level, and nothing is shown as found when it is not.

## Why the original automatic score was optimistic

| Input | Auto result | Review |
|---|---|---|
| Hotel California | exact | False positive. Qloo's artist index has a namesake entity with almost no tags. Should resolve to the Eagles. Fixed by the thin-hit rule. |
| Tirupati | exact | False positive. The loose matching rule accepted a railway station. Fixed by stricter matching plus a locality fallback and parent hints. |
| Butta Bomma, Naatu Naatu, Lag Jaa Gale | found via level 3 | Genuine level 3, but only at artist/composer level. |
| Why This Kolaveri Di | not found | Real miss at first. Now level 3 via the composer. |
| Umm Kulthum | not found | Spelling miss. Now level 2 via an alternate transliteration. |

## Patterns that shaped the design

1. **Songs resolve at artist level.** Wish copy must say "via the artist", never claim the song was found.
2. **Transliteration matters** (Arabic, Indian names). Hence level 2 with aliases and an LLM option.
3. **Namesakes and thin entities exist.** Matching compares names strictly and prefers hits that have tags.
4. **Food works through tags**, not entities, and resolved 6/6 including regional dishes.
5. **Cities and landmarks resolve well.** Only the very short or ambiguous name (Tirupati) was a problem.
6. **Regional film and Telugu/Hindi classic singers are well covered.**
7. **Some artists have no taste tags**, so items resolved to them carry little data into matching. Such items are kept and labelled, not dropped.

## Fallback ladder status

All six levels are implemented and verified: levels 1, 2, 3, 5, 6 in `resolve.py` and level 4 in `portrait.py`. See `docs/Engine.md` section 5.

## Gate status

- [x] 40 inputs run through the real ladder (`coverage_run.py`) and reviewed by hand.
- [x] 12 judge-style extra inputs (`live_checks.py --extra`), table below.
- [x] Level 4 verified live for three thin personas (Hindi/Hyderabad, Telugu/Chennai, Korean/Seoul). Results are region and language appropriate, not era-specific.
- [x] Level 6 verified (simulated bad key returns level 6, no crash).
- [x] LLM path verified live (`live_checks.py --llm` prints PASS). The engine works without it.
- [x] Wish generation verified live for the Nani demo person (`live_checks.py --wishes`) and with 35 offline checks.
- [ ] Judge test with 10 varied people end to end (Day 9).

## Judge-style inputs (our own inputs, statuses only)

| Input | Result |
|---|---|
| Ghulam Ali, Descendants of the Sun, Mugal e Azam (misspelt), Elton John, pesarattu, Edinburgh | Level 1 |
| Fairouz (alternate spelling), Hussain Sagar, Kumbakonam filter coffee | Level 2, through the built-in alias table |
| Aayega Aanewala (a song) | Level 3, via the artist |
| haleem biriyani, "a" | Level 5, honestly "not in Qloo" (the one-letter input is stopped by a short-input guard) |

The aliases and parents behind these results are seed knowledge in `resolve.py`. With the LLM on, unseen spellings get the same treatment automatically.