"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell, Card, Btn, Gathering, ErrorBox } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { DemoStory } from "@/components/DemoStory";
import { compileBook, demoStart, personas } from "@/lib/api";
import { QlooLayerProvider } from "@/lib/qlooLayer";
import { parsePersonParam, parseStep, pickPersona } from "@/lib/story";
import { useTask } from "@/lib/useTask";
import type { Persona } from "@/lib/types";

const storyHref = (id: string, n: number) => `/demo?p=${encodeURIComponent(id)}&step=${n}`;
const variantFor = (p: Persona, i: number): "nani" | "sana" => (p.first_name.trim().toLowerCase() === "sana" ? "sana" : p.first_name.trim().toLowerCase() === "nani" ? "nani" : i % 2 === 0 ? "nani" : "sana");

/** The original dashboard of demo people, kept intact behind "See everything". */
function Dashboard({ list, onOpen, busy }: { list: Persona[]; onOpen: (n: number) => void; busy: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">{list.map((p, i) => (
      <Card key={p.persona} className="rise"><div style={{ animationDelay: `${i * 100}ms` }}>
        <h2 className="text-4xl">{p.first_name}</h2>
        <p className="mb-5 mt-1 text-navy/70">{[p.birth_year && `Born ${p.birth_year}`, p.region, p.language].filter(Boolean).join(", ")}</p>
        <Btn onClick={() => onOpen(p.persona)} disabled={busy}>Open {p.first_name}&apos;s full page</Btn></div>
      </Card>))}
    </div>
  );
}

function DemoInner() {
  const router = useRouter(); const params = useSearchParams();
  const personId = parsePersonParam(params.get("p")); const step = parseStep(params.get("step")); const who = params.get("who"); const all = params.get("view") === "all";
  const t = useTask(); const s = useTask(); const starting = useRef(false);
  const [list, setList] = useState<Persona[] | null>(null);
  const load = useCallback(async () => { const p = await t.run(() => personas()); if (p) setList(p); }, [t.run]);
  useEffect(() => { if (!personId) void load(); }, [personId, load]);
  // One click creates one demo person; the id then lives in the URL, so Next, Back and refresh reuse it.
  const begin = async (n: number) => {
    if (starting.current) return; starting.current = true;
    try { const res = await s.run(async () => { const r = await demoStart(n); await compileBook(r.person_id).catch(() => undefined); return r; }); if (res?.person_id) router.push(storyHref(res.person_id, 1)); } finally { starting.current = false; }
  };
  const openFull = async (n: number) => { const res = await s.run(async () => { const r = await demoStart(n); await compileBook(r.person_id).catch(() => undefined); return r; }); if (res) router.push(`/person/${res.person_id}`); };

  if (personId) return <DemoStory personId={personId} step={step} hrefFor={n => storyHref(personId, n)} />;
  const featured = list ? pickPersona(list, who) : null;
  const others = (list ?? []).filter(p => p !== featured);
  return (
    <>
      {(t.busy && !list) && <Gathering slow={t.slow} title="Waking Genie up…" />}
      {s.busy && <Gathering slow={s.slow} title="Opening their story…" />}
      <header className="rise pb-8 pt-8 text-center">
        <p className="mb-3 text-sm uppercase tracking-[.22em] text-gold">A guided story · 8 short steps</p>
        <h1 className="text-5xl sm:text-7xl">{all ? "Meet someone" : featured ? `Meet ${featured.first_name}` : "Meet someone"}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ivory/75">{all ? "These are fictional people. Open one to see everything Genie made for them." : "A fictional person, and a quick walk through what Genie learns, what Qloo adds, and how a wish becomes something real."}</p>
      </header>
      {t.error && <ErrorBox message={t.error} onRetry={load} />}{s.error && <ErrorBox message={s.error} />}
      {list && list.length === 0 && <p className="text-center text-ivory/60">The demo is not available right now.</p>}
      {list && list.length > 0 && (all ? <Dashboard list={list} onOpen={openFull} busy={s.busy} /> : <>
        {featured && <Card className="warm-glow mx-auto mb-6 flex max-w-2xl flex-col items-center gap-5 text-center sm:flex-row sm:text-left"><Avatar variant={variantFor(featured, 0)} label={`Illustrated avatar for ${featured.first_name}`} /><div className="flex-1"><h2 className="text-4xl">{featured.first_name}</h2><p className="mb-4 mt-1 text-ivory/70">{[featured.birth_year && `Born ${featured.birth_year}`, featured.region, featured.language].filter(Boolean).join(", ")}</p><Btn onClick={() => begin(featured.persona)} disabled={s.busy}>Begin the story</Btn></div></Card>}
        {others.length > 0 && <div className={`mx-auto grid max-w-2xl gap-4 ${featured ? "" : "sm:grid-cols-2 max-w-4xl"}`}>{others.map((p, i) => <Card key={p.persona} className="flex items-center gap-4"><Avatar variant={variantFor(p, i + 1)} label={`Illustrated avatar for ${p.first_name}`} /><div><h2 className="text-3xl">{featured ? `Or meet ${p.first_name}` : p.first_name}</h2><p className="mb-3 text-sm text-ivory/65">{[p.birth_year && `Born ${p.birth_year}`, p.region].filter(Boolean).join(", ")}</p><Btn quiet={!!featured} onClick={() => begin(p.persona)} disabled={s.busy}>{featured ? "Begin" : `Meet ${p.first_name}`}</Btn></div></Card>)}</div>}
      </>)}
      <p className="mt-10 text-center text-sm">{all ? <button className="underline decoration-ivory/40 underline-offset-4 hover:text-gold" onClick={() => router.push("/demo")}>Back to the guided story</button> : <button className="underline decoration-ivory/40 underline-offset-4 hover:text-gold" onClick={() => router.push("/demo?view=all")}>See everything</button>}</p>
    </>
  );
}

export default function Demo() {
  return <QlooLayerProvider><Shell><Suspense fallback={<p role="status" className="py-24 text-center text-ivory/70">Opening the demo…</p>}><DemoInner /></Suspense></Shell></QlooLayerProvider>;
}
