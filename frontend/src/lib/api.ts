import { ApiError, friendlyMessage, PERSON_EXPIRED_CODE, PERSON_EXPIRED_MESSAGE, type NotFoundOverride } from "./errors";
import type { AgentLog, AgentResult, Fav, Person, Persona, PortraitItem, Wish } from "./types";
export const API = (process.env.NEXT_PUBLIC_API_URL || "https://genie-ld8p.onrender.com").replace(/\/$/, "");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function api<T>(path: string, opts: { method?: string; body?: unknown; timeout?: number; notFound?: NotFoundOverride } = {}): Promise<T> {
  const { method = "GET", body, timeout = 90000, notFound } = opts;
  for (let attempt = 0; ; attempt++) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(API + path, {
        method, signal: c.signal,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      let data: unknown; try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
      if (!r.ok && r.status === 404 && notFound) throw new ApiError(404, notFound.message, notFound.code);
      if (!r.ok) throw new ApiError(r.status, friendlyMessage(r.status, (data as { detail?: unknown } | undefined)?.detail));
      return data as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const net = e instanceof TypeError;
      if (attempt === 0 && (net || method === "GET")) { await sleep(1500); continue; }
      throw new ApiError(net ? 0 : 504, friendlyMessage(net ? 0 : 504));
    } finally { clearTimeout(t); }
  }
}
export const personas = () => api<Persona[]>("/demo/personas");
export const demoStart = (persona: number) => api<{ person_id: string }>("/demo/start", { method: "POST", body: { persona } });
export const createPerson = (b: object) => api<Person>("/persons", { method: "POST", body: b });
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
export const sendRequest = (id:string,wid:string,body:object) => api<unknown>(personPath(id,`wishes/${encodeURIComponent(wid)}/requests`),{method:"POST",body});
export const createCircle = (id:string) => api<{token:string;path:string}>(personPath(id,"circle"),{method:"POST"});
export const circleResponses = (id:string) => api<unknown>(personPath(id,"circle-responses"));
export const retention = (id:string,days:number) => api<{expires_at:string}>(personPath(id,"retention"),{method:"PATCH",body:{days}});
export const compileBook = (id:string) => api<unknown>(personPath(id,"wish-book/compile"),{method:"POST"});
export const shareBook = (id:string) => api<unknown>(personPath(id,"wish-book/share"),{method:"POST"});
export const stopSharing = (id:string) => api<unknown>(personPath(id,"wish-book/share"),{method:"DELETE"});
