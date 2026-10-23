"use client";
import { isQlooMaker } from "@/lib/qloo";
import { QlooBadge, useGlow } from "@/components/QlooLayer";
import { basisCopy, makerFacts, type MakerLike } from "@/lib/makers";

/** Header, facts and match explanation for a suggested Wish Maker. Does not touch the request/acceptance flow. */
export function MakerSummary({ m, notices }: { m: MakerLike; notices?: unknown }) {
  const f = makerFacts(m, notices);
  const b = basisCopy(m.basis, notices);
  const q = isQlooMaker(m); const glow = useGlow(q);
  const reasons = (m.reasons ?? []).filter((r): r is string => typeof r === "string" && r.trim().length > 0);
  return (
    <div className={`mb-3 space-y-1 rounded-2xl ${q ? "-m-2 p-2" : ""} ${glow}`} data-basis={m.basis ?? ""} data-qloo-derived={q ? "1" : undefined}>
      <h3 className="text-2xl">{m.name} <QlooBadge show={q} label="Qloo match" title="Matched using Qloo taste data" />{f.sample && <span title="Sample Wish Maker" className="ml-3 inline-block rounded-full border border-gold/50 bg-gold/15 px-2.5 py-0.5 align-middle font-sans text-xs font-medium tracking-wide text-gold">Sample</span>}</h3>
      {f.line && <p className="text-sm text-navy/70">{f.line}</p>}
      {reasons.length > 0 && <p className="text-sm">{reasons.join(" · ")}</p>}
      <p className="text-xs text-navy/60"><span className="font-medium">{b.title}.</span> {b.explanation} Suggested, not guaranteed.</p>
    </div>
  );
}
