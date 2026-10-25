import { clean, humanSourceLabel } from "./labels";
import { filterLearned } from "./wishbook";

/* Compiled Wish Book (confirmed contract): title, tagline, person, portrait[], themes[], learned[], wishes[], voices[], notice, generated_at. */

export const VOICE_ORDER = ["music", "food", "place", "film", "joy"] as const;
export const VOICE_LABEL: Record<(typeof VOICE_ORDER)[number], string> = {
  music: "The music", food: "The food", place: "The place", film: "The film", joy: "What brought them joy",
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface BookPortraitEntry { domain?: string; name: string; tags: string[]; tagCount?: number; source: string; label: string }
export interface BookWishMaker { name: string; type?: string; status?: string; sample: boolean }
export interface BookWish { title: string; description?: string; mode?: string; kind?: string; basis?: string; guess: boolean; makers: BookWishMaker[] }
export interface BookVoice { from: string; answers: { key: (typeof VOICE_ORDER)[number]; label: string; text: string }[] }
export interface BookView {
  title?: string; tagline?: string; personLine?: string; themes: string[]; learned: string[];
  family: BookPortraitEntry[]; guesses: BookPortraitEntry[]; other: BookPortraitEntry[];
  wishes: BookWish[]; voices: BookVoice[]; notice?: string; generatedAt?: string;
}

/** Sources that are the family's own: told, or reacted to while with them. Everything else is a guess or unknown. */
export const FAMILY_SOURCES = new Set(["told", "reacted"]);
export const GUESS_SOURCES = new Set(["likely", "ai-only"]);

function readSource(p: Record<string, unknown>): string {
  const s = (clean(p.source) ?? clean(p.source_label) ?? "").toLowerCase();
  if (s) return s;
  // Older snapshots carry only a readable label.
  const l = (clean(p.label) ?? "").toLowerCase();
  if (/^told\b/.test(l)) return "told";
  if (/\breacted\b/.test(l)) return "reacted";
  if (/ai|not in qloo/.test(l) && /suggest/.test(l)) return "ai-only";
  if (/\blikely\b/.test(l)) return "likely";
  return "";
}

/** Tags come from the backend already capped at five with genre/setting first, so order is kept and only the cap is enforced. */
export function portraitEntry(raw: unknown): BookPortraitEntry | null {
  if (!isObj(raw)) return null;
  const name = clean(raw.name);
  if (!name) return null;
  const source = readSource(raw);
  const tags = arr(raw.tags).map(t => (typeof t === "string" ? clean(t) : isObj(t) ? clean(t.name) : undefined)).filter((t): t is string => !!t);
  const seen = new Set<string>(); const uniq = tags.filter(t => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true))).slice(0, 5);
  const label = clean(raw.label) ? humanSourceLabel(clean(raw.label)!) : source ? humanSourceLabel(source) : "";
  return { domain: clean(raw.domain), name, tags: uniq, tagCount: typeof raw.tag_count === "number" ? raw.tag_count : undefined, source, label };
}

/** told and reacted are family testimony; likely and ai-only are guesses; an unknown source is never promoted to testimony. */
export function splitPortrait(items: unknown): { family: BookPortraitEntry[]; guesses: BookPortraitEntry[]; other: BookPortraitEntry[] } {
  const out = { family: [] as BookPortraitEntry[], guesses: [] as BookPortraitEntry[], other: [] as BookPortraitEntry[] };
  for (const raw of arr(items)) {
    const e = portraitEntry(raw); if (!e) continue;
    (FAMILY_SOURCES.has(e.source) ? out.family : GUESS_SOURCES.has(e.source) ? out.guesses : out.other).push(e);
  }
  return out;
}

/** Answers in the fixed order music, food, place, film, joy. Blank answers are skipped, nothing is invented. */
export function orderedAnswers(answers: unknown): BookVoice["answers"] {
  if (!isObj(answers)) return [];
  const out: BookVoice["answers"] = [];
  for (const key of VOICE_ORDER) { const text = clean(answers[key]); if (text) out.push({ key, label: VOICE_LABEL[key], text }); }
  return out;
}

export function parseVoices(raw: unknown): BookVoice[] {
  const out: BookVoice[] = [];
  for (const v of arr(raw)) {
    if (!isObj(v)) continue;
    const from = clean(v.from); const answers = orderedAnswers(v.answers);
    if (from && answers.length) out.push({ from, answers });
  }
  return out;
}

/** A wish is a guess when its basis is "likely" (confirmed contract) or the backend marks it a discovery. */
export const wishIsGuess = (w: { basis?: unknown; kind?: unknown }): boolean => clean(w.basis)?.toLowerCase() === "likely" || clean(w.kind)?.toLowerCase() === "discovery";

function parseMaker(raw: unknown): BookWishMaker | null {
  if (!isObj(raw)) return null;
  const name = clean(raw.name); if (!name) return null; // maker_contact and ids are never read here
  return { name, type: clean(raw.type), status: clean(raw.status), sample: raw.is_sample === true };
}

function personLine(p: unknown): string | undefined {
  if (typeof p === "string") return clean(p);
  if (!isObj(p)) return undefined;
  const name = clean(p.first_name) ?? clean(p.name);
  const born = typeof p.birth_year === "number" ? `Born ${p.birth_year}` : undefined;
  return [name, born, clean(p.region)].filter(Boolean).join(" · ") || undefined;
}

/** Accepts either `{content}` (person route) or the content itself (a shared route); null when there is nothing book-like. */
export function parseBook(raw: unknown): BookView | null {
  const c = isObj(raw) && isObj(raw.content) ? raw.content : raw;
  if (!isObj(c) || !(clean(c.title) || Array.isArray(c.portrait) || Array.isArray(c.wishes))) return null;
  const sp = splitPortrait(c.portrait);
  const themes = arr(c.themes).map(t => (typeof t === "string" ? clean(t) : isObj(t) ? clean(t.name) ?? clean(t.title) : undefined)).filter((t): t is string => !!t);
  const wishes: BookWish[] = [];
  for (const w of arr(c.wishes)) {
    if (!isObj(w)) continue; const title = clean(w.title); if (!title) continue;
    wishes.push({ title, description: clean(w.description), mode: clean(w.mode), kind: clean(w.kind), basis: clean(w.basis), guess: wishIsGuess(w), makers: arr(w.makers).map(parseMaker).filter((m): m is BookWishMaker => !!m) });
  }
  return {
    title: clean(c.title), tagline: clean(c.tagline), personLine: personLine(c.person), themes, learned: filterLearned(c.learned),
    ...sp, wishes, voices: parseVoices(c.voices), notice: clean(c.notice), generatedAt: clean(c.generated_at),
  };
}
