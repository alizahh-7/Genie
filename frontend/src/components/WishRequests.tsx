"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getRequests, matchWish, requestFeedback, sendRequest, withdrawRequest } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { recompileQuietly } from "@/lib/bookSync";
import { canAsk, canComplete, canReport, canWithdraw, completionBody, concernBody, defaultAskMessage, mergeSuggestions, parseRequestRows, SAMPLE_NOTE, STATUS_LABEL, validateMessage, MESSAGE_MAX, type RequestRow } from "@/lib/makerRequests";
import { STAFF_CONTACT_LABEL } from "@/lib/org";
import { useNotices } from "@/lib/useNotices";
import { Card, Btn, ErrorBox } from "@/components/ui";
import { MakerSummary } from "@/components/MakerSummary";
import { MakerTimeline } from "@/components/MakerTimeline";

const FIELD = "w-full rounded-xl border border-navy/20 bg-white p-3 text-navy";

/** Everything about one wish's Wish Makers: suggestions, the real request status, asking, withdrawing, finishing, and reporting a concern. */
export function WishRequests({ id, wish, personName, staff = false, readOnly = false }: { id: string; wish: { id: string; title?: string }; personName?: string; staff?: boolean; readOnly?: boolean }) {
  const notices = useNotices();
  const [rows, setRows] = useState<RequestRow[]>([]); const [matches, setMatches] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true); const [loadErr, setLoadErr] = useState(""); const [findMsg, setFindMsg] = useState(""); const [finding, setFinding] = useState(false);
  const [open, setOpen] = useState<{ maker: string; kind: "ask" | "concern" } | null>(null);
  const [msg, setMsg] = useState(""); const [contact, setContact] = useState(""); const [note, setNote] = useState(""); const [doneNote, setDoneNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null); const [rowErr, setRowErr] = useState<Record<string, string>>({}); const [sent, setSent] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>()); // one request per maker at a time: no double-clicks, no duplicates

  const refresh = useCallback(async () => {
    try { setRows(parseRequestRows(await getRequests(id, wish.id))); setLoadErr(""); } catch (e) { setLoadErr(errorDetail(e)); } finally { setLoading(false); }
  }, [id, wish.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const find = async () => {
    setFinding(true); setFindMsg("");
    try { const r = (await matchWish(id, wish.id)) as { matches?: unknown[]; message?: string } | undefined; setMatches(Array.isArray(r?.matches) ? r!.matches! : []); setFindMsg(r?.message ?? ""); await refresh(); }
    catch (e) { setFindMsg(errorDetail(e)); } finally { setFinding(false); }
  };

  const guard = async (maker: string, fn: () => Promise<void>) => {
    if (inFlight.current.has(maker)) return; inFlight.current.add(maker); setBusyId(maker); setRowErr(p => ({ ...p, [maker]: "" }));
    try { await fn(); } catch (e) { setRowErr(p => ({ ...p, [maker]: errorDetail(e) })); } finally { inFlight.current.delete(maker); setBusyId(null); }
  };
  const done = async (maker: string) => { await refresh(); void recompileQuietly(id); setOpen(null); setNote(""); return maker; };

  const startAsk = (r: RequestRow) => { setOpen({ maker: r.maker_id, kind: "ask" }); setMsg(defaultAskMessage({ maker: r.name, person: personName, wish: wish.title, staff })); setContact(""); };
  const ask = (r: RequestRow) => {
    const bad = validateMessage(msg); if (bad) { setRowErr(p => ({ ...p, [r.maker_id]: bad })); return; }
    void guard(r.maker_id, async () => {
      const resp = (await sendRequest(id, wish.id, { maker_id: r.maker_id, message: msg.trim(), ...(contact.trim() ? { family_contact: contact.trim() } : {}) })) as { maker_note?: string } | undefined;
      if (resp?.maker_note) setSent(p => ({ ...p, [r.maker_id]: resp.maker_note! }));
      await done(r.maker_id);
    });
  };
  const withdraw = (r: RequestRow) => { if (!window.confirm(`Withdraw the request to ${r.name ?? "this Wish Maker"}?`)) return; void guard(r.maker_id, async () => { await withdrawRequest(id, wish.id, r.maker_id); await done(r.maker_id); }); };
  const complete = (r: RequestRow) => void guard(r.maker_id, async () => { await requestFeedback(id, wish.id, r.maker_id, completionBody(doneNote)); setDoneNote(""); await done(r.maker_id); });
  const report = (r: RequestRow) => void guard(r.maker_id, async () => { await requestFeedback(id, wish.id, r.maker_id, concernBody(note)); await done(r.maker_id); });

  const list = mergeSuggestions(rows, matches);
  return (
    <div className="mt-4 space-y-4" data-wish-requests={wish.id}>
      {!readOnly && <div><Btn onClick={find} disabled={finding}>{finding ? "Looking…" : "Find Wish Makers"}</Btn></div>}
      {findMsg && <p>{findMsg}</p>}
      {loading ? <p role="status" className="text-sm text-ivory/60">Checking where this wish stands…</p> : loadErr ? <ErrorBox message={loadErr} onRetry={refresh} /> : null}
      {!loading && !loadErr && list.length === 0 && <p className="text-sm text-ivory/60">No Wish Makers have been suggested for this wish yet.</p>}
      {list.map(r => {
        const note0 = sent[r.maker_id] ?? r.maker_note; const isOpen = open?.maker === r.maker_id;
        return (
          <Card key={r.maker_id}>
            <MakerSummary m={{ ...r, name: r.name, reasons: r.reasons }} notices={notices} />
            <p className="mt-1 text-sm"><span className="font-medium">{STATUS_LABEL[r.status]}</span></p>
            <MakerTimeline row={r} />
            {note0 && <p data-maker-note className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm">{r.is_sample && <span className="mr-2 rounded-full border border-gold/50 px-2 py-0.5 text-xs text-gold">Sample</span>}{note0}</p>}
            {r.maker_contact && <p data-maker-contact className="mt-3 text-sm">Contact shared by the maker: <span className="font-medium">{r.maker_contact}</span></p>}
            {rowErr[r.maker_id] && <div className="mt-3"><ErrorBox message={rowErr[r.maker_id]} /></div>}
            {!readOnly && <div className="mt-4 flex flex-wrap gap-2">
              {canAsk(r.status) && <Btn quiet onClick={() => (isOpen && open?.kind === "ask" ? setOpen(null) : startAsk(r))}>Ask this Wish Maker</Btn>}
              {canComplete(r.status) && <Btn quiet onClick={() => complete(r)} disabled={busyId === r.maker_id}>Mark as done</Btn>}
              {canWithdraw(r.status) && <Btn quiet onClick={() => withdraw(r)} disabled={busyId === r.maker_id}>Withdraw request</Btn>}
              {canReport(r.status) && <Btn quiet onClick={() => { setOpen(isOpen && open?.kind === "concern" ? null : { maker: r.maker_id, kind: "concern" }); setNote(""); }}>Report a concern</Btn>}
            </div>}
            {isOpen && open?.kind === "ask" && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">Your message<textarea className={FIELD} rows={4} maxLength={MESSAGE_MAX + 50} value={msg} onChange={e => setMsg(e.target.value)} aria-describedby={`count-${r.maker_id}`} /></label>
                <p id={`count-${r.maker_id}`} className="text-xs text-ivory/60">{msg.trim().length} of {MESSAGE_MAX} characters (at least 5)</p>
                <label className="block text-sm">{staff ? STAFF_CONTACT_LABEL : "Optional way for the maker to reach you"}<input className={FIELD} value={contact} onChange={e => setContact(e.target.value)} /></label>
                <Btn onClick={() => ask(r)} disabled={busyId === r.maker_id}>{busyId === r.maker_id ? "Sending…" : "Send request"}</Btn>
              </div>)}
            {isOpen && open?.kind === "concern" && (
              <div role="alertdialog" aria-label="Report a concern" className="mt-4 space-y-3 rounded-2xl border border-ivory/25 p-4">
                <p className="text-sm">This tells Genie&apos;s team you have a concern about this Wish Maker. Please only do this if you need to. It is separate from marking the wish as done.</p>
                <label className="block text-sm">What happened? (optional)<textarea className={FIELD} rows={3} value={note} onChange={e => setNote(e.target.value)} /></label>
                <div className="flex gap-2"><Btn onClick={() => report(r)} disabled={busyId === r.maker_id}>Yes, report this concern</Btn><Btn quiet onClick={() => setOpen(null)}>Cancel</Btn></div>
              </div>)}
            {r.status === "accepted" && !readOnly && <label className="mt-3 block text-xs text-ivory/60">Optional note when marking as done<input className={`${FIELD} mt-1`} value={doneNote} onChange={e => setDoneNote(e.target.value)} /></label>}
          </Card>
        );
      })}
    </div>
  );
}
export { SAMPLE_NOTE };
