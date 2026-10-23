import { clean, humanSourceLabel, withPeriod } from "./labels";

/** Shapes returned by GET /persons/{id}/bedside-kit. Every field is optional because the payload is rendered defensively. */
export interface KitTrack { name?: string; label?: string; basis?: string }
export interface KitLine { text?: string; because?: string }
export interface Kit {
  title?: string; intro?: string; note?: string;
  playlist?: { title?: string; how_to?: string; tracks?: KitTrack[]; empty_note?: string };
  small_changes?: KitLine[]; visitors?: KitLine[];
}

/**
 * A playlist entry is its track name plus its human-readable label. `basis` is a machine
 * key ("reacted", "general"...) and is deliberately never shown, so nothing like
 * "because of reacted" can be produced. Entries without a name are dropped rather than invented.
 */
export function trackParts(t: unknown): { name: string; label?: string } | null {
  if (!t || typeof t !== "object") return null;
  const r = t as Record<string, unknown>;
  const name = clean(r.name);
  if (!name) return null;
  let label = clean(r.label);
  if (label) label = humanSourceLabel(label);
  if (label && label.toLowerCase() === name.toLowerCase()) label = undefined;
  return { name, label };
}

/** "Kishore Kumar. They reacted to this." */
export function trackSentence(t: unknown): string {
  const p = trackParts(t);
  if (!p) return "";
  return p.label ? `${withPeriod(p.name)} ${withPeriod(p.label)}` : p.name;
}

/** `because` is only meaningful for small changes and visitors; "general" is a placeholder, not a reason. */
export function becauseText(v: unknown): string | undefined {
  const s = clean(v);
  return s && s.toLowerCase() !== "general" ? s : undefined;
}

export function lineParts(r: unknown): { text: string; because?: string } | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const text = clean(o.text);
  return text ? { text, because: becauseText(o.because) } : null;
}
