import { clean } from "./labels";
import type { PortraitItem } from "./types";

export const STORY_STEPS = [
  { n: 1, short: "Meet", title: "Meet {name}" },
  { n: 2, short: "Replay", title: "Watch what Genie did" },
  { n: 3, short: "Portrait", title: "Who {name} was" },
  { n: 4, short: "Wishes", title: "Wishes only {name} would recognise" },
  { n: 5, short: "Compare", title: "A general AI, given the same facts" },
  { n: 6, short: "Maker", title: "Someone who can make it happen" },
  { n: 7, short: "Keepsake", title: "A keepsake for the family" },
  { n: 8, short: "Yours", title: "Now try your own person" },
] as const;
export const stepTitle = (n: number, name: string): string => (STORY_STEPS[n - 1]?.title ?? "").replace("{name}", name);
export const LAST_STEP = STORY_STEPS.length;

/** Step from a query value; anything unusable becomes step 1. */
export function parseStep(v: unknown): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= LAST_STEP ? n : 1;
}
export const clampStep = (n: number): number => Math.min(LAST_STEP, Math.max(1, Math.round(n)));

/** The person id is carried in the URL as an opaque token; reject anything that isn't a plain id. */
export function parsePersonParam(v: unknown): string | null {
  const s = clean(v);
  return s && /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : null;
}

const KIND_WORD: Record<string, string> = { music: "song", food: "dish", place: "place", film: "film", other: "favourite" };
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** Family-told items (told only, not reactions or guesses), in portrait order. */
export const toldItems = (items: readonly PortraitItem[]): PortraitItem[] => items.filter(i => i.source_label === "told");

/** "a song, a dish and a place" built from the domains of the items the family actually told Genie. Null when none. */
export function toldPhrase(items: readonly PortraitItem[]): string | null {
  const told = toldItems(items);
  if (told.length === 0) return null;
  const words: string[] = [];
  for (const t of told) { const w = KIND_WORD[t.domain] ?? "favourite"; words.push(`${article(w)} ${w}`); }
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const NUMBER_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const countWord = (n: number): string => NUMBER_WORD[n] ?? String(n);

/** Match a persona from the list by `?who=` (first name, case-insensitive). */
export function pickPersona<T extends { first_name: string }>(list: readonly T[], who: unknown): T | null {
  const w = clean(who)?.toLowerCase();
  return w ? list.find(p => p.first_name.trim().toLowerCase() === w) ?? null : null;
}
