import type { PortraitItem } from "./types";
export const MEDICAL_FALLBACK = "Genie is not a medical service. For questions about care, please speak with the care team.";
export const SOURCE: Record<string, string> = { told: "Told by family", likely: "Likely from their era and region", reacted: "They reacted to this", "ai-only": "Suggested by AI, not in Qloo" };
export const sourceLabel = (s: string) => SOURCE[s] ?? "From the story so far";
export const confidenceWord = (c: number) => (c >= 0.8 ? "Quite sure" : c >= 0.5 ? "Fairly sure" : "A gentle guess");
export const isNotInQloo = (i: PortraitItem) => i.resolution_level === 5 || i.resolution_level === 6;
export const shownTags = (i: PortraitItem, n = 5) => (isNotInQloo(i) ? [] : (i.tags ?? []).map(t => t.name).filter(Boolean).slice(0, n));
export const matchedVia = (i: PortraitItem) => (i.matched_name && i.matched_name.trim().toLowerCase() !== i.name.trim().toLowerCase() ? i.matched_name : null);
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} seconds`;
export const modeNote = (m: string) => (m === "in-person" ? "In person, with a family member present" : "Can happen remotely");
export const DOMAINS = ["music", "food", "place", "film", "other"];
export function pickMedical(n: unknown): string | undefined {
  if (!n || typeof n !== "object") return undefined;
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    if (typeof v === "string" && /medical|disclaimer/i.test(k)) return v;
    const d = typeof v === "object" ? pickMedical(v) : undefined;
    if (d) return d;
  }
  return undefined;
}
