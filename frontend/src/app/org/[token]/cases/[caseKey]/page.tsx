"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { orgApi } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { daysLeft, expiryText, isExpiringSoon, parseCase } from "@/lib/org";
import { parseRequestRows } from "@/lib/makerRequests";
import { Card, Btn, ErrorBox } from "@/components/ui";
import { PortalError, useOrg } from "@/components/OrgFrame";
import { MakerTimeline } from "@/components/MakerTimeline";
import { WishRequests } from "@/components/WishRequests";
import { STATUS_LABEL } from "@/lib/makerRequests";

export default function CasePage() {
  const { token, home } = useOrg(); const { caseKey } = useParams<{ caseKey: string }>(); const router = useRouter();
  const path = `/cases/${encodeURIComponent(caseKey)}`;
  const [raw, setRaw] = useState<unknown>(null); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(true);
  const [actErr, setActErr] = useState(""); const [working, setWorking] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(async () => { setBusy(true); setErr(null); try { setRaw(await orgApi<unknown>(token, path)); } catch (e) { setErr(e); } finally { setBusy(false); } }, [token, path]);
  useEffect(() => { void load(); }, [load]);
  const base = `/org/${encodeURIComponent(token)}`;
  const act = async (fn: () => Promise<unknown>, after?: () => void) => { if (working) return; setWorking(true); setActErr(""); try { await fn(); after ? after() : await load(); } catch (e) { setActErr(errorDetail(e)); } finally { setWorking(false); } };

  if (busy) return <p role="status" className="text-ivory/70">Opening this story…</p>;
  if (err) return <div className="space-y-4"><PortalError error={err} onRetry={load} /><Btn quiet href={base}>Back to the dashboard</Btn></div>;
  const c = parseCase(raw); const d = daysLeft(c.expires_at); const soon = isExpiringSoon(d); const editable = c.canEdit && home.canEdit;
  return (
    <div className="space-y-6" data-org-case={caseKey}>
      <Btn quiet href={base}>← Dashboard</Btn>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-4xl">{c.first_name ?? "Story"}</h2><p className="text-ivory/70">{[c.reference, c.region].filter(Boolean).join(" · ")}</p></div>
          <div className="flex flex-wrap gap-2">{c.status && <span className="rounded-full border border-ivory/30 px-3 py-0.5 text-sm capitalize">{c.status}</span>}{!editable && <span data-readonly-badge className="rounded-full border border-ivory/35 px-3 py-0.5 text-sm">Read-only view</span>}</div></div>
        {d !== null && <p data-expiry={soon ? "soon" : "ok"} className={`mt-3 text-sm ${soon ? "font-medium text-[#ffcf99]" : "text-ivory/70"}`}>{soon && <span aria-hidden="true">⚠ </span>}{expiryText(d)}</p>}
        {editable && <div data-case-actions className="mt-5 flex flex-wrap gap-2">
          {c.status !== "paused" && c.status !== "closed" && <Btn quiet disabled={working} onClick={() => act(() => orgApi(token, path, { method: "PATCH", body: { status: "paused" } }))}>Pause</Btn>}
          {(c.status === "paused" || c.status === "closed") && <Btn quiet disabled={working} onClick={() => act(() => orgApi(token, path, { method: "PATCH", body: { status: "open" } }))}>Reopen</Btn>}
          {c.status !== "closed" && <Btn quiet disabled={working} onClick={() => act(() => orgApi(token, path, { method: "PATCH", body: { status: "closed" } }))}>Close</Btn>}
          <Btn quiet disabled={working} onClick={() => act(() => orgApi(token, `${path}/extend`, { method: "POST", body: { days: 90 } }))}>Extend by 90 days</Btn>
          {c.family_page && <Btn quiet href={c.family_page}>Open the family page</Btn>}
          <Btn quiet disabled={working} onClick={() => setConfirmDelete(true)}>Delete permanently</Btn>
        </div>}
        {actErr && <div className="mt-4"><ErrorBox message={actErr} /></div>}
      </Card>
      {confirmDelete && <div role="alertdialog" aria-modal="true" aria-label="Delete this story" className="rounded-3xl border border-[#ff9b9b]/50 bg-[#2a1220] p-6"><p className="font-serif text-2xl">Delete this story permanently?</p><p className="mt-2 text-ivory/80">Everything Genie holds for {c.first_name ?? "this story"} is removed for good: the portrait, wishes, requests and Wish Book. This cannot be undone.</p><div className="mt-4 flex gap-3"><Btn disabled={working} onClick={() => act(() => orgApi(token, path, { method: "DELETE" }), () => router.push(base))}>{working ? "Deleting…" : "Yes, delete everything"}</Btn><Btn quiet onClick={() => setConfirmDelete(false)}>Keep it</Btn></div></div>}
      <section aria-label="Wishes"><h2 className="mb-4 text-3xl">Wishes</h2>
        {c.wishes.length === 0 ? <Card><p>No wishes yet.</p></Card> : <div className="space-y-5">{c.wishes.map((w, i) => {
          const wid = typeof w.id === "string" ? w.id : typeof w.wish_id === "string" ? w.wish_id : ""; const title = typeof w.title === "string" ? w.title : "A wish";
          const rows = parseRequestRows(w.requests ?? w.makers ?? []);
          return <Card key={wid || i} data-wish={wid || i}>
            <h3 className="text-2xl">{title}</h3>{typeof w.description === "string" && <p className="mt-1 text-ivory/75">{w.description}</p>}
            {editable && c.person_id && wid ? <WishRequests id={c.person_id} wish={{ id: wid, title }} personName={c.first_name} staff />
              : rows.length === 0 ? <p className="mt-3 text-sm text-ivory/60">No Wish Makers asked yet.</p>
              : <ul className="mt-3 space-y-3">{rows.map(r => <li key={r.maker_id} data-request={r.maker_id}><p>{r.name ?? "A Wish Maker"}{r.is_sample && <span className="ml-2 rounded-full border border-gold/50 px-2 py-0.5 text-xs text-gold">Sample</span>} <span className="text-sm text-ivory/70">· {STATUS_LABEL[r.status]}</span></p><MakerTimeline row={r} />{r.maker_contact && <p className="mt-2 text-sm">Contact shared by the maker: {r.maker_contact}</p>}</li>)}</ul>}
          </Card>; })}</div>}
      </section>
    </div>
  );
}
