import { SOURCE } from "./format";
import { clean, ownValue } from "./labels";

/** Same privacy filter the shared TextList applies: identifiers, tokens and contact details are never shown. */
export const HIDDEN_KEY = /(token|email|contact|qloo_entity_id|person_id|maker_id|^id$|^raw)/i;

/**
 * Recursively removes null, undefined, blank strings, NaN and containers that end up empty.
 * Real values (including 0 and false) are kept untouched. Returns undefined when nothing real is left.
 */
export function pruneEmpty(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined || depth > 8) return undefined;
  if (typeof v === "string") return v.trim() ? v : undefined;
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) {
    const items = v.map(x => pruneEmpty(x, depth + 1)).filter(x => x !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (HIDDEN_KEY.test(k)) continue;
      const p = pruneEmpty(val, depth + 1);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

export const MAX_TAGS = 5;

/** Tag names from strings or {name} objects; blanks and duplicates removed. */
export function tagNames(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const names: string[] = [];
  for (const t of v) {
    const n = typeof t === "string" ? clean(t) : t && typeof t === "object" ? clean((t as { name?: unknown }).name) : undefined;
    if (!n) return null; // not a tag list, so fall back to generic rendering
    if (!names.some(x => x.toLowerCase() === n.toLowerCase())) names.push(n);
  }
  return names;
}

/** Friendlier wording for a few known values only; anything else is shown as sent. */
export function displayValue(key: string, v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && key.toLowerCase() === "basis") return ownValue(SOURCE, v.trim().toLowerCase()) ?? v;
  return String(v);
}

export const labelFor = (k: string): string => k.replace(/_/g, " ");
