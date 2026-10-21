"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { API, compileBook, personPath, retention, shareBook, stopSharing } from "@/lib/api";
import { Page, useLoad, Wait, Action } from "@/components/Extra";
import { Card, Btn, ErrorBox } from "@/components/ui";

type Portrait = { name: string; domain: string; tags?: string[]; label?: string };
type BookContent = { title?: string; tagline?: string; portrait?: Portrait[]; wishes?: { title: string; description?: string; mode?: string }[]; learned?: string[]; voices?: { from: string; answers: Record<string, string> }[] };
type Book = { content?: BookContent; share_token?: string };

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const path = personPath(id, "wish-book");
  const { data, error, busy, reload } = useLoad<Book>(path);
  const [link, setLink] = useState("");
  const [expiry, setExpiry] = useState("");
  const content = data?.content;
  const makeLink = (v: unknown) => { const r = v as { path?: string; share_token?: string }; setLink(new URL(r.path ?? `/book/${r.share_token}`, window.location.origin).href); };
  return <Page id={id} title="Their Wish Book">
    <p className="mb-6 max-w-2xl text-ivory/70">A keepsake of the small details, wishes, and memories that came together around someone you love.</p>
    <div className="mb-8 flex flex-wrap gap-3">
      <Action label="Make or refresh the book" task={() => compileBook(id)} onDone={reload} />
      {content && <Action label="Create share link" task={() => shareBook(id)} onDone={makeLink} />}
      {content && <Btn quiet onClick={() => window.open(`${API}${path}/print`, "_blank", "noopener,noreferrer")}>Print / Save as PDF</Btn>}
    </div>
    {link && <Card className="mb-6 border-gold/35"><p className="text-sm text-ivory/65">Private share link</p><p className="mt-1 break-all font-medium">{link}</p><button className="mt-3 text-sm text-gold underline" onClick={() => navigator.clipboard.writeText(link)}>Copy link</button><button className="ml-5 text-sm text-ivory/60 underline" onClick={() => stopSharing(id).then(() => setLink(""))}>Stop sharing</button></Card>}
    {busy ? <Wait text="Gathering the pages…" /> : error ? <ErrorBox message={error.includes("not been compiled") ? "Your Wish Book is ready to be made when you are." : error} onRetry={reload} /> : content && <article className="print-paper mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-gold/30 bg-[#f8f1e4] p-7 text-[#29233d] shadow-2xl sm:p-12">
      <p className="mb-10 text-center text-xs uppercase tracking-[.22em] text-[#75629c]">A Genie keepsake</p>
      <h2 className="text-center text-6xl leading-none sm:text-7xl">{content.title}</h2><p className="mx-auto mt-5 max-w-md text-center text-lg text-[#665d70]">{content.tagline}</p>
      <div className="gold-rule my-12" />
      <section><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">Their world</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(content.portrait ?? []).map((p, i) => <div key={i} className="rounded-2xl border border-[#d7c9b1] p-4"><p className="text-xs uppercase tracking-wider text-[#75629c]">{p.domain} · {p.label}</p><h3 className="mt-1 text-3xl">{p.name}</h3>{p.tags?.length ? <p className="mt-2 text-sm text-[#665d70]">{p.tags.join(" · ")}</p> : null}</div>)}</div></section>
      {(content.learned?.length ?? 0) > 0 && <section className="mt-10"><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">Things we learned</p><ul className="mt-3 space-y-2 text-xl">{content.learned?.map((x, i) => <li key={i}>✦ {x}</li>)}</ul></section>}
      <section className="mt-10"><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">Wishes</p><div className="mt-4 space-y-5">{(content.wishes ?? []).map((w, i) => <div key={i}><h3 className="text-3xl">{w.title}</h3><p className="mt-1 text-[#665d70]">{w.description}</p><p className="mt-2 text-xs uppercase tracking-wider text-[#75629c]">{w.mode === "in-person" ? "In person" : "From anywhere"}</p></div>)}</div></section>
      {(content.voices?.length ?? 0) > 0 && <section className="mt-10 border-t border-[#d7c9b1] pt-8"><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">From the people who love them</p>{content.voices?.map((v, i) => <blockquote key={i} className="mt-5 border-l-2 border-[#b7a078] pl-5"><p className="font-serif text-2xl">{Object.values(v.answers).find(Boolean)}</p><footer className="mt-2 border-0 p-0 text-sm text-[#75629c]">— {v.from}</footer></blockquote>)}</section>}
    </article>}
    <Card className="mt-8 max-w-3xl"><label className="text-sm text-ivory/70">How long should Genie keep this story? <select className="ml-2 rounded-lg border border-ivory/30 bg-white px-2 py-1" defaultValue="7" id="retention-days">{[7, 30, 90, 365].map(n => <option key={n} value={n}>{n} days</option>)}</select></label><div className="mt-4"><Action label="Update retention" task={() => retention(id, Number((document.getElementById("retention-days") as HTMLSelectElement).value))} onDone={v => setExpiry((v as { expires_at: string }).expires_at)} /></div>{expiry && <p className="mt-3 text-sm text-ivory/70">Kept until {new Date(expiry).toLocaleDateString()}</p>}</Card>
  </Page>;
}
