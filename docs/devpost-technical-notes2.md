# Genie: technical notes for the Devpost description

For Alizah to turn into the "How it is Qloo-powered" and "How we built it" sections. Every number below comes from the repo or from a test run; nothing is invented. Do not publish raw Qloo data (names of results, tag lists, scores): Qloo's terms forbid it, and the cache folder is git-ignored for the same reason.

## The one-sentence answer to "does it work without Qloo?"
No. Without Qloo, Genie keeps the family's own words but loses its taste tags, the "people like them also love" discovery, the era-and-place portrait, and the tag-based maker matching. The side-by-side screen shows exactly this: a general AI is given the same facts and no Qloo data, and its wishes carry no taste evidence.

## What Qloo does (three jobs)
1. **Understand.** Every favourite the family names (song, dish, film, place) is resolved to a Qloo entity or taste tag (endpoints: search, tags, insights). Qloo's tags become the portrait's "what kind of taste is this" layer. Each item is labelled Told by family, They reacted to this, Likely from their era and region, or Suggested by AI, not in Qloo.
2. **Discover.** Wishes are generated from the portrait, plus one discovery wish: Qloo's insights endpoint, with explainability on, returns artists loved by people whose taste is close to the person's anchors. The wish names the anchors Qloo weighted most and always says it is a guess. When the portrait is thin, Qloo's audience signals (birth year, city) build a "Likely from their era and region" portrait.
3. **Match.** Each wish is matched to Wish Makers by comparing the portrait items' Qloo entity ids and tags with each maker's own Qloo-derived tags (exact entity match, then shared taste tags, then a maker who lists an artist Qloo links to the item). Qloo knows songs, dishes and places, not whether a home cook is good, so makers are tagged with the artists, cuisines and places they connect to and scored through those links. Every match shows its reasons and whether Qloo or a plain name match found it.

## The agent (visible on screen)
`run_agent` runs: collect, resolve, expand, (era and place, only if thin), build, discover, wishes. Each step reports real counts (calls, cached, errors), and every Qloo call appears in a live call log with a plain-language line, for example "Looked up Charminar as a place. Remembered."

## Fallback ladder (nothing ever fails empty)
1. Exact entity found. 2. Alternate spelling or alias. 3. Parent item (the artist, cuisine or city). 4. Era-and-place signals. 5. Not in Qloo: kept, labelled, and excluded from Qloo scoring. 6. API error or timeout: a cached answer, or a calm message and a retry. The input list is capped at 30 items.

## Reliability
- Every Qloo response is cached on disk and in a private database table that is restored at start-up, so repeat calls are instant and the demo people always load fast.
- Connect and read timeouts, retries, and a circuit breaker that fails fast after repeated timeouts.
- No engine function raises to its caller; failure becomes a lower level, fewer wishes, or `available: false`.
- Wishes come from fixed templates. The optional language model does not rewrite them unless switched on, and any rewrite is checked for tone and for the word "guess" on discovery wishes.

## Evidence we can state
- Coverage test: 40 inputs across Telugu, Hindi, Urdu and Tamil film songs, Western rock and pop, K-pop, Arabic and Latin music, regional dishes, places, and films. 38 of 40 resolved (music 21/23, food 6/6, places 6/6, film 4/4, TV 1/1). The two misses were one Tamil film song and one Arabic singer; they fall back to level 3 or 5.
- Judge test: 12 varied fictional people (different cultures and languages) went through the real API (run on a local server) to a compiled, shared and deleted Wish Book with no failed checks. [Update this line after the run against the deployed site.]
- Tests: more than 230 offline engine checks (fallback ladder, wishes, agent, Reaction Mode, side-by-side, Bedside Kit, cache and breaker, call-log labels) and 146 frontend tests.

## Honest limits (say these; judges respect them)
- The Wish Network is seeded with clearly labelled sample makers. Real onboarding, identity checks and partner hospices are next steps, and the verification plan is documented.
- Qloo's coverage depends on its data. Two of 40 test inputs did not resolve directly, and the ladder handles them.
- Genie is not a medical service. Reaction Mode and the Bedside Kit are comfort and connection only.
- Privacy: Qloo receives the names of favourites. If the optional language model is on, it receives names plus the person's region and language. No surnames, addresses, health data or ID numbers are collected, and everything can be deleted with one action.

## Suggested lines for the description
- "Genie is not a recommender. Qloo tells us who a person was, finds wishes only they would recognise, and matches those wishes to the people who can make them."
- "If the app would work the same without Qloo, it is the wrong thing to build. Genie shows the proof: a side-by-side with a general AI, and a live log of every Qloo call."