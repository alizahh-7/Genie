"use client";
import type { ReactNode } from "react";
import { QlooBadge, TagChip, useGlow } from "@/components/QlooLayer";
import { humanSourceLabel } from "@/lib/labels";
import type { MapDiscovery, MapFavourite, TasteMapModel } from "@/lib/tasteMap";

const Col = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <section aria-label={title} className="min-w-0">
    <p className="mb-3 text-xs uppercase tracking-[.18em] text-ivory/60"><span aria-hidden="true" className="mr-2 text-gold">0{n}</span>{title}</p>
    <div className="space-y-3">{children}</div>
  </section>
);
const Empty = ({ children }: { children: ReactNode }) => <p data-map-empty className="rounded-2xl border border-dashed border-ivory/20 px-4 py-3 text-sm text-ivory/55">{children}</p>;
const Arrow = () => <div aria-hidden="true" className="text-center text-2xl text-gold/60 lg:hidden">↓</div>;

function FavNode({ f }: { f: MapFavourite }) {
  const glow = useGlow(f.inQloo);
  return (
    <div data-node="favourite" data-qloo={f.inQloo ? "1" : undefined} className={`glass rounded-2xl p-4 ${glow}`}>
      <p className="text-xs uppercase tracking-wider text-ivory/60">{f.domain} · {humanSourceLabel(f.source)}</p>
      <p className="mt-1 font-serif text-2xl">{f.name} <QlooBadge show={f.inQloo} label="In Qloo" title="Found in Qloo" /></p>
      {f.matchedVia && <p className="mt-1 text-sm text-ivory/75">Matched via {f.matchedVia}</p>}
      {!f.inQloo && <p className="mt-1 text-xs text-ivory/50">Not found in Qloo</p>}
    </div>
  );
}
function DiscoveryNode({ d }: { d: MapDiscovery }) {
  const glow = useGlow(d.qloo);
  return (
    <div data-node="discovery" data-qloo={d.qloo ? "1" : undefined} className={`glass rounded-2xl border-dashed p-4 ${glow}`}>
      <p className="text-xs uppercase tracking-wider text-gold">Qloo&apos;s guess</p>
      <p className="mt-1 font-serif text-2xl">{d.discovered} <QlooBadge show={d.qloo} label="Qloo" title="Qloo taste evidence supports this guess" /></p>
      {d.wishTitle && <p className="mt-1 text-sm text-ivory/75">Suggested through the wish “{d.wishTitle}”</p>}
      {d.sharedTags.length > 0 && <p className="mt-1 text-sm text-ivory/75">Shares taste tags: {d.sharedTags.join(", ")}</p>}
    </div>
  );
}

/** Person → Favourites → Strongest taste tags → Discovered item. Missing parts render an honest empty note, never a made-up node. */
export function TasteMap({ model, note }: { model: TasteMapModel; note: string }) {
  return (
    <div data-taste-map>
      <div className="grid gap-5 lg:grid-cols-4">
        <Col n={1} title="Person"><div data-node="person" className="glass rounded-2xl p-4"><p className="font-serif text-3xl">{model.person}</p></div></Col>
        <Col n={2} title="Favourites"><Arrow />{model.missing.favourites ? <Empty>No favourites told by the family yet.</Empty> : model.favourites.map(f => <FavNode key={f.key} f={f} />)}</Col>
        <Col n={3} title="Strongest taste tags"><Arrow />{model.missing.tags ? <Empty>No strongest tags have been recorded yet.</Empty> : (
          <ul className="space-y-2">{model.tags.map(t => <li key={t.name} data-node="tag" className="flex flex-wrap items-center gap-x-2"><TagChip name={t.name} qloo={t.qloo} /><span className="text-xs text-ivory/55">from {t.from.join(", ")}</span></li>)}</ul>)}</Col>
        <Col n={4} title="Discovered item"><Arrow />{model.missing.discoveries ? <Empty>No discovery has been named yet.</Empty> : model.discoveries.map(d => <DiscoveryNode key={d.key} d={d} />)}</Col>
      </div>
      <p className="mt-6 max-w-3xl text-sm text-ivory/65">{note}</p>
    </div>
  );
}
