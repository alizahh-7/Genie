import { SOURCE } from "./format";

/** Trimmed string, or undefined when the value is not a non-empty string. */
export const clean = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Own-property lookup so keys like "constructor" never resolve to Object.prototype members. */
export const ownValue = (o: Record<string, string>, k: string): string | undefined => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** Turns a raw source key ("reacted") into its human wording; text that is already human is returned unchanged. */
export const humanSourceLabel = (s: string): string => ownValue(SOURCE, s.trim().toLowerCase()) ?? s.trim();

/** "maker_type" -> "Maker type". Only reformats, never adds meaning. */
export function humanize(v: unknown): string | undefined {
  const s = clean(v);
  if (!s) return undefined;
  const t = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const withPeriod = (s: string): string => (/[.!?…]$/.test(s) ? s : `${s}.`);
