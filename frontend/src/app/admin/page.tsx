"use client";
import { useCallback, useState } from "react";
import { Shell, Card, Btn, ErrorBox } from "@/components/ui";
import { AdminError, approveOrg, concerns as loadConcerns, makerApplications, orgApplications, orgLink, rejectOrg, reviewMaker, type Concern, type MakerApp, type OrgApp, type OrgApproved } from "@/lib/admin";

type Tab = "orgs" | "makers" | "concerns";
const F = "w-full rounded-xl border border-navy/20 bg-white px-4 py-3 text-navy";

export default function Admin() {
  const [token, setToken] = useState(""); const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<Tab>("orgs");
  const [orgs, setOrgs] = useState<OrgApp[]>([]); const [makers, setMakers] = useState<MakerApp[]>([]); const [cons, setCons] = useState<Concern[]>([]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ org: string; out: OrgApproved } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({}); const [refChecked, setRefChecked] = useState<Record<string, boolean>>({});

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { const m = e instanceof AdminError ? e.message : "Something went wrong. Please try again."; setErr(m); if (e instanceof AdminError && e.status === 401) setSignedIn(false); } finally { setBusy(false); }
  }, []);
  const refresh = useCallback(() => guard(async () => { const [o, m, c] = await Promise.all([orgApplications(token), makerApplications(token), loadConcerns(token)]); setOrgs(o); setMakers(m); setCons(c); setSignedIn(true); }), [guard, token]);

  const approve = (a: OrgApp) => guard(async () => { const out = await approveOrg(token, a.id); setIssued({ org: a.org_name, out }); setOrgs(x => x.filter(y => y.id !== a.id)); });
  const reject = (a: OrgApp) => { if (!window.confirm(`Reject the application from ${a.org_name}?`)) return; return guard(async () => { await rejectOrg(token, a.id); setOrgs(x => x.filter(y => y.id !== a.id)); }); };
  const review = (m: MakerApp, d: "approve" | "reject" | "suspend") => { if (d !== "approve" && !window.confirm(`${d === "reject" ? "Reject" : "Suspend"} ${m.name}?`)) return; return guard(async () => { await reviewMaker(token, m.id, d, !!refChecked[m.id], notes[m.id]); setMakers(x => x.filter(y => y.id !== m.id)); if (d === "suspend") setCons(x => x.filter(y => y.maker_id !== m.id)); }); };
  const copy = (t: string) => { try { void navigator.clipboard.writeText(t); } catch { /* clipboard unavailable */ } };

  if (!signedIn) return (
    <Shell>
      <h1 className="rise pt-8 text-5xl">Genie admin</h1>
      <p className="mb-6 mt-3 max-w-xl text-ivory/75">For the Genie team only. The token is kept in this tab’s memory and is never saved.</p>
      <Card className="max-w-md">
        <label className="block">Admin token<input type="password" autoComplete="off" className={`${F} mt-2`} value={token} onChange={e => setToken(e.target.value)} /></label>
        {err && <div className="mt-4"><ErrorBox message={err} /></div>}
        <div className="mt-5"><Btn onClick={() => void refresh()} disabled={!token.trim() || busy}>{busy ? "Checking…" : "Open"}</Btn></div>
      </Card>
    </Shell>
  );

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-8"><h1 className="text-5xl">Genie admin</h1><div className="flex gap-3"><Btn onClick={() => void refresh()} quiet disabled={busy}>Refresh</Btn><Btn onClick={() => { setToken(""); setSignedIn(false); setIssued(null); }} quiet>Sign out</Btn></div></div>
      <div role="tablist" className="my-6 flex flex-wrap gap-2">{([["orgs", `Organisations (${orgs.length})`], ["makers", `Wish Makers (${makers.length})`], ["concerns", `Concerns (${cons.length})`]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full border px-5 py-2 ${tab === k ? "border-gold bg-gold/15 text-gold" : "border-ivory/30 text-ivory/80 hover:border-gold"}`}>{l}</button>)}</div>
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}

      {issued && (
        <Card className="mb-6 border-gold/40">
          <h2 className="text-2xl">{issued.org} is approved</h2>
          <p className="mt-2 text-ivory/80">{issued.out.message}</p>
          {issued.out.path && <><p className="mt-3 break-all rounded-xl bg-ivory/10 p-3 text-sm">{orgLink(window.location.origin, issued.out.path)}</p><p className="mt-2 text-sm text-gold">This link is shown once. It is the organisation’s login, so share it only with the contact.</p><div className="mt-3"><Btn onClick={() => copy(orgLink(window.location.origin, issued.out.path))} quiet>Copy link</Btn></div></>}
        </Card>
      )}

      {tab === "orgs" && (orgs.length === 0 ? <p className="text-ivory/70">No organisations are waiting.</p> : <ul className="space-y-4">{orgs.map(a => (
        <li key={a.id}><Card>
          <h2 className="text-2xl">{a.org_name} <span className="text-base text-ivory/60">({a.kind})</span></h2>
          <p className="mt-1 text-ivory/75">{[a.city, a.country].filter(Boolean).join(", ") || "No location given"}</p>
          <p className="mt-2">{a.contact_name}, <span className="break-all">{a.contact_email}</span></p>
          {a.message && <p className="mt-2 border-l-2 border-gold/50 pl-3 text-ivory/80">{a.message}</p>}
          <div className="mt-4 flex flex-wrap gap-3"><Btn onClick={() => void approve(a)} disabled={busy}>Approve and email the link</Btn><Btn onClick={() => void reject(a)} quiet disabled={busy}>Reject</Btn></div>
        </Card></li>))}</ul>)}

      {tab === "makers" && (makers.length === 0 ? <p className="text-ivory/70">No Wish Maker applications are waiting.</p> : <ul className="space-y-4">{makers.map(m => (
        <li key={m.id}><Card>
          <h2 className="text-2xl">{m.name} <span className="text-base text-ivory/60">({m.type})</span></h2>
          <p className="mt-1 text-ivory/75">{[m.city, m.country].filter(Boolean).join(", ") || "No location given"}{m.remote_ok ? ", offers remote wishes" : ""}</p>
          {m.bio && <p className="mt-2 text-ivory/85">{m.bio}</p>}
          {m.contact_email && <p className="mt-2 break-all text-sm text-ivory/70">{m.contact_email}</p>}
          <label className="mt-4 flex items-center gap-2"><input type="checkbox" checked={!!refChecked[m.id]} onChange={e => setRefChecked({ ...refChecked, [m.id]: e.target.checked })} /> A reference was checked</label>
          <label className="mt-3 block text-sm">Note (optional, kept with the decision)<input maxLength={500} className={`${F} mt-1`} value={notes[m.id] ?? ""} onChange={e => setNotes({ ...notes, [m.id]: e.target.value })} /></label>
          <div className="mt-4 flex flex-wrap gap-3"><Btn onClick={() => void review(m, "approve")} disabled={busy}>Approve</Btn><Btn onClick={() => void review(m, "reject")} quiet disabled={busy}>Reject</Btn></div>
        </Card></li>))}</ul>)}

      {tab === "concerns" && (cons.length === 0 ? <p className="text-ivory/70">No concerns have been raised.</p> : <ul className="space-y-4">{cons.map(c => (
        <li key={c.wish_id + c.maker_id}><Card>
          <h2 className="text-2xl">{c.maker_name} <span className="text-base text-ivory/60">({c.application_status})</span></h2>
          <p className="mt-2 text-ivory/85">{c.feedback_note || "No note was left."}</p>
          {c.responded_at && <p className="mt-1 text-sm text-ivory/60">{new Date(c.responded_at).toLocaleString()}</p>}
          {c.application_status !== "suspended" && <div className="mt-4"><Btn onClick={() => void review({ id: c.maker_id, name: c.maker_name } as MakerApp, "suspend")} quiet disabled={busy}>Suspend this maker</Btn></div>}
        </Card></li>))}</ul>)}
    </Shell>
  );
}
