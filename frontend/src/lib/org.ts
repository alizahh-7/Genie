import { clean } from "./labels";

/* Hospice organisation portal helpers. The private link is the login, so the token appears only in request paths. */

export type OrgRole = "coordinator" | "volunteer" | "viewer";
export const KINDS = ["hospice", "hospital", "care home", "charity"] as const;
export const CONSENT_BY = ["the person", "their family or guardian"] as const;
export const REFERENCE_HINT = "Use your own label such as Story A. Never a medical record number.";
export const STAFF_CONTACT_LABEL = "How should the maker reach you? Use your organisation's contact, not the person's.";
export const LINK_INVALID = "This link is not valid.";
export const ORG_INVALID_CODE = "org-invalid";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const asRole = (v: unknown): OrgRole | null => { const r = (clean(v) ?? "").toLowerCase(); return r === "coordinator" || r === "volunteer" || r === "viewer" ? r : null; };

/** The backend's `can_edit` wins. If it is absent, only a viewer (or an unknown role) is read-only. Never guesses upward. */
export function canEdit(o: { can_edit?: unknown; role?: unknown }): boolean {
  if (typeof o.can_edit === "boolean") return o.can_edit;
  const r = asRole(o.role); return r === "coordinator" || r === "volunteer";
}

export function daysLeft(expiresAt: unknown, now = Date.now()): number | null {
  const s = clean(expiresAt); if (!s) return null;
  const t = new Date(s).getTime(); if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86400000);
}
export const EXPIRY_WARN_DAYS = 10;
export const isExpiringSoon = (d: number | null): boolean => d !== null && d < EXPIRY_WARN_DAYS;
export const expiryText = (d: number | null): string => (d === null ? "" : d < 0 ? "Expired" : d === 0 ? "Expires today" : d === 1 ? "1 day left" : `${d} days left`);

/** Which kind of failure a portal call returned: 404 on the portal itself is an invalid link, 403 is a role restriction. */
export function portalFailure(status: number): "invalid-link" | "forbidden" | "other" { return status === 404 ? "invalid-link" : status === 403 ? "forbidden" : "other"; }

export interface DashStat { key: string; label: string; value: number }
const STAT_DEFS: { label: string; keys: string[] }[] = [
  { label: "Stories open", keys: ["stories_open", "open_stories", "open", "cases_open"] },
  { label: "Stories paused", keys: ["stories_paused", "paused_stories", "paused", "cases_paused"] },
  { label: "Stories closed", keys: ["stories_closed", "closed_stories", "closed", "cases_closed"] },
  { label: "Wishes", keys: ["wishes", "wishes_total", "total_wishes"] },
  { label: "Awaiting maker reply", keys: ["awaiting_reply", "awaiting_maker_reply", "requested", "awaiting", "asked"] },
  { label: "Accepted", keys: ["accepted"] },
  { label: "Done", keys: ["done", "completed"] },
  { label: "Declined", keys: ["declined"] },
  { label: "Concerns", keys: ["concerns", "concerns_raised"] },
  { label: "Available makers", keys: ["available_makers", "makers_available", "makers"] },
];
const HOURS_KEYS = ["avg_hours_to_reply", "average_hours_to_reply", "avg_reply_hours", "avg_hours_to_maker_reply", "average_hours_to_maker_reply", "avg_hours_to_response", "average_response_hours"];
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const pick = (o: Record<string, unknown>, keys: string[]): { key: string; v: number } | null => { for (const k of keys) if (finite(o[k])) return { key: k, v: o[k] as number }; return null; };

/** Only totals the backend actually sent are returned; nothing is defaulted to zero. The average appears only when it is a number. */
export function dashboardStats(dash: unknown): { stats: DashStat[]; avgHours: number | null } {
  const d = isObj(dash) ? dash : {};
  const t = isObj(d.totals) ? d.totals : isObj(d.summary) ? d.summary : d;
  const stats: DashStat[] = [];
  for (const def of STAT_DEFS) { const f = pick(t, def.keys); if (f) stats.push({ key: f.key, label: def.label, value: f.v }); }
  const h = pick(t, HOURS_KEYS);
  return { stats, avgHours: h ? h.v : null };
}

export interface DashStory { case_key: string; first_name?: string; region?: string; reference?: string; status?: string; expires_at?: string; wishes?: number; requested?: number; accepted?: number; done?: number; concerns?: number; next_step?: string }
export function dashboardStories(dash: unknown): DashStory[] {
  const d = isObj(dash) ? dash : {};
  const list = Array.isArray(d.stories) ? d.stories : Array.isArray(d.cases) ? d.cases : [];
  const num = (v: unknown) => (finite(v) ? v : undefined);
  return list.filter(isObj).map(s => ({ case_key: clean(s.case_key) ?? "", first_name: clean(s.first_name), region: clean(s.region), reference: clean(s.reference), status: clean(s.status), expires_at: clean(s.expires_at), wishes: num(s.wishes), requested: num(s.requested), accepted: num(s.accepted), done: num(s.done), concerns: num(s.concerns), next_step: clean(s.next_step) })).filter(s => s.case_key);
}

/** Portal URLs only ever carry the token and the case_key, never a person id. */
export const casePath = (token: string, caseKey: string) => `/org/${encodeURIComponent(token)}?case=${encodeURIComponent(caseKey)}`;

/** A new private link is shown exactly once; this extracts it from whichever field the response used. */
export function privateLink(resp: unknown, origin: string): string | null {
  if (!isObj(resp)) return null;
  const direct = clean(resp.link) ?? clean(resp.url) ?? clean(resp.private_link);
  if (direct) return /^https?:\/\//.test(direct) ? direct : new URL(direct, origin).href;
  const path = clean(resp.path); if (path) return new URL(path, origin).href;
  const token = clean(resp.token); if (token) return `${origin}/org/${encodeURIComponent(token)}`;
  return null;
}

export interface OrgHomeView { orgName: string; kind?: string; place?: string; sample: boolean; memberName?: string; role: OrgRole | null; canEdit: boolean }
/** Portal home: organisation and member details. Role-dependent editing follows the backend's `can_edit`. */
export function parseHome(raw: unknown): OrgHomeView {
  const r = isObj(raw) ? raw : {};
  const o = isObj(r.organisation) ? r.organisation : isObj(r.organization) ? r.organization : {};
  const m = isObj(r.member) ? r.member : isObj(r.me) ? r.me : {};
  const role = asRole(m.role) ?? asRole(r.role);
  return {
    orgName: clean(o.org_name) ?? clean(o.name) ?? "Your organisation", kind: clean(o.kind),
    place: [clean(o.city), clean(o.country)].filter(Boolean).join(", ") || undefined,
    sample: o.is_sample === true, memberName: clean(m.name) ?? clean(m.contact_name), role,
    canEdit: canEdit({ can_edit: r.can_edit ?? m.can_edit, role }),
  };
}
export interface CaseView { first_name?: string; region?: string; reference?: string; status?: string; expires_at?: string; person_id?: string; family_page?: string; canEdit: boolean; role: OrgRole | null; wishes: Record<string, unknown>[] }
/** `person_id` and `family_page` are only read when the backend says the caller can edit; a viewer never receives them. */
export function parseCase(raw: unknown): CaseView {
  const r = isObj(raw) ? raw : {};
  const s = isObj(r.story) ? r.story : {};
  const role = asRole(r.role); const edit = canEdit({ can_edit: r.can_edit, role });
  return {
    first_name: clean(s.first_name), region: clean(s.region), reference: clean(s.reference), status: clean(s.status), expires_at: clean(s.expires_at),
    person_id: edit ? clean(s.person_id) ?? clean(r.person_id) : undefined, family_page: edit ? clean(s.family_page) ?? clean(r.family_page) : undefined,
    canEdit: edit, role, wishes: (Array.isArray(r.wishes) ? r.wishes : []).filter(isObj),
  };
}
