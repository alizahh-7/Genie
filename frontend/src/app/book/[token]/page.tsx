"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ApiError, errorDetail } from "@/lib/errors";
import { parseBook, type BookView } from "@/lib/bookV3";
import { Page, Wait } from "@/components/Extra";
import { Card, Btn, ErrorBox } from "@/components/ui";
import { WishBookView } from "@/components/WishBookView";

const NOT_FOUND = "This shared Wish Book link isn't available. It may have stopped being shared.";
type Load = { state: "loading" } | { state: "gone" } | { state: "error"; message: string } | { state: "ok"; book: BookView };

export default function SharedBook() {
  const { token } = useParams<{ token: string }>();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const fetchBook = useCallback(async () => {
    setLoad({ state: "loading" });
    try { const b = parseBook(await api<unknown>(`/book/${encodeURIComponent(token)}`, { notFound: { message: NOT_FOUND } })); setLoad(b ? { state: "ok", book: b } : { state: "gone" }); }
    catch (e) { setLoad(e instanceof ApiError && e.status === 404 ? { state: "gone" } : { state: "error", message: errorDetail(e) }); }
  }, [token]);
  useEffect(() => { void fetchBook(); }, [fetchBook]);
  return <Page title="A shared Wish Book">
    {load.state === "ok" && <div className="noprint mb-6"><Btn quiet onClick={() => window.print()}>Print / Save as PDF</Btn></div>}
    {load.state === "loading" ? <Wait text="Opening the book…" /> : load.state === "gone" ? <Card className="max-w-3xl"><p>{NOT_FOUND}</p></Card> : load.state === "error" ? <ErrorBox message={load.message} onRetry={fetchBook} /> : <WishBookView book={load.book} />}
  </Page>;
}
