"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Card, Btn, Gathering, ErrorBox } from "@/components/ui";
import { demoStart, personas } from "@/lib/api";
import { useTask } from "@/lib/useTask";
import type { Persona } from "@/lib/types";
export default function Demo() {
  const r = useRouter(); const t = useTask(); const s = useTask();
  const [list, setList] = useState<Persona[] | null>(null);
  const load = useCallback(async () => { const p = await t.run(() => personas()); if (p) setList(p); }, [t.run]);
  useEffect(() => { load(); }, [load]);
  const open = async (n: number) => { const res = await s.run(() => demoStart(n)); if (res) r.push(`/person/${res.person_id}`); };
  return (
    <Shell>
      {(t.busy && !list) && <Gathering slow={t.slow} title="Waking Genie up…" />}
      {s.busy && <Gathering slow={s.slow} title="Opening their story…" />}
      <h1 className="rise pt-8 text-5xl">Meet someone</h1>
      <p className="rise mb-8 mt-3 max-w-xl text-navy/75">These are fictional people. Choose one to see how Genie gets to know them.</p>
      {t.error && <ErrorBox message={t.error} onRetry={load} />}{s.error && <ErrorBox message={s.error} />}
      {list && list.length === 0 && <p className="text-navy/60">The demo is not available right now.</p>}
      <div className="grid gap-5 sm:grid-cols-2">{(list ?? []).map((p, i) => (
        <Card key={p.persona} className="rise" ><div style={{ animationDelay: `${i * 100}ms` }}>
          <h2 className="text-4xl">{p.first_name}</h2>
          <p className="mb-5 mt-1 text-navy/70">{[p.birth_year && `Born ${p.birth_year}`, p.region, p.language].filter(Boolean).join(", ")}</p>
          <Btn onClick={() => open(p.persona)} disabled={s.busy}>Meet {p.first_name}</Btn></div>
        </Card>))}
      </div>
    </Shell>
  );
}
