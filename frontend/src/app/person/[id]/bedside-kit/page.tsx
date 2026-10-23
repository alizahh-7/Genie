"use client";
import { useParams } from "next/navigation";
import { personPath } from "@/lib/api";
import { Page, useLoad, Wait } from "@/components/Extra";
import { Card, ErrorBox } from "@/components/ui";
import { lineParts, trackParts, type Kit } from "@/lib/bedside";
import { withPeriod } from "@/lib/labels";

export default function Bedside() {
  const { id } = useParams<{ id: string }>();
  const { data, error, busy, reload } = useLoad<Kit>(personPath(id, "bedside-kit"));
  const tracks = (data?.playlist?.tracks ?? []).map(trackParts).filter((t): t is NonNullable<typeof t> => t !== null);
  return <Page id={id} title="Bedside Kit">{busy ? <Wait /> : error ? <ErrorBox message={error} onRetry={reload} /> : data && <div className="space-y-5">
    {data.intro && <p>{data.intro}</p>}
    <Card>
      <h2 className="text-2xl">{data.playlist?.title ?? "Music"}</h2>
      {data.playlist?.how_to && <p>{data.playlist.how_to}</p>}
      {tracks.map((t, i) => <p className="my-3" key={i}>
        <span className="font-medium">{t.name}{t.label ? "." : ""}</span>
        {t.label && <span className="text-navy/70"> {withPeriod(t.label)}</span>}
      </p>)}
      {tracks.length === 0 && data.playlist?.empty_note && <p>{data.playlist.empty_note}</p>}
      <p className="text-xs text-navy/60">These are names to search in a music app, not recordings.</p>
    </Card>
    {([["Small changes", data.small_changes], ["Visitors", data.visitors]] as const).map(([title, rows]) => {
      const lines = (rows ?? []).map(lineParts).filter((l): l is NonNullable<typeof l> => l !== null);
      return <Card key={title}>
        <h2 className="mb-3 text-2xl">{title}</h2>
        {lines.map((r, i) => <p className="mb-3" key={i}>{r.text} {r.because && <span className="text-sm text-navy/60">— because of {r.because}</span>}</p>)}
      </Card>;
    })}
    {data.note && <Card><p>{data.note}</p></Card>}
  </div>}</Page>;
}
