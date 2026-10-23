"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, getPortrait, personPath } from "@/lib/api";
import { COMPARE_NOT_GENERATED } from "@/lib/errors";
import { useLoad, Wait, Action } from "@/components/Extra";
import { CompareView, type Comparison } from "@/components/CompareView";
import { QlooPanel } from "@/components/QlooLayer";
import { Shell, Btn, Card, ErrorBox } from "@/components/ui";
import type { PortraitItem } from "@/lib/types";

export default function Compare() {
  const { id } = useParams<{ id: string }>();
  const path = personPath(id, "compare");
  const { data, error, busy, reload, setData, status } = useLoad<Comparison>(path, { notFound: { message: COMPARE_NOT_GENERATED } });
  const [items, setItems] = useState<PortraitItem[] | null>(null);
  // The portrait is only used to corroborate which taste tags came from Qloo; the page works without it.
  useEffect(() => { let live = true; getPortrait(id).then(p => { if (live) setItems(p.items ?? []); }).catch(() => {}); return () => { live = false; }; }, [id]);
  return (
    <Shell>
      <div className="py-8">
        <div className="mb-3 flex justify-end"><Btn quiet href={`/person/${id}`}>Back to story</Btn></div>
        <header className="rise mx-auto mb-10 max-w-3xl text-center">
          <p className="mb-3 text-sm uppercase tracking-[.24em] text-gold">A general AI vs Genie</p>
          <h1 className="text-5xl sm:text-7xl">The same facts. <em className="text-gold">One side knows why.</em></h1>
          <p className="mx-auto mt-5 max-w-xl text-ivory/70">Both were given the same family facts. Compare the generic suggestions with the experience grounded in Qloo taste evidence.</p>
        </header>
        <div className="mb-6 flex flex-wrap items-center justify-center gap-4"><Action label="Run a new comparison" task={() => api<Comparison>(path, { method: "POST", timeout: 90000 })} onDone={setData} /></div>
        <QlooPanel showStrip={false} />
        {busy ? <Wait /> : error ? (status === 404
          ? <Card className="mt-6"><p>{error}</p><p className="mt-2 text-sm text-navy/70">Use “Run a new comparison” above to create one.</p></Card>
          : <ErrorBox message={error} onRetry={reload} />
        ) : data && <CompareView data={data} items={items} />}
      </div>
    </Shell>
  );
}
