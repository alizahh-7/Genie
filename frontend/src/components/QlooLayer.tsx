"use client";
import { useQlooLayer } from "@/lib/qlooLayer";
import { counterParts, type QlooCounters } from "@/lib/qloo";

export const QLOO_GLOW = "qloo-glow";

/** Small "Qloo" badge. Rendered only when the layer is on AND the caller has established real Qloo provenance. */
export function QlooBadge({ show, label = "Qloo", title }: { show: boolean; label?: string; title?: string }) {
  const { on } = useQlooLayer();
  if (!on || !show) return null;
  return <span data-qloo-badge title={title ?? "Derived from Qloo data"} className="qloo-badge">{label}</span>;
}

/** Class string for a glow, only when the layer is on and provenance holds. */
export function useGlow(derived: boolean): string {
  const { on } = useQlooLayer();
  return on && derived ? QLOO_GLOW : "";
}

export function QlooToggle() {
  const { on, toggle } = useQlooLayer();
  return (
    <button type="button" role="switch" aria-checked={on} onClick={toggle} data-qloo-toggle
      className="group inline-flex items-center gap-3 rounded-full border border-[#7dd3fc]/40 bg-[#7dd3fc]/10 py-2 pl-3 pr-5 text-sm text-ivory transition hover:border-[#7dd3fc] hover:bg-[#7dd3fc]/15">
      <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition ${on ? "bg-[#7dd3fc]" : "bg-ivory/25"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-[#10142f] transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
      <span className="font-medium">Show what Qloo did</span>
      <span className="sr-only">{on ? "On" : "Off"}</span>
    </button>
  );
}

const LEGEND = [
  { k: "Understand", d: "Resolving and expanding favourites." },
  { k: "Discover", d: "Finding related tastes and possibilities." },
  { k: "Match", d: "Connecting wishes with suitable makers." },
  { k: "Learn", d: "Using reactions to refresh the portrait." },
] as const;

export function QlooLegend() {
  return (
    <dl aria-label="What Qloo does in Genie" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {LEGEND.map((l, i) => (
        <div key={l.k} className="rounded-2xl border border-[#7dd3fc]/20 bg-[#7dd3fc]/[.06] px-4 py-3">
          <dt className="flex items-center gap-2 font-serif text-xl text-[#bde8fb]"><span aria-hidden="true" className="text-xs text-[#7dd3fc]/80">0{i + 1}</span>{l.k}</dt>
          <dd className="mt-0.5 text-sm text-ivory/70">{l.d}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Real counters only. Loading and empty states are explicit; metrics that cannot be derived are left out. */
export function QlooEvidenceStrip({ counters, loading }: { counters: QlooCounters | null; loading?: boolean }) {
  const { on } = useQlooLayer();
  const parts = counters ? counterParts(counters) : [];
  return (
    <div data-qloo-strip className={`rounded-2xl border px-5 py-3 text-sm ${on ? "qloo-glow border-[#7dd3fc]/50" : "border-ivory/15"} bg-ivory/5`}>
      <p className="text-xs uppercase tracking-[.18em] text-[#7dd3fc]">Qloo evidence</p>
      {loading ? <p role="status" className="mt-1 text-ivory/60">Counting Qloo activity…</p>
        : parts.length === 0 ? <p className="mt-1 text-ivory/60">No Qloo activity has been recorded for this story yet.</p>
        : <p className="mt-1 font-serif text-2xl text-ivory sm:text-3xl">{parts.map((p, i) => <span key={p}>{i > 0 && <span aria-hidden="true" className="mx-2 text-[#7dd3fc]/60">·</span>}{p}</span>)}</p>}
    </div>
  );
}

/** Toggle, legend and (optionally) counters as one compact block for a screen's header. */
export function QlooPanel({ counters, loading, showStrip = true, hideToggle = false }: { counters?: QlooCounters | null; loading?: boolean; showStrip?: boolean; hideToggle?: boolean }) {
  return (
    <section aria-label="Show what Qloo did" className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center gap-4">{!hideToggle && <QlooToggle />}<p className="text-sm text-ivory/60">{hideToggle ? "Switch on “Show what Qloo did” above to see it. " : ""}Highlights only what the data shows came from Qloo.</p></div>
      {showStrip && <QlooEvidenceStrip counters={counters ?? null} loading={loading} />}
      <QlooLegend />
    </section>
  );
}

export function TagChip({ name, qloo }: { name: string; qloo: boolean }) {
  const { on } = useQlooLayer();
  const hi = on && qloo;
  return <span data-qloo-tag={hi ? "1" : undefined} className={`rounded-md px-2.5 py-0.5 text-sm ${hi ? "qloo-tag" : "bg-navy/5"}`}>{name}</span>;
}
