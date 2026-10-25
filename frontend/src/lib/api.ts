import { ApiError, detailText, friendlyMessage, PERSON_EXPIRED_CODE, PERSON_EXPIRED_MESSAGE, type NotFoundOverride } from "./errors";
import type { AgentLog, AgentResult, Fav, Person, Persona, PortraitItem, Wish } from "./types";
export const API = (process.env.NEXT_PUBLIC_API_URL || "https://genie-ld8p.onrender.com").replace(/\/$/, "");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function api<T>(path: string, opts: { method?: string; body?: unknown; timeout?: number; notFound?: NotFoundOverride; retry?: boolean } = {}): Promise<T> {
  const { method = "GET", body, timeout = 90000, notFound, retry = true } = opts;
  for (let attempt = 0; ; attempt++) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(API + path, {
        method, signal: c.signal, referrerPolicy: "no-referrer",
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      let data: unknown; try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
      if (!r.ok && r.status === 404 && notFound) throw new ApiError(404, notFound.message, notFound.code);
      if (!r.ok) { const raw = (data as { detail?: unknown } | undefined)?.detail; throw new ApiError(r.status, friendlyMessage(r.status, raw), undefined, detailText(raw)); }
      return data as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const net = e instanceof TypeError;
      if (attempt === 0 && retry && (net || method === "GET")) { await sleep(1500); continue; }
      throw new ApiError(net ? 0 : 504, friendlyMessage(net ? 0 : 504));
    } finally { clearTimeout(t); }
  }
}
export const personas = () => api<Persona[]>("/demo/personas");
export const demoStart = (persona: number) => api<{ person_id: string }>("/demo/start", { method: "POST", body: { persona } });
export const createPerson = (b: object) => api<Person>("/persons", { method: "POST", body: b, retry: false });
export const getPerson = (id: string) => api<Person>(`/persons/${id}`, { notFound: { message: PERSON_EXPIRED_MESSAGE, code: PERSON_EXPIRED_CODE } });
export const getPortrait = (id: string) => api<{ items: PortraitItem[] }>(`/persons/${id}/portrait`);
export const getWishes = (id: string) => api<Wish[]>(`/persons/${id}/wishes`);
export const agentLog = (id: string) => api<{ step: string; log: AgentLog; created_at: string }[]>(`/persons/${id}/agent-log`);
export const agentRun = (id: string, quick_facts: Fav[]) => api<AgentResult>(`/persons/${id}/agent/run`, { method: "POST", body: { quick_facts } });
export const deletePerson = (id: string) => api<unknown>(`/persons/${id}`, { method: "DELETE" });

// Stored journey extensions; responses are rendered defensively because some endpoints have variable wrappers.
export const personPath = (id:string, suffix:string) => `/persons/${encodeURIComponent(id)}/${suffix}`;
export const matchWish = (id:string,wid:string) => api<unknown>(personPath(id,`wishes/${encodeURIComponent(wid)}/match?limit=5`),{method:"POST"});
export const getRequests = (id:string,wid:string) => api<unknown>(personPath(id,`wishes/${encodeURIComponent(wid)}/requests`));
export const sendRequest = (id:string,wid:string,body:object) => api<unknown>(personPath(id,`wishes/${encodeURIComponent(wid)}/requests`),{method:"POST",body,retry:false});
export const createCircle = (id:string) => api<{token:string;path:string}>(personPath(id,"circle"),{method:"POST"});
export const circleResponses = (id:string) => api<unknown>(personPath(id,"circle-responses"));
export const retention = (id:string,days:number) => api<{expires_at:string}>(personPath(id,"retention"),{method:"PATCH",body:{days}});
export const compileBook = (id:string) => api<unknown>(personPath(id,"wish-book/compile"),{method:"POST"});
export const shareBook = (id:string) => api<unknown>(personPath(id,"wish-book/share"),{method:"POST"});
export const stopSharing = (id:string) => api<unknown>(personPath(id,"wish-book/share"),{method:"DELETE"});

// ---- Phase 3: live learning, maker requests, organisation portal. POSTs below never retry on their own. ----
const wishPath = (id: string, wid: string) => personPath(id, `wishes/${encodeURIComponent(wid)}`);
export interface QuickFact { domain: string; name: string; hint?: string }
export interface BuildResponse { saved?: number; items?: unknown[]; qloo_log?: unknown[]; summary?: string }
export interface GenerateResponse { wishes?: unknown[]; follow_up?: string | null; qloo_log?: unknown[]; summary?: string }
export interface MatchAllResponse { results?: { wish_id: string; matches?: unknown[]; message?: string; explain?: unknown }[] }
export const buildPortrait = (id: string, quick_facts: QuickFact[]) => api<BuildResponse>(personPath(id, "portrait/build"), { method: "POST", body: { quick_facts }, timeout: 70000, retry: false });
export const generateWishes = (id: string) => api<GenerateResponse>(personPath(id, "wishes/generate"), { method: "POST", timeout: 90000, retry: false });
export const matchAll = (id: string, limit = 5) => api<MatchAllResponse>(personPath(id, `match-all?limit=${Math.min(10, Math.max(1, Math.trunc(limit)))}`), { method: "POST", timeout: 90000, retry: false });
export const withdrawRequest = (id: string, wid: string, makerId: string) => api<unknown>(`${wishPath(id, wid)}/requests/${encodeURIComponent(makerId)}/withdraw`, { method: "POST", retry: false });
export const requestFeedback = (id: string, wid: string, makerId: string, body: { completed: boolean; concern: boolean; note?: string }) => api<unknown>(`${wishPath(id, wid)}/requests/${encodeURIComponent(makerId)}/feedback`, { method: "POST", body, retry: false });
export const getBook = (id: string) => api<unknown>(personPath(id, "wish-book"), { notFound: { message: "The Wish Book hasn't been compiled yet.", code: "book-not-compiled" } });
export const applyOrg = (body: object) => api<{ received?: boolean; message?: string }>("/org-portal/apply", { method: "POST", body, retry: false });
/** `token` is a private link. It lives only in this request path: never logged, stored or sent in a referrer. */
export const orgApi = <T,>(token: string, suffix: string, opts: { method?: string; body?: unknown; notFound?: { message: string; code?: string } } = {}) =>
  api<T>(`/org-portal/${encodeURIComponent(token)}${suffix}`, { ...opts, retry: opts.method === undefined || opts.method === "GET" });
