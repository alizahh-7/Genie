"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { orgApi } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { CONSENT_BY, dashboardStats, dashboardStories, daysLeft, expiryText, isExpiringSoon, REFERENCE_HINT } from "@/lib/org";
import { Card, Btn, ErrorBox } from "@/components/ui";
import { PortalError, useOrg } from "@/components/OrgFrame";

const F = "mb-4 w-full rounded-xl border border-navy/20 bg-white px-4 py-3 text-navy";

function NewCase({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [f, setF] = useState({ first_name: "", birth_year: "", region: "", language: "", reference: "", consent_confirmed: false, consent_by: CONSENT_BY[0] as string });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ok = f.first_name.trim() && f.reference.trim() && f.consent_confirmed && (!f.birth_year || /^\d{4}$/.test(f.birth_year));
  const submit = async () => {
    if (!ok || busy) return; setBusy(true); setErr("");
    try {
      await orgApi(token, "/cases", { method: "POST", body: { first_name: f.first_name.trim(), birth_year: f.birth_year ? Number(f.birth_year) : undefined, region: f.region.trim() || undefined, language: f.language.trim() || undefined, reference: f.reference.trim(), consent_confirmed: f.consent_confirmed, consent_by: f.consent_by } });
      setOpen(false); setF({ ...f, first_name: "", birth_year: "", region: "", language: "", reference: "", consent_confirmed: false }); onCreated();
    } catch (e) { setErr(errorDetail(e)); } finally { setBusy(false); }
  };
  if (!open) return <Btn onClick={() => setOpen(true)}>Start a new story</Btn>;
  return (
    <Card data-new-case>
      <h2 className="mb-4 text-3xl">Start a new story</h2>
      <label className="block text-sm">First name or nickname<input className={F} value={f.first_name} onChange={set("first_name")} maxLength={40} /></label>
      <div className="grid gap-x-4 sm:grid-cols-3"><label className="block text-sm">Birth year<input className={F} inputMode="numeric" maxLength={4} value={f.birth_year} onChange={set("birth_year")} /></label><label className="block text-sm">City<input className={F} value={f.region} onChange={set("region")} /></label><label className="block text-sm">Language<input className={F} value={f.language} onChange={set("language")} /></label></div>
      <label className="block text-sm">Your reference<input className={F} value={f.reference} onChange={set("reference")} aria-describedby="ref-hint" /></label>
      <p id="ref-hint" className="-mt-2 mb-4 text-sm text-ivory/65">{REFERENCE_HINT}</p>
      <label className="mb-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={f.consent_confirmed} onChange={e => setF({ ...f, consent_confirmed: e.target.checked })} /><span>I confirm consent has been given to start this story.</span></label>
      <label className="block text-sm">Consent was given by<select className={F} value={f.consent_by} onChange={set("consent_by")}>{CONSENT_BY.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
      {err && <div className="mb-3"><ErrorBox message={err} /></div>}
      <div className="flex gap-3"><Btn onClick={submit} disabled={!ok || busy}>{busy ? "Creating…" : "Create story"}</Btn><Btn quiet onClick={() => setOpen(false)}>Cancel</Btn></div>
    </Card>
  );
}

export default function Dashboard() {
  const { token, home } = useOrg();
  const [dash, setDash] = useState<unknown>(null); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(true);
  const load = useCallback(async () => { setBusy(true); setErr(null); try { setDash(await orgApi<unknown>(token, "/dashboard")); } catch (e) { setErr(e); } finally { setBusy(false); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (busy) return <p role="status" className="text-ivory/70">Loading the dashboard…</p>;
  if (err) return <PortalError error={err} onRetry={load} />;
  const { stats, avgHours } = dashboardStats(dash); const stories = dashboardStories(dash);
  const base = `/org/${encodeURIComponent(token)}`;
  return (
    <div className="space-y-8" data-org-dashboard>
      {home.canEdit && <NewCase token={token} onCreated={load} />}
      {stats.length > 0 || avgHours !== null ? <section aria-label="Totals"><dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(s => <div key={s.key} data-stat={s.label} className="glass rounded-2xl px-4 py-3"><dt className="text-xs uppercase tracking-wider text-ivory/60">{s.label}</dt><dd className="font-serif text-4xl">{s.value}</dd></div>)}
        {avgHours !== null && <div data-stat="Average hours to maker reply" className="glass rounded-2xl px-4 py-3"><dt className="text-xs uppercase tracking-wider text-ivory/60">Average hours to maker reply</dt><dd className="font-serif text-4xl">{Math.round(avgHours * 10) / 10}</dd></div>}
      </dl></section> : null}
      <section aria-label="Stories">
        <h2 className="mb-4 text-3xl">Stories</h2>
        {stories.length === 0 ? <Card><p>No stories yet.{home.canEdit ? " Start one above when a family is ready." : ""}</p></Card> : <ul className="grid gap-4 md:grid-cols-2">{stories.map(s => { const d = daysLeft(s.expires_at); const soon = isExpiringSoon(d);
          return <li key={s.case_key}><Card data-story={s.case_key} className={soon ? "border-[#ffb870]/60" : ""}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-serif text-3xl">{s.first_name ?? "Story"}</p><p className="text-sm text-ivory/70">{[s.reference, s.region].filter(Boolean).join(" · ")}</p></div>{s.status && <span className="rounded-full border border-ivory/30 px-3 py-0.5 text-sm capitalize">{s.status}</span>}</div>
            {d !== null && <p data-expiry={soon ? "soon" : "ok"} className={`mt-3 text-sm ${soon ? "font-medium text-[#ffcf99]" : "text-ivory/70"}`}>{soon && <span aria-hidden="true">⚠ </span>}{expiryText(d)}{soon && " — kept only a little longer"}</p>}
            <p className="mt-3 text-sm text-ivory/80">{[s.wishes !== undefined && `${s.wishes} ${s.wishes === 1 ? "wish" : "wishes"}`, s.requested !== undefined && `${s.requested} asked`, s.accepted !== undefined && `${s.accepted} accepted`, s.done !== undefined && `${s.done} done`, s.concerns ? `${s.concerns} ${s.concerns === 1 ? "concern" : "concerns"}` : ""].filter(Boolean).join(" · ")}</p>
            {s.next_step && <p className="mt-2 text-sm"><span className="text-ivory/60">Next: </span>{s.next_step}</p>}
            <div className="mt-4"><Link href={`${base}/cases/${encodeURIComponent(s.case_key)}`} className="text-gold underline underline-offset-4">Open this story</Link></div>
          </Card></li>; })}</ul>}
      </section>
    </div>
  );
}
