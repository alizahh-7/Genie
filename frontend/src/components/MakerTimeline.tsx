import { buildTimeline, STATUS_LABEL, type RequestRow } from "@/lib/makerRequests";

/** Suggested → Asked → Accepted → Done, drawn from the ACTUAL request status. Upcoming stages are never shown as reached. */
export function MakerTimeline({ row }: { row: Pick<RequestRow, "status" | "requested_at" | "responded_at"> }) {
  const t = buildTimeline(row);
  return (
    <div data-timeline data-status={t.status} className="mt-3">
      <ol aria-label={`Progress: ${STATUS_LABEL[t.status]}`} className="grid grid-cols-4 gap-1">
        {t.stages.map(s => (
          <li key={s.key} data-stage={s.key} data-state={s.state} aria-current={s.state === "current" ? "step" : undefined} className="min-w-0">
            <div className="flex items-center">
              <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${s.state === "complete" ? "border-gold bg-gold" : s.state === "current" ? "border-gold bg-transparent ring-4 ring-gold/25" : "border-ivory/30 bg-transparent"}`} />
              <span aria-hidden="true" className={`ml-1 h-0.5 flex-1 ${s.state === "complete" ? "bg-gold/70" : "bg-ivory/20"} ${s.key === "done" ? "hidden" : ""}`} />
            </div>
            <p className={`mt-1 text-sm ${s.state === "upcoming" ? "text-ivory/45" : "text-ivory"}`}>{s.label}<span className="sr-only"> ({s.state === "complete" ? "reached" : s.state === "current" ? "current stage" : "not reached yet"})</span></p>
            {s.note && <p className="text-xs text-ivory/60">{s.note}</p>}
          </li>
        ))}
      </ol>
      {t.stopped && <p data-stopped className="mt-2 rounded-xl border border-ivory/20 bg-ivory/5 px-3 py-1.5 text-sm">{t.stopped}</p>}
    </div>
  );
}
