# Qloo coverage report (Risk 2, Day 1-2)

**Owner:** Umaima. **Script:** `backend/engine/coverage_test_v2.py`. **Date run:** Oct 16-17, 2026.
**Pass mark from the plan:** at least 70% of 40 inputs resolve.

> Raw Qloo responses and per-row ids are kept locally in `engine/_coverage/` (git-ignored) because Qloo's terms forbid publishing response data. This report contains only our own inputs and statuses.

## Result

| Measure | Result |
|---|---|
| Automatic score (exact or via level 3) | **38 of 40 (95%)** |
| After manual review of the auto-matches | roughly 34-36 of 40 (85-90%) once false positives are removed |
| Verdict | **Pass** (well above 70%) |

By domain (automatic): music 21/23, film 4/4, TV 1/1, food 6/6, place 6/6.

## Why the automatic score is optimistic

| Input | Auto result | Review |
|---|---|---|
| Hotel California | exact | False positive. Qloo's artist index has a namesake entity with almost no tags. Should resolve to the Eagles. Fixed by the thin-hit rule. |
| Tirupati | exact | False positive. The loose matching rule accepted a railway station. Fixed by stricter matching plus a locality fallback and parent hints. |
| Butta Bomma, Naatu Naatu, Lag Jaa Gale | found via level 3 | Genuine level 3, but only at artist/composer level. Qloo indexes artists, not songs. |
| Why This Kolaveri Di | not found | Real miss at first. Now level 3 via the composer (Anirudh Ravichander). |
| Umm Kulthum | not found | Spelling miss. Now level 2 via an alternate transliteration. |

## Patterns that shaped the design

1. **Songs resolve at artist level.** The Wish copy must say "via the artist", never claim the song was found.
2. **Transliteration matters** (Arabic, Indian names). Hence level 2 with aliases and an LLM option.
3. **Namesakes and thin entities exist.** Matching must compare names strictly and prefer hits that have tags.
4. **Food works through tags**, not entities, and resolved 6/6 including regional dishes (haleem, Hyderabadi biryani, irani chai).
5. **Cities and landmarks resolve well** (Charminar, Marina Beach, Goa, Kyoto, Jeju). Only the very short or ambiguous name (Tirupati) was a problem.
6. **Regional film and Telugu/Hindi classic singers are well covered** (for example Ghantasala, S. P. Balasubrahmanyam, Mohammed Rafi, Kishore Kumar, Lata Mangeshkar, Mughal-e-Azam, Mayabazar).

## Fallback ladder status

Implemented levels 1, 2, 3, 5, 6 in `resolve.py` and level 4 in `portrait.py`. See `docs/engine.md` section 5.

## Still to do for this gate

## Gate status

- [x] 40 inputs run through the real ladder (`coverage_run.py`) and reviewed by hand (`my_review`).
- [x] Judge-style extra inputs (`live_checks.py --extra`): 12 inputs covering spelling variants, songs, regional dishes, a landmark, a one-letter input.
- [x] Level 4 verified live for three thin personas (Hindi/Hyderabad, Telugu/Chennai, Korean/Seoul).
- [x] Level 6 verified (simulated bad key).

## Judge-style inputs (our own inputs, statuses only)

| Input | Result |
|---|---|
| Ghulam Ali, Descendants of the Sun, Mugal e Azam (misspelt), Elton John, pesarattu, Edinburgh | Level 1 |
| Fairouz (alternate spelling), Hussain Sagar, Kumbakonam filter coffee | Level 2 (alias or LLM) |
| Aayega Aanewala (a song) | Level 3, via the artist |
| haleem biriyani, "a" | Level 5, honestly "not in Qloo" |