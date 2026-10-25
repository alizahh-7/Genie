import { buildReceipt } from "@/lib/qlooReceipt";
import type { Wish } from "@/lib/types";

/** A small receipt under a wish: where it came from and which Qloo tags backed it. Renders nothing when there is nothing true to show. */
export function QlooReceipt({ wish, known }: { wish: Wish; known?: ReadonlySet<string> }) {
  const r = buildReceipt(wish, known);
  if (!r) return null;
  return (
    <div data-testid="qloo-receipt" className="mt-5 rounded-xl border border-gold/25 bg-ivory/5 p-4 text-sm text-ivory/85">
      <p className="mb-2 font-medium text-gold">Qloo receipt</p>
      {r.from.length > 0 && <p><span className="text-ivory/60">Built from: </span>{r.from.join(", ")}</p>}
      {r.qlooTags.length > 0 && <p className="mt-1"><span className="text-ivory/60">Qloo tags that matched: </span>{r.qlooTags.join(", ")}</p>}
      {r.guess && <p className="mt-1"><span className="text-ivory/60">Qloo’s guess: </span>{r.guess}</p>}
      {r.isGuess && <p className="mt-2 text-ivory/60">This is a guess from Qloo’s taste links. The family decides.</p>}
    </div>
  );
}
