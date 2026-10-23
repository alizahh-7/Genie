"use client";
import { useState } from "react";
import { Card } from "./ui";
import { confidenceWord, isNotInQloo, matchedVia, modeNote, seconds, shownTags, sourceLabel } from "@/lib/format";
import { qlooRowDisplay } from "@/lib/qlooLog";
import { isDiscoveryKind, isQlooDiscovery, isQlooResolved, isQlooTag } from "@/lib/qloo";
import { QlooBadge, TagChip, useGlow } from "@/components/QlooLayer";
import type { AgentLog, PortraitItem, Wish } from "@/lib/types";
const chip = (s: string) => (s === "told" ? "bg-sage/25 text-sagedeep" : s === "reacted" ? "bg-navy/10 text-navy" : "bg-sand text-navy/80");
export function PortraitCard({ item, i }: { item: PortraitItem; i: number }) {
  const tags = shownTags(item); const via = matchedVia(item); const resolved = isQlooResolved(item); const glow = useGlow(resolved);
  return (
    <article data-qloo-derived={resolved ? "1" : undefined} className={`rise rounded-2xl border border-navy/10 bg-paper p-6 ${glow}`} style={{ animationDelay: `${i * 70}ms` }}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-navy/60">{item.domain.charAt(0).toUpperCase() + item.domain.slice(1)}</span>
        <span className={`rounded-full px-3 py-0.5 ${chip(item.source_label)}`}>{sourceLabel(item.source_label)}</span>
        <QlooBadge show={resolved} label="Qloo matched" title="Qloo resolved this item; its taste tags come from Qloo" />
      </div>
      <h3 className="text-3xl">{item.name}</h3>
      {via && <p className="mt-1 text-sm text-navy/60">Matched via {via}</p>}
      {item.source_label === "likely" && <p className="mt-1 text-sm text-navy/60">This one is a guess.</p>}
      <div className="mt-3 flex items-center gap-3 text-sm text-navy/70">
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-navy/10"><span className="block h-full rounded-full bg-sage" style={{ width: `${Math.round(Math.max(0, Math.min(1, item.confidence)) * 100)}%` }} /></span>
        {confidenceWord(item.confidence)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {isNotInQloo(item) ? <span className="text-sm text-navy/60">Not in Qloo</span> : tags.map(t => <TagChip key={t} name={t} qloo={resolved} />)}
      </div>
    </article>
  );
}
export function WishCard({ wish, i, known }: { wish: Wish; i: number; known?: ReadonlySet<string> }) {
  const shown = (wish.tags ?? []).filter(t => t?.name).slice(0, 4);
  const qDiscovery = isQlooDiscovery(wish, known); const glow = useGlow(qDiscovery);
  return (
    <article data-discovery={isDiscoveryKind(wish) ? "1" : undefined} data-qloo-derived={qDiscovery ? "1" : undefined} className={`rise rounded-2xl border border-sagedeep/20 bg-gradient-to-br from-[#28204e] to-[#49385f] text-ivory p-7 ${glow}`} style={{ animationDelay: `${i * 90}ms` }}>
      <p className="mb-2 text-sm text-sagedeep">{modeNote(wish.mode)} <QlooBadge show={qDiscovery} label="Qloo discovery" title="A discovery backed by Qloo taste evidence" /></p>
      <h3 className="text-3xl">{wish.title}</h3>
      <p className="mt-3">{wish.description}</p>
      {wish.why && <p className="mt-3 border-l-2 border-sage pl-4 text-navy/80">{wish.why}</p>}
      {(wish.basis === "likely" || wish.kind === "discovery") && <p className="mt-3 text-sm text-navy/60">A guess. The family decides.</p>}
      {shown.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{shown.map(t => <TagChip key={t.name} name={t.name} qloo={isQlooTag(t, known)} />)}</div>}
    </article>
  );
}
export function WhatGenieDid({ log }: { log: AgentLog | null }) {
  if (!log?.steps?.length) return <p className="text-navy/60">No steps have been recorded for this story yet.</p>;
  return (
    <div>
      {log.timings?.total_ms != null && <p className="mb-4 text-sm text-navy/60">Took {seconds(log.timings.total_ms)} in all.</p>}
      <ol className="space-y-4">{log.steps.map((s, i) => (
        <li key={s.id + i}><p className="font-medium">{s.title} <QlooBadge show={typeof s.qloo_calls === "number" && s.qloo_calls > 0} title="This step made Qloo calls" /></p><p className="text-navy/80">{s.summary}</p>
          {(s.qloo_calls != null || s.cached != null) && <p className="text-sm text-navy/60">{s.qloo_calls != null && `Qloo calls: ${s.qloo_calls}`}{s.qloo_calls != null && s.cached != null && ". "}{s.cached != null && `Remembered: ${String(s.cached)}`}</p>}
        </li>))}
      </ol>
    </div>
  );
}
export function QlooCalls({ log }: { log: AgentLog | null }) {
  return <QlooCallList rows={log?.qloo_log} empty="No Qloo calls were recorded for this story yet." />;
}
/** Friendly one-line descriptions by default; "Show raw log" reveals the original technical entries unchanged. */
export function QlooCallList({ rows, empty }: { rows?: unknown[] | null; empty?: string }) {
  const [raw, setRaw] = useState(false);
  const list = (rows ?? []).map(qlooRowDisplay);
  if (!list.length) return empty ? <p className="text-navy/60">{empty}</p> : null;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" aria-pressed={raw} onClick={() => setRaw(v => !v)} className="rounded-full border border-ivory/35 px-4 py-1.5 text-sm text-ivory hover:border-gold hover:bg-ivory/10">{raw ? "Hide raw log" : "Show raw log"}</button>
      </div>
      <ul className={raw ? "space-y-2 font-mono text-xs" : "space-y-2 text-sm"}>{list.map((r, i) => (
        <li key={i} className="flex flex-wrap justify-between gap-x-4 border-b border-navy/10 pb-2">
          <span className={raw ? "break-all" : ""}>{raw ? r.raw : r.friendly}</span>
          {r.meta && <span className="text-navy/60">{r.meta}</span>}
        </li>))}
      </ul>
    </div>
  );
}
export { Card };
