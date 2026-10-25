"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildPortrait, createPerson, generateWishes, matchAll } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { recompileQuietly } from "@/lib/bookSync";
import { buildQuickFacts, failedStage, initialLive, isFinished, runLive, STAGE_ORDER, STAGE_TITLE, type LiveState, type StageId } from "@/lib/liveLearn";
import { Card, Btn, ErrorBox } from "@/components/ui";
import type { Fav } from "@/lib/types";

export const LIVE_KEY = "genie.live.v1";
export interface LiveForm { first_name: string; birth_year?: number; region?: string; language?: string }
const store = {
  save(v: { personId: string; favs: Fav[]; portraitDone?: boolean } | null) { try { if (v) window.sessionStorage.setItem(LIVE_KEY, JSON.stringify(v)); else window.sessionStorage.removeItem(LIVE_KEY); } catch { /* storage unavailable */ } },
  read(): { personId: string; favs: Fav[]; portraitDone?: boolean } | null { try { const v = JSON.parse(window.sessionStorage.getItem(LIVE_KEY) ?? "null"); return v && typeof v.personId === "string" ? v : null; } catch { return null; } },
};
export const readUnfinished = store.read;
export const clearUnfinished = () => store.save(null);

const Dot = ({ s }: { s: string }) => <span aria-hidden="true" className={`mt-1 inline-block h-4 w-4 shrink-0 rounded-full border-2 ${s === "done" ? "border-gold bg-gold" : s === "running" ? "animate-pulse border-gold bg-gold/30" : s === "failed" ? "border-[#ff9b9b] bg-[#ff9b9b]/30" : "border-ivory/30"}`} />;
const WORD: Record<string, string> = { waiting: "Waiting", running: "Running", done: "Completed", failed: "Failed" };

/** Three REAL calls, one after another. A stage turns "Completed" only after its response succeeded. */
export function LiveLearn({ form, favs, resumeId, resumePortraitDone = false }: { form: LiveForm; favs: Fav[]; resumeId?: string | null; resumePortraitDone?: boolean }) {
  const [state, setState] = useState<LiveState>(() => { const s = initialLive(resumeId ?? null); if (resumeId && resumePortraitDone) s.stages.portrait = { status: "done" }; return s; });
  const [running, setRunning] = useState(false);
  const [mk, setMk] = useState<{ busy: boolean; error: string; results: { wish_id: string; count: number; message: string }[] | null }>({ busy: false, error: "", results: null });
  const started = useRef(false); const busy = useRef(false); const latest = useRef(state); const booked = useRef(false);

  const go = useCallback(async () => {
    if (busy.current) return; busy.current = true; setRunning(true);
    try {
      const out = await runLive({
        createPerson: async () => { const p = await createPerson(form); store.save({ personId: p.id, favs }); return p; }, // persisted the moment it exists
        buildPortrait: id => buildPortrait(id, buildQuickFacts(favs)),
        generateWishes: id => generateWishes(id),
        onChange: s => { latest.current = s; setState(s); if (s.personId && s.stages.portrait.status === "done") store.save({ personId: s.personId, favs, portraitDone: true }); },
        errorText: errorDetail,
      }, latest.current);
      if (isFinished(out)) { store.save(null); if (!booked.current) { booked.current = true; void recompileQuietly(out.personId!); } }
    } finally { busy.current = false; setRunning(false); }
  }, [form, favs]);
  useEffect(() => { if (!started.current) { started.current = true; void go(); } }, [go]); // starts once; retries are explicit clicks

  const findMakers = async () => {
    if (!state.personId) return; setMk({ busy: true, error: "", results: null });
    try { const r = await matchAll(state.personId, 5); setMk({ busy: false, error: "", results: (r.results ?? []).map(x => ({ wish_id: x.wish_id, count: Array.isArray(x.matches) ? x.matches.length : 0, message: x.message ?? "" })) }); }
    catch (e) { setMk({ busy: false, error: errorDetail(e), results: null }); }
  };
  const failed = failedStage(state); const finished = isFinished(state);
  const detail = (id: StageId): string[] => {
    if (id === "person" && state.stages.person.status === "done" && state.personId) return ["Their story has been created."];
    if (id === "portrait" && state.portrait) return [`${state.portrait.items} portrait ${state.portrait.items === 1 ? "item" : "items"} · ${state.portrait.lookups} Qloo ${state.portrait.lookups === 1 ? "lookup" : "lookups"}`, ...(state.portrait.summary ? [state.portrait.summary] : [])];
    if (id === "wishes" && state.wishes) return [`${state.wishes.count} ${state.wishes.count === 1 ? "wish" : "wishes"} · ${state.wishes.lookups} Qloo ${state.wishes.lookups === 1 ? "lookup" : "lookups"}`, ...(state.wishes.summary ? [state.wishes.summary] : [])];
    return [];
  };
  return (
    <div data-live-learn>
      <h1 className="rise pt-8 text-5xl">Watching Genie learn</h1>
      <p className="mb-8 mt-3 max-w-xl text-ivory/75">These are live steps, one after another. Each one is marked complete only when Genie has really finished it.</p>
      <ol className="space-y-4" aria-label="Genie's progress">
        {STAGE_ORDER.map(id => { const st = state.stages[id];
          return <li key={id} data-stage={id} data-status={st.status}><Card className="flex gap-4"><Dot s={st.status} />
            <div className="min-w-0 flex-1"><p className="font-serif text-2xl">{STAGE_TITLE[id]} <span className="ml-2 font-sans text-sm text-ivory/60">{WORD[st.status]}<span className="sr-only">.</span></span></p>
              {st.status === "running" && id === "portrait" && <p className="mt-1 text-sm text-ivory/60">Looking each favourite up in Qloo can take several seconds.</p>}
              {detail(id).map((t, i) => <p key={i} className="mt-1 text-ivory/80">{t}</p>)}
              {st.status === "failed" && st.error && <div className="mt-3"><ErrorBox message={st.error} /></div>}
            </div></Card></li>; })}
      </ol>
      {failed && !running && <div className="mt-6 space-y-3"><p className="text-sm text-ivory/70">{state.personId ? "Their story is saved. Trying again continues from the step that stopped, without creating them again." : "Nothing was created yet, so trying again is safe."}</p><div className="flex flex-wrap gap-3"><Btn onClick={() => void go()}>Try again</Btn>{state.personId && <Btn quiet href={`/person/${state.personId}`}>Open what is saved so far</Btn>}</div></div>}
      {finished && state.personId && <div className="mt-8 space-y-5">
        {state.wishes?.followUp && <Card className="border-gold/30"><p>{state.wishes.followUp}</p><p className="mt-2 text-sm text-ivory/60">Optional. You can add it on their page.</p></Card>}
        <div className="flex flex-wrap gap-3"><Btn href={`/person/${state.personId}`}>Open their story</Btn><Btn quiet onClick={findMakers} disabled={mk.busy}>{mk.busy ? "Looking…" : "Find Wish Makers"}</Btn></div>
        {mk.error && <ErrorBox message={mk.error} />}
        {mk.results && <Card data-match-all><p className="text-sm text-ivory/60">These are suggestions only. Nobody has been asked yet.</p>
          {mk.results.length === 0 ? <p className="mt-2">No wishes to match.</p> : <ul className="mt-2 space-y-2">{mk.results.map(r => { const t = state.wishes?.items.find(w => w.id === r.wish_id)?.title; return <li key={r.wish_id}>{t || "A wish"}: {r.count === 0 ? (r.message || "no Wish Makers matched yet") : `${r.count} ${r.count === 1 ? "match" : "matches"} suggested`}</li>; })}</ul>}
          <div className="mt-3"><Btn quiet href={`/person/${state.personId}/wishes`}>Review and ask on the wishes page</Btn></div></Card>}
      </div>}
    </div>
  );
}
