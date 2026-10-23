"use client";
import { CleanData, hasData } from "@/components/CleanData";
import { QlooBadge, TagChip, useGlow } from "@/components/QlooLayer";
import { QlooCallList } from "@/components/story";
import { Card } from "@/components/ui";
import { genericLimits, normalizeWishes, readEvidence, scoreMetrics, type CmpWish, type ScoreMetric } from "@/lib/compareModel";
import { modeNote } from "@/lib/format";
import { qlooTagNames } from "@/lib/qloo";
import type { PortraitItem } from "@/lib/types";

export type Comparison = {
  generic?: { available?: boolean; wishes?: unknown[]; message?: string };
  genie?: { wishes?: unknown[]; qloo_log?: unknown[] };
  evidence?: unknown;
  note?: string;
};

function Metric({ m }: { m: ScoreMetric }) {
  const pct = m.of && m.of > 0 ? Math.min(100, Math.round((m.value / m.of) * 100)) : null;
  return (
    <div data-metric={m.key} className="rounded-2xl border border-gold/30 bg-gradient-to-b from-gold/10 to-transparent p-5">
      <p className="font-serif text-5xl leading-none text-gold sm:text-6xl">{m.value}{m.of !== undefined && <span className="ml-1 text-2xl text-ivory/60 sm:text-3xl"> of {m.of}</span>}</p>
      <p className="mt-3 font-medium">{m.label}</p>
      <p className="mt-1 text-sm text-ivory/60">{m.caption}</p>
      {pct !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ivory/15" aria-hidden="true"><div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

function Provenance({ w }: { w: CmpWish }) {
  if (w.provenance === "told") return <span className="rounded-full bg-sage/25 px-3 py-0.5 text-sm text-sagedeep">Told by family</span>;
  if (w.provenance === "guess") return <span className="rounded-full bg-sand/20 px-3 py-0.5 text-sm text-ivory/80">A guess</span>;
  return null;
}

function GenericCard({ w }: { w: CmpWish }) {
  return (
    <article className="muted-card rounded-2xl p-5 text-ivory/80">
      {w.title && <h3 className="text-2xl text-ivory/85">{w.title}</h3>}
      {w.description && <p className={w.title ? "mt-2" : ""}>{w.description}</p>}
    </article>
  );
}

function GenieCard({ w }: { w: CmpWish }) {
  const glow = useGlow(w.qlooDiscovery);
  const anyQloo = w.tags.some(t => t.qloo);
  return (
    <article data-discovery={w.discovery ? "1" : undefined} data-qloo-derived={w.qlooDiscovery ? "1" : undefined}
      className={`rise rounded-2xl p-5 text-ivory ${w.discovery ? "border border-dashed border-gold/70 bg-gradient-to-br from-gold/15 via-transparent to-violet-400/10" : "border border-gold/25 bg-ivory/[.06]"} ${glow}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {w.discovery && <span className="rounded-full border border-gold/60 bg-gold/15 px-3 py-0.5 text-sm text-gold">✦ A discovery</span>}
        <QlooBadge show={w.qlooDiscovery} label="Qloo discovery" title="A discovery backed by Qloo taste evidence" />
        <Provenance w={w} />
      </div>
      {w.title && <h3 className="text-2xl sm:text-3xl">{w.title}</h3>}
      {w.description && <p className={w.title ? "mt-2" : ""}>{w.description}</p>}
      {w.why && <p className="mt-3 border-l-2 border-gold/60 pl-4 text-ivory/80">{w.why}</p>}
      {w.discovery && <p className="mt-3 text-sm text-ivory/60">A guess. The family decides.</p>}
      {(w.tags.length > 0 || w.makerType || w.mode) && (
        <div className="mt-4 space-y-2">
          {w.tags.length > 0 && <div className="flex flex-wrap gap-2" aria-label={anyQloo ? "Taste tags" : "Tags"}>{w.tags.map(t => <TagChip key={t.name} name={t.name} qloo={t.qloo} />)}</div>}
          {(w.makerType || w.mode) && <p className="text-sm text-ivory/65">{[w.makerType && `Maker: ${w.makerType}`, w.mode && modeNote(w.mode)].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
    </article>
  );
}

/** The redesigned comparison body: scoreboard, two columns, note and call log. Everything shown comes from the response. */
export function CompareView({ data, items }: { data: Comparison; items?: readonly PortraitItem[] | null }) {
  const known = qlooTagNames(items);
  const generic = data.generic;
  const genericWishes = normalizeWishes(generic?.wishes);
  const genieWishes = normalizeWishes(data.genie?.wishes, known);
  const metrics = scoreMetrics(readEvidence(data.evidence));
  const limits = genericLimits(genericWishes);
  const logRows = Array.isArray(data.genie?.qloo_log) ? data.genie?.qloo_log : [];
  return (
    <div className="space-y-8">
      {metrics.length > 0 && (
        <section aria-label="Evidence scoreboard" data-scoreboard className="warm-glow rounded-3xl p-5 sm:p-7">
          <p className="mb-4 text-xs uppercase tracking-[.2em] text-gold">The evidence</p>
          <div className={`grid gap-4 ${metrics.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : metrics.length === 3 ? "sm:grid-cols-3" : metrics.length === 2 ? "sm:grid-cols-2" : ""}`}>{metrics.map(m => <Metric key={m.key} m={m} />)}</div>
        </section>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="cmp-generic" className="muted-card rounded-3xl p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[.2em] text-ivory/50">Without taste evidence</p>
          <h2 id="cmp-generic" className="mb-4 mt-1 text-3xl text-ivory/85">A general AI</h2>
          {generic?.available === false
            ? <p>{generic.message?.trim() || "A general AI comparison isn't available for this story."}</p>
            : genericWishes.length > 0 ? <>
              <div className="space-y-3">{genericWishes.map((w, i) => <GenericCard key={i} w={w} />)}</div>
              {limits.length > 0 && <ul className="mt-4 space-y-1 text-sm text-ivory/60" aria-label="What these suggestions lack">{limits.map(l => <li key={l} className="flex gap-2"><span aria-hidden="true">–</span>{l}</li>)}</ul>}
            </> : hasData(generic?.wishes) ? <CleanData value={generic?.wishes} /> : <p className="text-ivory/60">No suggestions to show.</p>}
        </section>
        <section aria-labelledby="cmp-genie" className="warm-glow rounded-3xl p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[.2em] text-gold">With taste evidence</p>
          <h2 id="cmp-genie" className="mb-4 mt-1 text-3xl">Genie, using Qloo</h2>
          {genieWishes.length > 0 ? <div className="space-y-3">{genieWishes.map((w, i) => <GenieCard key={i} w={w} />)}</div>
            : hasData(data.genie?.wishes) ? <CleanData value={data.genie?.wishes} /> : <p className="text-ivory/60">No suggestions to show.</p>}
        </section>
      </div>
      {data.note?.trim() && <Card className="text-lg"><p>{data.note}</p></Card>}
      {(logRows?.length ?? 0) > 0 && <details><summary className="cursor-pointer">Qloo call log</summary><div className="mt-3"><QlooCallList rows={logRows} /></div></details>}
    </div>
  );
}
