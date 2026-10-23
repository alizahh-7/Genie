import { clean, humanize } from "./labels";
import { provenanceOf, rankTags, type Provenance } from "./wishbook";
import { isDiscoveryKind, isQlooDiscovery, isQlooTag } from "./qloo";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A wish from either side of the comparison, read defensively from whatever shape the backend sent. */
export interface CmpTag { name: string; qloo: boolean }
export interface CmpWish {
  title?: string; description?: string; why?: string; mode?: string; makerType?: string;
  provenance: Provenance; discovery: boolean; qlooDiscovery: boolean;
  tags: CmpTag[]; hasTags: boolean; hasBasis: boolean; hasMaker: boolean;
}

const MAX_CARD_TAGS = 3;

/** Returns null for anything that has no readable title or description, so junk rows never become empty cards. */
export function normalizeWish(raw: unknown, known?: ReadonlySet<string>): CmpWish | null {
  if (typeof raw === "string") { const s = clean(raw); return s ? { title: s, provenance: "other", discovery: false, qlooDiscovery: false, tags: [], hasTags: false, hasBasis: false, hasMaker: false } : null; }
  if (!isObj(raw)) return null;
  const title = clean(raw.title) ?? clean(raw.name) ?? clean(raw.wish);
  const description = clean(raw.description) ?? clean(raw.text) ?? clean(raw.summary) ?? clean(raw.idea);
  if (!title && !description) return null;
  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const names = rankTags(rawTags, MAX_CARD_TAGS);
  const tags: CmpTag[] = names.map(n => {
    const src = rawTags.find(t => (typeof t === "string" ? clean(t) : isObj(t) ? clean(t.name) : undefined)?.toLowerCase() === n.toLowerCase());
    return { name: n, qloo: isQlooTag(src, known) };
  });
  const basis = clean(raw.basis) ?? clean(raw.source_label) ?? clean(raw.label);
  const mode = clean(raw.mode);
  const maker = clean(raw.maker_type);
  return {
    title, description: title ? description : description, why: clean(raw.why),
    mode, makerType: maker ? humanize(maker) : undefined,
    provenance: basis ? provenanceOf({ label: basis }) : "other",
    discovery: isDiscoveryKind(raw), qlooDiscovery: isQlooDiscovery({ kind: raw.kind, tags: rawTags, affinity: raw.affinity }, known),
    tags, hasTags: rawTags.length > 0, hasBasis: !!basis, hasMaker: !!maker,
  };
}

export const normalizeWishes = (list: unknown, known?: ReadonlySet<string>): CmpWish[] =>
  (Array.isArray(list) ? list : []).map(w => normalizeWish(w, known)).filter((w): w is CmpWish => w !== null);

/** Limitations are stated only when the generic wishes themselves lack that field. Never a blanket claim. */
export function genericLimits(wishes: readonly CmpWish[]): string[] {
  if (wishes.length === 0) return [];
  const out: string[] = [];
  if (wishes.every(w => !w.hasTags)) out.push("No Qloo taste evidence");
  if (wishes.every(w => !w.hasBasis)) out.push("No confirmed source labels");
  if (wishes.every(w => !w.hasMaker)) out.push("No maker matching through Genie's workflow");
  return out;
}

/* ---------- evidence scoreboard ---------- */

export interface EvidenceNumbers {
  genieWishes?: number; genieWishesWithTags?: number; genericWishes?: number;
  toldItems?: number; toldItemsInQloo?: number; qlooCalls?: number;
}
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** Reads only the documented numeric evidence fields (top level, or one level down). Absent fields stay undefined. */
export function readEvidence(evidence: unknown): EvidenceNumbers {
  const find = (key: string): number | undefined => {
    if (!isObj(evidence)) return undefined;
    const direct = num(evidence[key]); if (direct !== undefined) return direct;
    for (const v of Object.values(evidence)) if (isObj(v)) { const n = num(v[key]); if (n !== undefined) return n; }
    return undefined;
  };
  return {
    genieWishes: find("genie_wishes"), genieWishesWithTags: find("genie_wishes_with_taste_tags"), genericWishes: find("generic_wishes"),
    toldItems: find("genie_told_items"), toldItemsInQloo: find("genie_told_items_found_in_qloo"), qlooCalls: find("genie_qloo_calls"),
  };
}

export interface ScoreMetric { key: string; label: string; value: number; of?: number; caption: string }

export function scoreMetrics(e: EvidenceNumbers): ScoreMetric[] {
  const out: ScoreMetric[] = [];
  if (e.genieWishesWithTags !== undefined) out.push({ key: "tags", label: "Wishes with taste evidence", value: e.genieWishesWithTags, of: e.genieWishes, caption: "Genie's wishes that carry Qloo taste tags" });
  if (e.toldItemsInQloo !== undefined) out.push({ key: "told", label: "Family favourites found in Qloo", value: e.toldItemsInQloo, of: e.toldItems, caption: "What the family told Genie, matched in Qloo" });
  if (e.qlooCalls !== undefined) out.push({ key: "calls", label: "Qloo lookups made", value: e.qlooCalls, caption: "Real requests Genie made to Qloo" });
  if (e.genericWishes !== undefined) out.push({ key: "generic", label: "Wishes from a general AI", value: e.genericWishes, caption: "Same facts, no Qloo lookups" });
  return out;
}
