import { DEMO } from "./mock";
import { Person } from "./types";
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
// Endpoint paths are assumptions: check docs/engine-contract.md and adjust here only.
async function j(path: string, init?: RequestInit) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
  try {
    const r = await fetch(API + path, { ...init, signal: c.signal, headers: { "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(t); }
}
export async function getPerson(id: string): Promise<{ person: Person; sample: boolean }> {
  if (id !== "demo") { try { return { person: await j(`/persons/${id}`), sample: false }; } catch {} }
  return { person: DEMO, sample: true };
}
export async function createPerson(body: object): Promise<string> {
  try { return (await j("/persons", { method: "POST", body: JSON.stringify(body) })).id; } catch { return "demo"; }
}
export async function deleteEverything(id: string) { try { await j(`/persons/${id}`, { method: "DELETE" }); } catch {} }
export async function sendCircle(token: string, body: object) { try { await j(`/circle/${token}`, { method: "POST", body: JSON.stringify(body) }); } catch {} }
