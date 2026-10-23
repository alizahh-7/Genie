"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { agentLog, api, compileBook, getPerson, getPortrait, getWishes, matchWish, personPath } from "@/lib/api";
import { ApiError, COMPARE_NOT_GENERATED, PERSON_EXPIRED_CODE, WISH_BOOK_NOT_COMPILED } from "@/lib/errors";
import { deriveCounters, isDiscoveryKind, latestAgentLog, qlooTagNames } from "@/lib/qloo";
import { countWord, LAST_STEP, STORY_STEPS, stepTitle, toldItems, toldPhrase } from "@/lib/story";
import { seconds } from "@/lib/format";
import { useNotices } from "@/lib/useNotices";
import type { AgentLog, Person, PortraitItem, Wish } from "@/lib/types";
import { Btn, Card, ErrorBox } from "@/components/ui";
import { PortraitCard, WishCard } from "@/components/story";
import { QlooBadge, QlooEvidenceStrip, QlooLegend, QlooToggle } from "@/components/QlooLayer";
import { CompareView, type Comparison } from "@/components/CompareView";
import { MakerSummary } from "@/components/MakerSummary";
import { WishBookPreview, type BookContent } from "@/components/WishBookPreview";
import type { MakerLike } from "@/lib/makers";

interface StoryData { person: Person; items: PortraitItem[]; wishes: Wish[]; log: AgentLog | null }
type Lazy<T> = { status: "idle" | "loading" | "ok" | "missing" | "error"; data?: T; error?: string };
type Maker = MakerLike & { maker_id: string; name: string };

/** Fetches once, the first time `active` becomes true. Back/Next never refetch; failures can be retried. */
function useLazy<T>(active: boolean, load: () => Promise<T>) {
  const [st, setSt] = useState<Lazy<T>>({ status: "idle" });
  const loadRef = useRef(load); loadRef.current = load;
  const run = useCallback(async () => {
    setSt({ status: "loading" });
    try { setSt({ status: "ok", data: await loadRef.current() }); }
    catch (e) { setSt(e instanceof ApiError && e.status === 404 ? { status: "missing", error: e.friendly } : { status: "error", error: e instanceof Error ? e.message : "Something went wrong. Please try again." }); }
  }, []);
  useEffect(() => { if (active && st.status === "idle") void run(); }, [active, st.status, run]);
  return { ...st, reload: run, set: (data: T) => setSt({ status: "ok", data }) };
}

const Wait = ({ text }: { text: string }) => <Card><p role="status" className="text-ivory/70">{text}</p></Card>;
const Heading = ({ n, name, sub }: { n: number; name: string; sub?: string }) => (
  <header className="mb-7">
    <p className="text-sm uppercase tracking-[.22em] text-gold">Step {n} of {LAST_STEP}</p>
    <h2 tabIndex={-1} data-step-heading className="mt-2 text-4xl outline-none sm:text-6xl">{stepTitle(n, name)}</h2>
    {sub && <p className="mt-3 max-w-2xl text-lg text-ivory/75">{sub}</p>}
  </header>
);

/* ---------- steps ---------- */

function StepMeet({ d }: { d: StoryData }) {
  const told = toldItems(d.items); const phrase = toldPhrase(d.items);
  const facts = [d.person.birth_year && `Born ${d.person.birth_year}`, d.person.region].filter(Boolean).join(", ");
  return <>
    <Heading n={1} name={d.person.first_name} />
    <div className="warm-glow rounded-3xl p-6 sm:p-9">
      <p className="font-serif text-4xl sm:text-5xl">{d.person.first_name}.{facts && <span className="text-ivory/70"> {facts}.</span>}</p>
      {told.length > 0 && phrase
        ? <><p className="mt-5 text-xl text-ivory/85">{d.person.first_name}&apos;s family gave Genie {countWord(told.length)} {told.length === 1 ? "thing" : "things"}: {phrase}.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">{told.map(t => <li key={t.id} className="rounded-2xl border border-gold/30 bg-ivory/5 p-4"><p className="text-xs uppercase tracking-wider text-gold">{t.domain}</p><p className="mt-1 text-2xl">{t.name}</p></li>)}</ul></>
        : <p className="mt-5 text-lg text-ivory/75">Genie has not been told anything about {d.person.first_name} yet.</p>}
      <p className="mt-6 text-sm text-ivory/55">{d.person.first_name} is a fictional demo person. Nothing here is a real person&apos;s story.</p>
    </div>
  </>;
}

function StepReplay({ d, counters }: { d: StoryData; counters: ReturnType<typeof deriveCounters> }) {
  const steps = d.log?.steps ?? [];
  return <>
    <Heading n={2} name={d.person.first_name} sub="A replay of what Genie did." />
    <p className="mb-5 text-sm text-ivory/55">These are the steps saved from Genie&apos;s real run, shown in order. Nothing is running now.</p>
    <div className="mb-6"><QlooEvidenceStrip counters={counters} /></div>
    {steps.length === 0 ? <Card><p>No steps have been recorded for this story yet.</p></Card> : <>
      {d.log?.timings?.total_ms != null && <p className="mb-4 text-sm text-ivory/60">The run took {seconds(d.log.timings.total_ms)} in all.</p>}
      <ol className="relative space-y-4 border-l border-gold/30 pl-6">{steps.map((s, i) => (
        <li key={`${s.id}-${i}`} className="relative">
          <span aria-hidden="true" className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-gold shadow-[0_0_12px_rgba(244,201,112,.6)]" />
          <p className="text-xl font-medium">{s.title} <QlooBadge show={typeof s.qloo_calls === "number" && s.qloo_calls > 0} title="This step made Qloo calls" /></p>
          {s.summary && <p className="text-ivory/80">{s.summary}</p>}
          {typeof s.qloo_calls === "number" && <p className="text-sm text-ivory/55">Qloo calls: {s.qloo_calls}</p>}
        </li>))}
      </ol></>}
  </>;
}

function StepPortrait({ d, counters }: { d: StoryData; counters: ReturnType<typeof deriveCounters> }) {
  const told = d.items.filter(i => i.source_label === "told").length;
  const guesses = d.items.filter(i => i.source_label === "likely" || i.source_label === "ai-only").length;
  return <>
    <Heading n={3} name={d.person.first_name} sub={d.items.length ? `${told} told by the family${guesses ? `, ${guesses} gentle ${guesses === 1 ? "guess" : "guesses"}` : ""}. Every item keeps its honest label.` : undefined} />
    <div className="mb-6 space-y-4"><QlooEvidenceStrip counters={counters} /><QlooLegend /></div>
    {d.items.length === 0 ? <Card><p>No portrait yet for this story.</p></Card>
      : <div className="grid gap-5 sm:grid-cols-2">{d.items.map((it, i) => <PortraitCard key={it.id} item={it} i={i} />)}</div>}
  </>;
}

/** Two featured wishes. If the person has a backend discovery that isn't among the first two, it takes the second slot. */
export function featuredWishes(wishes: readonly Wish[]): Wish[] {
  const first = wishes.slice(0, 2);
  const disc = wishes.find(isDiscoveryKind);
  if (disc && first.length === 2 && !first.includes(disc)) return [first[0], disc];
  return first;
}

function StepWishes({ d, known }: { d: StoryData; known: ReadonlySet<string> }) {
  const feat = featuredWishes(d.wishes);
  return <>
    <Heading n={4} name={d.person.first_name} />
    {feat.length === 0 ? <Card><p>No wishes yet for this story.</p></Card> : <div className="grid gap-5 md:grid-cols-2">{feat.map((w, i) => <WishCard key={w.id} wish={w} i={i} known={known} />)}</div>}
    <div className="mt-6"><Btn quiet href={`/person/${d.person.id}/wishes`}>{d.wishes.length > feat.length ? `See all ${d.wishes.length} wishes` : "See all wishes"}</Btn></div>
  </>;
}

function StepCompare({ d, active }: { d: StoryData; active: boolean }) {
  const path = personPath(d.person.id, "compare");
  const cmp = useLazy<Comparison>(active, () => api<Comparison>(path, { notFound: { message: COMPARE_NOT_GENERATED } }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async () => { setBusy(true); setErr(""); try { cmp.set(await api<Comparison>(path, { method: "POST", timeout: 90000 })); } catch (e) { setErr(e instanceof Error ? e.message : "Could not run the comparison."); } finally { setBusy(false); } };
  return <>
    <Heading n={5} name={d.person.first_name} sub="Both were given the same family facts." />
    {cmp.status === "loading" || cmp.status === "idle" ? <Wait text="Loading the comparison…" />
      : cmp.status === "ok" && cmp.data ? <CompareView data={cmp.data} items={d.items} />
      : cmp.status === "missing" ? <Card><p>{cmp.error ?? COMPARE_NOT_GENERATED}</p><p className="mb-4 mt-2 text-sm text-ivory/70">Run one now to see a general AI and Genie side by side.</p><Btn onClick={run} disabled={busy}>{busy ? "Working…" : "Run a comparison"}</Btn>{err && <p className="mt-3 text-sm">{err}</p>}</Card>
      : <ErrorBox message={cmp.error ?? "Something went wrong."} onRetry={cmp.reload} />}
    <p className="mt-6 text-sm"><Link className="underline" href={`/person/${d.person.id}/compare`}>Open the full comparison page</Link></p>
  </>;
}

type MakerResult = { matches: Maker[]; message: string } | null;
function StepMaker({ d, res, setRes }: { d: StoryData; res: MakerResult; setRes: (r: MakerResult) => void }) {
  const notices = useNotices();
  const wish = featuredWishes(d.wishes)[0];
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const find = async () => {
    if (!wish) return; setBusy(true); setError("");
    try { const r = (await matchWish(d.person.id, wish.id)) as { matches?: Maker[]; message?: string } | undefined; setRes({ matches: Array.isArray(r?.matches) ? r!.matches! : [], message: r?.message ?? "" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not look for Wish Makers."); } finally { setBusy(false); }
  };
  return <>
    <Heading n={6} name={d.person.first_name} sub={wish ? undefined : "Wishes come first, then the people who can make them happen."} />
    {!wish ? <Card><p>There are no wishes to match yet.</p><div className="mt-4"><Btn quiet href={`/person/${d.person.id}/wishes`}>Find Wish Makers</Btn></div></Card> : <>
      <Card className="mb-5"><p className="text-xs uppercase tracking-wider text-gold">The wish</p><p className="mt-1 text-3xl font-serif">{wish.title}</p>{wish.maker_type && <p className="mt-1 text-sm text-ivory/65">Looking for: {wish.maker_type.replace(/[_-]+/g, " ")}</p>}</Card>
      {!res && <Btn onClick={find} disabled={busy}>{busy ? "Looking…" : "Find a Wish Maker"}</Btn>}
      {error && <ErrorBox message={error} onRetry={find} />}
      {res && (res.matches.length === 0
        ? <Card><p>{res.message || "No Wish Maker has matched this wish yet."}</p><div className="mt-4"><Btn quiet href={`/person/${d.person.id}/wishes`}>Look for makers on the wishes page</Btn></div></Card>
        : <div className="space-y-4">{res.matches.slice(0, 2).map(m => <Card key={m.maker_id}><MakerSummary m={m} notices={notices} /><Btn quiet href={`/person/${d.person.id}/wishes`}>Ask this Wish Maker</Btn></Card>)}
          <p className="text-sm text-ivory/60">Asking happens on the wishes page, where nothing is sent until you choose to.</p></div>)}
    </>}
  </>;
}

function StepKeepsake({ d, active }: { d: StoryData; active: boolean }) {
  const path = personPath(d.person.id, "wish-book");
  const book = useLazy<{ content?: BookContent }>(active, () => api(path, { notFound: { message: WISH_BOOK_NOT_COMPILED } }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const make = async () => { setBusy(true); setErr(""); try { await compileBook(d.person.id); await book.reload(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not make the book."); } finally { setBusy(false); } };
  return <>
    <Heading n={7} name={d.person.first_name} sub="Told memories and guesses stay apart, so the family always knows which is which." />
    {book.status === "loading" || book.status === "idle" ? <Wait text="Opening the Wish Book…" />
      : book.status === "ok" && book.data?.content ? <WishBookPreview content={book.data.content} />
      : book.status === "ok" || book.status === "missing" ? <Card><p>{WISH_BOOK_NOT_COMPILED}</p><div className="mt-4"><Btn onClick={make} disabled={busy}>{busy ? "Working…" : "Make the Wish Book"}</Btn></div>{err && <p className="mt-3 text-sm">{err}</p>}</Card>
      : <ErrorBox message={book.error ?? "Something went wrong."} onRetry={book.reload} />}
    <div className="mt-6"><Btn quiet href={`/person/${d.person.id}/wish-book`}>Open the full Wish Book</Btn></div>
  </>;
}

function StepYours({ d }: { d: StoryData }) {
  return <>
    <header className="py-6 text-center">
      <p className="text-sm uppercase tracking-[.22em] text-gold">Step {LAST_STEP} of {LAST_STEP}</p>
      <h2 tabIndex={-1} data-step-heading className="mt-3 text-5xl outline-none sm:text-7xl">{stepTitle(LAST_STEP, d.person.first_name)}</h2>
      <p className="mx-auto mt-5 max-w-xl text-xl text-ivory/80">{d.person.first_name} was a fictional guide. Tell Genie about someone you love, and see what it learns.</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3"><Btn href="/start">Start for someone I love</Btn><Btn quiet href={`/person/${d.person.id}`}>See everything</Btn></div>
      <p className="mt-6 text-sm text-ivory/55">No account needed. Delete everything at any time.</p>
    </header>
  </>;
}

/* ---------- shell ---------- */

export function DemoStory({ personId, step, hrefFor }: { personId: string; step: number; hrefFor: (n: number) => string }) {
  const router = useRouter();
  const [data, setData] = useState<StoryData | null>(null);
  const [maker, setMaker] = useState<MakerResult>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const personReq = getPerson(personId);
      const rest = Promise.all([getPortrait(personId), getWishes(personId), agentLog(personId).catch(() => [])]);
      rest.catch(() => {});
      const person = await personReq; const [pr, w, l] = await rest;
      setData({ person, items: pr.items ?? [], wishes: w ?? [], log: latestAgentLog(l) });
    } catch (e) { setError({ message: e instanceof Error ? e.message : "Something went wrong.", expired: e instanceof ApiError && e.code === PERSON_EXPIRED_CODE }); }
  }, [personId]);
  useEffect(() => { setData(null); setMaker(null); void load(); }, [load]);
  const counters = useMemo(() => deriveCounters({ log: data?.log, items: data?.items, wishes: data?.wishes }), [data]);
  const known = useMemo(() => qlooTagNames(data?.items), [data]);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!data) return; top.current?.scrollIntoView({ block: "start" }); top.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true }); }, [step, data]);

  if (error) return error.expired
    ? <div className="py-24 text-center"><h1 className="text-5xl">This demo has expired.</h1><p className="mb-8 mt-4 text-ivory/70">Demo stories are kept for a short time. Begin a fresh one any time.</p><Btn href="/demo">Start the demo again</Btn></div>
    : <ErrorBox message={error.message} onRetry={load} />;
  if (!data) return <div className="py-24 text-center"><p role="status" className="text-xl text-ivory/70">Opening {`their`} story…</p></div>;

  const name = data.person.first_name;
  return (
    <div ref={top} className="py-6" data-story-step={step}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <QlooToggle />
        <Link href={`/person/${data.person.id}`} className="text-sm underline decoration-ivory/40 underline-offset-4 hover:text-gold">See everything</Link>
      </div>
      <div className="mb-8" aria-label="Progress">
        <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm text-ivory/70"><span data-progress-text className="font-medium text-ivory">Step {step} of {LAST_STEP}</span><span className="hidden sm:inline">{STORY_STEPS.map(s => s.short).join(" · ")}</span></p>
        <div role="progressbar" aria-valuemin={1} aria-valuemax={LAST_STEP} aria-valuenow={step} aria-label={`Step ${step} of ${LAST_STEP}`} className="h-1.5 overflow-hidden rounded-full bg-ivory/15"><div className="h-full rounded-full bg-gold transition-all duration-700" style={{ width: `${(step / LAST_STEP) * 100}%` }} /></div>
      </div>
      <section aria-live="polite" className="min-h-[50vh]">
        {step === 1 && <StepMeet d={data} />}
        {step === 2 && <StepReplay d={data} counters={counters} />}
        {step === 3 && <StepPortrait d={data} counters={counters} />}
        {step === 4 && <StepWishes d={data} known={known} />}
        {step === 5 && <StepCompare d={data} active={step >= 5} />}
        {step === 6 && <StepMaker d={data} res={maker} setRes={setMaker} />}
        {step === 7 && <StepKeepsake d={data} active={step >= 7} />}
        {step === 8 && <StepYours d={data} />}
      </section>
      <nav aria-label="Story navigation" className="mt-10 flex items-center justify-between gap-3 border-t border-ivory/15 pt-6">
        {step > 1 ? <Btn quiet onClick={() => router.push(hrefFor(step - 1), { scroll: false })}>Back</Btn> : <span />}
        <span className="text-sm text-ivory/60">{name}&apos;s story</span>
        {step < LAST_STEP ? <Btn onClick={() => router.push(hrefFor(step + 1), { scroll: false })}>Next</Btn> : <span />}
      </nav>
    </div>
  );
}
