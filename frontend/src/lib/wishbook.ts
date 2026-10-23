import { SOURCE } from "./format";
import { clean, humanSourceLabel } from "./labels";

export type BookTag = string | { name?: string; type?: string };
export interface BookPortraitItem { name?: string; domain?: string; tags?: BookTag[]; label?: string; source_label?: string }

/* ---------- tags ---------- */

/** Vague mood descriptors. They are demoted (never deleted) so genre, place and setting tags surface first. */
const VAGUE_MOOD = new Set([
  "melodious", "expressive", "soulful", "nostalgic", "emotional", "heartfelt", "uplifting", "mellow", "dreamy", "energetic",
  "upbeat", "soothing", "relaxing", "passionate", "evocative", "atmospheric", "cheerful", "sentimental", "lively", "poetic",
  "lyrical", "haunting", "wistful", "tender", "serene", "vibrant", "bittersweet", "emotive", "mournful", "calm", "intense",
  "joyful", "playful", "rhythmic", "romantic", "warm", "gentle", "moving", "sad", "happy",
]);
const PREFERRED_TYPE = /genre|setting|location|place|cuisine|era|region|language/i;
const MOOD_TYPE = /mood|vibe|feel|emotion/i;

export const MAX_BOOK_TAGS = 5;

/**
 * At most `max` tags. Tag type (when the API supplies one) or a genre/setting-like name ranks first, vague mood
 * words rank last, everything else keeps the API's own order in between. Only tags present in the data are returned.
 */
export function rankTags(tags: unknown, max = MAX_BOOK_TAGS): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const ranked: { name: string; score: number; i: number }[] = [];
  tags.forEach((t, i) => {
    const name = typeof t === "string" ? clean(t) : t && typeof t === "object" ? clean((t as { name?: unknown }).name) : undefined;
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    const type = t && typeof t === "object" ? clean((t as { type?: unknown }).type) ?? "" : "";
    const score = PREFERRED_TYPE.test(type) ? 0 : MOOD_TYPE.test(type) || VAGUE_MOOD.has(name.toLowerCase()) ? 2 : 1;
    ranked.push({ name, score, i });
  });
  return ranked.sort((a, b) => a.score - b.score || a.i - b.i).slice(0, Math.max(0, max)).map(r => r.name);
}

/* ---------- told vs guessed ---------- */

export type Provenance = "told" | "guess" | "other";
const TOLD = new Set(["told", "reacted", SOURCE.told.toLowerCase(), SOURCE.reacted.toLowerCase()]);
const GUESS = new Set(["likely", "ai-only", SOURCE.likely.toLowerCase(), SOURCE["ai-only"].toLowerCase()]);

/**
 * Family-told (including reactions seen with family present) vs inferred. A missing or unrecognised label is
 * "other", never "told", so an inference can't be shown as a confirmed family memory.
 */
export function provenanceOf(p: BookPortraitItem): Provenance {
  const raw = (clean(p.label) ?? clean(p.source_label) ?? "").toLowerCase();
  if (!raw) return "other";
  if (TOLD.has(raw)) return "told";
  if (GUESS.has(raw)) return "guess";
  if (/\b(likely|guess|guessed|suggested|maybe|inferred|discovered)\b/.test(raw)) return "guess";
  if (/^told\b/.test(raw)) return "told";
  return "other";
}

export interface BookPortraitView { name: string; domain?: string; label?: string; tags: string[] }
export function groupPortrait(items: unknown): { told: BookPortraitView[]; guesses: BookPortraitView[]; other: BookPortraitView[] } {
  const out = { told: [] as BookPortraitView[], guesses: [] as BookPortraitView[], other: [] as BookPortraitView[] };
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const p = it as BookPortraitItem;
    const name = clean(p.name);
    if (!name) continue;
    const label = clean(p.label) ?? clean(p.source_label);
    const view: BookPortraitView = { name, domain: clean(p.domain), label: label ? humanSourceLabel(label) : undefined, tags: rankTags(p.tags) };
    const kind = provenanceOf(p);
    (kind === "told" ? out.told : kind === "guess" ? out.guesses : out.other).push(view);
  }
  return out;
}

/* ---------- "Things we learned" ---------- */

/** Mood words that, on their own, say nothing. Deliberately excludes words that are also genres or places. */
const FILTER_MOOD = new Set([
  "melodious", "expressive", "soulful", "nostalgic", "emotional", "heartfelt", "uplifting", "mellow", "dreamy", "energetic",
  "upbeat", "soothing", "relaxing", "passionate", "evocative", "atmospheric", "cheerful", "sentimental", "lively", "poetic",
  "lyrical", "haunting", "wistful", "tender", "serene", "vibrant", "bittersweet", "emotive", "mournful", "calm", "intense",
  "joyful", "playful", "rhythmic",
]);
/** Closed list of connective words from the filler template ("Their world kept returning to ..."). Anything else counts as real content. */
const FILLER = new Set([
  "their", "there", "its", "the", "a", "an", "of", "to", "in", "on", "at", "for", "and", "or", "with", "as", "by", "is", "was",
  "were", "are", "be", "it", "that", "this", "they", "them", "he", "she", "his", "her", "world", "kept", "keeps", "returning",
  "returned", "return", "returns", "came", "back", "again", "often", "always", "mood", "moods", "feel", "feeling", "feelings",
  "sound", "sounds", "tone", "vibe", "vibes", "taste", "tastes", "style", "styles", "music", "theme", "themes", "drawn",
  "pulled", "leaned", "leans", "toward", "towards", "about", "very", "so", "all",
]);
const PUNCT = /^[.,;:!?"'()\[\]“”‘’—–-]+|[.,;:!?"'()\[\]“”‘’—–-]+$/g;

/** True only when the sentence contains vague mood words and nothing else that carries information. */
export function isVagueMoodSentence(sentence: string): boolean {
  const words = sentence.toLowerCase().split(/\s+/).map(w => w.replace(PUNCT, "")).filter(Boolean);
  let mood = 0;
  for (const w of words) {
    if (FILLER.has(w)) continue;
    if (FILTER_MOOD.has(w)) { mood++; continue; }
    return false;
  }
  return mood > 0;
}

/** Drops filler sentences; improved backend sentences that name real genres, places or facts pass through unchanged. */
export function filterLearned(learned: unknown): string[] {
  if (!Array.isArray(learned)) return [];
  const out: string[] = [];
  for (const item of learned) {
    const text = clean(item);
    if (!text) continue;
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
    const kept = sentences.map(s => s.trim()).filter(s => s && !isVagueMoodSentence(s));
    if (kept.length === sentences.filter(s => s.trim()).length) out.push(text);
    else if (kept.length) out.push(kept.join(" "));
  }
  return out;
}
