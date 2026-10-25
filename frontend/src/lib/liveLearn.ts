import type { BuildResponse, GenerateResponse, QuickFact } from "./api";

/* Watch Genie Learn: three REAL sequential calls. A stage is "done" only after its response succeeded. */

export type StageId = "person" | "portrait" | "wishes";
export type StageStatus = "waiting" | "running" | "done" | "failed";
export interface Stage { status: StageStatus; error?: string }
export interface LiveState {
  personId: string | null;
  stages: Record<StageId, Stage>;
  portrait?: { items: number; saved?: number; lookups: number; summary?: string };
  wishes?: { count: number; lookups: number; summary?: string; followUp?: string | null; items: { id: string; title: string }[] };
}
export const STAGE_ORDER: StageId[] = ["person", "portrait", "wishes"];
export const STAGE_TITLE: Record<StageId, string> = { person: "Creating the story", portrait: "Building the Taste Portrait", wishes: "Generating wishes" };

export function initialLive(personId: string | null = null): LiveState {
  return { personId, stages: { person: { status: personId ? "done" : "waiting" }, portrait: { status: "waiting" }, wishes: { status: "waiting" } } };
}

export interface LiveDeps {
  createPerson: () => Promise<{ id: string }>;
  buildPortrait: (id: string) => Promise<BuildResponse>;
  generateWishes: (id: string) => Promise<GenerateResponse>;
  onChange: (s: LiveState) => void;
  errorText: (e: unknown) => string;
}
export const buildQuickFacts = (favs: { domain: string; name: string }[]): QuickFact[] => favs.slice(0, 30).map(f => ({ domain: f.domain, name: f.name }));

const wishItems = (w: unknown): { id: string; title: string }[] => (Array.isArray(w) ? w : []).flatMap(x => { const o = x as { id?: unknown; title?: unknown }; return typeof o?.id === "string" ? [{ id: o.id, title: typeof o.title === "string" ? o.title : "" }] : []; });
const set = (s: LiveState, id: StageId, st: Stage): LiveState => ({ ...s, stages: { ...s.stages, [id]: st } });

/**
 * Runs the first stage that is not yet done, then the next, strictly one after another, and stops at the first failure.
 * Passing the previous state back in resumes: a finished person is never created twice and a finished portrait is never rebuilt.
 */
export async function runLive(deps: LiveDeps, from: LiveState): Promise<LiveState> {
  let s = from;
  const push = (n: LiveState) => { s = n; deps.onChange(s); };
  for (const id of STAGE_ORDER) {
    if (s.stages[id].status === "done") continue;
    push(set(s, id, { status: "running" }));
    try {
      if (id === "person") { const p = await deps.createPerson(); push({ ...set(s, id, { status: "done" }), personId: p.id }); }
      else if (id === "portrait") {
        const r = await deps.buildPortrait(s.personId!);
        push({ ...set(s, id, { status: "done" }), portrait: { items: Array.isArray(r?.items) ? r.items.length : 0, saved: typeof r?.saved === "number" ? r.saved : undefined, lookups: Array.isArray(r?.qloo_log) ? r.qloo_log.length : 0, summary: r?.summary } });
      } else {
        const r = await deps.generateWishes(s.personId!);
        push({ ...set(s, id, { status: "done" }), wishes: { count: Array.isArray(r?.wishes) ? r.wishes.length : 0, lookups: Array.isArray(r?.qloo_log) ? r.qloo_log.length : 0, summary: r?.summary, followUp: r?.follow_up ?? null, items: wishItems(r?.wishes) } });
      }
    } catch (e) { push(set(s, id, { status: "failed", error: deps.errorText(e) })); return s; }
  }
  return s;
}
export const failedStage = (s: LiveState): StageId | null => STAGE_ORDER.find(id => s.stages[id].status === "failed") ?? null;
export const isFinished = (s: LiveState): boolean => STAGE_ORDER.every(id => s.stages[id].status === "done");
