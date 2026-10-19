"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell, Card, Tag, Btn, Loading, LABEL } from "@/components/ui";
import { usePerson } from "@/lib/usePerson";
import { deleteEverything } from "@/lib/api";
export default function Portrait() {
  const { id } = useParams<{ id: string }>(); const { p, sample } = usePerson(id); const r = useRouter(); const [log, setLog] = useState(false);
  if (!p) return <Loading id={id} />;
  return (
    <Shell id={id}>
      <h1 className="text-4xl text-dusk mb-1">{p.name}</h1>
      <p className="mb-6 text-dusk/80">Who they were, through what they loved.{sample && " This is a sample story."}</p>
      {p.items.map(i => (
        <Card key={i.id}>
          <p className="text-sm text-brass">{i.domain}, {LABEL[i.label]}</p>
          <h2 className="text-2xl my-1">{i.name}</h2>
          {i.tags.map(t => <Tag key={t}>{t}</Tag>)}
        </Card>
      ))}
      <button className="underline text-dusk mb-3" onClick={() => setLog(!log)}>{log ? "Hide" : "Show"} what Qloo told us</button>
      {log && <Card>{p.qlooLog.map(l => <p key={l} className="text-sm">{l}</p>)}</Card>}
      <div className="flex flex-wrap gap-3 mt-6">
        <Btn href={`/person/${id}/wishes`}>See wishes</Btn>
        <Btn quiet onClick={async () => { if (confirm("Delete everything about this person?")) { await deleteEverything(id); r.push("/"); } }}>Delete everything</Btn>
      </div>
    </Shell>
  );
}
