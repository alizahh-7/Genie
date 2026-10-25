"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell, Card, Btn, Gathering, ErrorBox, Disclosure } from "@/components/ui";
import FavouriteEditor from "@/components/FavouriteEditor";
import { PortraitCard, WishCard, WhatGenieDid, QlooCalls } from "@/components/story";
import { QlooPanel } from "@/components/QlooLayer";
import { deriveCounters, qlooTagNames } from "@/lib/qloo";
import { agentLog, agentRun, deletePerson, getPerson, getPortrait, getWishes } from "@/lib/api";
import { useTask } from "@/lib/useTask";
import { recompileQuietly } from "@/lib/bookSync";
import { PERSON_EXPIRED_CODE } from "@/lib/errors";
import type { AgentLog, Fav, Person, PortraitItem, Wish } from "@/lib/types";
export default function PersonPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const t = useTask();
  const [person, setPerson] = useState<Person | null>(null); const [items, setItems] = useState<PortraitItem[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]); const [log, setLog] = useState<AgentLog | null>(null);
  const [editing, setEditing] = useState(false); const [favs, setFavs] = useState<Fav[]>([]); const [copied, setCopied] = useState(false);
  const fetchAll = useCallback(async () => {
    // Look the person up first and let its failure win: only GET /persons/{id} returning 404 means "expired".
    const personReq = getPerson(id);
    const rest = Promise.all([getPortrait(id), getWishes(id), agentLog(id).catch(() => [])]);
    rest.catch(() => {}); // avoids an unhandled rejection when the person lookup fails first
    const p = await personReq;
    const [pr, w, l] = await rest;
    setPerson(p); setItems(pr.items ?? []); setWishes(w ?? []);
    const row = [...l].reverse().find(x => x.step === "agent"); setLog(row ? row.log : null);
  }, [id]);
  const load = useCallback(() => t.run(fetchAll), [t.run, fetchAll]);
  const counters = useMemo(() => deriveCounters({ log, items, wishes }), [log, items, wishes]);
  const known = useMemo(() => qlooTagNames(items), [items]);
  useEffect(() => { load(); }, [load]);
  const openEditor = () => { setFavs(items.filter(i => i.source_label === "told" || i.source_label === "reacted").map(i => ({ domain: i.domain, name: i.name }))); setEditing(true); };
  const rerun = () => t.run(async () => { await agentRun(id, favs); await fetchAll(); setEditing(false); void recompileQuietly(id); });
  const remove = async () => {
    if (!confirm("Delete everything? This removes the portrait, wishes, Wish Circle answers, matches, and Wish Book, and cannot be undone.")) return;
    const ok = await t.run(() => deletePerson(id).then(() => true)); if (ok) router.push("/");
  };
  const copy = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 3000); } catch {} };
  if (!person) return (
    <Shell>
      {t.busy || (!t.error) ? <Gathering slow={t.slow} title="Opening their story…" /> : t.code === PERSON_EXPIRED_CODE
        ? <div className="py-24 text-center"><h1 className="text-5xl">This page has expired or was deleted.</h1><p className="mb-8 mt-4 text-navy/70">Nothing more is kept. You are welcome to begin again.</p><div className="flex flex-wrap justify-center gap-3"><Btn href="/start">Start a new story</Btn><Btn quiet href="/">Back to the start</Btn></div></div>
        : <ErrorBox message={t.error} onRetry={load} />}
    </Shell>
  );
  return (
    <Shell>
      {t.busy && <Gathering slow={t.slow} />}
      <header className="rise pb-10 pt-6">
        <p className="text-base text-sagedeep">Who they were, through what they loved</p>
        <h1 className="mt-2 text-6xl sm:text-7xl">{person.first_name}</h1>
        <p className="mt-3 text-navy/70">{[person.birth_year && `Born ${person.birth_year}`, person.region, `Kept until ${new Date(person.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`].filter(Boolean).join(", ")}</p>
      </header>
      {t.error && <ErrorBox message={t.error} />}
      <nav aria-label="Their story" className="mb-9 flex flex-wrap gap-2 text-sm">{[
        ["Wishes & makers","wishes"],["Invite family","circle"],["Reaction mode","reaction"],["Bedside kit","bedside-kit"],["Compare","compare"],["Taste Map","taste-map"],["Wish Book","wish-book"]
      ].map(([label,path]) => <Btn key={path} quiet href={`/person/${id}/${path}`}>{label}</Btn>)}</nav>
      <section aria-labelledby="portrait">
        <h2 id="portrait" className="mb-5 text-4xl">Taste Portrait</h2>
        <QlooPanel counters={counters} />
        {items.length === 0 ? <Card><p>No portrait yet. Add a song, a dish or a place they loved, and Genie will begin.</p></Card>
          : <div className="grid gap-5 sm:grid-cols-2">{items.map((it, i) => <PortraitCard key={it.id} item={it} i={i} />)}</div>}
      </section>
      <section aria-labelledby="wishes" className="mt-14">
        <h2 id="wishes" className="mb-5 text-4xl">Wishes</h2>
        {wishes.length === 0 ? <Card><p>Wishes appear once there is a portrait to learn from.</p></Card>
          : <div className="grid gap-5">{wishes.map((w, i) => <WishCard key={w.id} wish={w} i={i} known={known} />)}</div>}
      </section>
      <section className="mt-14">
        <Disclosure title="What Genie did" hint="The steps, in order"><WhatGenieDid log={log} /></Disclosure>
        <Disclosure title="Qloo calls" hint="Every lookup made for this story"><QlooCalls log={log} /></Disclosure>
      </section>
      {editing && <Card className="mt-8"><h2 className="mb-4 text-3xl">Add what they loved</h2><FavouriteEditor items={favs} onChange={setFavs} />
        <div className="mt-5 flex gap-3"><Btn onClick={rerun} disabled={t.busy}>Gather their story again</Btn><Btn quiet onClick={() => setEditing(false)}>Cancel</Btn></div></Card>}
      <div className="mt-10 flex flex-wrap gap-3">
        {!editing && <Btn onClick={openEditor}>Add a favourite</Btn>}
        <Btn quiet onClick={copy}>{copied ? "Link copied" : "Copy my private page link"}</Btn>
        <Btn quiet onClick={remove}>Delete everything</Btn>
      </div>
      <p className="mt-4 max-w-xl text-sm text-navy/60">Anyone with this page link can see this page. There are no accounts, so please share it only with people you trust.</p>
    </Shell>
  );
}
