import { basisKind } from "./makers";
import { clean } from "./labels";
import type { AgentLog, PortraitItem, Wish } from "./types";

/*
 * Qloo provenance. Every rule here is deliberately strict: an item is "Qloo-derived" only when its own backend
 * data says so. Anything text-based, type-based, family-told or of unknown origin is never marked.
 */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Portrait items resolved in Qloo (levels 1-4). Levels 5 and 6 are "not in Qloo" (see format.isNotInQloo); AI-only items never count. */
export function isQlooResolved(i: Pick<PortraitItem, "resolution_level" | "source_label">): boolean {
  if (i.source_label === "ai-only") return false;
  const l = i.resolution_level;
  return typeof l === "number" && Number.isFinite(l) && l >= 1 && l <= 4;
}

/** Lower-cased names of every tag carried by a Qloo-resolved portrait item. */
export function qlooTagNames(items: readonly PortraitItem[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const it of items ?? []) {
    if (!isQlooResolved(it)) continue;
    for (const t of it.tags ?? []) { const n = clean(t?.name); if (n) out.add(n.toLowerCase()); }
  }
  return out;
}

/**
 * A tag is Qloo-derived when it is an object carrying a Qloo tag id or a taste/qloo type, or when the same tag name
 * sits on a Qloo-resolved portrait item. A bare string with no corroboration is not marked.
 */
export function isQlooTag(tag: unknown, known?: ReadonlySet<string>): boolean {
  if (typeof tag === "string") return !!known && known.has(tag.trim().toLowerCase());
  if (!isObj(tag)) return false;
  if (clean(tag.id)) return true;
  if (/qloo|taste/i.test(clean(tag.type) ?? "")) return true;
  const n = clean(tag.name);
  return !!n && !!known && known.has(n.toLowerCase());
}

export const hasQlooTags = (tags: unknown, known?: ReadonlySet<string>): boolean => Array.isArray(tags) && tags.some(t => isQlooTag(t, known));

/** Discovery per the backend (`kind === "discovery"`), regardless of Qloo. */
export const isDiscoveryKind = (w: { kind?: unknown }): boolean => clean(w.kind)?.toLowerCase() === "discovery";

/** A discovery counts as Qloo-based only if it is a backend discovery AND carries Qloo taste evidence (Qloo tags or an affinity value). */
export function isQlooDiscovery(w: { kind?: unknown; tags?: unknown; affinity?: unknown }, known?: ReadonlySet<string>): boolean {
  if (!isDiscoveryKind(w)) return false;
  const aff = w.affinity;
  return hasQlooTags(w.tags, known) || (typeof aff === "number" && Number.isFinite(aff)) || !!clean(aff);
}

/** Maker matches only when the match basis is Qloo alone. Text, type, mixed and unknown bases never qualify. */
export const isQlooMaker = (m: { basis?: unknown }): boolean => basisKind(m.basis) === "qloo";

/* ---------- agent log helpers ---------- */

/** The most recent saved "agent" run, the same row the person page has always shown. */
export function latestAgentLog(rows: unknown): AgentLog | null {
  if (!Array.isArray(rows)) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (isObj(r) && r.step === "agent" && isObj(r.log)) return r.log as unknown as AgentLog;
  }
  return null;
}

/* ---------- counters ---------- */

export interface QlooCounters { lookups: number | null; tasteLinks: number | null; discoveries: number | null }

/**
 * Qloo lookups: one source only, so nothing is counted twice. The run's `qloo_log` is preferred (one row per call);
 * if it is empty or absent, the per-step `qloo_calls` numbers are summed instead. Never both.
 * Taste links: tags on Qloo-resolved portrait items (unique per item).
 * Discoveries: wishes that are backend discoveries with Qloo evidence.
 * A metric is null when its source was not loaded, so callers omit it rather than show a made-up zero.
 */
export function deriveCounters(src: { log?: AgentLog | null; items?: readonly PortraitItem[] | null; wishes?: readonly Wish[] | null }): QlooCounters {
  let lookups: number | null = null;
  const log = src.log;
  if (log) {
    const rows = Array.isArray(log.qloo_log) ? log.qloo_log.length : 0;
    const stepNums = (Array.isArray(log.steps) ? log.steps : []).map(s => s?.qloo_calls).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
    if (rows > 0) lookups = rows;
    else if (stepNums.length > 0) lookups = stepNums.reduce((a, b) => a + b, 0);
    else if (Array.isArray(log.qloo_log)) lookups = 0;
  }
  let tasteLinks: number | null = null;
  if (src.items) {
    tasteLinks = 0;
    for (const it of src.items) {
      if (!isQlooResolved(it)) continue;
      const seen = new Set<string>();
      for (const t of it.tags ?? []) { const n = clean(t?.name); if (n) seen.add(n.toLowerCase()); }
      tasteLinks += seen.size;
    }
  }
  let discoveries: number | null = null;
  if (src.wishes) {
    const known = qlooTagNames(src.items);
    discoveries = src.wishes.filter(w => isQlooDiscovery(w, known)).length;
  }
  return { lookups, tasteLinks, discoveries };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Only metrics that are real and above zero are phrased; the rest are omitted. */
export function counterParts(c: QlooCounters): string[] {
  const out: string[] = [];
  if (c.lookups != null && c.lookups > 0) out.push(plural(c.lookups, "Qloo lookup", "Qloo lookups"));
  if (c.tasteLinks != null && c.tasteLinks > 0) out.push(plural(c.tasteLinks, "taste link", "taste links"));
  if (c.discoveries != null && c.discoveries > 0) out.push(plural(c.discoveries, "discovery", "discoveries"));
  return out;
}

/** Reaction Mode: Qloo learning is claimed only when the save response itself reports Qloo activity. */
export function reactionQlooCalls(resp: unknown): number | null {
  if (!isObj(resp)) return null;
  const n = resp.qloo_calls;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  if (Array.isArray(resp.qloo_log) && resp.qloo_log.length > 0) return resp.qloo_log.length;
  return null;
}
