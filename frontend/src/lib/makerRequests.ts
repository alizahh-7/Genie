import { clean } from "./labels";

/* Wish → Maker timeline. The stage shown always comes from the ACTUAL request status (GET /requests), never from a match. */

export type ReqStatus = "suggested" | "requested" | "accepted" | "done" | "declined" | "withdrawn" | "unknown";
const KNOWN = new Set(["suggested", "requested", "accepted", "done", "declined", "withdrawn"]);
export const normStatus = (s: unknown): ReqStatus => { const v = (clean(s) ?? "").toLowerCase(); return KNOWN.has(v) ? (v as ReqStatus) : "unknown"; };

export const STATUS_LABEL: Record<ReqStatus, string> = {
  suggested: "Suggested", requested: "Asked", accepted: "Accepted", done: "Done",
  declined: "Not going ahead — Declined", withdrawn: "Not going ahead — Withdrawn", unknown: "Status not available",
};

export type StageState = "complete" | "current" | "upcoming";
export interface TimelineStage { key: "suggested" | "asked" | "accepted" | "done"; label: string; state: StageState; note?: string }
export interface Timeline { stages: TimelineStage[]; stopped: string | null; status: ReqStatus }

const STAGES: { key: TimelineStage["key"]; label: string }[] = [{ key: "suggested", label: "Suggested" }, { key: "asked", label: "Asked" }, { key: "accepted", label: "Accepted" }, { key: "done", label: "Done" }];
const INDEX: Partial<Record<ReqStatus, number>> = { suggested: 0, requested: 1, accepted: 2, done: 3 };
const fmt = (iso?: string | null) => { if (!iso) return undefined; const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };

/**
 * suggested/requested/accepted: earlier stages complete, this one current, later ones upcoming.
 * done: every stage complete. declined/withdrawn: the path stops, nothing after "Asked" is marked reached.
 * There is no completion timestamp, so Done only ever shows `responded_at`, worded as the last update.
 */
export function buildTimeline(row: { status?: unknown; requested_at?: string | null; responded_at?: string | null }): Timeline {
  const status = normStatus(row.status);
  const idx = INDEX[status];
  const stages: TimelineStage[] = STAGES.map((s, i) => {
    let state: StageState = "upcoming";
    if (idx !== undefined) state = status === "done" ? "complete" : i < idx ? "complete" : i === idx ? "current" : "upcoming";
    else if (status === "declined" || status === "withdrawn") state = i === 0 ? "complete" : i === 1 && row.requested_at ? "complete" : "upcoming";
    let note: string | undefined;
    if (s.key === "asked" && state !== "upcoming") note = fmt(row.requested_at) ? `Asked ${fmt(row.requested_at)}` : undefined;
    if (s.key === "accepted" && status === "accepted") note = fmt(row.responded_at) ? `Replied ${fmt(row.responded_at)}` : undefined;
    if (s.key === "done" && status === "done") note = fmt(row.responded_at) ? `Last update ${fmt(row.responded_at)}` : undefined;
    return { ...s, state, note };
  });
  return { stages, stopped: status === "declined" || status === "withdrawn" ? STATUS_LABEL[status] : null, status };
}

export interface RequestRow {
  maker_id: string; status: ReqStatus; score?: number; reasons: string[]; basis?: string; request_message?: string; maker_note?: string;
  requested_at?: string | null; responded_at?: string | null; name?: string; type?: string; city?: string; country?: string;
  is_sample: boolean; verification_status?: string; maker_contact?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Maker contact is shown only for accepted or done requests, whatever else the payload carries. */
export const contactAllowed = (status: ReqStatus): boolean => status === "accepted" || status === "done";

export function parseRequestRows(raw: unknown): RequestRow[] {
  const list = Array.isArray(raw) ? raw : isObj(raw) ? (Array.isArray(raw.requests) ? raw.requests : Array.isArray(raw.results) ? raw.results : []) : [];
  const out: RequestRow[] = [];
  for (const r of list) {
    if (!isObj(r)) continue; const id = clean(r.maker_id); if (!id) continue;
    const status = normStatus(r.status);
    out.push({
      maker_id: id, status, score: typeof r.score === "number" ? r.score : undefined,
      reasons: (Array.isArray(r.reasons) ? r.reasons : []).filter((x): x is string => typeof x === "string" && !!x.trim()),
      basis: clean(r.basis), request_message: clean(r.request_message), maker_note: clean(r.maker_note),
      requested_at: clean(r.requested_at) ?? null, responded_at: clean(r.responded_at) ?? null,
      name: clean(r.name), type: clean(r.type), city: clean(r.city), country: clean(r.country), is_sample: r.is_sample === true,
      verification_status: clean(r.verification_status), maker_contact: contactAllowed(status) ? clean(r.maker_contact) : undefined,
    });
  }
  return out;
}

/** Suggestions from match / match-all carry no status. The row from GET /requests wins; a maker with no row is simply "suggested". */
export function mergeSuggestions(rows: RequestRow[], matches: unknown[]): RequestRow[] {
  const byId = new Map(rows.map(r => [r.maker_id, r]));
  const out = [...rows];
  for (const m of matches) {
    if (!isObj(m)) continue; const id = clean(m.maker_id); if (!id || byId.has(id)) continue;
    out.push({
      maker_id: id, status: "suggested", score: typeof m.score === "number" ? m.score : undefined,
      reasons: (Array.isArray(m.reasons) ? m.reasons : []).filter((x): x is string => typeof x === "string" && !!x.trim()), basis: clean(m.basis),
      name: clean(m.name), type: clean(m.type), city: clean(m.city), country: clean(m.country), is_sample: m.is_sample === true,
      verification_status: clean(m.verification_status), requested_at: null, responded_at: null,
    });
  }
  return out;
}

/** Can the family or staff send a request right now? Already open, accepted, done or declined rows cannot be asked again. */
export const canAsk = (s: ReqStatus): boolean => s === "suggested" || s === "withdrawn" || s === "unknown";
export const canWithdraw = (s: ReqStatus): boolean => s === "requested" || s === "accepted";
export const canComplete = (s: ReqStatus): boolean => s === "accepted";
export const canReport = (s: ReqStatus): boolean => s === "accepted" || s === "done";

export const MESSAGE_MIN = 5, MESSAGE_MAX = 600;
export function validateMessage(m: string): string | null {
  const n = m.trim().length;
  if (n < MESSAGE_MIN) return `Please write at least ${MESSAGE_MIN} characters.`;
  if (n > MESSAGE_MAX) return `Please keep it to ${MESSAGE_MAX} characters or fewer (now ${n}).`;
  return null;
}
export function defaultAskMessage(o: { maker?: string; person?: string; wish?: string; staff?: boolean }): string {
  const who = o.person ? `${o.person}'s` : "our";
  const hello = o.maker ? `Hello ${o.maker},` : "Hello,";
  const base = o.staff
    ? `${hello} we are coordinating a wish on behalf of a family and would be grateful for your help${o.wish ? ` with "${o.wish}"` : ""}. Could you tell us whether this is something you can offer? Thank you.`
    : `${hello} ${who} family would be grateful for your help${o.wish ? ` with "${o.wish}"` : ""}. Could you tell us whether this is something you can offer? Thank you.`;
  return base.slice(0, MESSAGE_MAX);
}
/** The exact note a sample maker returns when it accepts immediately. Shown as the backend sends it. */
export const SAMPLE_NOTE = "This is a sample Wish Maker. In a live network, a real person would respond here.";

/** Feedback bodies. `concern: true` exists only in concernBody, which is wired to a separate, confirmed action. */
export const completionBody = (note?: string) => ({ completed: true, concern: false, ...(clean(note) ? { note: clean(note)! } : {}) });
export const concernBody = (note?: string) => ({ completed: false, concern: true, ...(clean(note) ? { note: clean(note)! } : {}) });
