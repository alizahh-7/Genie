import { API } from "./api";

/** Admin calls. The token lives only in memory, never in storage, and is sent as the X-Admin-Token header. */
export interface OrgApp { id: string; org_name: string; kind: string; city: string | null; country: string | null; contact_name: string; contact_email: string; message: string | null; status: string; created_at: string }
export interface MakerApp { id: string; name: string; type: string; bio: string | null; tags: unknown; city: string | null; country: string | null; languages: string[] | null; remote_ok: boolean; contact_email: string | null; application_status: string; applied_at: string | null }
export interface Concern { wish_id: string; maker_id: string; maker_name: string; application_status: string; feedback_note: string | null; responded_at: string | null }
export interface OrgApproved { org_id?: string; path?: string; contact_email?: string; email_sent?: boolean; message?: string }

export class AdminError extends Error { constructor(public status: number, message: string) { super(message); } }

export function adminMessage(status: number, detail?: unknown): string {
  if (status === 401) return "That admin token was not accepted.";
  if (status === 503) return "Admin access is not set up on the server yet.";
  if (status === 404) return "That item was not found, or it was already reviewed.";
  if (status === 0) return "Could not reach the server. It may be waking up; try again in a minute.";
  return typeof detail === "string" && detail ? detail : "Something went wrong. Please try again.";
}

export async function adminCall<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API + path, { method, referrerPolicy: "no-referrer", headers: { "X-Admin-Token": token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new AdminError(0, adminMessage(0)); }
  const text = await r.text(); let data: unknown; try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!r.ok) throw new AdminError(r.status, adminMessage(r.status, (data as { detail?: unknown } | undefined)?.detail));
  return data as T;
}

export const orgApplications = (t: string) => adminCall<OrgApp[]>(t, "/admin/org-applications?status=pending");
export const approveOrg = (t: string, id: string) => adminCall<OrgApproved>(t, `/admin/org-applications/${encodeURIComponent(id)}/approve`, "POST");
export const rejectOrg = (t: string, id: string) => adminCall<{ rejected: boolean }>(t, `/admin/org-applications/${encodeURIComponent(id)}/reject`, "POST");
export const makerApplications = (t: string) => adminCall<MakerApp[]>(t, "/admin/makers?status=pending");
export const reviewMaker = (t: string, id: string, decision: "approve" | "reject" | "suspend", reference_checked: boolean, note?: string) =>
  adminCall<unknown>(t, `/admin/makers/${encodeURIComponent(id)}/review`, "POST", { decision, reference_checked, ...(note?.trim() ? { note: note.trim().slice(0, 500) } : {}) });
export const concerns = (t: string) => adminCall<Concern[]>(t, "/admin/concerns");
/** Full private link from the path the server returns. */
export const orgLink = (origin: string, path?: string) => path ? origin.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path) : "";
