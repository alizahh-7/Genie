"use client";
import { useCallback, useEffect, useState } from "react";
import { orgApi } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { asRole, privateLink } from "@/lib/org";
import { Card, Btn, ErrorBox } from "@/components/ui";
import { PortalError, useOrg } from "@/components/OrgFrame";

const F = "w-full rounded-xl border border-navy/20 bg-white px-4 py-3 text-navy";
type Member = { id: string; name?: string; email?: string; role?: string };
const list = (r: unknown): Member[] => { const a = Array.isArray(r) ? r : r && typeof r === "object" && Array.isArray((r as { members?: unknown }).members) ? (r as { members: unknown[] }).members : []; return a.flatMap(x => { const o = x as Record<string, unknown>; const id = o?.id ?? o?.member_id; return id !== undefined && id !== null ? [{ id: String(id), name: typeof o.name === "string" ? o.name : undefined, email: typeof o.email === "string" ? o.email : undefined, role: typeof o.role === "string" ? o.role : undefined }] : []; }); };

export default function Team() {
  const { token, home } = useOrg();
  const [members, setMembers] = useState<Member[]>([]); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(true);
  const [f, setF] = useState({ name: "", email: "", role: "volunteer" }); const [adding, setAdding] = useState(false); const [addErr, setAddErr] = useState("");
  const [shown, setShown] = useState<{ link: string | null; emailSent: boolean | null } | null>(null); const [copied, setCopied] = useState(false);
  const load = useCallback(async () => { setBusy(true); setErr(null); try { setMembers(list(await orgApi<unknown>(token, "/members"))); } catch (e) { setErr(e); } finally { setBusy(false); } }, [token]);
  useEffect(() => { if (home.role === "coordinator") void load(); else setBusy(false); }, [load, home.role]);
  if (home.role !== "coordinator") return <Card data-forbidden><p className="font-serif text-2xl">Your role doesn&apos;t allow this.</p><p className="mt-2 text-ivory/75">Only coordinators can manage the team.</p></Card>;
  const add = async () => {
    if (adding || !f.name.trim()) return; setAdding(true); setAddErr("");
    try { const r = await orgApi<unknown>(token, "/members", { method: "POST", body: { name: f.name.trim(), email: f.email.trim() || undefined, role: f.role } }); const es = (r as { email_sent?: unknown } | undefined)?.email_sent; setShown({ link: privateLink(r, window.location.origin), emailSent: typeof es === "boolean" ? es : null }); setCopied(false); setF({ name: "", email: "", role: "volunteer" }); await load(); }
    catch (e) { setAddErr(errorDetail(e)); } finally { setAdding(false); }
  };
  const remove = async (m: Member) => { if (!window.confirm(`Remove ${m.name ?? "this member"}? Their private link will stop working.`)) return; try { await orgApi(token, `/members/${encodeURIComponent(m.id)}`, { method: "DELETE" }); await load(); } catch (e) { setAddErr(errorDetail(e)); } };
  const copy = async () => { if (!shown?.link) return; try { await navigator.clipboard.writeText(shown.link); setCopied(true); } catch { /* clipboard unavailable */ } };
  return (
    <div className="space-y-6" data-org-team>
      <h2 className="text-3xl">Team</h2>
      {shown && <Card data-private-link className="border-gold/40"><p className="font-serif text-2xl">Their private link</p>
        {shown.link ? <><p className="mt-2 break-all font-medium">{shown.link}</p><div className="mt-3 flex gap-3"><Btn quiet onClick={copy}>{copied ? "Copied" : "Copy link"}</Btn><Btn quiet onClick={() => setShown(null)}>I have copied it</Btn></div></> : <p className="mt-2">The member was added, but no link was returned.</p>}
        <p className="mt-3 text-sm text-ivory/75">This link is shown only once and works as their login. Share it privately, and never in a public place.</p>
        {shown.emailSent === true && <p className="mt-2 text-sm">An email with the link was sent.</p>}{shown.emailSent === false && <p className="mt-2 text-sm">No email was sent, so please share the link yourself.</p>}</Card>}
      <Card><h3 className="mb-3 text-2xl">Add a team member</h3><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Name<input className={F} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label><label className="text-sm">Email (optional)<input type="email" className={F} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label><label className="text-sm">Role<select className={F} value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{["volunteer", "viewer", "coordinator"].map(r => <option key={r}>{r}</option>)}</select></label></div>{addErr && <div className="mt-3"><ErrorBox message={addErr} /></div>}<div className="mt-4"><Btn onClick={add} disabled={adding || !f.name.trim()}>{adding ? "Adding…" : "Add member"}</Btn></div></Card>
      {busy ? <p role="status" className="text-ivory/70">Loading the team…</p> : err ? <PortalError error={err} onRetry={load} /> : members.length === 0 ? <Card><p>No team members yet.</p></Card> : <ul className="space-y-3">{members.map(m => <li key={m.id}><Card className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-serif text-2xl">{m.name ?? "Member"}</p><p className="text-sm text-ivory/70">{[asRole(m.role) ?? m.role, m.email].filter(Boolean).join(" · ")}</p></div><Btn quiet onClick={() => remove(m)}>Remove</Btn></Card></li>)}</ul>}
    </div>
  );
}
