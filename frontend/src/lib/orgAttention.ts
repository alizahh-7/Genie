import { daysLeft, isExpiringSoon, type DashStory } from "./org";

export type AttentionKind = "concern" | "expiring" | "awaiting" | "paused";
export interface AttentionItem { kind: AttentionKind; caseKey: string; name: string; text: string; sort: number }

const label = (s: DashStory) => s.first_name ?? s.reference ?? "A story";
const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/**
 * What staff should look at first, derived only from the dashboard rows the backend sent.
 * Closed stories are ignored. Order: concerns, retention deadlines, replies awaited, paused stories.
 */
export function attentionItems(stories: readonly DashStory[], now: number = Date.now()): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const s of stories) {
    if (!s.case_key || s.status === "closed") continue;
    const name = label(s);
    if (typeof s.concerns === "number" && s.concerns > 0) out.push({ kind: "concern", caseKey: s.case_key, name, text: `${n(s.concerns, "concern", "concerns")} raised`, sort: 0 });
    const d = daysLeft(s.expires_at, now);
    if (isExpiringSoon(d)) out.push({ kind: "expiring", caseKey: s.case_key, name, text: d === 0 ? "kept until today" : `kept for ${n(d as number, "more day", "more days")}`, sort: 1 + (d as number) / 100 });
    if (typeof s.requested === "number" && s.requested > 0) out.push({ kind: "awaiting", caseKey: s.case_key, name, text: `${n(s.requested, "Wish Maker has", "Wish Makers have")} not replied yet`, sort: 2 });
    if (s.status === "paused") out.push({ kind: "paused", caseKey: s.case_key, name, text: "is paused", sort: 3 });
  }
  return out.sort((a, b) => a.sort - b.sort);
}
export const ATTENTION_LABEL: Record<AttentionKind, string> = { concern: "Concern", expiring: "Retention", awaiting: "Waiting", paused: "Paused" };
