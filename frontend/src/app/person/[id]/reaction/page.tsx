"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Shell, Card, Btn, Loading } from "@/components/ui";
import { usePerson } from "@/lib/usePerson";
export default function Reaction() {
  const { id } = useParams<{ id: string }>(); const { p } = usePerson(id);
  const [i, setI] = useState(0); const [msg, setMsg] = useState(""); const [lit, setLit] = useState<string[]>([]);
  if (!p) return <Loading id={id} />;
  const cards = p.items.slice(0, 3); const cur = cards[i];
  const next = (liked?: string) => { if (liked) setLit([...lit, liked]); setMsg(liked ? "" : "That is okay. Let us try something else."); setI(i + 1); };
  return (
    <Shell id={id}>
      <h1 className="text-3xl text-dusk mb-1">Sit together for a moment</h1>
      <p className="mb-6 text-dusk/80">Share this with {p.name} with family close by. A few items at a time, nothing to get right.</p>
      {cur ? (
        <Card>
          <p className="text-sm text-brass">{cur.domain}</p>
          <h2 className="text-3xl my-4">{cur.name}</h2>
          <div className="flex flex-wrap gap-3"><Btn onClick={() => next(cur.name)}>They lit up</Btn><Btn quiet onClick={() => next()}>No reaction</Btn></div>
          {msg && <p className="mt-4 text-dusk/80">{msg}</p>}
        </Card>
      ) : (
        <Card><h2 className="text-2xl mb-2">That is enough for today.</h2><p>{lit.length ? `Noted: ${lit.join(", ")}.` : "Thank you for sitting together."}</p></Card>
      )}
      <Btn href={`/person/${id}/portrait`} quiet>Stop</Btn>
    </Shell>
  );
}
