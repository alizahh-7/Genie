"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { compileBook, getBook, shareBook, stopSharing, retention } from "@/lib/api";
import { ApiError, errorDetail, WISH_BOOK_NOT_COMPILED } from "@/lib/errors";
import { parseBook, type BookView } from "@/lib/bookV3";
import { Page, Action, Wait } from "@/components/Extra";
import { Card, Btn, ErrorBox } from "@/components/ui";
import { WishBookView } from "@/components/WishBookView";

type Load = { state: "loading" } | { state: "missing" } | { state: "error"; message: string } | { state: "ok"; book: BookView };

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [compiling, setCompiling] = useState(false); const [compileErr, setCompileErr] = useState("");
  const [link, setLink] = useState(""); const [expiry, setExpiry] = useState("");
  const compiled = useRef(false); // a compile is only ever started by a click, never by a render

  const fetchBook = useCallback(async () => {
    setLoad({ state: "loading" });
    try { const b = parseBook(await getBook(id)); setLoad(b ? { state: "ok", book: b } : { state: "missing" }); }
    catch (e) { setLoad(e instanceof ApiError && e.status === 404 ? { state: "missing" } : { state: "error", message: errorDetail(e) }); }
  }, [id]);
  useEffect(() => { void fetchBook(); }, [fetchBook]);

  // Compile first, then read. A GET 404 only means "not compiled yet", so it never shows the expired screen.
  const compile = async () => {
    if (compiled.current) return; compiled.current = true; setCompiling(true); setCompileErr("");
    try { await compileBook(id); await fetchBook(); } catch (e) { setCompileErr(errorDetail(e)); } finally { compiled.current = false; setCompiling(false); }
  };
  const makeLink = (v: unknown) => { const r = v as { path?: string; share_token?: string }; setLink(new URL(r.path ?? `/book/${r.share_token}`, window.location.origin).href); };
  const ok = load.state === "ok" ? load.book : null;

  return <Page id={id} title="Their Wish Book">
    <p className="noprint mb-6 max-w-2xl text-ivory/70">A keepsake of the small details, wishes, and memories that came together around someone you love.</p>
    <div className="noprint mb-8 flex flex-wrap gap-3">
      <Btn onClick={compile} disabled={compiling}>{compiling ? "Working…" : ok ? "Refresh the book" : "Compile the Wish Book"}</Btn>
      {ok && <Action label="Create share link" task={() => shareBook(id)} onDone={makeLink} />}
      {ok && <Btn quiet onClick={() => window.print()}>Print / Save as PDF</Btn>}
    </div>
    {compileErr && <div className="noprint mb-6"><ErrorBox message={compileErr} /></div>}
    {link && <Card className="noprint mb-6 border-gold/35"><p className="text-sm text-ivory/65">Private share link</p><p className="mt-1 break-all font-medium">{link}</p><button className="mt-3 text-sm text-gold underline" onClick={() => navigator.clipboard.writeText(link)}>Copy link</button><button className="ml-5 text-sm text-ivory/60 underline" onClick={() => stopSharing(id).then(() => setLink(""))}>Stop sharing</button></Card>}
    {load.state === "loading" ? <Wait text="Gathering the pages…" />
      : load.state === "missing" ? <Card className="noprint max-w-3xl"><p>{WISH_BOOK_NOT_COMPILED}</p><p className="mt-2 text-sm text-ivory/70">Compile it when you are ready. The book is a saved snapshot of the story so far.</p></Card>
      : load.state === "error" ? <ErrorBox message={load.message} onRetry={fetchBook} />
      : <WishBookView book={load.book} />}
    <Card className="noprint mt-8 max-w-3xl"><label className="text-sm text-ivory/70">How long should Genie keep this story? <select className="ml-2 rounded-lg border border-ivory/30 bg-white px-2 py-1 text-[#29233d]" defaultValue="7" id="retention-days">{[7, 30, 90, 365].map(n => <option key={n} value={n}>{n} days</option>)}</select></label><div className="mt-4"><Action label="Update retention" task={() => retention(id, Number((document.getElementById("retention-days") as HTMLSelectElement).value))} onDone={v => setExpiry((v as { expires_at: string }).expires_at)} /></div>{expiry && <p className="mt-3 text-sm text-ivory/70">Kept until {new Date(expiry).toLocaleDateString()}</p>}</Card>
  </Page>;
}
