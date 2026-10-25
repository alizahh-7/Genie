import { isQlooTag } from "./qloo";
import { clean } from "./labels";
import type { Wish } from "./types";

/**
 * The "Qloo receipt" of a wish: what it was built from and which Qloo tags backed it.
 * Honest by construction: tags count as Qloo's only when the existing provenance rule (isQlooTag) says so,
 * and a wish with nothing to show returns null instead of an empty box.
 */
export interface Receipt { from: string[]; qlooTags: string[]; guess: string | null; isGuess: boolean }

type WishWithSources = Wish & { source_items?: unknown };

export function buildReceipt(wish: WishWithSources, known?: ReadonlySet<string>): Receipt | null {
  const raw = Array.isArray(wish.source_items) ? wish.source_items : [];
  const from: string[] = [];
  for (const s of raw) {
    const n = clean(typeof s === "string" ? s : (s as { name?: unknown } | null)?.name);
    if (n && !from.some(f => f.toLowerCase() === n.toLowerCase())) from.push(n);
    if (from.length === 4) break;
  }
  const qlooTags: string[] = [];
  for (const t of wish.tags ?? []) {
    const n = clean(t?.name);
    if (n && isQlooTag(t, known) && !qlooTags.some(q => q.toLowerCase() === n.toLowerCase())) qlooTags.push(n);
    if (qlooTags.length === 5) break;
  }
  const guess = clean(wish.discovered) ?? null;
  const isGuess = wish.basis === "likely" || wish.kind === "discovery";
  if (!from.length && !qlooTags.length && !guess) return null;
  return { from, qlooTags, guess, isGuess };
}
