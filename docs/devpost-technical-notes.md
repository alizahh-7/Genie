# Genie: technical notes for the Devpost description (engine and Qloo)

For Alizah. Every number here comes from our own test runs on fictional people. Nothing in this file is Qloo response data.

## The short version
Genie turns a few favourites into a Taste Portrait, suggests wishes only that person would recognise, and finds the people who could make them happen. Qloo is the part that understands what the person loved: it resolves what a family types, links it to taste, suggests something the family would not think of, and lets us match a wish to a Wish Maker. A general AI given the same facts has none of that, and a side-by-side screen shows the difference live.

## How it is Qloo-powered
| Job | What Genie does | Qloo calls |
|---|---|---|
| Understand | Resolves every favourite to a Qloo entity (artist, film, place) or taste tag (dish), moving from a song to its artist and from a spelling variant to the right entity | Search, tags |
| Expand | Collects the taste tags that describe each item and drops tags that do not belong on a family screen (ageing, end of life, heavy themes, medical wording) | Same responses |
| Discover | Asks Qloo what people with similar taste also love, with Qloo's own match score and explanation, and turns the answer into one wish that says it is a guess | Insights with explainability |
| Match | Scores each Wish Maker against the specific items a wish is about, using shared Qloo entities and taste tags, and labels each match as Qloo-based or by name | (stored Qloo data, backend) |
| Learn | In Reaction Mode, a tap on "lit up" asks Qloo for more in that direction | Insights |

Every Qloo request is shown in a live call log (`step`, `request`, `status`, `ms`).

## The agent, step by step
`collect`, `resolve`, `expand`, `era` (only when the portrait is thin), `build`, `discover`, `wishes`, and the backend's `match`. Each step's sentence is built from real counts, never invented, and the call log shows exactly what was asked.

## The fallback ladder: nothing fails empty
1 exact entity, 2 alternate spelling or script, 3 move up to the artist, cuisine or city, 4 a "likely from their era and region" portrait when fewer than 3 items resolve, 5 "not in Qloo" (kept, labelled, never hidden), 6 API error or timeout (a calm message, never a raw error).

## What we measured
| Measure | Result |
|---|---|
| Coverage test, 40 inputs across Telugu, Hindi, Urdu, Tamil, Western, K-pop, Arabic, dishes, places and films | 40 of 40 resolve (33 exact, 1 alternate spelling, 6 through an artist or parent) |
| Judge test, 12 fictional people in 12 languages and regions, through the real API to a printed Wish Book | 12 of 12, 0 failed checks (after 3 bugs found by the test were fixed) |
| Time to first result, new person, cold cache | 6 to 27 seconds (median 14); a warm cache 3 to 8 seconds |
| Demo people with the private cache restored | 25 to 90 milliseconds |
| Odd inputs on purpose (empty, emoji, scripts in four languages, injected code, 5000 characters) | 43 of 43, nothing crashes |
| Qloo unreachable | Agent still answers in about 14 seconds (33 before our circuit breaker) |
| Offline engine tests | 213, plus 8 for the cache store |

## Honesty rules built in
- Every item says where it came from: told by the family, likely from their era and region, or they reacted to it.
- A song is "via the artist". We never say we found the song.
- A guess says it is a guess. Wishes built only from guesses say "in the spirit of ..., a guess from their era and region" and never call a guess a favourite.
- A guess with ageing, end-of-life or heavy-theme tags is skipped, not shown.
- Reaction Mode: "no reaction" is never shown as failure.
- The Bedside Kit is comfort only and always ends with "Genie is not a medical service."

## Safety and privacy (engine side)
- Qloo's responses are cached in a private database table, never in the repository, and restored at server start.
- Only names of favourites, and the person's region and language, go to Qloo and to the AI. For the comparison, the AI also receives the first name, birth year and Wish Circle notes, because that is exactly what Genie was given. A typed person's comparison answer is never cached.
- Every external call has a timeout, a retry and a circuit breaker.
- All test data is fictional.

## Challenges (honest and specific)
- Qloo has artists and places but no songs or dishes, so Genie resolves by type and labels what it could not find.
- Qloo's own tags are not always right for a family's screen, so we filter wording about ageing, end of life, medicine, war and disasters, and skip whole guesses with heavy themes.
- Our judge test caught three bugs a unit test would not: a thin portrait asked no follow-up question, a film-only portrait got only two wishes, and wishes built from guesses called them favourites.
- We measured an AI rewriter for wish wording (79% of its rewrites passed our safety checks) and chose reviewed templates instead, because every sentence in this product should be one we chose.

## Limits we state openly
- Level 4 is audience-popularity for the person's age bracket, region and language, not era-specific, so some guesses look odd. They are always labelled "likely".
- The free-tier AI can run out of quota. The comparison then says the general AI is unavailable, and Genie's side is still complete.
- A new person on a cold cache takes up to about half a minute.
- Wish Makers in this build are labelled samples.

## Try it yourself (for judges)
Type a song title and see it land "via the artist". Type a nonsense name and see "not in Qloo" instead of a made-up result. Type a single favourite and see the gentle follow-up question. Open the side-by-side screen and the call log.

## Text blocks for the description
**How it is Qloo-powered.** Genie uses Qloo five ways. It resolves every favourite a family names to a Qloo entity or taste tag, moving from a song to its artist and from a spelling variant to the right entity. It expands each item into taste tags, and filters out wording that does not belong on a family's screen. It asks Qloo's taste graph what people with similar taste also love, using Qloo's own match scores and explanations to suggest a wish the family might not think of. It matches Wish Makers to a wish through shared entities and taste tags, and labels whether the match came through Qloo or by name. And when a person can no longer speak, it shows a few items, learns from what lights them up, and asks Qloo for more in that direction. A visible call log shows every request.

**How we built it.** A Python engine calls Qloo and an optional AI through one cached client with timeouts, retries and a circuit breaker. A FastAPI backend on Supabase Postgres stores people, portraits, wishes and matches and enforces privacy. The agent reports seven honest steps built from real counts, and failures degrade through a six-level fallback ladder instead of breaking the experience.

**Challenges.** Qloo has entities for artists and places, but not for individual songs or dishes. Genie resolves by type, treats dishes as taste tags, and labels anything it could not find. We tested the whole path with twelve fictional people, including nonsense and injected-code inputs, and fixed what the test found. We made the comparison with a general AI fair: it gets the same facts, no Qloo data, and the same tone rules, and when it cannot answer we say so.