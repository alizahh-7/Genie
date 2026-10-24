"use client";
import type { ReactNode } from "react";
import type { BookPortraitEntry, BookView } from "@/lib/bookV3";
import { STATUS_LABEL, normStatus } from "@/lib/makerRequests";

const label = "text-sm uppercase tracking-[.16em] text-[#75629c]";
const when = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); };

function Tile({ p, guess }: { p: BookPortraitEntry; guess?: boolean }) {
  return (
    <div className={`book-keep rounded-2xl border p-4 ${guess ? "border-dashed border-[#b7a078]" : "border-[#d7c9b1]"}`} data-source={p.source || "unknown"}>
      <p className="text-xs uppercase tracking-wider text-[#75629c]">{[p.domain, p.label].filter(Boolean).join(" · ")}</p>
      <h3 className="mt-1 text-3xl">{p.name}</h3>
      {p.tags.length > 0 && <p className="mt-2 text-sm text-[#665d70]">{p.tags.join(" · ")}</p>}
    </div>
  );
}
const Section = ({ title, note, children, id }: { title: string; note?: string; children: ReactNode; id?: string }) => (
  <section className="book-section mt-10" data-section={id}><p className={label}>{title}</p>{note && <p className="mt-2 text-sm text-[#665d70]">{note}</p>}{children}</section>
);

/** The family keepsake. Used by the family page and the shared-token page; prints on A4 (see the print rules in globals.css). */
export function WishBookView({ book, snapshotNote }: { book: BookView; snapshotNote?: ReactNode }) {
  return (
    <article data-wishbook className="print-paper mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-gold/30 bg-[#f8f1e4] p-7 text-[#29233d] shadow-2xl sm:p-12">
      <header className="book-cover text-center">
        <p className="mb-10 text-xs uppercase tracking-[.22em] text-[#75629c]">A Genie keepsake</p>
        {book.title && <h2 className="text-6xl leading-none sm:text-7xl">{book.title}</h2>}
        {book.tagline && <p className="mx-auto mt-5 max-w-md text-lg text-[#665d70]">{book.tagline}</p>}
        {book.personLine && <p className="mt-6 text-sm tracking-wide text-[#75629c]">{book.personLine}</p>}
        {book.themes.length > 0 && <ul aria-label="Themes" className="mt-6 flex flex-wrap justify-center gap-2">{book.themes.map(t => <li key={t} className="rounded-full border border-[#d7c9b1] px-3 py-1 text-sm text-[#665d70]">{t}</li>)}</ul>}
        <div className="gold-rule mt-12" />
      </header>

      {book.voices.length > 0 && (
        <Section id="voices" title="In their family's words">
          <div className="mt-6 space-y-10">{book.voices.map((v, i) => (
            <div key={i} className="book-keep" data-voice={v.from}>
              <p className="font-serif text-2xl text-[#75629c]">{v.from} remembers</p>
              <dl className="mt-3 space-y-5">{v.answers.map(a => (
                <div key={a.key} data-answer={a.key}><dt className="text-xs uppercase tracking-wider text-[#75629c]">{a.label}</dt><dd className="mt-1 border-l-2 border-[#b7a078] pl-5 font-serif text-3xl leading-snug sm:text-4xl">{a.text}</dd></div>
              ))}</dl>
            </div>))}</div>
        </Section>)}

      {book.family.length > 0 && <Section id="family" title="Their world" note="What the family told us, or how they reacted."><div className="mt-4 grid gap-3 sm:grid-cols-2">{book.family.map((p, i) => <Tile key={i} p={p} />)}</div></Section>}
      {book.guesses.length > 0 && <Section id="guesses" title="Maybe, from their era and region" note="These are guesses, not memories. The family decides what fits."><div className="mt-4 grid gap-3 sm:grid-cols-2">{book.guesses.map((p, i) => <Tile key={i} p={p} guess />)}</div></Section>}
      {book.other.length > 0 && <Section id="other" title="From the story so far"><div className="mt-4 grid gap-3 sm:grid-cols-2">{book.other.map((p, i) => <Tile key={i} p={p} />)}</div></Section>}

      {book.learned.length > 0 && <Section id="learned" title="Things we learned"><ul className="mt-3 space-y-2 text-xl">{book.learned.map((x, i) => <li key={i}>✦ {x}</li>)}</ul></Section>}

      {book.wishes.length > 0 && (
        <Section id="wishes" title="Wishes">
          <div className="mt-4 space-y-6">{book.wishes.map((w, i) => (
            <div key={i} className="book-keep" data-wish-guess={w.guess ? "1" : undefined}>
              <h3 className="text-3xl">{w.title}</h3>
              {w.description && <p className="mt-1 text-[#665d70]">{w.description}</p>}
              <p className="mt-2 text-xs uppercase tracking-wider text-[#75629c]">{w.mode === "in-person" ? "In person" : w.mode ? "From anywhere" : ""}</p>
              {w.guess && <p className="mt-1 text-sm text-[#665d70]">A guess. The family decides.</p>}
              {w.makers.length > 0 && <ul aria-label="Wish Makers" className="mt-2 space-y-1 text-sm text-[#665d70]">{w.makers.map((m, j) => <li key={j}>{m.name}{m.type ? `, ${m.type}` : ""}{m.sample ? " (Sample)" : ""}{m.status ? ` · ${STATUS_LABEL[normStatus(m.status)]}` : ""}</li>)}</ul>}
            </div>))}</div>
        </Section>)}

      {book.notice && <footer className="book-section mt-10 border-t border-[#d7c9b1] pt-6 text-sm text-[#665d70]">{book.notice}</footer>}
      <p className="mt-6 text-center text-xs text-[#75629c]">{book.generatedAt ? `Compiled on ${when(book.generatedAt)}. ` : ""}A saved snapshot, so later changes appear after the book is refreshed.</p>
      {snapshotNote}
    </article>
  );
}
