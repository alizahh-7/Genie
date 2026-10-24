"use client";
import { useState } from "react";
import { Shell, Card, Btn, ErrorBox } from "@/components/ui";
import { applyOrg } from "@/lib/api";
import { errorDetail, ApiError } from "@/lib/errors";
import { KINDS } from "@/lib/org";

const F = "mb-4 w-full rounded-xl border border-navy/20 bg-white px-4 py-3 text-navy";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fictional layout preview. Labels are examples, not organisations, and there are deliberately no statistics. */
function Preview() {
  const rows = [["Story A", "Awaiting maker reply"], ["Story B", "Accepted"], ["Story C", "Done"]];
  return (
    <figure aria-label="Fictional dashboard preview" className="glass relative overflow-hidden rounded-3xl p-5">
      <figcaption className="mb-3 flex items-center justify-between text-xs uppercase tracking-[.18em] text-ivory/60"><span>Dashboard preview</span><span className="rounded-full border border-gold/40 px-2 py-0.5 text-gold">Fictional layout</span></figcaption>
      <ul className="space-y-2">{rows.map(([t, s]) => <li key={t} className="flex items-center justify-between rounded-2xl border border-ivory/15 bg-ivory/5 px-4 py-3"><span className="font-serif text-xl">{t}</span><span className="text-sm text-ivory/75">{s}</span></li>)}</ul>
      <p className="mt-3 text-xs text-ivory/55">Staff see each story&apos;s stage, how long it is kept, and what happens next. Labels like “Story A” are chosen by your team, never a medical record number.</p>
    </figure>
  );
}

export default function ForHospices() {
  const [f, setF] = useState({ org_name: "", kind: "hospice", city: "", country: "", contact_name: "", contact_email: "", message: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState<string | null>(null); const [fieldErr, setFieldErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setError(""); setFieldErr("");
    if (!f.org_name.trim() || !f.city.trim() || !f.country.trim() || !f.contact_name.trim()) { setFieldErr("Please fill in the organisation, city, country and your name."); return; }
    if (!EMAIL.test(f.contact_email.trim())) { setFieldErr("Please enter a valid email address."); return; }
    if (busy) return; setBusy(true);
    try { const r = await applyOrg({ ...f, org_name: f.org_name.trim(), city: f.city.trim(), country: f.country.trim(), contact_name: f.contact_name.trim(), contact_email: f.contact_email.trim(), message: f.message.trim() }); setDone(r?.message?.trim() || "Your application was received."); }
    catch (e) { setError(e instanceof ApiError && e.status === 429 ? errorDetail(e) : errorDetail(e)); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <header className="rise pb-8 pt-10 text-center">
        <p className="mb-3 text-sm uppercase tracking-[.22em] text-gold">For hospices and care organisations</p>
        <h1 className="text-5xl sm:text-6xl">Help a wish happen, without adding to your workload</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ivory/75">Genie helps a family put what someone loved into words, then suggests people who might make a small wish real. Your team coordinates it from one calm dashboard.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Card><h2 className="text-3xl">A coordination service</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-ivory/80"><li>Your staff open a story for someone, with their or their family&apos;s consent.</li><li>The family adds memories. Genie suggests wishes and Wish Makers who could help.</li><li>You see where each wish stands: suggested, asked, accepted or done.</li></ul></Card>
          <Card><h2 className="text-3xl">Honest about the model</h2><p className="mt-3 text-ivory/80">Genie is an early project. Families use it without an account. Hospices and care organisations apply for access to the coordination dashboard, and any terms are discussed with you directly before anything is agreed. We do not publish customer numbers or outcomes, because we would rather show you than claim.</p><p className="mt-3 text-sm text-ivory/60">Genie is not a medical service. It does not give medical advice or replace your care team.</p></Card>
          <Preview />
        </div>
        <Card>
          <h2 className="mb-4 text-3xl">Apply for access</h2>
          {done ? <div role="status" data-apply-success><p className="text-xl">{done}</p><div className="mt-5"><Btn quiet href="/">Back to Genie</Btn></div></div> : <>
            <label className="block text-sm">Organisation<input className={F} value={f.org_name} onChange={set("org_name")} autoComplete="organization" /></label>
            <label className="block text-sm">Type<select className={F} value={f.kind} onChange={set("kind")}>{KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
            <div className="grid gap-x-4 sm:grid-cols-2"><label className="block text-sm">City<input className={F} value={f.city} onChange={set("city")} /></label><label className="block text-sm">Country<input className={F} value={f.country} onChange={set("country")} /></label></div>
            <label className="block text-sm">Your name<input className={F} value={f.contact_name} onChange={set("contact_name")} autoComplete="name" /></label>
            <label className="block text-sm">Email<input type="email" className={F} value={f.contact_email} onChange={set("contact_email")} autoComplete="email" /></label>
            <label className="block text-sm">Anything you would like us to know (optional)<textarea className={F} rows={4} maxLength={1000} value={f.message} onChange={set("message")} /></label>
            {fieldErr && <p role="alert" className="mb-3 text-sm text-[#ffb4b4]">{fieldErr}</p>}
            {error && <div className="mb-3"><ErrorBox message={error} /></div>}
            <Btn onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send application"}</Btn>
          </>}
        </Card>
      </div>
    </Shell>
  );
}
