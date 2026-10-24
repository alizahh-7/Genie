import { clean } from "./labels";
import { isDiscoveryKind, isQlooDiscovery } from "./qloo";
import type { PortraitItem, Wish } from "./types";

/* Taste Map: Person → Favourites → Strongest taste tags → Discovered item. Every node and link comes from the data; nothing is filled in. */

export interface MapTag { name: string; qloo: boolean; from: string[] }
export interface MapFavourite { key: string; name: string; domain: string; source: "told" | "reacted"; inQloo: boolean; matchedVia: string | null; tags: MapTag[] }
export interface MapDiscovery { key: string; discovered: string; wishTitle: string; qloo: boolean; sharedTags: string[] }
export interface TasteMapModel { person: string; favourites: MapFavourite[]; tags: MapTag[]; discoveries: MapDiscovery[]; missing: { favourites: boolean; tags: boolean; discoveries: boolean } }

type MapItem = PortraitItem & { qloo_entity_id?: string | null; top_tags?: unknown };
type MapWish = Wish & { discovered?: unknown };

const tagName = (t: unknown): string | undefined => (typeof t === "string" ? clean(t) : t && typeof t === "object" ? clean((t as { name?: unknown }).name) : undefined);

/** Found in Qloo means the item carries a qloo_entity_id (confirmed contract). */
export const foundInQloo = (i: { qloo_entity_id?: unknown }): boolean => !!clean(i.qloo_entity_id);
/** The strongest tags come from `top_tags` only, capped at five. */
export function topTagNames(i: { top_tags?: unknown }): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const t of Array.isArray(i.top_tags) ? i.top_tags : []) { const n = tagName(t); if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); } }
  return out.slice(0, 5);
}

export function buildTasteMap(personName: string, items: readonly PortraitItem[] | null | undefined, wishes: readonly Wish[] | null | undefined): TasteMapModel {
  const favourites: MapFavourite[] = [];
  const tagMap = new Map<string, MapTag>();
  (items ?? []).forEach((raw, idx) => {
    const it = raw as MapItem;
    if (it.source_label !== "told" && it.source_label !== "reacted") return;
    const name = clean(it.name); if (!name) return;
    const inQ = foundInQloo(it); const key = `${it.id ?? idx}`;
    const tags: MapTag[] = topTagNames(it).map(n => {
      const k = n.toLowerCase(); const existing = tagMap.get(k);
      const t: MapTag = existing ?? { name: n, qloo: false, from: [] };
      t.qloo = t.qloo || inQ; if (!t.from.includes(name)) t.from.push(name); tagMap.set(k, t);
      return t;
    });
    const matched = clean(it.matched_name);
    favourites.push({ key, name, domain: clean(it.domain) ?? "other", source: it.source_label, inQloo: inQ, matchedVia: matched && matched.toLowerCase() !== name.toLowerCase() ? matched : null, tags });
  });
  const tags = [...tagMap.values()];
  const known = new Set(tags.filter(t => t.qloo).map(t => t.name.toLowerCase()));
  const discoveries: MapDiscovery[] = [];
  (wishes ?? []).forEach((raw, idx) => {
    const w = raw as MapWish;
    if (!isDiscoveryKind(w)) return;
    const discovered = clean(w.discovered); if (!discovered) return;
    const wishTags = (Array.isArray(w.tags) ? w.tags : []).map(tagName).filter((n): n is string => !!n);
    const shared = wishTags.filter(n => tagMap.has(n.toLowerCase()));
    discoveries.push({ key: `${w.id ?? idx}`, discovered, wishTitle: clean(w.title) ?? "", qloo: isQlooDiscovery(w, known), sharedTags: [...new Set(shared)] });
  });
  return { person: personName, favourites, tags, discoveries, missing: { favourites: favourites.length === 0, tags: tags.length === 0, discoveries: discoveries.length === 0 } };
}

export const QLOO_GUESS_NOTE = "Qloo's guess, based on shared taste tags. It is not something the family said.";
/** Provenance wording from GET /meta/notices when it publishes a short line about discoveries or guesses; otherwise the built-in note. */
export function pickProvenanceNote(notices: unknown): string { return findNote(notices, 0) ?? QLOO_GUESS_NOTE; }
function findNote(n: unknown, depth: number): string | undefined {
  if (!n || typeof n !== "object" || depth > 4) return undefined;
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    if (typeof v === "string" && /discover|guess|provenance/i.test(k) && v.trim().length > 0 && v.trim().length <= 240 && !/medical/i.test(k)) return v.trim();
    const d = typeof v === "object" ? findNote(v, depth + 1) : undefined; if (d) return d;
  }
  return undefined;
}
