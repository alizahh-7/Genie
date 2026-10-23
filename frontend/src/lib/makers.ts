import { clean, humanize } from "./labels";

export interface MakerLike {
  maker_id?: string; name?: string; type?: string; city?: string; country?: string;
  is_sample?: boolean; verification_status?: string; reasons?: unknown[]; basis?: string;
}

/* ---------- friendly labels from GET /meta/notices ---------- */

export type LabelGroup = "verification" | "type" | "basis";
const GROUPS: Record<LabelGroup, string[]> = {
  verification: ["verification_status", "verification", "verification_statuses", "status_labels", "statuses", "status"],
  type: ["maker_type", "maker_types", "type_labels", "types"],
  basis: ["basis", "match_basis", "match_bases", "basis_labels", "bases"],
};
const LABEL_KEYS = ["label", "name", "title", "display", "text"];
const ID_KEYS = ["id", "value", "key", "code", "slug", "status", "type", "basis"];
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
/** Labels must be short single lines, so a long notice (like an attribution paragraph) is never mistaken for one. */
const shortLine = (v: unknown): string | undefined => { const s = clean(v); return s && s.length <= 80 && !/[\r\n]/.test(s) ? s : undefined; };
const labelOf = (o: unknown): string | undefined => { if (!o || typeof o !== "object") return undefined; for (const k of LABEL_KEYS) { const s = shortLine((o as Record<string, unknown>)[k]); if (s) return s; } return undefined; };

function labelFrom(node: unknown, value: string): string | undefined {
  const target = norm(value);
  if (Array.isArray(node)) {
    for (const el of node) {
      if (!el || typeof el !== "object") continue;
      const o = el as Record<string, unknown>;
      const id = ID_KEYS.map(k => o[k]).find(x => typeof x === "string") as string | undefined;
      if (id && norm(id) === target) { const s = labelOf(o); if (s) return s; }
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (norm(k) !== target) continue;
      const s = shortLine(v) ?? labelOf(v);
      if (s) return s;
    }
  }
  return undefined;
}

/** Looks for a friendly label for `value` inside notices, whatever their nesting. Returns undefined when none is published. */
export function noticeLabel(notices: unknown, group: LabelGroup, value: unknown): string | undefined {
  const v = clean(value);
  if (!v) return undefined;
  const aliases = GROUPS[group];
  const walk = (node: unknown, depth: number): string | undefined => {
    if (!node || typeof node !== "object" || depth > 5) return undefined;
    if (!Array.isArray(node)) {
      for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
        if (aliases.includes(norm(k))) { const s = labelFrom(child, v); if (s) return s; }
      }
    }
    for (const child of Object.values(node as object)) { const s = walk(child, depth + 1); if (s) return s; }
    return undefined;
  };
  return walk(notices, 0);
}

/* ---------- maker card facts ---------- */

export function isSample(m: MakerLike): boolean {
  return m.is_sample === true || norm(clean(m.verification_status) ?? "") === "sample";
}

export function makerFacts(m: MakerLike, notices?: unknown): { sample: boolean; line: string } {
  const sample = isSample(m);
  const type = noticeLabel(notices, "type", m.type) ?? humanize(m.type);
  const place = [clean(m.city), clean(m.country)].filter(Boolean).join(", ");
  const status = clean(m.verification_status);
  // "sample" is shown as a badge, not repeated in the metadata line.
  const statusLabel = status && norm(status) !== "sample" ? noticeLabel(notices, "verification", status) ?? humanize(status) : undefined;
  return { sample, line: [type, place, statusLabel].filter(Boolean).join(" · ") };
}

/* ---------- how the match was made ---------- */

export type BasisKind = "qloo" | "text" | "type" | "mixed" | "unknown";

export function basisKind(raw: unknown): BasisKind {
  const s = (clean(raw) ?? "").toLowerCase();
  if (!s) return "unknown";
  const qloo = s.includes("qloo");
  const text = /(^|[^a-z])text|keyword|lexical/.test(s);
  const type = /(^|[^a-z])type|categor/.test(s);
  if (qloo && (text || type)) return "mixed";
  if (qloo) return "qloo";
  if (text && type) return "mixed";
  if (text) return "text";
  if (type) return "type";
  return "unknown";
}

/** Plain-language account of how the match was made. A text or type match is never described as coming from Qloo. */
export function basisCopy(raw: unknown, notices?: unknown): { kind: BasisKind; title: string; explanation: string } {
  const kind = basisKind(raw);
  switch (kind) {
    case "qloo": return { kind, title: "Qloo-based match", explanation: "This suggestion came from Qloo's taste data." };
    case "text": return { kind, title: "Text-based match", explanation: "This was found by matching text, not through Qloo." };
    case "type": return { kind, title: "Type-based match", explanation: "This was chosen because the maker's category fits the wish, not through Qloo." };
    case "mixed": return { kind, title: "Mixed match", explanation: "This combines more than one way of matching, so only part of it may come from Qloo." };
    default: {
      const v = clean(raw);
      if (!v) return { kind, title: "Match basis not specified", explanation: "We can't say how this one was matched." };
      return { kind, title: noticeLabel(notices, "basis", v) ?? `Match basis: ${humanize(v)}`, explanation: "We can't say more about how this one was matched." };
    }
  }
}
