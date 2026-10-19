"use client";
import { useParams } from "next/navigation";
import { Shell, Card, Tag, Sample, Loading } from "@/components/ui";
import { usePerson } from "@/lib/usePerson";
export default function Wishes() {
  const { id } = useParams<{ id: string }>(); const { p } = usePerson(id);
  if (!p) return <Loading id={id} />;
  return (
    <Shell id={id}>
      <h1 className="text-3xl text-dusk mb-1">Wishes for {p.name}</h1>
      <p className="mb-6 text-dusk/80">Genie suggests. You decide. Nobody is contacted until you and they both agree.</p>
      {p.wishes.map(w => (
        <Card key={w.id}>
          <Tag>{w.mode === "remote" ? "Can happen remotely" : "In person, with family present"}</Tag>
          <h2 className="text-2xl my-1">{w.title}</h2>
          <p className="mb-3">{w.description}</p>
          {w.makers.map(m => (
            <div key={m.name} className="flex flex-wrap items-center justify-between border-t border-brass/30 py-2 text-base">
              <span>{m.name}, {m.city}<Sample /></span>
              <span className="text-dusk/80">{m.score}% fit, {m.status}</span>
            </div>
          ))}
        </Card>
      ))}
    </Shell>
  );
}
