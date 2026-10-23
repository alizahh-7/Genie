import { filterLearned, groupPortrait, type BookPortraitItem } from "@/lib/wishbook";
import { clean } from "@/lib/labels";

export type BookContent = {
  title?: string; tagline?: string; portrait?: BookPortraitItem[]; learned?: string[];
  wishes?: { title?: string; description?: string; mode?: string; basis?: string | null; kind?: string | null }[];
};

const MAX_TOLD = 4, MAX_LEARNED = 3, MAX_WISHES = 3;

/** A short preview of the compiled Wish Book. Uses the same grouping, tag ranking (max 5) and sentence filter as the full book. */
export function WishBookPreview({ content }: { content: BookContent }) {
  const portrait = groupPortrait(content.portrait);
  const learned = filterLearned(content.learned).slice(0, MAX_LEARNED);
  const wishes = (content.wishes ?? []).filter(w => clean(w?.title)).slice(0, MAX_WISHES);
  return (
    <article data-wishbook-preview className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-gold/30 bg-[#f8f1e4] p-6 text-[#29233d] shadow-2xl sm:p-10">
      <p className="mb-6 text-center text-xs uppercase tracking-[.22em] text-[#75629c]">A Genie keepsake</p>
      {clean(content.title) && <h3 className="text-center text-5xl leading-none sm:text-6xl">{content.title}</h3>}
      {clean(content.tagline) && <p className="mx-auto mt-4 max-w-md text-center text-lg text-[#665d70]">{content.tagline}</p>}
      <div className="gold-rule my-8" />
      {portrait.told.length > 0 && <section><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">Their world</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{portrait.told.slice(0, MAX_TOLD).map((p, i) => <div key={i} className="rounded-2xl border border-[#d7c9b1] p-3"><p className="text-xs uppercase tracking-wider text-[#75629c]">{[p.domain, p.label].filter(Boolean).join(" · ")}</p><p className="mt-1 text-2xl">{p.name}</p>{p.tags.length > 0 && <p className="mt-1 text-sm text-[#665d70]">{p.tags.join(" · ")}</p>}</div>)}</div></section>}
      {portrait.guesses.length > 0 && <p className="mt-5 text-sm text-[#665d70]">Plus {portrait.guesses.length} {portrait.guesses.length === 1 ? "guess" : "guesses"} from their era and region, kept separate from what the family told.</p>}
      {learned.length > 0 && <section className="mt-6"><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">Things we learned</p><ul className="mt-2 space-y-1 text-lg">{learned.map((x, i) => <li key={i}>✦ {x}</li>)}</ul></section>}
      {wishes.length > 0 && <section className="mt-6"><p className="text-sm uppercase tracking-[.16em] text-[#75629c]">Wishes</p><ul className="mt-2 space-y-3">{wishes.map((w, i) => <li key={i}><p className="text-2xl">{w.title}</p>{clean(w.description) && <p className="text-[#665d70]">{w.description}</p>}{(w.basis === "likely" || w.kind === "discovery") && <p className="text-sm text-[#665d70]">A guess. The family decides.</p>}</li>)}</ul></section>}
    </article>
  );
}
